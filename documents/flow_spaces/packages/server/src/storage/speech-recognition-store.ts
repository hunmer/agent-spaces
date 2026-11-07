import { readJsonFile, writeJsonFile, getDataDir } from './json-store.js'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { SpeechRecognitionConfig, SpeechRecognitionProvider } from '@agent-spaces/shared'

const FILE = () => join(getDataDir(), 'speech-recognition.json')

type StoredConfig = SpeechRecognitionConfig

function load(): StoredConfig[] {
  return readJsonFile<StoredConfig[]>(FILE()) ?? []
}

function save(items: StoredConfig[]) {
  writeJsonFile(FILE(), items)
}

export function listSpeechConfigs(): StoredConfig[] {
  return load()
}

export function getSpeechConfig(id: string): StoredConfig | undefined {
  return load().find(c => c.id === id)
}

export function getDefaultSpeechConfig(): StoredConfig | undefined {
  const items = load()
  return items.find(c => c.enabled !== false) ?? undefined
}

export function createSpeechConfig(input: {
  provider: SpeechRecognitionProvider
  label: string
  credentials: Record<string, string>
}): StoredConfig {
  const items = load()
  const now = new Date().toISOString()
  const item: StoredConfig = {
    id: randomUUID(),
    provider: input.provider,
    label: input.label || input.provider,
    enabled: true,
    credentials: input.credentials,
    createdAt: now,
    updatedAt: now,
  }
  items.push(item)
  save(items)
  return item
}

export function updateSpeechConfig(id: string, patch: Partial<Pick<StoredConfig, 'label' | 'credentials' | 'enabled'>>): StoredConfig | undefined {
  const items = load()
  const idx = items.findIndex(c => c.id === id)
  if (idx === -1) return undefined
  if (patch.label !== undefined) items[idx].label = patch.label
  if (patch.credentials !== undefined) items[idx].credentials = patch.credentials
  if (patch.enabled !== undefined) items[idx].enabled = patch.enabled
  items[idx].updatedAt = new Date().toISOString()
  save(items)
  return items[idx]
}

export function deleteSpeechConfig(id: string): boolean {
  const items = load()
  const idx = items.findIndex(c => c.id === id)
  if (idx === -1) return false
  items.splice(idx, 1)
  save(items)
  return true
}
