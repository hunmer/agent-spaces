import { join } from 'node:path'
import { v4 as uuid } from 'uuid'
import type { SubscriptionConfig } from '@agent-spaces/shared'
import { getDataDir, ensureDir, readJsonFile, writeJsonFile } from './json-store.js'

const FILE = () => {
  const dir = join(getDataDir(), 'subscriptions')
  ensureDir(dir)
  return join(dir, 'configs.json')
}

export function listSubscriptions(): SubscriptionConfig[] {
  return readJsonFile<SubscriptionConfig[]>(FILE()) ?? []
}

function saveAll(items: SubscriptionConfig[]) {
  writeJsonFile(FILE(), items)
}

export function getSubscription(id: string): SubscriptionConfig | undefined {
  return listSubscriptions().find(s => s.id === id)
}

export function createSubscription(data: Omit<SubscriptionConfig, 'id' | 'createdAt' | 'updatedAt'>): SubscriptionConfig {
  const items = listSubscriptions()
  const now = new Date().toISOString()
  const item: SubscriptionConfig = { ...data, id: uuid(), createdAt: now, updatedAt: now }
  items.push(item)
  saveAll(items)
  return item
}

export function updateSubscription(id: string, patch: Partial<Pick<SubscriptionConfig, 'label' | 'headers' | 'cookie'>>): SubscriptionConfig | undefined {
  const items = listSubscriptions()
  const idx = items.findIndex(s => s.id === id)
  if (idx < 0) return undefined
  Object.assign(items[idx], patch, { updatedAt: new Date().toISOString() })
  saveAll(items)
  return items[idx]
}

export function deleteSubscription(id: string): boolean {
  const items = listSubscriptions()
  const len = items.length
  const filtered = items.filter(s => s.id !== id)
  if (filtered.length === len) return false
  saveAll(filtered)
  return true
}
