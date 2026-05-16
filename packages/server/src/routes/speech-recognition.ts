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
  const { label, credentials } = req.body as { label?: string; credentials?: Record<string, string> }
  const updated = store.updateSpeechConfig(req.params.id, { label, credentials })
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
  const config = configId
    ? store.getSpeechConfig(configId)
    : store.getDefaultSpeechConfig()

  if (!config) {
    clientWs.close(4004, 'No speech recognition config found')
    return
  }

  try {
    const session = await createSpeechSession(config)

    session.onResult((result) => {
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify(result))
      }
    })

    session.onError((err) => {
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({ error: err.message }))
      }
    })

    session.onClose(() => {
      if (clientWs.readyState === 1) {
        clientWs.close(1000, 'Session ended')
      }
    })

    clientWs.on('message', (data: import('ws').Data) => {
      if (Buffer.isBuffer(data)) {
        session.sendAudio(data)
      } else {
        const msg = data.toString()
        if (msg === '{"type":"end"}' || msg === '{"type":"end"}') {
          session.end()
        }
      }
    })

    clientWs.on('close', () => {
      session.end()
    })
  } catch (err: any) {
    clientWs.close(1011, err.message || 'Failed to create speech session')
  }
}

export default router
