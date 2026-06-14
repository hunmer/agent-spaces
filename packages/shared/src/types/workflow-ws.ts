// ============================================================
// Workflow WS Protocol & Channel Contracts
// ============================================================
// WebSocket message types for workflow communication.
// Only includes workflow-related channels (not chat/aiProvider/etc
// which agent-spaces already handles separately).

import type { BackendErrorShape } from './workflow-errors.js'
import type {
  ExecutionControlRequest,
  ExecutionRecoveryRequest,
  ExecutionRecoveryResponse,
  WorkflowDebugNodeRequest,
  WorkflowDebugNodeResponse,
  WorkflowExecuteRequest,
  WorkflowExecuteResponse,
} from './workflow-execution.js'
import type {
  ExecutionLog,
  OperationEntry,
  StagedNode,
  Workflow,
  WorkflowFolder,
  WorkflowVersion,
  ExecutionInputPreset,
} from './workflow.js'
import type {
  AgentToolDefinition,
  PluginConfigSaveResult,
  PluginMeta,
  PluginWorkflowNodesResult,
} from './workflow-plugin.js'

// ---- WS Message Types ----

export type WSMessageKind =
  | 'request'
  | 'response'
  | 'event'
  | 'error'
  | 'interaction_required'
  | 'interaction_response'

export interface WSRequest<Channel extends string = string, Data = unknown> {
  id: string
  channel: Channel
  type: 'request'
  data: Data
  timeoutMs?: number
}

export interface WSResponse<Channel extends string = string, Data = unknown> {
  id: string
  channel: Channel
  type: 'response'
  data: Data
}

export interface WorkflowWSEvent<Channel extends string = string, Data = unknown> {
  channel: Channel
  type: 'event'
  data: Data
}

export interface WSError<Channel extends string = string> {
  id?: string
  channel?: Channel
  type: 'error'
  error: BackendErrorShape
}

// ---- Interaction Types ----

export type InteractionType =
  | 'file_select'
  | 'form'
  | 'confirm'
  | 'agent_chat'
  | 'chat_tool'
  | 'node_execution'
  | 'table_confirm'
  | 'dialog_alert'
  | 'dialog_prompt'
  | 'dialog_form'
  | 'custom'

export interface AgentChatInteractionSchema {
  prompt: string
  systemPrompt?: string
  cwd?: string
  additionalDirectories?: string[]
  permissionMode?: string
  extraInstructions?: string
  loadProjectClaudeMd?: boolean
  loadRuleMd?: boolean
  workflowId?: string
  workflowName?: string
  workflowDescription?: string
  enabledPlugins?: string[]
}

export interface NodeExecutionInteractionSchema {
  toolType: string
  params: Record<string, unknown>
}

export interface ChatToolInteractionSchema {
  kind: 'renderer_workflow_tool' | 'client_agent_tool'
  requestId: string
  toolName: string
  args: Record<string, unknown>
  targetTabId?: string
}

export interface TableConfirmInteractionSchema {
  headers: Array<{ id: string; title: string; type: 'string' | 'number' | 'boolean' }>
  cells: Array<{ id: string; data: Record<string, unknown> }>
  selectionMode: 'none' | 'single' | 'multi'
}

export interface InteractionRequest<Data = unknown> {
  id: string
  channel: 'workflow:interaction'
  type: 'interaction_required'
  executionId: string
  workflowId: string
  nodeId: string
  interactionType: InteractionType
  schema: Data
  timeoutMs?: number
}

export interface InteractionResponse<Data = unknown> {
  id: string
  channel: 'workflow:interaction'
  type: 'interaction_response'
  executionId: string
  workflowId: string
  nodeId: string
  data: Data
  cancelled?: boolean
  error?: BackendErrorShape
}

export interface ClientNodeRequest<Data = Record<string, unknown>> {
  id: string
  channel: 'workflow:client-node'
  type: 'client_node_request'
  executionId: string
  workflowId: string
  nodeId: string
  nodeType: string
  args: Data
  timeoutMs?: number
}

export interface ClientNodeResponse<Data = unknown> {
  id: string
  channel: 'workflow:client-node'
  type: 'client_node_response'
  executionId: string
  workflowId: string
  nodeId: string
  data?: Data
  error?: BackendErrorShape
}

