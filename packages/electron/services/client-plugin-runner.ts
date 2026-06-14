import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import type { PluginInfo } from '@agent-spaces/shared'
import { resolvePluginEntryFile } from '@agent-spaces/shared'
import { desktopNative } from './desktop-native.js'
import { windowManager } from './window-manager.js'

type PluginAction = {
  name: string
  run?: (ctx: Record<string, any>, args: Record<string, any>) => Promise<unknown>
}

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

function getDataDir(): string {
  return resolve(process.env.AGENT_SPACES_DATA_DIR || join(process.env.HOME || process.env.USERPROFILE || homedir(), '.agent-spaces-data'))
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T
}

function templatesPluginsDir(): string {
  const candidates = [
    resolve(process.cwd(), 'packages/templates/plugins'),
    resolve(process.cwd(), '../templates/plugins'),
    resolve(process.cwd(), 'templates/plugins'),
    resolve(__dirname, '../../templates/plugins'),
  ]
  return candidates.find(candidate => existsSync(candidate)) || candidates[0]
}

function pluginInstallDir(pluginId: string): string {
  return join(getDataDir(), 'plugins', pluginId)
}

function readManifestFromDir(dir: string): PluginInfo | null {
  const candidates = ['plugin.json', 'manifest.json', 'info.json', 'web-plugin.json', 'package.json']
  for (const filename of candidates) {
    const manifest = readJsonFile<PluginInfo>(join(dir, filename))
    if (manifest?.id || manifest?.name) return manifest
  }
  return null
}

function resolvePluginDir(pluginId: string): string | null {
  const direct = pluginInstallDir(pluginId)
  if (existsSync(direct)) return direct

  const installedRoot = join(getDataDir(), 'plugins')
  if (existsSync(installedRoot)) {
    for (const entry of readdirSync(installedRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(installedRoot, entry.name)
      const manifest = readManifestFromDir(dir)
      if ((manifest?.id || entry.name) === pluginId) return dir
    }
  }

  const templateRoot = templatesPluginsDir()
  if (existsSync(templateRoot)) {
    for (const entry of readdirSync(templateRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(templateRoot, entry.name)
      const manifest = readManifestFromDir(dir)
      if ((manifest?.id || entry.name) === pluginId) return dir
    }
  }

  return null
}

function loadCommonJsModule<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null
  delete require.cache[require.resolve(filePath)]
  return require(filePath) as T
}

function createTranslator(dir: string) {
  const lang = readJsonFile<Record<string, Record<string, string>>>(join(dir, 'lang.json')) || {}
  const current = lang.zh || {}
  const fallback = lang.en || {}
  return (key: string, fallbackText?: string) => current[key] || fallback[key] || fallbackText || key
}

function createPluginApi(dir: string, info: PluginInfo): Record<string, unknown> {
  const apiEntry = resolvePluginEntryFile(info, 'api')
  const apiModule = loadCommonJsModule<{ createApi?: (deps: Record<string, unknown>) => Record<string, unknown> }>(join(dir, apiEntry))
  if (typeof apiModule?.createApi !== 'function') return {}
  return apiModule.createApi({ desktopNative, windowManager })
}

export async function executeClientPluginNode(
  pluginId: string,
  nodeType: string,
  args: Record<string, any>,
): Promise<unknown> {
  const dir = resolvePluginDir(pluginId)
  if (!dir) throw new Error(`Client plugin not found: ${pluginId}`)

  const info = readManifestFromDir(dir)
  if (!info) throw new Error(`Client plugin manifest not found: ${pluginId}`)

  const actionsModule = loadCommonJsModule<PluginAction[] | ((t: (key: string, fallback?: string) => string) => PluginAction[])>(join(dir, 'actions.js'))
  if (!actionsModule) throw new Error(`Client plugin actions not found: ${pluginId}`)

  const t = createTranslator(dir)
  const actions = typeof actionsModule === 'function' ? actionsModule(t) : actionsModule
  const action = Array.isArray(actions) ? actions.find(item => item.name === nodeType) : null
  if (!action || typeof action.run !== 'function') throw new Error(`Client plugin action not found: ${pluginId}/${nodeType}`)

  const api = createPluginApi(dir, info)
  return action.run({
    api,
    logger: console,
  }, args)
}
