// ============================================================
// Workflow Plugin Types
// ============================================================

import type { NodeProperty, NodeTypeDefinition } from './workflow.js'

// ---- Plugin Info ----

export type PluginRuntimeType = 'server' | 'client' | 'both'
export type PluginStartupTrigger = 'server-load' | 'first-request'

export interface PluginStartupConfig {
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  trigger: PluginStartupTrigger
  readyUrl?: string
  readyTimeoutMs?: number
}

export interface PluginConfigField {
  key: string
  label: string
  desc?: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'object'
  value: string
  options?: Array<{ label: string; value: string }>
  placeholder?: string
  required?: boolean
}

export interface PluginAuthor {
  name: string
  email?: string
  url?: string
}

export interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  author: PluginAuthor
  tags?: string[]
  /** Relative path to icon file (svg, png, jpeg, webp, etc.) within the plugin directory */
  icon?: string
  minAppVersion?: string
  hasView?: boolean
  hasWorkflow?: boolean
  type?: PluginRuntimeType
  startup?: PluginStartupConfig
  config?: PluginConfigField[]
  entries?: {
    main?: string
    server?: string
    client?: string
    workflow?: string
    tools?: string | string[]
    api?: string
    view?: string
  }
}

export interface PluginMeta {
  id: string
  name: string
  version: string
  description: string
  author: PluginAuthor
  tags: string[]
  hasView: boolean
  hasWorkflow?: boolean
  type?: PluginRuntimeType
  enabled: boolean
  config?: PluginConfigField[]
  iconPath?: string
  md5?: string
  installedAt?: number
}

// ---- Agent Tool (from plugins) ----

export interface AgentToolDefinition {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
  pluginId?: string
}

// ---- Plugin Query Results ----

export interface PluginWorkflowNodesResult {
  pluginId: string
  nodes: NodeTypeDefinition[]
}

export interface PluginConfigSaveResult {
  success: boolean
  error?: string
}

// ---- Plugin Entry Resolution ----

export type PluginEntryKind = 'main' | 'server' | 'client' | 'workflow' | 'tools' | 'api' | 'view'

const DEFAULT_PLUGIN_ENTRY_FILES: Record<PluginEntryKind, string | string[]> = {
  main: 'main.js',
  server: 'main.js',
  client: 'main.js',
  workflow: 'workflow.js',
  tools: 'tools.js',
  api: 'api.js',
  view: 'view.js',
}

export function resolvePluginEntryFile(info: PluginInfo, kind: PluginEntryKind): string {
  const entry = info.entries?.[kind]
  if (typeof entry === 'string' && entry.trim()) return entry.trim()
  if (Array.isArray(entry)) return entry.map(file => file.trim()).find(Boolean) ?? ''

  const fallback = DEFAULT_PLUGIN_ENTRY_FILES[kind]
  if (Array.isArray(fallback)) return fallback[0] ?? ''
  return fallback
}

export function resolvePluginEntryFiles(info: PluginInfo, kind: PluginEntryKind): string[] {
  const entry = info.entries?.[kind]
  if (Array.isArray(entry)) return entry.map(file => file.trim()).filter(Boolean)
  if (typeof entry === 'string' && entry.trim()) return [entry.trim()]

  const fallback = DEFAULT_PLUGIN_ENTRY_FILES[kind]
  if (Array.isArray(fallback)) return fallback
  return [fallback]
}

// ---- Local Bridge Nodes ----
// Nodes that run in the main process (Electron) or backend

export interface LocalBridgeWorkflowNodeDefinition extends NodeTypeDefinition {
  runtime: 'main_process_bridge'
  source: 'browser_tool'
}

const DELAY_NODE_PROPERTIES: NodeProperty[] = [
  {
    key: 'milliseconds',
    label: 'nodes.delay.props.milliseconds',
    type: 'number',
    required: true,
    default: 1000,
    tooltip: 'nodes.delay.props.milliseconds_tooltip',
  },
  {
    key: 'reason',
    label: 'nodes.delay.props.reason',
    type: 'text',
    tooltip: 'nodes.delay.props.reason_tooltip',
  },
]

export const LOCAL_BRIDGE_WORKFLOW_NODES: LocalBridgeWorkflowNodeDefinition[] = [
  {
    type: 'delay',
    label: 'nodes.delay.label',
    category: 'nodes.categories.utilities',
    icon: 'Circle',
    description: 'nodes.delay.description',
    properties: DELAY_NODE_PROPERTIES,
    runtime: 'main_process_bridge',
    source: 'browser_tool',
  },
]

export function getLocalBridgeWorkflowNode(type: string): LocalBridgeWorkflowNodeDefinition | undefined {
  return LOCAL_BRIDGE_WORKFLOW_NODES.find((node) => node.type === type)
}

export function isLocalBridgeWorkflowNode(type: string): boolean {
  return LOCAL_BRIDGE_WORKFLOW_NODES.some((node) => node.type === type)
}
