// Workflow Execution Manager — core execution engine
// Ported from work_fox, adapted for agent-spaces:
// - Removed: pluginRegistry, clientNodeCache, Electron main process bridge
// - Changed: agent_run uses agent-spaces Agent runtime directly
// - Kept: DAG traversal, loops, switches, variables, breakpoints, recovery

import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  WorkflowGroup,
  ExecutionLog,
  ExecutionStep,
  ExecutionLogEntry,
  EngineStatus,
  ConditionItem,
  OutputField,
} from '@agent-spaces/shared';
import type {
  ExecutionBacklogEvent,
  ExecutionEventChannel,
  ExecutionEventMap,
  ExecutionRecoveryRequest,
  ExecutionRecoveryResponse,
  WorkflowDebugNodeRequest,
  WorkflowDebugNodeResponse,
  WorkflowExecuteRequest,
  WorkflowExecuteResponse,
} from '@agent-spaces/shared';
import { createErrorShape } from '@agent-spaces/shared';
import type { AgentRuntimeConfig } from '../adapters/agent-runtime-types.js';
import type { InteractionManager } from './interaction-manager.js';
import type { ClientNodeManager } from './client-node-manager.js';
import * as workflowStore from '../storage/workflow-store.js';
import * as sqliteStore from '../storage/sqlite-store.js';
import { validateIdentifier } from '../storage/sql-safety.js';
import * as pluginService from './plugin.js';
import { executeCommandNode } from './workflow-command-runner.js';
import { getThinkingRuntimeConfig } from './llm-model-config.js';
import * as workspaceService from './workspace.js';
import { buildAgentPrompt } from '../ws/agent-prompt.js';

interface ExecutionManagerDeps {
  interactionManager: InteractionManager
  clientNodeManager: ClientNodeManager
  emit: (channel: string, payload: unknown) => void
}

interface ExecutionSession {
  id: string
  workflow: Workflow
  ownerClientId: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  groups?: WorkflowGroup[]
  variables?: OutputField[]
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
  eventSink?: (channel: string, payload: unknown) => void
}

interface LoopExecutionFrame {
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

interface LoopIterations {
  count: number | null
  items: unknown[]
  infinite: boolean
}

interface LoopWorkerState {
  branch: Map<string, string>
  data: Record<string, any>
  frame: LoopExecutionFrame
  inputs: Record<string, any>
}

interface FinishedExecutionRecovery {
  ownerClientId: string
  workflowId: string
  recovery: NonNullable<ExecutionRecoveryResponse['execution']>
  expiresAt: number
}

const MAX_RECENT_EVENTS = 100;
const FINISHED_RECOVERY_TTL_MS = 2 * 60_000;
const DELAY_NODE_MIN_MS = 100;
const DELAY_NODE_MAX_MS = 30_000;

export class ExecutionManager {
  private sessions = new Map<string, ExecutionSession>();
  private finishedRecoveries = new Map<string, FinishedExecutionRecovery>();
  private loopWorkerState = new AsyncLocalStorage<LoopWorkerState>();

  constructor(private deps: ExecutionManagerDeps) {}

  getRunningSessionCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.status === 'running' || session.status === 'paused') count++;
    }
    return count;
  }

  async execute(
    request: WorkflowExecuteRequest,
    ownerClientId: string,
    eventSink?: (channel: string, payload: unknown) => void,
  ): Promise<WorkflowExecuteResponse> {
    const workflow = workflowStore.getWorkflow(request.workflowId);
    if (!workflow) {
      throw createErrorShape('NOT_FOUND', `Workflow not found: ${request.workflowId}`);
    }

    const snapshot = this.resolveExecutionSnapshot(workflow, request);
    const executionId = randomUUID();
    const session = this.createSession(
      executionId, workflow, ownerClientId, request.input || {}, snapshot, undefined, request.env, eventSink,
    );
    session.context.__config__ = this.loadPluginConfigs(session);

    this.sessions.set(executionId, session);
    void this.run(session);
    return { executionId, status: 'running' };
  }

  async debugNode(
    request: WorkflowDebugNodeRequest,
    ownerClientId: string,
  ): Promise<WorkflowDebugNodeResponse> {
    const startedAt = Date.now();
    const workflow = workflowStore.getWorkflow(request.workflowId);
    if (!workflow) {
      throw createErrorShape('NOT_FOUND', `Workflow not found: ${request.workflowId}`);
    }

    const snapshotNodes = request.snapshot?.nodes ? clone(request.snapshot.nodes) : clone(workflow.nodes);
    const snapshotEdges = request.snapshot?.edges ? clone(request.snapshot.edges) : clone(workflow.edges);
    const snapshotGroups = request.snapshot?.groups ? clone(request.snapshot.groups) : clone(workflow.groups || []);
    const snapshotVariables = request.snapshot?.variables ? clone(request.snapshot.variables) : clone(workflow.variables || []);
    const embeddedNode = request.embeddedNode ? clone(request.embeddedNode) : null;
    const nodes = embeddedNode
      ? snapshotNodes.some(n => n.id === request.nodeId)
        ? snapshotNodes.map(n => n.id === request.nodeId ? embeddedNode : n)
        : [...snapshotNodes, embeddedNode]
      : snapshotNodes;
    const targetNode = nodes.find(n => n.id === request.nodeId);

    if (!targetNode) {
      return { status: 'error', error: `Node not found: ${request.nodeId}`, duration: Date.now() - startedAt };
    }

    const session = this.createSession(
      `debug-${randomUUID()}`, workflow, ownerClientId, request.input || {},
      { nodes, edges: snapshotEdges, groups: snapshotGroups, variables: snapshotVariables }, request.context, request.env,
    );

    try {
      session.context.__config__ = this.loadPluginConfigs(session);
      session.status = 'running';
      await this.executeNode(session, targetNode);
      const step = [...session.steps].reverse().find(s => s.nodeId === targetNode.id);

      if (step?.status === 'error') {
        return { status: 'error', error: step.error || 'Debug failed', duration: Date.now() - startedAt, logs: step.logs };
      }
      return { status: 'completed', output: step?.output, duration: Date.now() - startedAt, logs: step?.logs };
    } catch (error) {
      return {
        status: 'error',
        error: typeof error === 'string' ? error
          : error instanceof Error ? error.message
          : JSON.stringify(error),
        duration: Date.now() - startedAt,
      };
    }
  }

  pause(executionId: string): WorkflowExecuteResponse {
    const session = this.getSession(executionId);
    if (session.status === 'running') session.pauseRequested = true;
    return { executionId, status: session.status };
  }

  async resume(executionId: string): Promise<WorkflowExecuteResponse> {
    const session = this.getSession(executionId);
    if (session.status !== 'paused') return { executionId, status: session.status };

    const prev = session.pauseReason;
    session.pauseRequested = false;
    session.pauseReason = undefined;
    session.pauseNodeId = undefined;
    session.pauseBreakpoint = undefined;
    session.status = 'running';

    const current = session.executionOrder[session.currentIndex];
    if (prev === 'breakpoint-start' && current?.breakpoint === 'start') {
      session.breakpointBypassKeys.add(`${current.id}:start`);
    }

    this.emitEvent(session, 'workflow:resumed', {
      executionId: session.id, workflowId: session.workflow.id,
      timestamp: Date.now(), status: 'running',
      currentNodeId: session.executionOrder[session.currentIndex]?.id,
    });
    this.emitLog(session);
    void this.runSafe(session, session.currentIndex);
    return { executionId, status: session.status };
  }

  stop(executionId: string): WorkflowExecuteResponse {
    const session = this.sessions.get(executionId);
    if (!session) {
      const fr = this.finishedRecoveries.get(executionId);
      return { executionId, status: fr?.recovery.status ?? 'error' };
    }

    session.stopRequested = true;
    this.deps.interactionManager.cancelExecution(executionId, 'Execution stopped');
    this.deps.clientNodeManager.cancelExecution(executionId, 'Execution stopped');

    if (session.status === 'running' || session.status === 'paused') {
      session.status = 'error';
      session.lastErrorMessage = 'Execution stopped';
      session.finishedAt = Date.now();
      this.emitLog(session);
      this.emitWorkflowError(session);
      this.persistAndCleanup(session);
    }
    return { executionId, status: session.status };
  }

  getExecutionRecovery(
    request: ExecutionRecoveryRequest,
    ownerClientId: string,
  ): ExecutionRecoveryResponse {
    this.pruneFinishedRecoveries();

    const active = this.findSession(ownerClientId, request.workflowId, request.executionId);
    if (active) {
      return { found: true, execution: this.createRecoveryState(active, true) };
    }

    const finished = this.findFinishedRecovery(ownerClientId, request.workflowId, request.executionId);
    if (finished) {
      return { found: true, execution: clone(finished.recovery) };
    }
    return { found: false };
  }

  // ---- Private: Session lifecycle ----

  private resolveExecutionSnapshot(
    workflow: Workflow,
    request: WorkflowExecuteRequest,
  ): { nodes: WorkflowNode[]; edges: WorkflowEdge[]; groups?: WorkflowGroup[]; variables?: OutputField[] } | undefined {
    const baseNodes = request.snapshot?.nodes ? clone(request.snapshot.nodes) : clone(workflow.nodes);
    const baseEdges = request.snapshot?.edges ? clone(request.snapshot.edges) : clone(workflow.edges);
    const baseGroups = request.snapshot?.groups ? clone(request.snapshot.groups) : clone(workflow.groups || []);
    const baseVariables = request.snapshot?.variables ? clone(request.snapshot.variables) : clone(workflow.variables || []);

    const rootNodes = getNodesForExecutionScope(baseNodes, null);
    const startNodes = rootNodes.filter(n => n.type === 'start');

    if (request.startNodeId) {
      const startNode = rootNodes.find(n => n.id === request.startNodeId);
      if (!startNode) {
        throw createErrorShape('BAD_REQUEST', `Start node not found: ${request.startNodeId}`);
      }
      return this.buildReachableSnapshot(baseNodes, baseEdges, baseGroups, baseVariables, startNode.id);
    }

    if (startNodes.length > 1) {
      const choices = startNodes.map(n => `${n.label || 'Start'}(${n.id})`).join(', ');
      throw createErrorShape('BAD_REQUEST', `Multiple start nodes, specify startNodeId: ${choices}`);
    }

    return request.snapshot ? { nodes: baseNodes, edges: baseEdges, groups: baseGroups, variables: baseVariables } : undefined;
  }

  private buildReachableSnapshot(
    nodes: WorkflowNode[], edges: WorkflowEdge[], groups: WorkflowGroup[], variables: OutputField[], firstNodeId: string,
  ) {
    const reachableIds = new Set<string>([firstNodeId]);
    const queue = [firstNodeId];
    while (queue.length > 0) {
      const sourceId = queue.shift()!;
      for (const edge of edges) {
        if (edge.source !== sourceId || reachableIds.has(edge.target)) continue;
        reachableIds.add(edge.target);
        queue.push(edge.target);
      }
    }
    const partialNodes = nodes.filter(n => reachableIds.has(n.id));
    const first = partialNodes.find(n => n.id === firstNodeId);
    return {
      nodes: first ? [first, ...partialNodes.filter(n => n.id !== firstNodeId)] : partialNodes,
      edges: edges.filter(e => reachableIds.has(e.source) && reachableIds.has(e.target)),
      groups,
      variables,
    };
  }

  private createSession(
    executionId: string, workflow: Workflow, ownerClientId: string,
    input: Record<string, unknown>,
    snapshot?: { nodes: WorkflowNode[]; edges: WorkflowEdge[]; groups?: WorkflowGroup[]; variables?: OutputField[] },
    context?: Record<string, unknown>,
    env?: Record<string, unknown>,
    eventSink?: (channel: string, payload: unknown) => void,
  ): ExecutionSession {
    const defaultEnv = this.buildOutputObject(snapshot?.variables ?? workflow.variables) ?? {};
    return {
      id: executionId, workflow, ownerClientId,
      nodes: snapshot?.nodes ? clone(snapshot.nodes) : clone(workflow.nodes),
      edges: snapshot?.edges ? clone(snapshot.edges) : clone(workflow.edges),
      groups: snapshot?.groups ? clone(snapshot.groups) : clone(workflow.groups || []),
      variables: snapshot?.variables ? clone(snapshot.variables) : clone(workflow.variables || []),
      context: {
        ...(context ? clone(context) : {}),
        __data__: context?.__data__ && typeof context.__data__ === 'object' ? clone(context.__data__) : {},
        __env__: {
          ...defaultEnv,
          ...(env ? clone(env) : {}),
        },
        __input__: input,
      },
      status: 'idle', executionOrder: [], currentIndex: 0,
      pauseRequested: false, stopRequested: false,
      startedAt: Date.now(), steps: [],
      activeBranches: new Map(), persisted: false,
      lastUpdatedAt: Date.now(), eventSequence: 0,
      recentEvents: [], loopStack: [],
      breakpointBypassKeys: new Set(), eventSink,
    };
  }

  // ---- Private: Execution loop ----

  private async run(session: ExecutionSession): Promise<void> {
    try {
      session.executionOrder = this.buildExecutionOrder(session.nodes, session.edges);
      if (session.executionOrder.length === 0) {
        session.status = 'error';
        session.lastErrorMessage = 'Empty workflow or no execution order';
        session.finishedAt = Date.now();
        this.emitWorkflowError(session);
        this.persistAndCleanup(session);
        return;
      }

      session.status = 'running';
      session.startedAt = Date.now();
      this.emitEvent(session, 'workflow:started', {
        executionId: session.id, workflowId: session.workflow.id,
        timestamp: session.startedAt, status: 'running',
        workflowName: session.workflow.name,
      });
      this.emitLog(session);
      this.emitContext(session);
      await this.runSafe(session, 0);
    } catch (error) {
      this.handleExecutionError(session, error);
    }
  }

  private async runSafe(session: ExecutionSession, startIndex: number): Promise<void> {
    try {
      await this.runFromIndex(session, startIndex);
    } catch (error) {
      this.handleExecutionError(session, error);
    }
  }

  private handleExecutionError(session: ExecutionSession, error: unknown): void {
    if (session.status === 'completed' || session.status === 'error') return;
    session.status = 'error';
    session.lastErrorMessage = error instanceof Error ? error.message : String(error);
    session.finishedAt = Date.now();
    this.emitWorkflowError(session);
    this.persistAndCleanup(session);
  }

  private async runFromIndex(session: ExecutionSession, startIndex: number): Promise<void> {
    for (let i = startIndex; i < session.executionOrder.length; i++) {
      if (session.stopRequested) {
        if (session.status === 'error') return;
        session.status = 'error';
        session.lastErrorMessage = 'Execution stopped';
        session.finishedAt = Date.now();
        this.emitLog(session);
        this.emitWorkflowError(session);
        this.persistAndCleanup(session);
        return;
      }

      if (session.pauseRequested) {
        session.currentIndex = i;
        session.status = 'paused';
        session.pauseReason = 'manual';
        session.pauseNodeId = session.executionOrder[i]?.id;
        this.emitLog(session);
        this.emitEvent(session, 'workflow:paused', {
          executionId: session.id, workflowId: session.workflow.id,
          timestamp: Date.now(), status: 'paused',
          currentNodeId: session.executionOrder[i]?.id, reason: 'manual',
        });
        return;
      }

      session.currentIndex = i;
      const node = session.executionOrder[i];
      const nodeState = node.nodeState || 'normal';

      if (node.type === 'loop_body' && isGeneratedWorkflowNode(node)) continue;
      if (getCompositeParentId(node)) continue;

      if (this.getActiveBranches(session).size > 0 && !this.isNodeReachable(session, node.id)) {
        this.recordSkippedStep(session, node, 'Inactive branch');
        continue;
      }

      if (!this.areIncomingNodesCompleted(session, node.id, session.edges)) {
        this.recordSkippedStep(session, node, 'Waiting for upstream nodes');
        continue;
      }

      if (nodeState === 'disabled') {
        this.recordSkippedStep(session, node, 'Node disabled');
        session.status = 'error';
        session.lastErrorMessage = 'Node disabled, workflow aborted';
        session.finishedAt = Date.now();
        this.emitLog(session);
        this.emitWorkflowError(session);
        this.persistAndCleanup(session);
        return;
      }

      if (nodeState === 'skipped') {
        this.recordSkippedStep(session, node, 'Node skipped');
        continue;
      }

      if (this.shouldPauseAtBreakpoint(session, node, 'start')) {
        this.pauseAtBreakpoint(session, i, node, 'start');
        return;
      }

      const result = await this.executeNode(session, node);
      if (result === 'interrupted') { i -= 1; continue; }

      if (session.status === 'error') {
        session.finishedAt = Date.now();
        this.emitLog(session);
        this.emitWorkflowError(session);
        this.persistAndCleanup(session);
        return;
      }

      if (this.shouldPauseAtBreakpoint(session, node, 'end')) {
        this.pauseAtBreakpoint(session, i + 1, node, 'end');
        return;
      }
    }

    session.status = 'completed';
    session.finishedAt = Date.now();
    this.emitLog(session);
    this.emitContext(session);
    this.emitEvent(session, 'workflow:completed', {
      executionId: session.id, workflowId: session.workflow.id,
      timestamp: Date.now(), status: 'completed',
      log: this.currentLog(session), context: this.currentContext(session),
    });
    this.persistAndCleanup(session);
  }

  // ---- Private: Node execution ----

  private async executeNode(
    session: ExecutionSession, node: WorkflowNode,
  ): Promise<'completed' | 'interrupted'> {
    if (session.stopRequested || session.status === 'error') return 'interrupted';

    const delay = typeof node.data?._delay === 'number' ? node.data._delay : 0;
    if (delay > 0) {
      await sleep(delay);
      if (session.stopRequested || session.pauseRequested) return 'interrupted';
    }

    const resolvedData = this.resolveContextVariables(session, { ...node.data });
    const stepInput = this.getStepInput(node, resolvedData);
    this.setNodeExecutionInput(session, node.id, node.type === 'end' ? {} : this.buildOutputObject(resolvedData.inputFields) ?? {});

    const step: ExecutionStep = {
      nodeId: node.id, nodeLabel: node.label, startedAt: Date.now(), status: 'running',
      ...(stepInput === undefined ? {} : { input: stepInput }),
    };
    session.steps.push(step);

    this.emitEvent(session, 'node:start', {
      executionId: session.id, workflowId: session.workflow.id,
      timestamp: Date.now(), nodeId: node.id, nodeLabel: node.label, input: stepInput,
    });
    this.emitLog(session);

    const stepLogs: ExecutionLogEntry[] = [];
    const appendLog = (level: ExecutionLogEntry['level'], message: string) => {
      const entry: ExecutionLogEntry = { level, message, timestamp: Date.now() };
      stepLogs.push(entry);
      step.logs = [...stepLogs];
      this.emitEvent(session, 'node:progress', {
        executionId: session.id, workflowId: session.workflow.id,
        timestamp: entry.timestamp, nodeId: node.id, message, data: { level },
      });
      this.emitLog(session);
    };

    try {
      const result = await this.dispatchNode(session, node, resolvedData, appendLog);
      if (session.stopRequested) return 'interrupted';

      step.finishedAt = Date.now();
      step.status = 'completed';
      step.output = result && Array.isArray(result._logs)
        ? (() => { step.logs = result._logs; const { _logs, ...rest } = result; return rest; })()
        : result;

      session.context[node.id] = step.output;
      this.setNodeExecutionData(session, node.id, result);
      if (node.type === 'start') this.setNodeExecutionInput(session, node.id, result);

      if (node.type === 'switch' && result?.__branch__) {
        this.getActiveBranches(session).set(node.id, result.__branch__);
      }

      this.emitContext(session);
      this.emitEvent(session, 'node:complete', {
        executionId: session.id, workflowId: session.workflow.id,
        timestamp: Date.now(), nodeId: node.id, step: { ...step },
      });
      this.emitLog(session);
    } catch (error) {
      if (session.stopRequested) return 'interrupted';
      step.finishedAt = Date.now();
      step.status = 'error';
      step.error = typeof error === 'string' ? error
        : error instanceof Error ? error.message
        : JSON.stringify(error);
      step.logs = stepLogs.length ? [...stepLogs] : undefined;
      session.status = 'error';
      session.lastErrorMessage = step.error;
      this.emitEvent(session, 'node:error', {
        executionId: session.id, workflowId: session.workflow.id,
        timestamp: Date.now(), nodeId: node.id, step: { ...step },
        error: createErrorShape('WORKFLOW_ERROR', step.error),
      });
      this.emitLog(session);
    }

    return 'completed';
  }

  private async dispatchNode(
    session: ExecutionSession, node: WorkflowNode,
    resolvedData: Record<string, any>,
    appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<any> {
    switch (node.type) {
      case 'start': {
        const fieldOutput = this.buildOutputObject(resolvedData.inputFields) ?? {};
        const runtimeInput = session.context.__input__ ?? {};
        return { ...fieldOutput, ...runtimeInput };
      }
      case 'loop_body':
      case 'sticky_note':
        return null;
      case 'loop_break':
        return this.executeLoopBreak(session, appendLog);
      case 'end':
        return this.buildOutputObject(resolvedData.outputs);
      case 'gallery_preview':
        return { items: Array.isArray(resolvedData.items) ? resolvedData.items : [] };
      case 'table_display':
        return this.executeTableDisplay(session, node, resolvedData);
      case 'sqlite_query':  return this.executeSqliteQuery(session, node, resolvedData);
      case 'sqlite_insert': return this.executeSqliteInsert(session, node, resolvedData);
      case 'sqlite_update': return this.executeSqliteUpdate(session, node, resolvedData);
      case 'sqlite_delete': return this.executeSqliteDelete(session, node, resolvedData);
      case 'sqlite_raw':    return this.executeSqliteRaw(session, node, resolvedData);
      case 'run_code':
        return this.executeCode(
          this.getRuntimeContext(session),
          String(resolvedData.code || ''),
          this.buildCodeParams(session, node, resolvedData),
          appendLog,
        );
      case 'run_python':
        return this.executePython(
          String(resolvedData.pythonPath || ''),
          String(resolvedData.code || ''),
          this.buildCodeParams(session, node, resolvedData),
          appendLog,
        );
      case 'toast':
        return { message: String(resolvedData.message || ''), type: String(resolvedData.type || 'info') };
      case 'delay':
        return this.executeDelayNode(resolvedData, appendLog);
      case 'switch':
        return this.executeSwitch(resolvedData.conditions);
      case 'variable_aggregate': {
        const outputKey = this.getFirstObjectOutputKey(resolvedData.outputs) ?? 'result';
        return { [outputKey]: this.executeVariableAggregate(resolvedData.groups || []) };
      }
      case 'flatten_array':
        return this.executeFlattenArray(resolvedData);
      case 'pluck_array_key':
        return this.executePluckArrayKey(resolvedData);
      case 'array_text_replace':
        return this.executeArrayTextReplace(resolvedData);
      case 'parse_json':
        return this.executeParseJson(resolvedData);
      case 'string_concat':
        return this.executeStringConcat(resolvedData);
      case 'string_split':
        return this.executeStringSplit(resolvedData);
      case 'set_variable':
        return this.executeSetVariable(session, resolvedData.variables || [], appendLog);
      case 'get_variable':
        return this.executeGetVariable(session, resolvedData);
      case 'delete_variable':
        return this.executeDeleteVariable(session, resolvedData, appendLog);
      case 'sub_workflow':
        return this.executeSubWorkflow(session, resolvedData, appendLog);
      case 'loop':
        return this.executeLoopNode(session, node, resolvedData, appendLog);
      case 'agent_run':
        return this.executeAgentRun(session, node, resolvedData, appendLog);
      case 'alert':
        return this.executeAlertDialog(session, node, resolvedData, appendLog);
      case 'prompt':
        return this.executePromptDialog(session, node, resolvedData, appendLog);
      case 'form':
        return this.executeFormDialog(session, node, resolvedData, appendLog);
      default:
        if (pluginService.canExecuteWorkflowNode(node.type)) {
          if (pluginService.requiresClientExecution(node.type)) {
            return this.executeClientNode(session, node, resolvedData, appendLog);
          }
          return pluginService.executeWorkflowNode(node.type, resolvedData, {
            logger: {
              info: (message) => appendLog('info', message),
              warning: (message) => appendLog('warning', message),
              error: (message) => appendLog('error', message),
            },
          });
        }
        throw new Error(`Unsupported node type: ${node.type}`);
    }
  }

  // ---- Private: Node type implementations ----

  private async executeClientNode(
    session: ExecutionSession,
    node: WorkflowNode,
    resolvedData: Record<string, any>,
    appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<Record<string, unknown>> {
    appendLog('info', `Requesting client execution for ${node.type}`);
    const result = await this.deps.clientNodeManager.request({
      clientId: session.ownerClientId,
      executionId: session.id,
      workflowId: session.workflow.id,
      nodeId: node.id,
      nodeType: node.type,
      args: resolvedData,
    });
    return this.normalizeNodeResult(result);
  }

  private normalizeNodeResult(result: unknown): Record<string, unknown> {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return { result };
    const record = result as Record<string, unknown>;
    if (record.success === true && record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
      return record.data as Record<string, unknown>;
    }
    if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
      return record.data as Record<string, unknown>;
    }
    return record;
  }

  private async executeDelayNode(
    resolvedData: Record<string, any>,
    appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<Record<string, unknown>> {
    const rawMilliseconds = Number(resolvedData.milliseconds);
    const milliseconds = Number.isFinite(rawMilliseconds)
      ? Math.min(Math.max(rawMilliseconds, DELAY_NODE_MIN_MS), DELAY_NODE_MAX_MS)
      : 1000;
    const reason = typeof resolvedData.reason === 'string' ? resolvedData.reason.trim() : '';

    appendLog('info', reason ? `Delay ${milliseconds}ms: ${reason}` : `Delay ${milliseconds}ms`);
    await sleep(milliseconds);
    return { milliseconds, reason };
  }

  private executeLoopBreak(
    session: ExecutionSession,
    appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Record<string, boolean> {
    const frame = this.getLoopFrame(session);
    if (!frame) throw new Error('loop_break can only run inside a loop body');
    frame.breakRequested = true;
    appendLog('info', 'Loop break requested');
    return { break: true };
  }

  private executePluckArrayKey(resolvedData: Record<string, any>): Record<string, unknown[]> {
    const array = Array.isArray(resolvedData.array) ? resolvedData.array : [];
    const key = String(resolvedData.key || '').trim();
    if (!key) return { result: [] };

    return {
      result: array.map((item) => (
        item && typeof item === 'object' && key in item ? item[key] : undefined
      )),
    };
  }

  private executeFlattenArray(resolvedData: Record<string, any>): Record<string, unknown[]> {
    const array = Array.isArray(resolvedData.array) ? resolvedData.array : [];
    const key = String(resolvedData.key || '').trim();
    const result: unknown[] = [];

    for (const item of array) {
      const value = key && item && typeof item === 'object' && key in item
        ? item[key]
        : item;

      if (Array.isArray(value)) {
        result.push(...value);
      } else if (value !== undefined) {
        result.push(value);
      }
    }

    return { result };
  }

  private executeParseJson(resolvedData: Record<string, any>): Record<string, unknown> {
    const text = String(resolvedData.text ?? '').trim();
    if (!text) return { result: {} };
    try {
      const parsed = JSON.parse(text);
      return { result: parsed && typeof parsed === 'object' ? parsed : { value: parsed } };
    } catch {
      return { result: {} };
    }
  }

  /**
   * 字符串拼接节点：用 {{expression}} 占位符引用输入字段的值进行插值。
   * 表达式以输入字段为上下文执行，例如 {{users[0]}}、{{today.hour}}。
   */
  private executeStringConcat(resolvedData: Record<string, any>): Record<string, string> {
    const template = typeof resolvedData.template === 'string' ? resolvedData.template : '';
    const context = this.buildOutputObject(resolvedData.inputFields) ?? {};
    return { result: this.interpolateTemplate(template, context) };
  }

  /**
   * 字符串分割节点：将 source 字符串按分隔符切成数组。
   * 源字符串来自 source 属性（支持变量），分隔符来自 text 属性（默认 |）。
   */
  private executeStringSplit(resolvedData: Record<string, any>): Record<string, string[]> {
    const source = typeof resolvedData.source === 'string' ? resolvedData.source : '';
    const delimiter = typeof resolvedData.text === 'string' && resolvedData.text !== ''
      ? resolvedData.text
      : '|';
    if (source === '') return { result: [] };
    return { result: source.split(delimiter) };
  }

  private interpolateTemplate(template: string, context: Record<string, any>): string {
    if (!template) return '';
    const keys = Object.keys(context);
    return template.replace(/\{\{([\s\S]*?)\}\}/g, (match, expr: string) => {
      const trimmed = expr.trim();
      if (!trimmed) return '';
      try {
        const fn = new Function(...keys, `"use strict"; return (${trimmed});`);
        const value = fn(...keys.map(k => context[k]));
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
      } catch {
        return match;
      }
    });
  }

  private executeArrayTextReplace(resolvedData: Record<string, any>): Record<string, string[]> {
    const array = Array.isArray(resolvedData.array) ? resolvedData.array : [];
    const findText = String(resolvedData.findText ?? '');
    const replaceText = String(resolvedData.replaceText ?? '');
    const replaceMode = resolvedData.replaceMode === 'regex' ? 'regex' : 'literal';
    const rawReplaceCount = Number(resolvedData.replaceCount);
    const replaceCount = Number.isFinite(rawReplaceCount) && rawReplaceCount > 0
      ? Math.floor(rawReplaceCount)
      : 0;

    if (!findText) return { result: array.map((item) => String(item ?? '')) };

    return {
      result: array.map((item) => this.replaceTextWithLimit(
        String(item ?? ''),
        findText,
        replaceText,
        replaceCount,
        replaceMode,
      )),
    };
  }

  private replaceTextWithLimit(
    value: string,
    findText: string,
    replaceText: string,
    replaceCount: number,
    replaceMode: 'literal' | 'regex',
  ): string {
    let count = 0;
    if (replaceMode === 'regex') {
      const pattern = new RegExp(findText, 'g');
      return value.replace(pattern, (match) => {
        if (replaceCount > 0 && count >= replaceCount) return match;
        count += 1;
        return replaceText;
      });
    }

    return value.replaceAll(findText, (match) => {
      if (replaceCount > 0 && count >= replaceCount) return match;
      count += 1;
      return replaceText;
    });
  }

  private async executeAgentRun(
    session: ExecutionSession, node: WorkflowNode,
    resolvedData: Record<string, any>,
    appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<any> {
    const prompt = typeof resolvedData.prompt === 'string' ? resolvedData.prompt : '';
    if (!prompt.trim()) throw new Error('agent_run node missing prompt');

    appendLog('info', 'Executing agent_run node');

    return this.executeAgentWithRuntime(session, node, resolvedData, appendLog);
  }

  private async executeAgentWithRuntime(
    session: ExecutionSession, _node: WorkflowNode,
    resolvedData: Record<string, any>,
    appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<any> {
    const { createAgentRuntime } = await import('../adapters/agent-runtime.js');
    const agentService = await import('./agent.js');

    const workspaceId = resolveWorkflowAgentWorkspaceId();
    const workspace = workspaceService.getById(workspaceId);
    const agentConfigId = resolveAgentConfigId(resolvedData);
    const presets = agentService.listPresets(workspaceId).filter(p => p.enabled !== false);
    const preset = agentConfigId
      ? presets.find(p => p.id === agentConfigId)
      : presets[0];
    if (!preset) {
      throw new Error(agentConfigId ? `Agent preset not found: ${agentConfigId}` : 'No enabled agent preset available');
    }

    appendLog('info', `Using agent: ${preset.name || preset.id}`);

    const permissionMode = normalizeAgentPermissionMode(resolvedData.permissionMode);
    const runtime = createAgentRuntime({
      kind: preset.runtimeKind as any,
      provider: preset.modelProvider as any,
      model: preset.modelId,
      apiKey: preset.apiKey,
      baseURL: getRuntimeBaseURL(preset.modelProvider, preset.apiBase),
      adapterBaseURL: preset.apiBase,
      permissionMode,
      ...getThinkingRuntimeConfig(preset),
    });

    const prompt = String(resolvedData.prompt || '');
    const systemPrompt = typeof resolvedData.systemPrompt === 'string' ? resolvedData.systemPrompt : undefined;
    const extraInstructions = typeof resolvedData.extraInstructions === 'string' ? resolvedData.extraInstructions.trim() : '';
    const ruleLoadingInstructions = [
      resolvedData.loadProjectClaudeMd === false ? '不要主动加载项目 CLAUDE.md/AGENTS.md 规则文件。' : '',
      resolvedData.loadRuleMd === false ? '不要主动加载 .claude/rules 或同类规则目录。' : '',
    ].filter(Boolean).join('\n');
    const workflowContext = [
      `当前工作流: ${session.workflow.name}${session.workflow.id ? ` (${session.workflow.id})` : ''}`,
      typeof session.workflow.description === 'string' && session.workflow.description.trim()
        ? `工作流描述:\n${session.workflow.description.trim()}`
        : '',
    ].filter(Boolean).join('\n\n');
    const fullPrompt = [systemPrompt, extraInstructions, ruleLoadingInstructions, workflowContext, prompt]
      .map(part => typeof part === 'string' ? part.trim() : '')
      .filter(Boolean)
      .join('\n\n');
    const workingDir = typeof resolvedData.cwd === 'string' && resolvedData.cwd.trim()
      ? resolvedData.cwd.trim()
      : agentService.resolveWorkingDir(workspaceId, preset);
    const configDir = agentService.getAgentConfigDir(workspaceId, preset);
    const sandboxDirs = uniqueStrings([
      ...normalizeStringList(preset.sandboxDirs),
      ...normalizeStringList(resolvedData.additionalDirectories),
    ]);
    const mcpServers = agentService.getMcpServers(preset.mcps);
    const skills = agentService.getAvailableSkillNames(configDir, preset.skills);

    appendLog('info', `Runtime: ${preset.runtimeKind || 'open-agent-sdk'}; permissionMode=${permissionMode}; cwd=${workingDir}`);
    if (sandboxDirs.length) appendLog('info', `Additional directories: ${sandboxDirs.join(', ')}`);

    const result = await runtime.execute(
      buildAgentPrompt(workspaceId, preset.systemPrompt, fullPrompt, [], {
        runtimeKind: preset.runtimeKind,
        mcpServers: Object.keys(mcpServers ?? {}),
        skills,
        boundDirs: workspace?.boundDirs ?? [],
        workingDir,
        excludeNativeClaudeMd: preset.runtimeKind === 'claude-code',
      }),
      workingDir,
      {
        maxTurns: 100,
        mcpServers,
        skills,
        configDir,
        sandboxDirs,
        systemPrompt: preset.systemPrompt,
        outputStyle: preset.outputStyle,
        userPrompt: prompt,
        onEvent: (event) => {
          if (event.type === 'output') {
            appendLog('info', event.line);
          } else if (event.type === 'tool_use') {
            appendLog('info', `Tool: ${event.name}`);
          }
        },
      },
    );

    if (!result.success) {
      throw new Error(result.summary || 'Agent execution failed');
    }

    appendLog('info', `Agent completed: ${result.summary || 'done'}`);
    const message = result.output?.join('\n').trim() || result.summary;
    return {
      result: message,
      usage: result.usage,
      runtime: {
        cwd: workingDir,
        additionalDirectories: sandboxDirs,
        permissionMode,
        extraInstructions,
        loadProjectClaudeMd: resolvedData.loadProjectClaudeMd !== false,
        loadRuleMd: resolvedData.loadRuleMd !== false,
        enabledPlugins: session.workflow.enabledPlugins,
        mcpServers: Object.keys(mcpServers ?? {}),
        skills,
        workspaceId,
        agentConfigId: preset.id,
      },
    };
  }

  private async executeTableDisplay(
    session: ExecutionSession, node: WorkflowNode,
    resolvedData: Record<string, any>,
  ): Promise<any> {
    const headers = Array.isArray(resolvedData.headers) ? resolvedData.headers : [];
    const cells = Array.isArray(resolvedData.cells) ? resolvedData.cells : [];
    const selectionMode = ['none', 'single', 'multi'].includes(resolvedData.selectionMode)
      ? resolvedData.selectionMode : 'none';

    if (selectionMode === 'none') {
      return { selectedRows: cells, selectedCount: cells.length };
    }

    const result = await this.deps.interactionManager.request({
      clientId: session.ownerClientId,
      executionId: session.id,
      workflowId: session.workflow.id,
      nodeId: node.id,
      interactionType: 'table_confirm',
      schema: { headers, cells, selectionMode },
    });
    return { ...(result as Record<string, any>), headers, cells };
  }

  // ---- Private: SQLite node execution ----

  /**
   * inputFields 是节点声明的输入字段（OutputField[]，每项 {key, type, value?, children?}），
   * 其 value 在 resolvedData 解析阶段（resolveContextVariables）已被绑定上游变量。
   * 取「值」数组（按声明顺序），用于绑定 SQL 的 ? 占位符。
   */
  private getInputFieldValues(resolvedData: Record<string, any>): unknown[] {
    const fields = Array.isArray(resolvedData?.inputFields) ? resolvedData.inputFields : [];
    return fields.map((f: any) => f?.value ?? f?.defaultValue ?? null);
  }

  private resolveWhereParams(where: string): { clause: string | null; paramCount: number } {
    if (!where || !where.trim()) return { clause: null, paramCount: 0 };
    const paramCount = (where.match(/\?/g) || []).length;
    return { clause: where, paramCount };
  }

  private executeSqliteQuery(
    _session: ExecutionSession, _node: WorkflowNode,
    resolvedData: Record<string, any>,
  ): { rows: unknown[]; rowCount: number } {
    const dbId = String(resolvedData.database || '');
    const table = String(resolvedData.table || '');
    validateIdentifier(table, 'table');
    const colsRaw = resolvedData.columns === '*' || !resolvedData.columns ? '*' : String(resolvedData.columns);
    const { clause, paramCount } = this.resolveWhereParams(String(resolvedData.where || ''));
    const order = resolvedData.orderBy ? ` ORDER BY ${resolvedData.orderBy}` : '';
    const limit = Number(resolvedData.limit) > 0 ? Number(resolvedData.limit) : 1000;
    let sql = `SELECT ${colsRaw} FROM "${table}"`;
    if (clause) sql += ` WHERE ${clause}`;
    sql += `${order} LIMIT ?`;
    const fieldValues = this.getInputFieldValues(resolvedData).slice(0, paramCount);
    const result = sqliteStore.query(dbId, sql, [...fieldValues, limit]);
    return { rows: result.rows, rowCount: result.rowCount };
  }

  private executeSqliteInsert(
    _session: ExecutionSession, _node: WorkflowNode,
    resolvedData: Record<string, any>,
  ): { insertedId: number | null; changes: number } {
    const dbId = String(resolvedData.database || '');
    const table = String(resolvedData.table || '');
    validateIdentifier(table, 'table');
    const fields = Array.isArray(resolvedData.fields) ? resolvedData.fields : [];
    const columns = fields.map((f: any) => { validateIdentifier(String(f.column), 'column'); return String(f.column); });
    const placeholders = columns.map(() => '?').join(',');
    const sql = `INSERT INTO "${table}" (${columns.join(',')}) VALUES (${placeholders})`;
    const fieldValues = this.getInputFieldValues(resolvedData);
    const params = fields.map((f: any, i: number) => fieldValues[i] ?? f.value ?? null);
    const r = sqliteStore.exec(dbId, sql, params);
    return { insertedId: r.lastInsertRowid, changes: r.changes };
  }

  private executeSqliteUpdate(
    _session: ExecutionSession, _node: WorkflowNode,
    resolvedData: Record<string, any>,
  ): { changes: number } {
    const dbId = String(resolvedData.database || '');
    const table = String(resolvedData.table || '');
    validateIdentifier(table, 'table');
    const setFields = Array.isArray(resolvedData.setFields) ? resolvedData.setFields : [];
    const columns = setFields.map((f: any) => { validateIdentifier(String(f.column), 'column'); return String(f.column); });
    const setClause = columns.map((c) => `${c} = ?`).join(', ');
    const { clause, paramCount } = this.resolveWhereParams(String(resolvedData.where || ''));
    let sql = `UPDATE "${table}" SET ${setClause}`;
    if (clause) sql += ` WHERE ${clause}`;
    const fieldValues = this.getInputFieldValues(resolvedData);
    const setParams = setFields.map((f: any, i: number) => fieldValues[i] ?? f.value ?? null);
    const whereParams = fieldValues.slice(setFields.length, setFields.length + paramCount);
    const r = sqliteStore.exec(dbId, sql, [...setParams, ...whereParams]);
    return { changes: r.changes };
  }

  private executeSqliteDelete(
    _session: ExecutionSession, _node: WorkflowNode,
    resolvedData: Record<string, any>,
  ): { changes: number } {
    const dbId = String(resolvedData.database || '');
    const table = String(resolvedData.table || '');
    validateIdentifier(table, 'table');
    const { clause, paramCount } = this.resolveWhereParams(String(resolvedData.where || ''));
    let sql = `DELETE FROM "${table}"`;
    if (clause) sql += ` WHERE ${clause}`;
    const fieldValues = this.getInputFieldValues(resolvedData).slice(0, paramCount);
    const r = sqliteStore.exec(dbId, sql, fieldValues);
    return { changes: r.changes };
  }

  private executeSqliteRaw(
    _session: ExecutionSession, _node: WorkflowNode,
    resolvedData: Record<string, any>,
  ): { rows: unknown[]; rowCount?: number; execResult?: { changes: number; lastInsertRowid: number | null } } {
    const dbId = String(resolvedData.database || '');
    const sql = String(resolvedData.sql || '');
    const mode = String(resolvedData.mode || 'query');
    const params = this.getInputFieldValues(resolvedData).slice(0, (sql.match(/\?/g) || []).length);
    if (mode === 'exec') {
      const r = sqliteStore.exec(dbId, sql, params);
      return { rows: [], execResult: r };
    }
    const r = sqliteStore.query(dbId, sql, params);
    return { rows: r.rows, rowCount: r.rowCount };
  }

  private async executeAlertDialog(
    session: ExecutionSession, node: WorkflowNode,
    resolvedData: Record<string, any>,
    appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<any> {
    appendLog('info', 'Waiting for alert confirmation');
    await this.deps.interactionManager.request({
      clientId: session.ownerClientId,
      executionId: session.id,
      workflowId: session.workflow.id,
      nodeId: node.id,
      interactionType: 'dialog_alert' as any,
      schema: { title: String(resolvedData.title || 'Alert'), message: String(resolvedData.message || '') },
    });
    appendLog('info', 'Alert confirmed');
    return { confirmed: true };
  }

  private async executePromptDialog(
    session: ExecutionSession, node: WorkflowNode,
    resolvedData: Record<string, any>,
    appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<any> {
    appendLog('info', 'Waiting for user input');
    const result = await this.deps.interactionManager.request({
      clientId: session.ownerClientId,
      executionId: session.id,
      workflowId: session.workflow.id,
      nodeId: node.id,
      interactionType: 'dialog_prompt' as any,
      schema: {
        title: String(resolvedData.title || 'Input'),
        message: String(resolvedData.message || ''),
        placeholder: String(resolvedData.placeholder || ''),
        defaultValue: String(resolvedData.defaultValue || ''),
      },
    });
    appendLog('info', 'User input received');
    if (result && typeof result === 'object' && 'value' in result) {
      return { value: (result as any).value, confirmed: true };
    }
    return { value: result as string, confirmed: result !== null };
  }

  private async executeFormDialog(
    session: ExecutionSession, node: WorkflowNode,
    resolvedData: Record<string, any>,
    appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<any> {
    const items = Array.isArray(resolvedData.items) ? resolvedData.items : [];
    appendLog('info', `Waiting for form (${items.length} items)`);
    const result = await this.deps.interactionManager.request({
      clientId: session.ownerClientId,
      executionId: session.id,
      workflowId: session.workflow.id,
      nodeId: node.id,
      interactionType: 'dialog_form' as any,
      schema: { title: String(resolvedData.title || 'Form'), items },
    });
    if (result === null || result === undefined) {
      appendLog('warning', 'Form cancelled');
      throw new Error('Form cancelled, workflow aborted');
    }
    appendLog('info', 'Form completed');
    return { values: result, confirmed: result !== null };
  }

  private executeCode(
    context: Record<string, any>,
    code: string,
    params: Record<string, any>,
    appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): any {
    const normalized = code
      .replace(/\basync\s+function\s+main\s*\(\s*\{\s*params\s*\}\s*:\s*Args\s*\)\s*:\s*Promise\s*<\s*Output\s*>/g, 'async function main({ params })')
      .replace(/\bfunction\s+main\s*\(\s*\{\s*params\s*\}\s*:\s*Args\s*\)\s*:\s*Output/g, 'function main({ params })');
    const formatConsoleValue = (value: unknown): string => {
      if (typeof value === 'string') return value;
      if (value instanceof Error) return value.stack || value.message;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    };
    const workflowConsole = {
      ...console,
      log: (...args: unknown[]) => {
        console.log(...args);
        appendLog('info', args.map(formatConsoleValue).join(' '));
      },
      info: (...args: unknown[]) => {
        console.info(...args);
        appendLog('info', args.map(formatConsoleValue).join(' '));
      },
      warn: (...args: unknown[]) => {
        console.warn(...args);
        appendLog('warning', args.map(formatConsoleValue).join(' '));
      },
      error: (...args: unknown[]) => {
        console.error(...args);
        appendLog('error', args.map(formatConsoleValue).join(' '));
      },
    };
    const fn = new Function('context', 'params', 'console', `${normalized}\nif (typeof main === 'function') return main({ params, context })`);
    return fn(context, params, workflowConsole);
  }

  private async executePython(
    pythonPath: string,
    code: string,
    params: Record<string, any>,
    appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<any> {
    const python = pythonPath.trim() || 'python';
    if (!code.trim()) throw new Error('Python code is empty');

    // User code runs at module top level, then we call main(params) if defined.
    // Result is emitted on stdout wrapped between markers; everything else on
    // stdout/stderr is forwarded to the workflow log.
    const wrapper = `import os, json, sys

__WF_PARAMS__ = json.loads(os.environ.get('__WF_PARAMS__', '{}'))

${code}

if 'main' in dir() and callable(main):
    __wf_result = main(__WF_PARAMS__)
else:
    __wf_result = None

sys.stdout.write('__WF_RESULT__' + json.dumps(__wf_result, default=str) + '__WF_RESULT_END__')
sys.stdout.flush()
`;

    const dir = await mkdtemp(join(tmpdir(), 'wf-python-'));
    const scriptPath = join(dir, 'main.py');
    try {
      await writeFile(scriptPath, wrapper, 'utf8');

      const stdout = await new Promise<string>((resolve, reject) => {
        execFile(python, [scriptPath], {
          cwd: dir,
          env: { ...process.env, __WF_PARAMS__: JSON.stringify(params ?? {}) },
          timeout: 300_000,
          maxBuffer: 10 * 1024 * 1024,
        }, (error, out, stderr) => {
          // Forward stderr (tracebacks) and any non-result stdout to the log.
          const stderrText = String(stderr || '');
          if (stderrText) appendLog('error', stderrText.trim());
          if (error) {
            reject(new Error(`Python execution failed: ${stderrText.trim() || error.message}`));
            return;
          }
          resolve(String(out || ''));
        });
      });

      const start = stdout.lastIndexOf('__WF_RESULT__');
      const end = stdout.lastIndexOf('__WF_RESULT_END__');
      if (start === -1 || end === -1 || end <= start) {
        const rest = stdout.replace('__WF_RESULT__', '').replace('__WF_RESULT_END__', '').trim();
        if (rest) appendLog('info', rest);
        appendLog('warning', 'Python code produced no result marker');
        return null;
      }

      const before = stdout.slice(0, start);
      if (before.trim()) appendLog('info', before.trim());

      const payload = stdout.slice(start + '__WF_RESULT__'.length, end).trim();
      try {
        return payload === '' ? null : JSON.parse(payload);
      } catch {
        appendLog('warning', `Python returned non-JSON result: ${payload}`);
        return payload;
      }
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private buildCodeParams(
    session: ExecutionSession,
    node: WorkflowNode,
    resolvedData: Record<string, any>,
  ): Record<string, any> {
    const explicitInput = this.buildOutputObject(resolvedData.inputFields);
    if (explicitInput) return explicitInput;

    const sourceNodeId = typeof resolvedData.sourceNodeId === 'string' && resolvedData.sourceNodeId
      ? resolvedData.sourceNodeId
      : session.edges.find(edge => edge.target === node.id && this.isActiveEdge(session, edge))?.source;
    if (!sourceNodeId) return {};

    const sourceOutput = this.getNodeExecutionData(session, sourceNodeId);
    if (sourceOutput && typeof sourceOutput === 'object' && !Array.isArray(sourceOutput)) {
      return { ...sourceOutput };
    }
    return sourceOutput === undefined ? {} : { input: sourceOutput };
  }

  private executeSwitch(conditions: unknown): any {
    const conditionItems = Array.isArray(conditions) ? conditions : [];

    for (let i = 0; i < conditionItems.length; i++) {
      const cond = conditionItems[i];
      if (!cond || typeof cond !== 'object') continue;

      const item = cond as Partial<ConditionItem> & { field?: unknown };
      const variable = item.variable ?? item.field ?? '';
      const value = item.value ?? '';
      const operator = typeof item.operator === 'string' ? item.operator : 'equals';

      if (this.evaluateCondition(variable, value, operator)) {
        return { __branch__: `case-${i}`, matchedIndex: i };
      }
    }
    return { __branch__: 'default', matchedIndex: -1 };
  }

  private executeVariableAggregate(groups: any[]): Record<string, any> {
    if (!Array.isArray(groups)) return {};
    return groups.reduce<Record<string, any>>((result, group) => {
      const key = typeof group?.key === 'string' ? group.key.trim() : '';
      if (!key) return result;
      const variables = Array.isArray(group.variables) ? group.variables : [];
      result[key] = this.findFirstNonEmpty(variables);
      return result;
    }, {});
  }

  private executeSetVariable(
    session: ExecutionSession,
    variables: any[],
    appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Record<string, any> {
    if (!session.context.__env__ || typeof session.context.__env__ !== 'object') session.context.__env__ = {};
    const items = Array.isArray(variables) ? variables : [];
    let count = 0;
    for (const item of items) {
      const key = typeof item?.key === 'string' ? item.key.trim() : '';
      if (!key) continue;
      setNestedValue(session.context.__env__, key, item.value);
      count++;
    }
    appendLog('info', `Set ${count} workflow variable(s)`);
    return { env: clone(session.context.__env__) };
  }

  private executeGetVariable(session: ExecutionSession, resolvedData: Record<string, any>): Record<string, any> {
    const key = typeof resolvedData.key === 'string' ? resolvedData.key.trim() : '';
    if (!key) throw new Error('get_variable node missing key');
    const value = getNestedValue(session.context.__env__ ?? {}, key);
    return {
      value: value === undefined ? resolvedData.defaultValue ?? '' : value,
      exists: value !== undefined,
    };
  }

  private executeDeleteVariable(
    session: ExecutionSession,
    resolvedData: Record<string, any>,
    appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Record<string, any> {
    const key = typeof resolvedData.key === 'string' ? resolvedData.key.trim() : '';
    if (!key) throw new Error('delete_variable node missing key');
    const deleted = deleteNestedValue(session.context.__env__ ?? {}, key);
    appendLog(deleted ? 'info' : 'warning', deleted ? `Deleted workflow variable: ${key}` : `Workflow variable not found: ${key}`);
    return { deleted, env: clone(session.context.__env__ ?? {}) };
  }

  private findFirstNonEmpty(variables: any[]): any {
    for (const v of variables) {
      const value = v?.value;
      if (value !== null && value !== undefined && value !== '' &&
          !(Array.isArray(value) && value.length === 0) &&
          !(typeof value === 'object' && Object.keys(value).length === 0)) return value;
    }
    return '';
  }

  // ---- Private: Loop execution ----

  private async executeLoopNode(
    session: ExecutionSession, node: WorkflowNode,
    resolvedData: Record<string, any>,
    appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<any> {
    const bodyNode = findCompositeChildByRole(session.nodes, node.id, 'loop_body');
    if (!bodyNode) throw new Error('Loop node missing body');

    const loopType = typeof resolvedData.loopType === 'string' ? resolvedData.loopType : 'count';
    const iterations = this.resolveLoopIterations(loopType, resolvedData);
    const concurrency = Math.max(1, Math.floor(Number(resolvedData.concurrency) || 1));
    const sharedVars = this.initLoopSharedVars(resolvedData.sharedVariables);
    const items: unknown[] = [];

    appendLog('info', iterations.infinite
      ? `Starting infinite loop, concurrency ${concurrency}`
      : `Starting loop, ${iterations.count} iterations, concurrency ${concurrency}`);

    let nextIndex = 0;
    let stopScheduling = false;
    const running = new Set<Promise<void>>();

    const hasNext = () => iterations.infinite || nextIndex < (iterations.count ?? 0);
    const createFrame = (index: number): LoopExecutionFrame => ({
      loopNodeId: node.id,
      parentData: session.context.__data__,
      bodyAnchorId: bodyNode.id,
      variables: sharedVars,
      metadata: { index, count: iterations.count, item: iterations.items[index],
        isFirst: index === 0, isLast: iterations.count !== null && index === iterations.count - 1 },
    });

    const startNext = () => {
      if (stopScheduling || !hasNext()) return false;
      const index = nextIndex++;
      const frame = createFrame(index);
      const promise = this.executeLoopIteration(session, bodyNode, frame, iterations, appendLog)
        .then(result => {
          items[index] = normalizeLoopResult(result);
          if (session.status === 'error' || frame.breakRequested) stopScheduling = true;
        }).finally(() => running.delete(promise));
      running.add(promise);
      return true;
    };

    while (running.size < concurrency && startNext()) { /* fill window */ }
    while (running.size > 0) {
      await Promise.race(running);
      if (session.stopRequested || session.status === 'error') throw new Error('Execution stopped');
      while (running.size < concurrency && startNext()) { /* backfill */ }
    }

    appendLog('info', 'Loop completed');
    const output = this.buildOutputObject(resolvedData.outputs) ?? {};
    return { ...output, items };
  }

  private async executeLoopIteration(
    session: ExecutionSession, bodyNode: WorkflowNode,
    frame: LoopExecutionFrame, iterations: LoopIterations,
    appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<unknown> {
    if (session.stopRequested) throw new Error('Execution stopped');
    if (iterations.infinite && frame.metadata.index > 0) await sleep(0);

    session.loopStack.push(frame);
    try {
      this.syncLoopContext(session);
      appendLog('info', iterations.infinite
        ? `Loop iteration ${frame.metadata.index + 1}`
        : `Loop iteration ${frame.metadata.index + 1}/${iterations.count}`);
      return await this.runWithLoopWorkerState(session, frame, () => this.executeLoopBody(session, bodyNode));
    } finally {
      const idx = session.loopStack.lastIndexOf(frame);
      if (idx >= 0) session.loopStack.splice(idx, 1);
      this.syncLoopContext(session);
    }
  }

  private resolveLoopIterations(loopType: string, data: Record<string, any>): LoopIterations {
    if (loopType === 'array') {
      const items = Array.isArray(data.arrayPath) ? data.arrayPath : [];
      return { count: items.length, items, infinite: false };
    }
    if (loopType === 'infinite') return { count: null, items: [], infinite: true };
    const count = Math.max(0, Math.floor(Number(data.count) || 0));
    return { count, items: Array.from({ length: count }, () => undefined), infinite: false };
  }

  private initLoopSharedVars(vars: unknown): Record<string, unknown> {
    if (!Array.isArray(vars)) return {};
    const build = (fields: Array<Record<string, any>>): Record<string, unknown> => {
      const result: Record<string, unknown> = {};
      for (const field of fields) {
        if (!field?.key) continue;
        if (field.type === 'object') {
          result[field.key] = build(Array.isArray(field.children) ? field.children : []);
          continue;
        }
        if (field.type === 'array') {
          result[field.key] = [];
          continue;
        }
        result[field.key] = field.value ?? '';
      }
      return result;
    };
    return build(vars as Array<Record<string, any>>);
  }

  private async executeLoopBody(session: ExecutionSession, bodyNode: WorkflowNode): Promise<unknown> {
    const scopeNodes = getNodesForExecutionScope(session.nodes, bodyNode.id);
    if (scopeNodes.length > 0) return this.executeScopedBody(session, bodyNode, scopeNodes);

    const bodyData = bodyNode.data?.bodyWorkflow;
    if (bodyData && typeof bodyData === 'object') {
      return this.executeEmbeddedWorkflow(session, normalizeEmbeddedWorkflow(bodyData, () => randomUUID()));
    }
    return this.executeScopedBody(session, bodyNode, scopeNodes);
  }

  private async executeScopedBody(
    session: ExecutionSession, bodyNode: WorkflowNode, scopeNodes: WorkflowNode[],
  ): Promise<unknown> {
    const scopeIds = new Set(scopeNodes.map(n => n.id));
    const bodyEdges = session.edges.filter(e => {
      if (e.sourceHandle === 'loop_next') return false;
      const srcEntry = e.source === bodyNode.id && scopeIds.has(e.target);
      return srcEntry || (scopeIds.has(e.source) && scopeIds.has(e.target));
    });

    const adjacency = new Map<string, WorkflowEdge[]>();
    for (const edge of bodyEdges) {
      const arr = adjacency.get(edge.source) || [];
      arr.push(edge);
      adjacency.set(edge.source, arr);
    }

    const visited = new Set<string>([bodyNode.id]);
    const execFrom = async (nodeId: string): Promise<unknown> => {
      if (shouldInterrupt(session)) return undefined;
      let lastResult: unknown;
      for (const edge of adjacency.get(nodeId) || []) {
        if (shouldInterrupt(session)) return lastResult;
        const activeHandle = this.getActiveBranches(session).get(edge.source);
        if (activeHandle !== undefined && edge.sourceHandle !== activeHandle) continue;
        const nextNode = scopeNodes.find(n => n.id === edge.target);
        if (!nextNode || visited.has(nextNode.id)) continue;
        if (!this.areIncomingNodesCompleted(session, nextNode.id, bodyEdges, visited)) continue;
        visited.add(nextNode.id);
        const result = await this.executeNode(session, nextNode);
        if (result === 'interrupted' || shouldInterrupt(session)) return lastResult;
        lastResult = this.getNodeExecutionData(session, nextNode.id);
        const downstream = await execFrom(nextNode.id);
        if (downstream !== undefined) lastResult = downstream;
      }
      return lastResult;
    };
    return execFrom(bodyNode.id);
  }

  private async executeSubWorkflow(
    session: ExecutionSession, resolvedData: Record<string, any>,
    appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<unknown> {
    const workflowId = typeof resolvedData.workflowId === 'string' ? resolvedData.workflowId : '';
    if (!workflowId) throw new Error('sub_workflow missing workflowId');
    if (workflowId === session.workflow.id) throw new Error('sub_workflow cannot call itself');

    const target = workflowStore.getWorkflow(workflowId);
    if (!target) throw new Error(`sub_workflow target not found: ${workflowId}`);

    appendLog('info', `Starting sub_workflow: ${target.name}`);
    const result = await this.executeEmbeddedWorkflow(session, {
      nodes: clone(target.nodes), edges: clone(target.edges),
    }, this.buildOutputObject(resolvedData.inputFields) ?? {});
    appendLog('info', `Completed sub_workflow: ${target.name}`);
    return result;
  }

  private async executeEmbeddedWorkflow(
    session: ExecutionSession,
    workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
    input?: Record<string, any>,
  ): Promise<unknown> {
    const nodeMap = new Map(workflow.nodes.map(n => [n.id, n]));
    const adjacency = new Map<string, WorkflowEdge[]>();
    for (const edge of workflow.edges) {
      const arr = adjacency.get(edge.source) || [];
      arr.push(edge);
      adjacency.set(edge.source, arr);
    }

    const startNode = workflow.nodes.find(n => n.type === 'start');
    if (!startNode) throw new Error('Embedded workflow missing start node');

    if (input && Object.keys(input).length > 0) {
      this.setNodeExecutionData(session, startNode.id, input);
      this.setNodeExecutionInput(session, startNode.id, input);
    }

    const visited = new Set<string>([startNode.id]);
    const execFrom = async (nodeId: string): Promise<unknown> => {
      if (shouldInterrupt(session)) return undefined;
      let lastResult: unknown;
      for (const edge of adjacency.get(nodeId) || []) {
        if (shouldInterrupt(session)) return lastResult;
        const activeHandle = this.getActiveBranches(session).get(edge.source);
        if (activeHandle !== undefined && edge.sourceHandle !== activeHandle) continue;
        const nextNode = nodeMap.get(edge.target);
        if (!nextNode || visited.has(nextNode.id)) continue;
        if (!this.areIncomingNodesCompleted(session, nextNode.id, workflow.edges, visited)) continue;
        visited.add(nextNode.id);
        const result = await this.executeNode(session, nextNode);
        if (result === 'interrupted' || shouldInterrupt(session)) return lastResult;
        if (nextNode.type !== 'start') lastResult = this.getNodeExecutionData(session, nextNode.id);
        const downstream = await execFrom(nextNode.id);
        if (downstream !== undefined) lastResult = downstream;
      }
      return lastResult;
    };
    return execFrom(startNode.id);
  }

  // ---- Private: Condition evaluation ----

  private evaluateCondition(variable: any, value: any, operator: string): boolean {
    switch (operator) {
      case 'equals': return variable == value;
      case 'not_equals': return variable != value;
      case 'greater_than': return Number(variable) > Number(value);
      case 'less_than': return Number(variable) < Number(value);
      case 'greater_than_or_equal': return Number(variable) >= Number(value);
      case 'less_than_or_equal': return Number(variable) <= Number(value);
      case 'contains': return String(variable).includes(String(value));
      case 'not_contains': return !String(variable).includes(String(value));
      case 'starts_with': return String(variable).startsWith(String(value));
      case 'ends_with': return String(variable).endsWith(String(value));
      case 'is_empty': return variable === '' || variable === null || variable === undefined;
      case 'is_not_empty': return variable !== '' && variable !== null && variable !== undefined;
      case 'is_true': return variable === true || variable === 'true' || variable === 1;
      case 'is_false': return variable === false || variable === 'false' || variable === 0;
      default: return false;
    }
  }

  private loadPluginConfigs(session: ExecutionSession): Record<string, Record<string, string>> {
    const pluginIds = this.getReferencedPluginIds(session);
    const schemes = session.workflow.pluginConfigSchemes || {};
    const config: Record<string, Record<string, string>> = {};

    for (const pluginId of pluginIds) {
      try {
        const schemeName = schemes[pluginId];
        config[pluginId] = schemeName
          ? workflowStore.readPluginScheme(session.workflow.id, pluginId, schemeName)
          : pluginService.getPluginConfig(pluginId);
      } catch {
        config[pluginId] = pluginService.getPluginConfig(pluginId);
      }
    }

    return config;
  }

  private getReferencedPluginIds(session: ExecutionSession): string[] {
    const pluginIds = new Set(session.workflow.enabledPlugins || []);
    const collect = (value: any) => {
      if (typeof value === 'string') {
        const matches = value.matchAll(/__config__\[(["'])([^"']+)\1\]/g);
        for (const match of matches) pluginIds.add(match[2]);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(collect);
        return;
      }
      if (value && typeof value === 'object') {
        Object.values(value).forEach(collect);
      }
    };

    session.nodes.forEach(node => collect(node.data));
    return [...pluginIds];
  }

  // ---- Private: Variable resolution ----

  private resolveContextVariables(session: ExecutionSession, data: Record<string, any>): Record<string, any> {
    return this.resolveValue(session, data);
  }

  private resolveValue(session: ExecutionSession, value: any): any {
    if (typeof value === 'string') return this.resolveStringValue(session, value);
    if (Array.isArray(value)) return value.map(item => this.resolveValue(session, item));
    if (value && typeof value === 'object') {
      const resolved: Record<string, any> = {};
      for (const [key, nested] of Object.entries(value)) {
        resolved[key] = this.resolveValue(session, nested);
      }
      return resolved;
    }
    return value;
  }

  private resolveStringValue(session: ExecutionSession, value: string): any {
    // Full match patterns (return raw value, not string)
    const loopVarMatch = value.match(/^\s*\{\{\s*__loop__\.vars\.([^}]+?)\s*\}\}\s*$/);
    if (loopVarMatch) return this.getLoopVariableValue(session, loopVarMatch[1]) ?? '';

    const loopMetaMatch = value.match(/^\s*\{\{\s*__loop__\.((?:index|count|item|isFirst|isLast)(?:\.[^}]+?)?)\s*\}\}\s*$/);
    if (loopMetaMatch) return this.getLoopMetaPathValue(session, loopMetaMatch[1]) ?? '';

    const envMatch = value.match(/^\s*\{\{\s*__env__\.([^}]+?)\s*\}\}\s*$/);
    if (envMatch) return getNestedValue(session.context.__env__ ?? {}, envMatch[1]) ?? '';

    const dataMatch = value.match(/^\s*\{\{\s*__data__\[(["'])([^"']+)\1\](?:\.|\[)([^}]+?)\s*\}\}\s*$/);
    if (dataMatch) {
      const data = this.getNodeExecutionData(session, dataMatch[2]);
      if (data != null) {
        const result = getNestedValue(data, normalizeVariablePath(dataMatch[3]));
        if (result !== undefined) return result;
      }
      return '';
    }

    const inputMatch = value.match(/^\s*\{\{\s*__inputs__\[(["'])([^"']+)\1\](?:\.|\[)([^}]+?)\s*\}\}\s*$/);
    if (inputMatch) {
      const inputData = this.getNodeExecutionInput(session, inputMatch[2]);
      if (inputData != null) {
        const result = getNestedValue(inputData, normalizeVariablePath(inputMatch[3]));
        if (result !== undefined) return result;
      }
      return '';
    }

    const configMatch = value.match(/^\s*\{\{\s*__config__\[(["'])([^"']+)\1\]\[(["'])([^"']+)\3\](?:\.(\w+(?:\.\w+)*))?\s*\}\}\s*$/);
    if (configMatch) {
      const pluginConfig = session.context.__config__?.[configMatch[2]];
      if (pluginConfig != null) {
        let raw: any = pluginConfig[configMatch[4]];
        if (configMatch[5] && typeof raw === 'string') {
          try { raw = JSON.parse(raw); } catch { /* keep raw string */ }
        }
        const result = configMatch[5] ? getNestedValue(raw, configMatch[5]) : raw;
        if (result !== undefined) return result;
      }
      return '';
    }

    const ctxMatch = value.match(/^\s*\{\{\s*context\.([^}]+?)\s*\}\}\s*$/);
    if (ctxMatch) return getNestedValue(session.context, ctxMatch[1]) ?? '';

    // Inline patterns (string replacement)
    let text = value
      .replace(/\{\{\s*__loop__\.vars\.([^}]+?)\s*\}\}/g, (_m, p) => String(this.getLoopVariableValue(session, p) ?? ''))
      .replace(/\{\{\s*__loop__\.((?:index|count|item|isFirst|isLast)(?:\.[^}]+?)?)\s*\}\}/g, (_m, p) => String(this.getLoopMetaPathValue(session, p) ?? ''))
      .replace(/\{\{\s*__env__\.([^}]+?)\s*\}\}/g, (_m, p) => String(getNestedValue(session.context.__env__ ?? {}, p) ?? ''))
      .replace(/\{\{\s*__data__\[(["'])([^"']+)\1\](?:\.|\[)([^}]+?)\s*\}\}/g, (_m, _q, nid, fp) => {
        const d = this.getNodeExecutionData(session, nid);
        return d == null ? '' : String(getNestedValue(d, normalizeVariablePath(fp)) ?? '');
      })
      .replace(/\{\{\s*__inputs__\[(["'])([^"']+)\1\](?:\.|\[)([^}]+?)\s*\}\}/g, (_m, _q, nid, fp) => {
        const d = this.getNodeExecutionInput(session, nid);
        return d == null ? '' : String(getNestedValue(d, normalizeVariablePath(fp)) ?? '');
      })
      .replace(
        /\{\{\s*__config__\[(["'])([^"']+)\1\]\[(["'])([^"']+)\3\](?:\.(\w+(?:\.\w+)*))?\s*\}\}/g,
        (_m, _pq, pluginId, _kq, key, dotPath) => {
          const pluginConfig = session.context.__config__?.[pluginId];
          if (pluginConfig == null) return '';
          let raw: any = pluginConfig[key];
          if (dotPath && typeof raw === 'string') {
            try { raw = JSON.parse(raw); } catch { /* keep raw string */ }
          }
          return String((dotPath ? getNestedValue(raw, dotPath) : raw) ?? '');
        },
      )
      .replace(/\{\{\s*context\.([^}]+?)\s*\}\}/g, (_m, p) => String(getNestedValue(session.context, p) ?? ''));

    return text;
  }

  // ---- Private: Build execution order ----

  private buildExecutionOrder(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const inDegree = new Map(nodes.map(n => [n.id, 0]));
    for (const edge of edges) {
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }
    const order: WorkflowNode[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const node = nodeMap.get(id);
      if (node) order.push(node);
      for (const edge of edges) {
        if (edge.source !== id) continue;
        const deg = (inDegree.get(edge.target) ?? 1) - 1;
        inDegree.set(edge.target, deg);
        if (deg === 0) queue.push(edge.target);
      }
    }
    return order;
  }

  // ---- Private: Breakpoints ----

  private shouldPauseAtBreakpoint(session: ExecutionSession, node: WorkflowNode, bp: 'start' | 'end'): boolean {
    if (node.breakpoint !== bp) return false;
    return !session.breakpointBypassKeys.has(`${node.id}:${bp}`);
  }

  private pauseAtBreakpoint(session: ExecutionSession, nextIndex: number, node: WorkflowNode, bp: 'start' | 'end'): void {
    session.currentIndex = nextIndex;
    session.status = 'paused';
    session.pauseReason = bp === 'start' ? 'breakpoint-start' : 'breakpoint-end';
    session.pauseNodeId = node.id;
    session.pauseBreakpoint = bp;
    this.emitLog(session);
    this.emitEvent(session, 'workflow:paused', {
      executionId: session.id, workflowId: session.workflow.id,
      timestamp: Date.now(), status: 'paused',
      currentNodeId: node.id, reason: session.pauseReason,
    });
  }

  // ---- Private: Branch reachability ----

  private isNodeReachable(
    session: ExecutionSession,
    nodeId: string,
    visited?: Set<string>,
    edges: WorkflowEdge[] = session.edges,
  ): boolean {
    const seen = visited || new Set<string>();
    if (seen.has(nodeId)) return false;
    seen.add(nodeId);
    const incoming = edges.filter(e => e.target === nodeId);
    if (incoming.length === 0) return true;
    for (const edge of incoming) {
      const activeHandle = this.getActiveBranches(session).get(edge.source);
      if (activeHandle !== undefined && edge.sourceHandle !== activeHandle) continue;
      if (this.isNodeReachable(session, edge.source, seen, edges)) return true;
    }
    return false;
  }

  private areIncomingNodesCompleted(
    session: ExecutionSession,
    nodeId: string,
    edges: WorkflowEdge[],
    completedNodeIds?: Set<string>,
  ): boolean {
    const incoming = edges.filter(edge => (
      edge.target === nodeId
      && this.isActiveEdge(session, edge)
      && (this.getActiveBranches(session).size === 0 || this.isNodeReachable(session, edge.source, undefined, edges))
    ));
    if (incoming.length === 0) return true;
    return incoming.every(edge => this.isNodeCompleted(session, edge.source, completedNodeIds));
  }

  private isActiveEdge(session: ExecutionSession, edge: WorkflowEdge): boolean {
    const activeHandle = this.getActiveBranches(session).get(edge.source);
    return activeHandle === undefined || edge.sourceHandle === activeHandle;
  }

  private isNodeCompleted(
    session: ExecutionSession,
    nodeId: string,
    completedNodeIds?: Set<string>,
  ): boolean {
    if (completedNodeIds?.has(nodeId)) return true;
    const step = [...session.steps].reverse().find(s => s.nodeId === nodeId);
    return this.doesStepSatisfyDownstreamDependency(step);
  }

  private doesStepSatisfyDownstreamDependency(step: ExecutionStep | undefined): boolean {
    return step?.status === 'completed' || step?.status === 'skipped';
  }

  // ---- Private: Loop context ----

  private getLoopFrame(session: ExecutionSession): LoopExecutionFrame | null {
    const workerFrame = this.loopWorkerState.getStore()?.frame;
    if (workerFrame) return workerFrame;
    return session.loopStack[session.loopStack.length - 1] || null;
  }

  private getActiveBranches(session: ExecutionSession): Map<string, string> {
    return this.loopWorkerState.getStore()?.branch ?? session.activeBranches;
  }

  private runWithLoopWorkerState<T>(
    session: ExecutionSession, frame: LoopExecutionFrame, callback: () => Promise<T>,
  ): Promise<T> {
    return this.loopWorkerState.run(
      { branch: new Map(session.activeBranches), data: {}, frame, inputs: {} },
      callback,
    );
  }

  private syncLoopContext(session: ExecutionSession): void {
    const frame = this.getLoopFrame(session);
    if (!frame) { delete session.context.__loop__; return; }
    session.context.__loop__ = {
      vars: frame.variables, index: frame.metadata.index, count: frame.metadata.count,
      item: frame.metadata.item, isFirst: frame.metadata.isFirst, isLast: frame.metadata.isLast,
    };
  }

  private getRuntimeContext(session: ExecutionSession): Record<string, any> {
    const frame = this.getLoopFrame(session);
    const ws = this.loopWorkerState.getStore();
    if (!frame && !ws) return session.context;
    return {
      ...session.context,
      ...(ws ? { __data__: { ...session.context.__data__, ...ws.data } } : {}),
      ...(ws ? { __inputs__: { ...session.context.__inputs__, ...ws.inputs } } : {}),
      ...(frame ? { __loop__: session.context.__loop__ } : {}),
    };
  }

  private getLoopVariableValue(session: ExecutionSession, path: string): unknown {
    const frame = this.getLoopFrame(session);
    if (!frame) return undefined;
    return getNestedValue(frame.variables, path);
  }

  private getLoopMetaValue(session: ExecutionSession, key: string): unknown {
    const frame = this.getLoopFrame(session);
    if (!frame) return undefined;
    return frame.metadata[key as keyof LoopExecutionFrame['metadata']];
  }

  private getLoopMetaPathValue(session: ExecutionSession, path: string): unknown {
    const normalized = normalizeVariablePath(path);
    const [key, ...rest] = normalized.split('.');
    const value = this.getLoopMetaValue(session, key);
    if (rest.length === 0) return value;
    return getNestedValue(value, rest.join('.'));
  }

  // ---- Private: Node execution data ----

  private getNodeExecutionData(session: ExecutionSession, nodeId: string): any {
    const frame = this.getLoopFrame(session);
    const ws = this.loopWorkerState.getStore();
    if (!frame) return session.context.__data__?.[nodeId];
    if (nodeId === frame.bodyAnchorId || nodeId === frame.loopNodeId) {
      return { $index: frame.metadata.index, $count: frame.metadata.count, $item: frame.metadata.item,
        $isFirst: frame.metadata.isFirst, $isLast: frame.metadata.isLast, ...frame.variables };
    }
    return ws?.data[nodeId] ?? session.context.__data__?.[nodeId] ?? frame.parentData?.[nodeId];
  }

  private setNodeExecutionData(session: ExecutionSession, nodeId: string, value: unknown): void {
    const ws = this.loopWorkerState.getStore();
    if (ws) { ws.data[nodeId] = value; return; }
    if (!session.context.__data__) session.context.__data__ = {};
    session.context.__data__[nodeId] = value;
  }

  private getNodeExecutionInput(session: ExecutionSession, nodeId: string): any {
    const ws = this.loopWorkerState.getStore();
    return ws?.inputs[nodeId] ?? session.context.__inputs__?.[nodeId];
  }

  private setNodeExecutionInput(session: ExecutionSession, nodeId: string, value: unknown): void {
    const ws = this.loopWorkerState.getStore();
    if (ws) { ws.inputs[nodeId] = value; return; }
    if (!session.context.__inputs__) session.context.__inputs__ = {};
    session.context.__inputs__[nodeId] = value;
  }

  // ---- Private: Output building ----

  private getStepInput(node: WorkflowNode, data: Record<string, any>): Record<string, any> | undefined {
    if (node.type === 'start' || node.type === 'end') return undefined;
    return data;
  }

  private buildOutputObject(outputs: OutputField[] | undefined): Record<string, any> | null {
    if (!Array.isArray(outputs) || outputs.length === 0) return null;
    const result: Record<string, any> = {};
    for (const field of outputs) {
      if (!field.key) continue;
      if (field.type === 'object') {
        result[field.key] = this.buildOutputObject(field.children) ?? {};
        continue;
      }
      if (field.type === 'array') {
        result[field.key] = Array.isArray(field.value) ? field.value : [];
        continue;
      }
      result[field.key] = field.value ?? '';
    }
    return result;
  }

  private getFirstObjectOutputKey(outputs: OutputField[] | undefined): string | null {
    if (!Array.isArray(outputs)) return null;
    const field = outputs.find(item => (item?.type === 'object' || item?.type === 'array') && typeof item.key === 'string' && item.key.trim());
    return field?.key.trim() || null;
  }

  private recordSkippedStep(session: ExecutionSession, node: WorkflowNode, reason: string): void {
    session.steps.push({
      nodeId: node.id, nodeLabel: node.label,
      startedAt: Date.now(), finishedAt: Date.now(),
      status: 'skipped', error: reason,
    });
    this.emitLog(session);
  }

  // ---- Private: Event emission ----

  private currentContext(session: ExecutionSession): Record<string, unknown> {
    return clone(session.context);
  }

  private currentLog(session: ExecutionSession): ExecutionLog {
    return {
      id: session.id, workflowId: session.workflow.id,
      startedAt: session.startedAt, finishedAt: session.finishedAt,
      status: session.status === 'running' ? 'running' : session.status === 'paused' ? 'paused' : session.status === 'completed' ? 'completed' : 'error',
      steps: clone(session.steps),
      snapshot: {
        nodes: clone(session.nodes),
        edges: clone(session.edges),
        groups: clone(session.groups || []),
        variables: clone(session.variables || []),
      },
    };
  }

  private emitEvent<C extends ExecutionEventChannel>(session: ExecutionSession, channel: C, payload: ExecutionEventMap[C]): void {
    session.lastUpdatedAt = Date.now();
    session.eventSequence += 1;
    session.recentEvents.push({
      sequence: session.eventSequence, channel,
      payload: clone(payload) as ExecutionEventMap[ExecutionEventChannel],
    });
    if (session.recentEvents.length > MAX_RECENT_EVENTS) {
      session.recentEvents.splice(0, session.recentEvents.length - MAX_RECENT_EVENTS);
    }
    if (session.eventSink) {
      session.eventSink(channel as string, payload);
    } else {
      this.deps.emit(channel, payload);
    }
  }

  private emitLog(session: ExecutionSession): void {
    this.emitEvent(session, 'execution:log', {
      executionId: session.id, workflowId: session.workflow.id,
      timestamp: Date.now(), log: this.currentLog(session),
    });
  }

  private emitContext(session: ExecutionSession): void {
    this.emitEvent(session, 'execution:context', {
      executionId: session.id, workflowId: session.workflow.id,
      timestamp: Date.now(), context: this.currentContext(session),
    });
  }

  private emitWorkflowError(session: ExecutionSession): void {
    this.emitEvent(session, 'workflow:error', {
      executionId: session.id, workflowId: session.workflow.id,
      timestamp: Date.now(), status: 'error',
      error: createErrorShape('WORKFLOW_ERROR', session.lastErrorMessage || 'Workflow execution failed'),
      log: this.currentLog(session),
    });
  }

  // ---- Private: Persistence & recovery ----

  private persistAndCleanup(session: ExecutionSession): void {
    if (!session.persisted) {
      workflowStore.addExecutionLog(session.workflow.id, this.currentLog(session));
      session.persisted = true;
    }
    this.finishedRecoveries.set(session.id, {
      ownerClientId: session.ownerClientId,
      workflowId: session.workflow.id,
      recovery: this.createRecoveryState(session, false),
      expiresAt: Date.now() + FINISHED_RECOVERY_TTL_MS,
    });
    this.sessions.delete(session.id);
    this.pruneFinishedRecoveries();
  }

  private createRecoveryState(session: ExecutionSession, active: boolean): NonNullable<ExecutionRecoveryResponse['execution']> {
    return {
      executionId: session.id, workflowId: session.workflow.id, status: session.status,
      currentNodeId: session.pauseNodeId || session.executionOrder[session.currentIndex]?.id,
      pauseReason: session.pauseReason, updatedAt: session.lastUpdatedAt, active,
      log: this.currentLog(session), context: this.currentContext(session),
      recentEvents: clone(session.recentEvents),
    };
  }

  private findSession(ownerClientId: string, workflowId: string, executionId?: string | null): ExecutionSession | undefined {
    for (const s of this.sessions.values()) {
      if (s.ownerClientId !== ownerClientId || s.workflow.id !== workflowId) continue;
      if (executionId && s.id !== executionId) continue;
      return s;
    }
    return undefined;
  }

  private findFinishedRecovery(ownerClientId: string, workflowId: string, executionId?: string | null): FinishedExecutionRecovery | undefined {
    for (const r of this.finishedRecoveries.values()) {
      if (r.ownerClientId !== ownerClientId || r.workflowId !== workflowId) continue;
      if (executionId && r.recovery.executionId !== executionId) continue;
      return r;
    }
    return undefined;
  }

  private pruneFinishedRecoveries(): void {
    const now = Date.now();
    for (const [id, r] of this.finishedRecoveries) {
      if (r.expiresAt <= now) this.finishedRecoveries.delete(id);
    }
  }

  private getSession(executionId: string): ExecutionSession {
    const session = this.sessions.get(executionId);
    if (!session) throw createErrorShape('NOT_FOUND', `Session not found: ${executionId}`);
    return session;
  }
}

// ---- Utility functions ----

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getNestedValue(obj: any, path: string): any {
  const parts = normalizeVariablePath(path).split('.').filter(Boolean);
  return getNestedPathValue(obj, parts);
}

function getNestedPathValue(current: any, parts: string[]): any {
  if (parts.length === 0) return current;
  if (current == null) return undefined;

  const [part, ...rest] = parts;
  if (Array.isArray(current) && !isArrayIndex(part) && part !== 'length') {
    const values = current
      .map(item => getNestedPathValue(item, parts))
      .filter(value => value !== undefined);
    if (values.length === 0) return undefined;
    return values.flatMap(value => Array.isArray(value) ? value : [value]);
  }

  return getNestedPathValue(current[part], rest);
}

function isArrayIndex(part: string): boolean {
  return /^(0|[1-9]\d*)$/.test(part);
}

function setNestedValue(obj: Record<string, any>, path: string, value: unknown): void {
  const parts = normalizeVariablePath(path).split('.').filter(Boolean);
  if (parts.length === 0) return;
  let current: Record<string, any> = obj;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!next || typeof next !== 'object' || Array.isArray(next)) current[part] = {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

function deleteNestedValue(obj: Record<string, any>, path: string): boolean {
  const parts = normalizeVariablePath(path).split('.').filter(Boolean);
  if (parts.length === 0) return false;
  let current: Record<string, any> = obj;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!next || typeof next !== 'object') return false;
    current = next;
  }
  const last = parts[parts.length - 1];
  if (!Object.prototype.hasOwnProperty.call(current, last)) return false;
  delete current[last];
  return true;
}

function normalizeVariablePath(path: string): string {
  return path
    .trim()
    .replace(/\]\s*\[\s*/g, '.')
    .replace(/\[\s*(["'])([^"']+)\1\s*\]/g, '.$2')
    .replace(/\[\s*([^\]"'\s]+)\s*\]/g, '.$1')
    .replace(/^\[\s*/, '')
    .replace(/\s*\]$/, '')
    .replace(/^(["'])([^"']+)\1$/, '$2')
    .replace(/(["'])\s*\.\s*(["'])/g, '.')
    .replace(/["']/g, '')
    .replace(/^\./, '');
}

function shouldInterrupt(session: ExecutionSession): boolean {
  return session.stopRequested || session.status === 'error';
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean);
  }

  return [];
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function normalizeAgentPermissionMode(value: unknown): AgentRuntimeConfig['permissionMode'] {
  switch (value) {
    case 'default':
    case 'acceptEdits':
    case 'bypassPermissions':
    case 'plan':
    case 'dontAsk':
    case 'auto':
      return value;
    default:
      return 'dontAsk';
  }
}

function getRuntimeBaseURL(provider?: string, apiBase?: string): string | undefined {
  if (
    provider === 'openai-responses-to-anthropic-messages'
    || provider === 'openai-chat-completions-to-anthropic-messages'
  ) return undefined;
  return apiBase;
}

function resolveWorkflowAgentWorkspaceId(): string {
  return workspaceService.getAll()[0]?.id ?? 'default';
}

function resolveAgentConfigId(resolvedData: Record<string, any>): string {
  if (typeof resolvedData.agentConfigId === 'string' && resolvedData.agentConfigId.trim()) {
    return resolvedData.agentConfigId.trim();
  }
  const agent = resolvedData.agent;
  if (agent && typeof agent === 'object' && !Array.isArray(agent)) {
    const id = (agent as Record<string, unknown>).id;
    if (typeof id === 'string' && id.trim()) return id.trim();
  }
  return '';
}

// Composite node helpers (from workflow-composite.ts shared types)
function getNodesForExecutionScope(nodes: WorkflowNode[], scopeId: string | null): WorkflowNode[] {
  // scopeId null = root nodes (no composite.parentId)
  // scopeId non-null = nodes whose composite.parentId matches
  if (scopeId === null) {
    return nodes.filter(n => !n.composite?.parentId);
  }
  return nodes.filter(n => n.composite?.parentId === scopeId);
}

function findCompositeChildByRole(nodes: WorkflowNode[], parentId: string, role: string): WorkflowNode | undefined {
  return nodes.find(n => n.composite?.parentId === parentId && n.composite?.role === role);
}

function getCompositeParentId(node: WorkflowNode): string | undefined {
  return node.composite?.parentId ?? undefined;
}

function isGeneratedWorkflowNode(node: WorkflowNode): boolean {
  return !!node.data?._generated;
}

function normalizeEmbeddedWorkflow(data: any, genId: () => string): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  // Simplified: just return as-is if already normalized
  if (data.nodes && data.edges) return data;
  return { nodes: [], edges: [] };
}

function normalizeLoopResult(result: unknown): Record<string, any> {
  if (result && typeof result === 'object' && !Array.isArray(result)) return result as Record<string, any>;
  return { result };
}
