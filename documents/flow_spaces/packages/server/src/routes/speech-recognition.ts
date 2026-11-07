import { Router } from 'express'
import type { Request, Response } from 'express'
import * as store from '../storage/speech-recognition-store.js'
import { createSpeechSession } from '../services/speech-recognition/index.js'
import type { SpeechRecognitionProvider } from '@agent-spaces/shared'

const router = Router()

// REST: CRUD for speech recognition configs
router.get('/', (_req: Request, res: Response) => {
  res.json(store.listSpeechConfigs())
})

router.post('/', (req: Request, res: Response) => {
  const { provider, label, credentials } = req.body as {
    provider: SpeechRecognitionProvider
    label?: string
    credentials: Record<string, string>
  }
  if (!provider || !credentials) {
    res.status(400).json({ error: 'provider and credentials are required' })
    return
  }
  const item = store.createSpeechConfig({ provider, label: label || provider, credentials })
  res.status(201).json(item)
})

router.put('/:id', (req: Request<{ id: string }>, res: Response) => {
  const { label, credentials, enabled } = req.body as { label?: string; credentials?: Record<string, string>; enabled?: boolean }
  const updated = store.updateSpeechConfig(req.params.id, { label, credentials, enabled })
  if (!updated) {
    res.status(404).json({ error: 'Config not found' })
    return
  }
  res.json(updated)
})

router.delete('/:id', (req: Request<{ id: string }>, res: Response) => {
  if (!store.deleteSpeechConfig(req.params.id)) {
    res.status(404).json({ error: 'Config not found' })
    return
  }
  res.status(204).end()
})

// Export a handler for WebSocket upgrade (speech streaming)
export async function handleSpeechStream(
  clientWs: import('ws').WebSocket,
  configId?: string,
) {
  console.log('[speech-ws] new connection, configId:', configId || '(default)')
  const config = configId
    ? store.getSpeechConfig(configId)
    : store.getDefaultSpeechConfig()

  if (!config) {
    console.warn('[speech-ws] no config found, closing')
    clientWs.close(4004, 'No speech recognition config found')
    return
  }

  console.log('[speech-ws] using config:', config.id, 'provider:', config.provider)

  try {
    console.log('[speech-ws] creating session...')
    const session = await createSpeechSession(config)
    console.log('[speech-ws] session created')

    let audioPackets = 0
    let lastLogTime = Date.now()

    session.onResult((result) => {
      console.log('[speech-ws] result:', result.text, 'isFinal:', result.isFinal)
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify(result))
      }
    })

    session.onError((err) => {
      console.error('[speech-ws] session error:', err.message)
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({ error: err.message }))
      }
    })

    session.onClose(() => {
      console.log('[speech-ws] session closed, total audio packets:', audioPackets)
      if (clientWs.readyState === 1) {
        clientWs.close(1000, 'Session ended')
      }
    })

    clientWs.on('message', (data: import('ws').Data) => {
      if (Buffer.isBuffer(data)) {
        session.sendAudio(data)
        audioPackets++
        const now = Date.now()
        if (audioPackets <= 3 || now - lastLogTime > 5000) {
          console.log('[speech-ws] audio packet #', audioPackets, 'size:', data.byteLength)
          lastLogTime = now
        }
      } else {
        const msg = data.toString()
        console.log('[speech-ws] text message:', msg)
        if (msg === '{"type":"end"}' || msg === '{"type":"end"}') {
          session.end()
        }
      }
    })

    clientWs.on('close', () => {
      console.log('[speech-ws] client disconnected, total audio packets:', audioPackets)
      session.end()
    })
  } catch (err: any) {
    console.error('[speech-ws] failed to create session:', err.message)
    clientWs.close(1011, err.message || 'Failed to create speech session')
  }
}

export default router
