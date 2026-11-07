import { Router } from 'express'
import type { Request, Response } from 'express'
import * as store from '../storage/subscription-store.js'
import { fetchQuota } from '../services/subscription/index.js'
import type { SubscriptionProvider } from '@agent-spaces/shared'

const router = Router()

router.get('/', (_req: Request, res: Response) => {
  res.json(store.listSubscriptions())
})

router.get('/:id/quota', async (req: Request<{ id: string }>, res: Response) => {
  const config = store.getSubscription(req.params.id)
  if (!config) {
    res.status(404).json({ error: 'subscription not found' })
    return
  }
  try {
    const quota = await fetchQuota(config)
    res.json(quota)
  } catch (err: any) {
    console.error(`[subscription] fetchQuota failed for ${config.provider}/${config.id}:`, err.message ?? err)
    res.status(502).json({ error: err.message ?? 'Failed to fetch quota' })
  }
})

router.post('/', (req: Request, res: Response) => {
  const { provider, label, headers, cookie } = req.body as { provider: SubscriptionProvider; label: string; headers?: Record<string, string>; cookie?: string }
  if (!provider || (!headers && !cookie)) {
    res.status(400).json({ error: 'provider and headers or cookie are required' })
    return
  }
  const item = store.createSubscription({ provider, label: label || provider, headers, cookie })
  res.status(201).json(item)
})

router.put('/:id', (req: Request<{ id: string }>, res: Response) => {
  const { label, headers, cookie } = req.body as { label?: string; headers?: Record<string, string>; cookie?: string }
  const updated = store.updateSubscription(req.params.id, { label, headers, cookie })
  if (!updated) {
    res.status(404).json({ error: 'subscription not found' })
    return
  }
  res.json(updated)
})

router.delete('/:id', (req: Request<{ id: string }>, res: Response) => {
  if (!store.deleteSubscription(req.params.id)) {
    res.status(404).json({ error: 'subscription not found' })
    return
  }
  res.status(204).end()
})

export default router
