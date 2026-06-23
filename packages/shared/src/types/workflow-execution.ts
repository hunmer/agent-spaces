import type {
  EngineStatus,
  ExecutionLog,
  ExecutionLogEntry,
  ExecutionStep,
  OutputField,
  Workflow,
  WorkflowEdge,
  WorkflowGroup,
  WorkflowNode,
} from './workflow.js'
import type { BackendErrorShape } from './workflow-errors.js'

// ---- Execution Event Types ----

export type ExecutionEventChannel =
  | 'workflow:started'
  | 'workflow:paused'
  | 'workflow:resumed'
  | 'workflow:completed'
  | 'workflow:error'
  | 'node:start'
  | 'node:progress'
  | 'node:complete'
  | 'node:error'
  | 'execution:log'
  | 'execution:context'

// ---- Base Event ----

export interface ExecutionEventBase {
  executionId: string
  workflowId: string
  timestamp: number
}

// ---- Workflow-level Events ----

export interface WorkflowStartedEvent extends ExecutionEventBase {
  status: 'running'
  workflowName?: string
}

export interface WorkflowPausedEvent extends ExecutionEventBase {
  status: 'paused'
  currentNodeId?: string
  reason?: 'manual' | 'breakpoint-start' | 'breakpoint-end'
}

export interface WorkflowResumedEvent extends ExecutionEventBase {
  status: 'running'
  currentNodeId?: string
}

export interface WorkflowCompletedEvent extends ExecutionEventBase {
  status: 'completed'
  log: ExecutionLog
  context: Record<string, unknown>
}

export interface WorkflowErrorEvent extends ExecutionEventBase {
  status: 'error'
  error: BackendErrorShape
  log?: ExecutionLog
}

// ---- Node-level Events ----

export interface NodeStartEvent extends ExecutionEventBase {
  nodeId: string
  nodeLabel: string
  input?: unknown
}

export interface NodeProgressEvent extends ExecutionEventBase {
  nodeId: string
  message?: string
  progress?: number
  data?: unknown
}

export interface NodeCompleteEvent extends ExecutionEventBase {
  nodeId: string
  step: ExecutionStep
}

export interface NodeErrorEvent extends ExecutionEventBase {
  nodeId: string
  step: ExecutionStep
  error: BackendErrorShape
}

// ---- Log & Context Events ----

export interface ExecutionLogEvent extends ExecutionEventBase {
  log: ExecutionLog
}

export interface ExecutionContextEvent extends ExecutionEventBase {
  context: Record<string, unknown>
}

// ---- Snapshot ----

export interface ExecutionSnapshot {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  groups?: Workflow['groups']
  variables?: OutputField[]
}

// ---- Backlog (for recovery) ----

export interface ExecutionBacklogEvent {
  sequence: number
  channel: ExecutionEventChannel
  payload: ExecutionEventMap[ExecutionEventChannel]
}

// ---- Recovery ----

export interface ExecutionRecoveryRequest {
  workflowId: string
  executionId?: string | null
}

export interface ExecutionRecoveryState {
  executionId: string
  workflowId: string
  status: EngineStatus
  currentNodeId?: string
  pauseReason?: WorkflowPausedEvent['reason']
  updatedAt: number
  active: boolean
  log: ExecutionLog
  context: Record<string, unknown>
  recentEvents: ExecutionBacklogEvent[]
}

export interface ExecutionRecoveryResponse {
  found: boolean
  execution?: ExecutionRecoveryState
}

// ---- Control Requests ----

export interface ExecutionControlRequest {
  executionId: string
}

export interface WorkflowExecuteRequest {
  workflowId: string
  input?: Record<string, unknown>
  env?: Record<string, unknown>
  context?: Record<string, unknown>
  snapshot?: ExecutionSnapshot
  startNodeId?: string
  dryRun?: WorkflowDryRunOptions
}

export interface WorkflowDryRunOptions {
  nodeIds?: string[]
  inputs?: Record<string, unknown>
  outputs?: Record<string, unknown>
}

export interface WorkflowExecuteResponse {
  executionId: string
  status: EngineStatus
}

export interface WorkflowDebugNodeRequest {
  workflowId: string
  nodeId: string
  input?: Record<string, unknown>
  env?: Record<string, unknown>
  context?: Record<string, unknown>
  snapshot?: ExecutionSnapshot
  embeddedNode?: WorkflowNode
}

export interface WorkflowDebugNodeResponse {
  status: 'completed' | 'error'
  output?: unknown
  error?: string
  duration: number
  logs?: ExecutionLogEntry[]
}

// ---- Event Map ----

export interface ExecutionEventMap {
  'workflow:started': WorkflowStartedEvent
  'workflow:paused': WorkflowPausedEvent
  'workflow:resumed': WorkflowResumedEvent
  'workflow:completed': WorkflowCompletedEvent
  'workflow:error': WorkflowErrorEvent
  'node:start': NodeStartEvent
  'node:progress': NodeProgressEvent
  'node:complete': NodeCompleteEvent
  'node:error': NodeErrorEvent
  'execution:log': ExecutionLogEvent
  'execution:context': ExecutionContextEvent
}