export type WSIncomingMessage =
  | WSRequest
  | WSResponse
  | WorkflowWSEvent
  | WSError
  | InteractionRequest
  | InteractionResponse
  | ClientNodeRequest
  | ClientNodeResponse

export type WSOutgoingMessage = WSIncomingMessage

// ---- Handshake ----

export interface WSClientHello {
  protocolVersion: 1
  clientId?: string
  token?: string
}

export interface WSServerHello {
  protocolVersion: 1
  serverId: string
  clientId: string
  heartbeatIntervalMs: number
}

// ============================================================
// Channel Contracts (workflow-related only)
// ============================================================

export interface ChannelContract<Request, Response> {
  request: Request
  response: Response
}

export type EmptyRequest = undefined
export type EmptyResponse = undefined

// ---- Workflow CRUD ----

export interface WorkflowListRequest {
  folderId?: string | null
}

export interface WorkflowCreateRequest {
  data: Omit<Workflow, 'id'>
}

export interface WorkflowUpdateRequest {
  id: string
  data: Partial<Omit<Workflow, 'id'>>
}

export interface WorkflowDeleteRequest {
  id: string
}

export interface WorkflowGetRequest {
  id: string
}

// ---- Folder CRUD ----

export interface WorkflowFolderCreateRequest {
  data: Omit<WorkflowFolder, 'id'>
}

export interface WorkflowFolderUpdateRequest {
  id: string
  data: Partial<Omit<WorkflowFolder, 'id'>>
}

export interface WorkflowFolderDeleteRequest {
  id: string
}

// ---- Version CRUD ----

export interface WorkflowVersionListRequest {
  workflowId: string
}

export interface WorkflowVersionAddRequest {
  workflowId: string
  name: string
  nodes: Workflow['nodes']
  edges: Workflow['edges']
}

export interface WorkflowVersionGetRequest {
  workflowId: string
  versionId: string
}

export interface WorkflowVersionDeleteRequest {
  workflowId: string
  versionId: string
}

export interface WorkflowVersionClearRequest {
  workflowId: string
}

// ---- Execution Log ----

export interface ExecutionLogListRequest {
  workflowId: string
}

export interface ExecutionLogSaveRequest {
  workflowId: string
  log: ExecutionLog
}

export interface ExecutionLogDeleteRequest {
  workflowId: string
  id: string
}

export interface ExecutionLogClearRequest {
  workflowId: string
}

export interface ExecutionLogGetPathRequest {
  workflowId: string
  id: string
}

// ---- Operation History ----

export interface OperationHistoryLoadRequest {
  workflowId: string
}

export interface OperationHistorySaveRequest {
  workflowId: string
  entries: OperationEntry[]
}

export interface OperationHistoryClearRequest {
  workflowId: string
}

// ---- Plugin (workflow-related) ----

export interface PluginSchemeRequest {
  workflowId: string
  pluginId: string
}

export interface PluginSchemeNamedRequest extends PluginSchemeRequest {
  schemeName: string
}

export interface PluginSchemeSaveRequest extends PluginSchemeNamedRequest {
  data: Record<string, string>
}

export interface PluginIdRequest {
  id: string
}

export interface PluginInstallRequest {
  url: string
}

export interface PluginWorkflowNodesRequest {
  pluginId: string
}

export interface PluginAgentToolsRequest {
  pluginIds: string[]
}

export interface ClientPluginNodeRegistrationRequest {
  nodes: Array<Record<string, unknown>>
}

export interface ClientPluginToolRegistrationRequest {
  tools: AgentToolDefinition[]
}

export interface PluginConfigRequest {
  pluginId: string
}

export interface PluginConfigSaveRequest {
  pluginId: string
  data: Record<string, string>
}

// ---- Dashboard (workflow-related) ----

export interface DashboardStatsResponse {
  workflowCount: number
  runningCount: number
  pluginCount: number
  todayExecutions: number
  weekExecutions: number
  totalExecutions: number
  dailyTrend: Array<{
    date: string
    count: number
    success: number
    error: number
  }>
}

export interface DashboardExecutionsRequest {
  range?: 'today' | 'week' | 'all'
  status?: string
  page?: number
  pageSize?: number
}

