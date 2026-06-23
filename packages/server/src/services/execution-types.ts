// Workflow 执行引擎专用类型 —— 从 execution-manager.ts 提取。
// 供 ExecutionManager 主类与各 helper 模块共享。

import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  WorkflowGroup,
  ExecutionStep,
  ExecutionLogEntry,
  EngineStatus,
  OutputField,
  ExecutionBacklogEvent,
  ExecutionRecoveryResponse,
  WorkflowDryRunOptions,
} from '@agent-spaces/shared';
import type { InteractionManager } from './interaction-manager.js';
import type { ClientNodeManager } from './client-node-manager.js';

export interface ExecutionManagerDeps {
  interactionManager: InteractionManager
  clientNodeManager: ClientNodeManager
  emit: (channel: string, payload: unknown) => void
}

export interface ExecutionSession {
  id: string
  workflow: Workflow
  ownerClientId: string
  workspaceId?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  groups?: WorkflowGroup[]
  variables?: OutputField[]
  logSnapshot?: {
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
    groups?: WorkflowGroup[]
    variables?: OutputField[]
  }
  context: Record<string, any>
  status: EngineStatus
  executionOrder: WorkflowNode[]
  currentIndex: number
  pauseRequested: boolean
  pauseReason?: 'manual' | 'breakpoint-start' | 'breakpoint-end'
  pauseNodeId?: string
  pauseBreakpoint?: 'start' | 'end'
  stopRequested: boolean
  startedAt: number
  finishedAt?: number
  steps: ExecutionStep[]
  activeBranches: Map<string, string>
  lastErrorMessage?: string
  persisted: boolean
  lastUpdatedAt: number
  eventSequence: number
  recentEvents: ExecutionBacklogEvent[]
  loopStack: LoopExecutionFrame[]
  breakpointBypassKeys: Set<string>
  dryRun?: WorkflowDryRunOptions
  eventSink?: (channel: string, payload: unknown) => void
}

export interface LoopExecutionFrame {
  loopNodeId: string
  parentData?: Record<string, unknown>
  bodyAnchorId: string
  variables: Record<string, unknown>
  breakRequested?: boolean
  metadata: {
    index: number
    count: number | null
    item: unknown
    isFirst: boolean
    isLast: boolean
  }
}

export interface LoopIterations {
  count: number | null
  items: unknown[]
  infinite: boolean
}

export interface LoopWorkerState {
  branch: Map<string, string>
  data: Record<string, any>
  frame: LoopExecutionFrame
  inputs: Record<string, any>
}

export interface FinishedExecutionRecovery {
  ownerClientId: string
  workflowId: string
  recovery: NonNullable<ExecutionRecoveryResponse['execution']>
  expiresAt: number
}
