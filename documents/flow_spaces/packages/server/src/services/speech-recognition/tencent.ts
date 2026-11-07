import { randomUUID } from 'node:crypto'
import { createHmac } from 'node:crypto'
import WebSocket from 'ws'
import type { SpeechRecognitionConfig, SpeechRecognitionResult } from '@agent-spaces/shared'
import { SpeechRecognitionProviderBase, type SpeechRecognitionSession } from './base.js'

interface TencentResult {
  voice_text_str: string
  slice_type: number
  index: number
}

interface TencentMessage {
  code: number
  message: string
  voice_id: string
  result?: TencentResult
  final?: number
}

export class TencentSpeechProvider extends SpeechRecognitionProviderBase {
  readonly provider = 'tencent'

  async createSession(config: SpeechRecognitionConfig): Promise<SpeechRecognitionSession> {
    const { appId, secretId, secretKey } = this.extractCredentials(config)
    const voiceId = randomUUID()
    const timestamp = Math.floor(Date.now() / 1000)
    const expired = timestamp + 86400
    const nonce = Math.floor(Math.random() * 100000000)

    const params: Record<string, string> = {
      secretid: secretId,
      timestamp: String(timestamp),
      expired: String(expired),
      nonce: String(nonce),
      engine_model_type: '16k_zh',
      voice_id: voiceId,
      voice_format: '1', // PCM
      needvad: '1',
      filter_dirty: '1',
      filter_modal: '1',
      filter_punc: '1',
    }

    const signature = this.generateSignature(appId, params, secretKey)
    params.signature = signature

    const url = `wss://asr.cloud.tencent.com/asr/v2/${appId}?${new URLSearchParams(params).toString()}`
    console.log('[tencent-asr] connecting to Tencent ASR, appId:', appId)

    const ws = new WebSocket(url)
    const resultCallbacks: ((result: SpeechRecognitionResult) => void)[] = []
    const errorCallbacks: ((err: Error) => void)[] = []
    const closeCallbacks: (() => void)[] = []

    return new Promise((resolve, reject) => {
      const handshakeTimeout = setTimeout(() => {
        ws.close()
        reject(new Error('Tencent ASR handshake timeout'))
      }, 10000)

      ws.on('open', () => {
        console.log('[tencent-asr] WebSocket opened, waiting for handshake...')
      })

      ws.on('message', (data: WebSocket.Data) => {
        clearTimeout(handshakeTimeout)
        const msg: TencentMessage = JSON.parse(data.toString())
        console.log('[tencent-asr] message:', JSON.stringify(msg).slice(0, 200))

        if (msg.code !== 0) {
          const err = new Error(`Tencent ASR error [${msg.code}]: ${msg.message}`)
          errorCallbacks.forEach(cb => cb(err))
          ws.close()
          return
        }

        if (msg.final === 1) {
          closeCallbacks.forEach(cb => cb())
          ws.close()
          return
        }

        if (msg.result) {
          const result: SpeechRecognitionResult = {
            text: msg.result.voice_text_str,
            isFinal: msg.result.slice_type === 2,
            sliceType: msg.result.slice_type,
          }
          resultCallbacks.forEach(cb => cb(result))
        }
      })

      ws.on('error', (err) => {
        clearTimeout(handshakeTimeout)
        console.error('[tencent-asr] WebSocket error:', err.message)
        errorCallbacks.forEach(cb => cb(err))
      })

      ws.on('close', () => {
        clearTimeout(handshakeTimeout)
        console.log('[tencent-asr] WebSocket closed')
        closeCallbacks.forEach(cb => cb())
      })

      // Wait for first message (handshake confirmation) to resolve
      ws.once('message', (data: WebSocket.Data) => {
        clearTimeout(handshakeTimeout)
        const msg: TencentMessage = JSON.parse(data.toString())
        console.log('[tencent-asr] handshake response:', JSON.stringify(msg).slice(0, 200))
        if (msg.code !== 0) {
          reject(new Error(`Tencent ASR handshake failed [${msg.code}]: ${msg.message}`))
          return
        }
        resolve({
          sendAudio: (data: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(data)
          },
          end: () => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end' }))
          },
          onResult: (cb) => resultCallbacks.push(cb),
          onError: (cb) => errorCallbacks.push(cb),
          onClose: (cb) => closeCallbacks.push(cb),
        })
      })
    })
  }

  private extractCredentials(config: SpeechRecognitionConfig): { appId: string; secretId: string; secretKey: string } {
    const { appId, secretId, secretKey } = config.credentials
    if (!appId || !secretId || !secretKey) {
      throw new Error('Tencent speech recognition requires appId, secretId, and secretKey')
    }
    return { appId, secretId, secretKey }
  }

  private generateSignature(appId: string, params: Record<string, string>, secretKey: string): string {
    const sortedKeys = Object.keys(params).sort()
    const queryString = sortedKeys.map(k => `${k}=${params[k]}`).join('&')
    const signStr = `asr.cloud.tencent.com/asr/v2/${appId}?${queryString}`
    const hmac = createHmac('sha1', secretKey)
    hmac.update(signStr)
    return hmac.digest('base64')
  }
}