export interface DashboardExecutionItem {
  id: string
  workflowId: string
  workflowName: string
  status: 'running' | 'completed' | 'paused' | 'error'
  startedAt: number
  finishedAt: number | null
  duration: number | null
  stepCount: number
}

export interface DashboardExecutionsResponse {
  items: DashboardExecutionItem[]
  total: number
  page: number
  pageSize: number
}

export interface DashboardWorkflowDetailRequest {
  workflowId: string
}

export interface DashboardWorkflowDetailResponse {
  workflow: {
    id: string
    name: string
    folderId: string | null
    nodeCount: number
    edgeCount: number
    createdAt: number
    updatedAt: number
  }
  versions: Array<{
    id: string
    version: number
    createdAt: number
    nodeCount: number
    description?: string
  }>
  executions: {
    items: Array<{
      id: string
      status: 'running' | 'completed' | 'paused' | 'error'
      startedAt: number
      finishedAt: number | null
      duration: number | null
      stepCount: number
    }>
    total: number
  }
}

// ---- Staging ----

export interface StagingLoadRequest {
  workflowId: string
}

export interface StagingSaveRequest {
  workflowId: string
  nodes: StagedNode[]
}

// ---- Trigger ----

export interface TriggerValidateCronRequest {
  cron: string
}

export interface TriggerValidateCronResponse {
  valid: boolean
  nextRuns: string[]
  error?: string
}

export interface TriggerCheckHookNameRequest {
  hookName: string
  excludeWorkflowId?: string
}

export interface TriggerCheckHookNameResponse {
  conflictWorkflowIds: string[]
  hookUrl: string
}

// ============================================================
// Workflow Channel Map
// ============================================================

export interface WorkflowChannelMap {
  // Workflow CRUD
  'workflow:list': ChannelContract<WorkflowListRequest, Workflow[]>
  'workflow:get': ChannelContract<WorkflowGetRequest, Workflow | undefined>
  'workflow:create': ChannelContract<WorkflowCreateRequest, Workflow>
  'workflow:update': ChannelContract<WorkflowUpdateRequest, EmptyResponse>
  'workflow:delete': ChannelContract<WorkflowDeleteRequest, EmptyResponse>
  'workflow:list-plugin-schemes': ChannelContract<PluginSchemeRequest, string[]>
  'workflow:read-plugin-scheme': ChannelContract<PluginSchemeNamedRequest, Record<string, string>>
  'workflow:create-plugin-scheme': ChannelContract<PluginSchemeNamedRequest, EmptyResponse>
  'workflow:save-plugin-scheme': ChannelContract<PluginSchemeSaveRequest, EmptyResponse>
  'workflow:delete-plugin-scheme': ChannelContract<PluginSchemeNamedRequest, EmptyResponse>

  // Folder CRUD
  'workflowFolder:list': ChannelContract<EmptyRequest, WorkflowFolder[]>
  'workflowFolder:create': ChannelContract<WorkflowFolderCreateRequest, WorkflowFolder>
  'workflowFolder:update': ChannelContract<WorkflowFolderUpdateRequest, EmptyResponse>
  'workflowFolder:delete': ChannelContract<WorkflowFolderDeleteRequest, EmptyResponse>

  // Version CRUD
  'workflowVersion:list': ChannelContract<WorkflowVersionListRequest, WorkflowVersion[]>
  'workflowVersion:add': ChannelContract<WorkflowVersionAddRequest, WorkflowVersion>
  'workflowVersion:get': ChannelContract<WorkflowVersionGetRequest, WorkflowVersion | undefined>
  'workflowVersion:delete': ChannelContract<WorkflowVersionDeleteRequest, EmptyResponse>
  'workflowVersion:clear': ChannelContract<WorkflowVersionClearRequest, EmptyResponse>
  'workflowVersion:nextName': ChannelContract<WorkflowVersionListRequest, string>

  // Execution Log
  'executionLog:list': ChannelContract<ExecutionLogListRequest, ExecutionLog[]>
  'executionLog:save': ChannelContract<ExecutionLogSaveRequest, ExecutionLog>
  'executionLog:delete': ChannelContract<ExecutionLogDeleteRequest, EmptyResponse>
  'executionLog:clear': ChannelContract<ExecutionLogClearRequest, EmptyResponse>
  'executionLog:getPath': ChannelContract<ExecutionLogGetPathRequest, string>

