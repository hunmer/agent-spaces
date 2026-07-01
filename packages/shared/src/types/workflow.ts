//
// Design decisions:
// 1. Node type is string + data: Record<string, unknown> (loose coupling)
// 2. Timestamps are number (epoch ms)
// 3. All workflow extensions (groups, triggers, plugins) are optional
// 4. Legacy WorkflowTemplate is a type alias for backward compat
// 5. Legacy agent/command node data preserved via legacy- prefixed helpers

// ---- JSON helpers ----

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = Record<string, JsonValue>

// ---- Folder ----

export interface WorkflowFolder {
  id: string
  name: string
  parentId: string | null
  order: number
  createdAt: number
}

// ---- Node ----

export type NodeRunState = 'normal' | 'disabled' | 'skipped'
export type NodeBreakpoint = 'start' | 'end'

export interface ConditionItem {
  id: string
  variable: string
  compareMode?: 'value' | 'length'
  operator: string
  value: string
}

export interface ConditionGroup {
  id: string
  joiner?: 'and' | 'or'
  conditions: ConditionItem[]
}

export interface WorkflowNodeCompositeMeta {
  rootId?: string
  parentId?: string | null
  role?: string
  generated?: boolean
  hidden?: boolean
  scopeBoundary?: boolean
}

export interface WorkflowNode {
  id: string
  type: string
  label: string
  position: { x: number; y: number }
  data: Record<string, unknown>
  inputFields?: OutputField[]
  outputs?: OutputField[]
  nodeState?: NodeRunState
  breakpoint?: NodeBreakpoint
  nodeColor?: string
  composite?: WorkflowNodeCompositeMeta
}

// ---- Edge ----

export interface WorkflowEdgeCompositeMeta {
  rootId?: string
  parentId?: string | null
  generated?: boolean
  hidden?: boolean
  locked?: boolean
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  edgeKind?: 'runtime' | 'reference'
  sourceHandle?: string | null
  targetHandle?: string | null
  startLabel?: string
  middleLabel?: string
  endLabel?: string
  edgeLineStyle?: 'solid' | 'dashed'
  composite?: WorkflowEdgeCompositeMeta
}

// ---- Embedded Workflow ----

