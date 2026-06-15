import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
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

type ClientPluginInstallOptions = {
  pluginId: string
  sourceUrl: string
  md5?: string
}

type ClientPluginState = {
  md5?: string
  installedAt?: number
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

function readClientPluginState(dir: string): ClientPluginState {
  return readJsonFile<ClientPluginState>(join(dir, '.client-state.json')) || {}
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
  const state = readClientPluginState(dir)
  const iconPath = info.icon ? `local://${encodeURI(resolve(dir, info.icon))}` : ''
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
    iconPath,
    md5: state.md5,
    installedAt: state.installedAt,
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

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`fetch ${url} failed: ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

async function tryFetchText(url: string): Promise<string | null> {
  const response = await fetch(url)
  if (!response.ok) return null
  return response.text()
}

function safeJoinPluginPath(root: string, relPath: string): string | null {
  const clean = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!clean || clean.split('/').includes('..') || clean.split('/').includes('node_modules')) return null
  const target = resolve(root, clean)
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)) ? target : null
}

function collectClientPluginFiles(info: PluginInfo, manifestName: string): string[] {
  const files = new Set([
    manifestName,
    'main.js',
    'workflow.js',
    'actions.js',
    'api.js',
    'tools.js',
    'shared.js',
    'lang.json',
  ])

  if (info.icon) files.add(info.icon)
  const entries = info.entries || {}
  for (const entry of [entries.main, entries.client, entries.workflow, entries.api, entries.tools]) {
    for (const file of Array.isArray(entry) ? entry : [entry]) {
      if (file) files.add(file)
    }
  }
  return [...files]
}

export async function installClientPluginFromStore(options: ClientPluginInstallOptions): Promise<PluginMeta> {
  const base = options.sourceUrl.replace(/\/+$/, '')
  const manifestNames = ['plugin.json', 'manifest.json', 'info.json', 'web-plugin.json', 'package.json']
  let manifestName = ''
  let manifest: PluginInfo | null = null

  for (const name of manifestNames) {
    const text = await tryFetchText(`${base}/${name}`)
    if (!text) continue
    const parsed = JSON.parse(text) as PluginInfo
    if (parsed?.id || parsed?.name) {
      manifestName = name
      manifest = parsed
      break
    }
  }

  if (!manifest || !manifestName) throw new Error(`Client plugin manifest not found: ${options.pluginId}`)
  if ((manifest.id || options.pluginId) !== options.pluginId) throw new Error(`Client plugin id mismatch: ${manifest.id || ''}`)
  if (manifest.type && manifest.type !== 'client' && manifest.type !== 'both') {
    throw new Error(`Plugin is not client executable: ${options.pluginId}`)
  }

  const targetDir = localClientPluginDir(options.pluginId)
  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(targetDir, { recursive: true })

  for (const file of collectClientPluginFiles(manifest, manifestName)) {
    const targetPath = safeJoinPluginPath(targetDir, file)
    if (!targetPath) continue
    try {
      const buffer = await fetchBuffer(`${base}/${file}`)
      mkdirSync(dirname(targetPath), { recursive: true })
      writeFileSync(targetPath, buffer)
    } catch {
      continue
    }
  }

  const info = readManifestFromDir(targetDir)
  if (!info) throw new Error(`Client plugin install failed: ${options.pluginId}`)
  writeFileSync(join(targetDir, '.client-state.json'), JSON.stringify({ md5: options.md5, installedAt: Date.now() }, null, 2), 'utf-8')
  const meta = normalizePluginMeta(options.pluginId, targetDir, info)
  return meta
}

export function uninstallClientPlugin(pluginId: string): void {
  const dir = resolvePluginDir(pluginId)
  if (!dir) throw new Error(`Client plugin not found: ${pluginId}`)
  rmSync(dir, { recursive: true, force: true })
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
