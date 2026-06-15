import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import vm from 'node:vm'
import type { NodeTypeDefinition, PluginInfo, PluginMeta } from '@agent-spaces/shared'
import { resolvePluginEntryFile } from '@agent-spaces/shared'
import { desktopNative } from './desktop-native.js'
import { windowManager } from './window-manager.js'

type PluginAction = {
  name: string
  label?: string
  category?: string
  icon?: string
  description?: string
  properties?: unknown[]
  toolProperties?: unknown[]
  outputs?: unknown[]
  run?: (ctx: Record<string, any>, args: Record<string, any>) => Promise<unknown>
}

const require = createRequire(import.meta.url)

function getClientPluginDir(): string {
  return resolve(process.env.AGENT_SPACES_CLIENT_PLUGIN_DIR || join(process.env.HOME || process.env.USERPROFILE || homedir(), '.agent-spaces-client', 'plugins'))
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T
}

function localClientPluginDir(pluginId: string): string {
  return join(getClientPluginDir(), pluginId)
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
  const direct = localClientPluginDir(pluginId)
  if (existsSync(direct)) return direct

  const localRoot = getClientPluginDir()
  if (existsSync(localRoot)) {
    for (const entry of readdirSync(localRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(localRoot, entry.name)
      const manifest = readManifestFromDir(dir)
      if ((manifest?.id || entry.name) === pluginId) return dir
    }
  }

  return null
}

function loadCommonJsModule<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null
  const source = readFileSync(filePath, 'utf-8')
  const module = { exports: {} as T }
  const localRequire = createRequire(filePath)
  const script = new vm.Script(`(function(require, module, exports, __filename, __dirname) {\n${source}\n})`, { filename: filePath })
  const runner = script.runInNewContext({ console, Buffer, URL, URLSearchParams, fetch, setTimeout, clearTimeout })
  runner(localRequire, module, module.exports, filePath, dirname(filePath))
  return module.exports
}

function loadPluginActions(dir: string): PluginAction[] {
  const actionsModule = loadCommonJsModule<PluginAction[] | ((t: (key: string, fallback?: string) => string) => PluginAction[])>(join(dir, 'actions.js'))
  if (!actionsModule) return []
  const t = createTranslator(dir)
  const actions = typeof actionsModule === 'function' ? actionsModule(t) : actionsModule
  return Array.isArray(actions) ? actions : []
}

function normalizePluginMeta(dirName: string, dir: string, info: PluginInfo): PluginMeta {
  const id = String(info.id || dirName)
  return {
    id,
    name: String(info.name || id),
    version: String(info.version || '0.0.0'),
    description: String(info.description || ''),
    author: info.author || { name: 'Unknown' },
    tags: Array.isArray(info.tags) ? info.tags : [],
    hasView: Boolean(info.hasView),
    hasWorkflow: Boolean(info.hasWorkflow || info.entries?.workflow || existsSync(join(dir, 'actions.js'))),
    type: info.type,
    enabled: true,
    config: Array.isArray(info.config) ? info.config : [],
    iconPath: info.icon || '',
  }
}

function actionToWorkflowNode(action: PluginAction, pluginId: string): NodeTypeDefinition {
  return {
    type: action.name,
    label: action.label || action.name,
    category: action.category || pluginId,
    icon: action.icon || 'Plug',
    description: action.description || '',
    properties: (action.properties || action.toolProperties || []) as NodeTypeDefinition['properties'],
    outputs: (action.outputs || []) as NodeTypeDefinition['outputs'],
  }
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

  const actions = loadPluginActions(dir)
  const action = Array.isArray(actions) ? actions.find(item => item.name === nodeType) : null
  if (!action || typeof action.run !== 'function') throw new Error(`Client plugin action not found: ${pluginId}/${nodeType}`)

  const api = createPluginApi(dir, info)
  return action.run({
    api,
    logger: console,
  }, args)
}

export function listClientWorkflowPlugins(): PluginMeta[] {
  const root = getClientPluginDir()
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map((entry) => {
      const dir = join(root, entry.name)
      const info = readManifestFromDir(dir)
      if (!info || (info.type && info.type !== 'client' && info.type !== 'both')) return null
      const meta = normalizePluginMeta(entry.name, dir, info)
      return meta.hasWorkflow ? meta : null
    })
    .filter((plugin): plugin is PluginMeta => Boolean(plugin))
}

export function getClientWorkflowNodes(pluginId: string): NodeTypeDefinition[] {
  const dir = resolvePluginDir(pluginId)
  if (!dir) throw new Error(`Client plugin not found: ${pluginId}`)

  const info = readManifestFromDir(dir)
  if (!info) throw new Error(`Client plugin manifest not found: ${pluginId}`)
  if (Array.isArray((info as PluginInfo & { workflowNodes?: NodeTypeDefinition[] }).workflowNodes)) {
    return (info as PluginInfo & { workflowNodes: NodeTypeDefinition[] }).workflowNodes
  }

  const actions = loadPluginActions(dir)
  return actions.map(action => actionToWorkflowNode(action, info.id || pluginId))
}