export interface EmbeddedWorkflow {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

// ---- Agent Config ----

export interface AgentResourceItem {
  id: string
  name: string
  enabled: boolean
  description?: string
  command?: string
  source?: string
}

export interface WorkflowAgentConfig {
  workspaceDir: string
  dataDir: string
  skills: AgentResourceItem[]
  mcps: AgentResourceItem[]
}

// ---- Groups ----

export interface WorkflowGroup {
  id: string
  name: string
  childNodeIds: string[]
  childGroupIds: string[]
  x?: number
  y?: number
  width?: number
  height?: number
  color?: string
  locked: boolean
  disabled: boolean
  savedNodeStates: Record<string, NodeRunState>
}

// ---- Triggers ----

export interface WorkflowTriggerBase {
  id: string
  enabled: boolean
}

export type WorkflowTrigger =
  | (WorkflowTriggerBase & {
      type: 'cron'
      cron: string
      timezone?: string
    })
  | (WorkflowTriggerBase & {
      type: 'hook'
      hookName: string
    })

// ---- Main Workflow Model ----

export interface Workflow {
  id: string
  name: string
  type?: 'normal' | 'workspace'
  folderId: string | null
  icon?: string
  description?: string
  tags?: string[]
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  createdAt: number
  updatedAt: number
  /** Epoch ms of the most recent execution start; undefined if never run. Used for "last run" sorting. */
  lastRunAt?: number
  enabledPlugins?: string[]
  agentConfig?: WorkflowAgentConfig
  pluginConfigSchemes?: Record<string, string>
  layoutSnapshot?: Record<string, unknown>
  groups?: WorkflowGroup[]
  triggers?: WorkflowTrigger[]
  variables?: OutputField[]
  /** 是否已发布（开放访问）。默认 false，未发布时 share 页面展示占位提示。 */
  published?: boolean
}

// ---- Node Property Definition (for editor) ----

export interface OutputField {
  key: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'file' | 'image' | 'audio' | 'video' | 'select' | 'any' | 'string[]' | 'number[]' | 'file[]' | 'image[]' | 'audio[]' | 'video[]' | 'any[]'
  value?: unknown
  fileNameFilter?: string
  description?: string
  required?: boolean
  inputMode?: 'variable' | 'native'
  options?: string[]
  children?: OutputField[]
}

export type DataType = 'string' | 'number' | 'boolean' | 'string[]' | 'number[]' | 'object[]' | 'object' | 'any'

export interface ArrayFieldItem {
  key: string
  label: string
  type: 'text' | 'number' | 'select' | 'checkbox' | 'output_fields'
  dataType?: DataType
  required?: boolean
  default?: unknown
  options?: { label: string; value: string }[]
  placeholder?: string
}

export interface NodePropertyVisibleWhen {
  key: string
  equals?: unknown
  in?: unknown[]
}

export interface NodePropertyDynamicOptions {
  source: 'sqlite-tables' | 'sqlite-columns' | 'mini-apps'
  dependsOn: string
  dependsOnTableKey?: string
  allOption?: boolean
  placeholder?: string
}

export interface NodeProperty {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'code' | 'conditions' | 'array' | 'output_fields' | 'agent' | 'sqlite' | 'knowledge-base'
  dataType?: DataType
  required?: boolean
  readonly?: boolean
  default?: unknown
  options?: { label: string; value: string }[]
  language?: string
  tooltip?: string
  placeholder?: string
  inputMode?: 'variable' | 'native'
  fields?: ArrayFieldItem[]
  itemTemplate?: Record<string, unknown>
  visibleWhen?: NodePropertyVisibleWhen
  dynamicOptions?: NodePropertyDynamicOptions
}

export interface NodeNamedHandleConfig {
  id: string
  label?: string
}

export interface CompoundChildNodeDefinition {
  role: string
  type: string
  label?: string
  offset?: { x: number; y: number }
  hidden?: boolean
  scopeBoundary?: boolean
  parentRole?: string
  data?: Record<string, unknown>
}

export interface CompoundEdgeDefinition {
  sourceRole: string
  targetRole: string
  sourceHandle?: string | null
  targetHandle?: string | null
  hidden?: boolean
  locked?: boolean
}

export interface CompoundNodeDefinition {
  rootRole?: string
  children: CompoundChildNodeDefinition[]
  edges?: CompoundEdgeDefinition[]
}

export interface NodeHandleConfig {
  source?: boolean
  target?: boolean
  connectionCount?: number
  sourceHandles?: NodeNamedHandleConfig[]
  dynamicSource?: {
    dataKey: string
    extraCount?: number
  }
}

export interface WorkflowNodeOutputMiddleware {
  type: 'arrayItemField'
  sourceKey: string
  itemKey: string
  targetKey: string
}

export interface WorkflowNodeInputMiddleware {
  type: 'stringArrayToObjectArray'
  sourceKey: string
  targetKey: string
  valueKey: string
  copyValueToKeys?: string[]
  defaults?: Record<string, unknown>
}

export interface NodeTypeDefinition {
  type: string
  label: string
  category: string
  icon: string
  description: string
  properties: NodeProperty[]
  handles?: NodeHandleConfig
  allowInputFields?: boolean
  /** 限制本节点「输入字段」允许的输出类型；未声明则允许全部 */
  allowedInputFieldTypes?: OutputField['type'][]
  outputs?: OutputField[]
  readonlyOutputs?: boolean
  inputMiddleware?: WorkflowNodeInputMiddleware
  outputMiddleware?: WorkflowNodeOutputMiddleware
  customView?: unknown
  customViewMinSize?: { width?: number; height?: number }
  manualCreate?: boolean
  singleton?: boolean
  debuggable?: boolean
  compound?: CompoundNodeDefinition
}

// ---- Execution ----

export interface ExecutionLogEntry {
  level: 'info' | 'warning' | 'error'
  message: string
  timestamp: number
}

export interface ExecutionStep {
  nodeId: string
  nodeLabel: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'completed' | 'error' | 'skipped'
  input?: unknown
  output?: unknown
  error?: string
  logs?: ExecutionLogEntry[]
}

export interface ExecutionLog {
  id: string
  workflowId: string
  issueId?: string
  issueTitle?: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'completed' | 'paused' | 'error'
  steps: ExecutionStep[]
  snapshot?: {
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
    groups?: WorkflowGroup[]
    variables?: OutputField[]
  }
}

export interface WorkflowVersion {
  id: string
  workflowId: string
  name: string
  snapshot: {
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
  }
  createdAt: number
}

export type EngineStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error'

export interface OperationEntry {
  description: string
  timestamp: number
  snapshot?: string
}

export interface StagedNode {
  id: string
  sourceNodeId: string
  type: string
  label: string
  data: Record<string, unknown>
  composite?: WorkflowNodeCompositeMeta
  stagedAt: number
}

export interface WorkflowAgentToolCall {
  id: string
  name: string
  input?: unknown
  result?: unknown
  status: 'running' | 'success' | 'error'
}

export type WorkflowAgentTimelineItem =
  | { id: string; type: 'thinking'; content: string }
  | { id: string; type: 'message'; content: string }
  | ({ type: 'tool' } & WorkflowAgentToolCall)

export interface WorkflowAgentChatMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: string
  toolCalls?: WorkflowAgentToolCall[]
  timeline?: WorkflowAgentTimelineItem[]
}

export interface ExecutionInputPreset {
  id: string
  name: string
  values: Record<string, unknown>
  createdAt: number
}

// ============================================================
// Legacy compatibility
// ============================================================
//
// agent-spaces original WorkflowTemplate used discriminated union
// node types (agent | command) and ISO string timestamps.
// We keep type aliases and adapter helpers for backward compat.

/** @deprecated Use Workflow instead. Kept for backward compat. */
export type WorkflowTemplate = Workflow

// ---- Legacy node data shapes (for adapter use) ----

export interface LegacyAgentNodeData {
  label: string
  agentConfigId: string
  role: string
  avatarUrl?: string
  modelId?: string
  taskTitleTemplate?: string
  taskDescriptionTemplate?: string
}

export interface LegacyCommandNodeData {
  label: string
  script: string
  cwd?: string
  env?: Record<string, string>
  shell?: string
  failStrategy?: 'stop'
}

/**
 * Convert legacy agent-spaces WorkflowTemplate (with discriminated union nodes)
 * to unified Workflow. This is a type-level helper — actual conversion happens
 * in server migration code.
 *
 * Legacy shape:
 *   nodes: WorkflowAgentNode[] | WorkflowCommandNode[]  (type: 'agent' | 'command')
 *   createdAt/updatedAt: string (ISO)
 *
 * Unified shape:
 *   nodes: WorkflowNode[]  (type: string, data: Record<string, unknown>)
 *   createdAt/updatedAt: number (epoch ms)
 */
export interface LegacyWorkflowTemplateRaw {
  id: string
  name: string
  description?: string
  nodes: Array<{
    id: string
    type: 'agent' | 'command'
    position: { x: number; y: number }
    data: LegacyAgentNodeData | LegacyCommandNodeData
  }>
  edges: Array<{
    id: string
    source: string
    target: string
  }>
  viewport?: { x: number; y: number; zoom: number }
  createdAt: string
  updatedAt: string
}