  // Operation History
  'operationHistory:load': ChannelContract<OperationHistoryLoadRequest, OperationEntry[]>
  'operationHistory:save': ChannelContract<OperationHistorySaveRequest, EmptyResponse>
  'operationHistory:clear': ChannelContract<OperationHistoryClearRequest, EmptyResponse>

  // Execution Control
  'workflow:execute': ChannelContract<WorkflowExecuteRequest, WorkflowExecuteResponse>
  'workflow:debug-node': ChannelContract<WorkflowDebugNodeRequest, WorkflowDebugNodeResponse>
  'workflow:get-execution-recovery': ChannelContract<ExecutionRecoveryRequest, ExecutionRecoveryResponse>
  'workflow:pause': ChannelContract<ExecutionControlRequest, WorkflowExecuteResponse>
  'workflow:resume': ChannelContract<ExecutionControlRequest, WorkflowExecuteResponse>
  'workflow:stop': ChannelContract<ExecutionControlRequest, WorkflowExecuteResponse>

  // Plugin (workflow-related)
  'plugin:list': ChannelContract<EmptyRequest, PluginMeta[]>
  'plugin:enable': ChannelContract<PluginIdRequest, EmptyResponse>
  'plugin:disable': ChannelContract<PluginIdRequest, EmptyResponse>
  'plugin:install': ChannelContract<PluginInstallRequest, PluginMeta>
  'plugin:uninstall': ChannelContract<PluginIdRequest, EmptyResponse>
  'plugin:get-workflow-nodes': ChannelContract<PluginWorkflowNodesRequest, PluginWorkflowNodesResult>
  'plugin:list-workflow-plugins': ChannelContract<EmptyRequest, PluginMeta[]>
  'plugin:get-agent-tools': ChannelContract<PluginAgentToolsRequest, AgentToolDefinition[]>
  'plugin:get-config': ChannelContract<PluginConfigRequest, Record<string, string>>
  'plugin:save-config': ChannelContract<PluginConfigSaveRequest, PluginConfigSaveResult>
  'chat:register-client-nodes': ChannelContract<ClientPluginNodeRegistrationRequest, EmptyResponse>
  'chat:register-client-agent-tools': ChannelContract<ClientPluginToolRegistrationRequest, EmptyResponse>

  // Agent Tool Execution
  'agent:execTool': ChannelContract<{ toolType: string; params: Record<string, unknown>; targetTabId?: string }, unknown>

  // Dashboard
  'dashboard:stats': ChannelContract<EmptyRequest, DashboardStatsResponse>
  'dashboard:executions': ChannelContract<DashboardExecutionsRequest, DashboardExecutionsResponse>
  'dashboard:workflow-detail': ChannelContract<DashboardWorkflowDetailRequest, DashboardWorkflowDetailResponse>

  // Execution Input Presets
  'executionPreset:list': ChannelContract<{ workflowId: string }, ExecutionInputPreset[]>
  'executionPreset:save': ChannelContract<{ workflowId: string; preset: ExecutionInputPreset }, EmptyResponse>
  'executionPreset:delete': ChannelContract<{ workflowId: string; presetId: string }, EmptyResponse>
  'executionPreset:get-default': ChannelContract<{ workflowId: string }, { presetId: string | null }>
  'executionPreset:set-default': ChannelContract<{ workflowId: string; presetId: string | null }, EmptyResponse>

  // Trigger
  'trigger:validate-cron': ChannelContract<TriggerValidateCronRequest, TriggerValidateCronResponse>
  'trigger:check-hook-name': ChannelContract<TriggerCheckHookNameRequest, TriggerCheckHookNameResponse>

  // Staging
  'staging:load': ChannelContract<{ workflowId: string }, StagedNode[]>
  'staging:save': ChannelContract<StagingSaveRequest, EmptyResponse>
  'staging:clear': ChannelContract<{ workflowId: string }, EmptyResponse>
}

export type WorkflowChannel = keyof WorkflowChannelMap
export type ChannelRequest<C extends WorkflowChannel> = WorkflowChannelMap[C]['request']
export type ChannelResponse<C extends WorkflowChannel> = WorkflowChannelMap[C]['response']
