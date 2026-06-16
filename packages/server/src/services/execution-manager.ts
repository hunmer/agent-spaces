// Workflow Execution Manager — core execution engine
// Ported from work_fox, adapted for agent-spaces:
// - Removed: pluginRegistry, clientNodeCache, Electron main process bridge
// - Changed: agent_run uses agent-spaces Agent runtime directly
// - Kept: DAG traversal, loops, switches, variables, breakpoints, recovery

import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  WorkflowGroup,
  ExecutionLog,
  ExecutionStep,
  ExecutionLogEntry,
  OutputField,
} from '@agent-spaces/shared';
import type {
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
import * as workflowStore from '../storage/workflow-store.js';
import * as pluginService from './plugin.js';
import { getNestedValue, normalizeVariablePath } from './execution-value-access.js';
import {
  clone,
  normalizeNodeResult,
  isClientPluginNode,
  getClientPluginId,
  executePluckArrayKey,
  executeFlattenArray,
  executeParseJson,
  executeStringConcat,
  executeStringSplit,
  executeArrayTextReplace,
  executeSwitch,
  executeVariableAggregate,
  executeSetVariable,
  executeGetVariable,
  executeDeleteVariable,
  resolveLoopIterations,
  initLoopSharedVars,
  buildExecutionOrder,
  buildOutputObject,
  getFirstObjectOutputKey,
  getStepInput,
} from './execution-node-helpers.js';
import type {
  ExecutionManagerDeps,
  ExecutionSession,
  LoopExecutionFrame,
  LoopIterations,
  LoopWorkerState,
  FinishedExecutionRecovery,
} from './execution-types.js';
import {
  executeSqliteQuery,
  executeSqliteInsert,
  executeSqliteUpdate,
  executeSqliteDelete,
  executeSqliteRaw,
} from './execution-sqlite-nodes.js';
import { executeKbAdd, executeKbQuery, executeKbDelete } from './execution-kb-nodes.js';
import { executeCode, executePython } from './execution-code-runners.js';
import { executeAgentRun } from './execution-agent-runner.js';
import {
  shouldInterrupt,
  getNodesForExecutionScope,
  findCompositeChildByRole,
  getCompositeParentId,
  isGeneratedWorkflowNode,
  normalizeEmbeddedWorkflow,
  normalizeLoopResult,
} from './execution-composite-helpers.js';

// 保留公共导出（外部测试直接引用），实际定义已移至 execution-value-access.ts
export { getNestedValue } from './execution-value-access.js';

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
    workspaceId?: string,
  ): Promise<WorkflowExecuteResponse> {
    const workflow = workflowStore.getWorkflow(request.workflowId);
    if (!workflow) {
      throw createErrorShape('NOT_FOUND', `Workflow not found: ${request.workflowId}`);
    }

    const snapshot = this.resolveExecutionSnapshot(workflow, request);
    const executionId = randomUUID();
    const session = this.createSession(
      executionId, workflow, ownerClientId, request.input || {}, snapshot, undefined, request.env, eventSink, workspaceId,
    );
    session.context.__config__ = this.loadPluginConfigs(session);

    this.sessions.set(executionId, session);
    void this.run(session);
    return { executionId, status: 'running' };
  }

  async debugNode(
    request: WorkflowDebugNodeRequest,
    ownerClientId: string,
    workspaceId?: string,
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
      undefined, workspaceId,
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
    workspaceId?: string,
  ): ExecutionSession {
    const defaultEnv = buildOutputObject(snapshot?.variables ?? workflow.variables) ?? {};
    return {
      id: executionId, workflow, ownerClientId,
      ...(workspaceId ? { workspaceId } : {}),
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
      session.executionOrder = buildExecutionOrder(session.nodes, session.edges);
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
    const completedNodeIds = new Set(
      session.steps
        .filter(step => this.doesStepSatisfyDownstreamDependency(step))
        .map(step => step.nodeId),
    );
    const runningNodeIds = new Set<string>();
    const scheduledNodeIds = new Set<string>(completedNodeIds);
    let paused = false;

    const startReadyNodes = (): Array<Promise<void>> => {
      const started: Array<Promise<void>> = [];
      for (let i = startIndex; i < session.executionOrder.length; i++) {
        const node = session.executionOrder[i];
        if (!node || scheduledNodeIds.has(node.id) || runningNodeIds.has(node.id)) continue;
        if (!this.areIncomingNodesCompleted(session, node.id, session.edges, completedNodeIds)) continue;

        scheduledNodeIds.add(node.id);
        runningNodeIds.add(node.id);
        started.push((async () => {
          try {
            const result = await this.executeWorkflowNodeAtIndex(session, node, i);
            if (result === 'completed' || result === 'skipped') completedNodeIds.add(node.id);
            if (result === 'paused') paused = true;
          } finally {
            runningNodeIds.delete(node.id);
          }
        })());
      }
      return started;
    };

    const running = new Set<Promise<void>>();
    const enqueueReady = () => {
      if (session.status === 'error' || session.stopRequested || session.pauseRequested || paused) return;
      for (const promise of startReadyNodes()) {
        const tracked = promise.finally(() => running.delete(tracked));
        running.add(tracked);
      }
    };

    enqueueReady();
    while (running.size > 0) {
      await Promise.race(running);
      if (session.status === 'error') {
        await Promise.allSettled(running);
        session.finishedAt = Date.now();
        this.emitLog(session);
        this.emitWorkflowError(session);
        this.persistAndCleanup(session);
        return;
      }
      if (session.stopRequested) {
        await Promise.allSettled(running);
        session.status = 'error';
        session.lastErrorMessage = 'Execution stopped';
        session.finishedAt = Date.now();
        this.emitLog(session);
        this.emitWorkflowError(session);
        this.persistAndCleanup(session);
        return;
      }
      if (paused || session.status === 'paused') {
        await Promise.allSettled(running);
        return;
      }
      enqueueReady();
    }

    if (session.status === 'paused') return;
    if (scheduledNodeIds.size < session.executionOrder.length) {
      for (const node of session.executionOrder) {
        if (!scheduledNodeIds.has(node.id)) this.recordSkippedStep(session, node, 'Waiting for upstream nodes');
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

  private async executeWorkflowNodeAtIndex(
    session: ExecutionSession,
    node: WorkflowNode,
    index: number,
  ): Promise<'completed' | 'skipped' | 'paused' | 'interrupted'> {
    if (session.stopRequested) {
      if (session.status === 'error') return 'interrupted';
      session.status = 'error';
      session.lastErrorMessage = 'Execution stopped';
      return 'interrupted';
    }

    if (session.pauseRequested) {
      session.currentIndex = index;
      session.status = 'paused';
      session.pauseReason = 'manual';
      session.pauseNodeId = node.id;
      this.emitLog(session);
      this.emitEvent(session, 'workflow:paused', {
        executionId: session.id, workflowId: session.workflow.id,
        timestamp: Date.now(), status: 'paused',
        currentNodeId: node.id, reason: 'manual',
      });
      return 'paused';
    }

    session.currentIndex = index;
    const nodeState = node.nodeState || 'normal';

    if (node.type === 'loop_body' && isGeneratedWorkflowNode(node)) return 'skipped';
    if (getCompositeParentId(node)) return 'skipped';

    if (this.getActiveBranches(session).size > 0 && !this.isNodeReachable(session, node.id)) {
      this.recordSkippedStep(session, node, 'Inactive branch');
      return 'skipped';
    }

    if (nodeState === 'disabled') {
      this.recordSkippedStep(session, node, 'Node disabled');
      session.status = 'error';
      session.lastErrorMessage = 'Node disabled, workflow aborted';
      return 'interrupted';
    }

    if (nodeState === 'skipped') {
      this.recordSkippedStep(session, node, 'Node skipped');
      return 'skipped';
    }

    if (this.shouldPauseAtBreakpoint(session, node, 'start')) {
      this.pauseAtBreakpoint(session, index, node, 'start');
      return 'paused';
    }

    const result = await this.executeNode(session, node);
    if (result === 'interrupted') return 'interrupted';

    if (session.status === 'error') return 'interrupted';

    if (this.shouldPauseAtBreakpoint(session, node, 'end')) {
      this.pauseAtBreakpoint(session, index + 1, node, 'end');
      return 'paused';
    }
    return 'completed';
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
    const stepInput = getStepInput(node, resolvedData);
    this.setNodeExecutionInput(session, node.id, node.type === 'end' ? {} : buildOutputObject(resolvedData.inputFields) ?? {});

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
      this.setNodeExecutionData(session, node.id, normalizeNodeResult(result));
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
        const fieldOutput = buildOutputObject(resolvedData.inputFields) ?? {};
        const runtimeInput = session.context.__input__ ?? {};
        return { ...fieldOutput, ...runtimeInput };
      }
      case 'loop_body':
      case 'sticky_note':
      case 'markdown':
        return null;
      case 'loop_break':
        return this.executeLoopBreak(session, appendLog);
      case 'end':
        return buildOutputObject(resolvedData.outputs);
      case 'gallery_preview':
        return { items: Array.isArray(resolvedData.items) ? resolvedData.items : [] };
      case 'table_display':
        return this.executeTableDisplay(session, node, resolvedData);
      case 'sqlite_query':  return executeSqliteQuery(resolvedData);
      case 'sqlite_insert': return executeSqliteInsert(resolvedData);
      case 'sqlite_update': return executeSqliteUpdate(resolvedData);
      case 'sqlite_delete': return executeSqliteDelete(resolvedData);
      case 'sqlite_raw':    return executeSqliteRaw(resolvedData);
      case 'kb_add':        return executeKbAdd(resolvedData, session.workspaceId || '');
      case 'kb_query':      return executeKbQuery(resolvedData, session.workspaceId || '');
      case 'kb_delete':     return executeKbDelete(resolvedData, session.workspaceId || '');
      case 'run_code':
        return executeCode(
          this.getRuntimeContext(session),
          String(resolvedData.code || ''),
          this.buildCodeParams(session, node, resolvedData),
          appendLog,
        );
      case 'run_python':
        return executePython(
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
        return executeSwitch(resolvedData.conditions);
      case 'variable_aggregate': {
        const outputKey = getFirstObjectOutputKey(resolvedData.outputs) ?? 'result';
        return { [outputKey]: executeVariableAggregate(resolvedData.groups || []) };
      }
      case 'flatten_array':
        return executeFlattenArray(resolvedData);
      case 'pluck_array_key':
        return executePluckArrayKey(resolvedData);
      case 'array_text_replace':
        return executeArrayTextReplace(resolvedData);
      case 'parse_json':
        return executeParseJson(resolvedData);
      case 'string_concat':
        return executeStringConcat(resolvedData);
      case 'string_split':
        return executeStringSplit(resolvedData);
      case 'set_variable':
        return executeSetVariable(session, resolvedData.variables || [], appendLog);
      case 'get_variable':
        return executeGetVariable(session, resolvedData);
      case 'delete_variable':
        return executeDeleteVariable(session, resolvedData, appendLog);
      case 'sub_workflow':
        return this.executeSubWorkflow(session, resolvedData, appendLog);
      case 'loop':
        return this.executeLoopNode(session, node, resolvedData, appendLog);
      case 'agent_run':
        return executeAgentRun(session, node, resolvedData, appendLog);
      case 'alert':
        return this.executeAlertDialog(session, node, resolvedData, appendLog);
      case 'prompt':
        return this.executePromptDialog(session, node, resolvedData, appendLog);
      case 'form':
        return this.executeFormDialog(session, node, resolvedData, appendLog);
      default:
        if (isClientPluginNode(node)) {
          return this.executeClientNode(session, node, resolvedData, appendLog);
        }
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
    const pluginId = getClientPluginId(node) || pluginService.getPluginIdByNodeType(node.type);
    if (!pluginId) throw new Error(`Client plugin not found for node type: ${node.type}`);
    appendLog('info', `Requesting client execution for ${node.type}`);
    const result = await this.deps.clientNodeManager.request({
      clientId: session.ownerClientId,
      executionId: session.id,
      workflowId: session.workflow.id,
      nodeId: node.id,
      pluginId,
      nodeType: node.type,
      args: resolvedData,
    });
    return normalizeNodeResult(result);
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

  private buildCodeParams(
    session: ExecutionSession,
    node: WorkflowNode,
    resolvedData: Record<string, any>,
  ): Record<string, any> {
    const explicitInput = buildOutputObject(resolvedData.inputFields);
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

  // ---- Private: Loop execution ----

  private async executeLoopNode(
    session: ExecutionSession, node: WorkflowNode,
    resolvedData: Record<string, any>,
    appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<any> {
    const bodyNode = findCompositeChildByRole(session.nodes, node.id, 'loop_body');
    if (!bodyNode) throw new Error('Loop node missing body');

    const loopType = typeof resolvedData.loopType === 'string' ? resolvedData.loopType : 'count';
    const iterations = resolveLoopIterations(loopType, resolvedData);
    const concurrency = Math.max(1, Math.floor(Number(resolvedData.concurrency) || 1));
    const sharedVars = initLoopSharedVars(resolvedData.sharedVariables);
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
    const output = buildOutputObject(resolvedData.outputs) ?? {};
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
      return this.executeDownstreamBranches(
        session,
        nodeId,
        adjacency.get(nodeId) || [],
        bodyEdges,
        visited,
        id => scopeNodes.find(n => n.id === id),
        execFrom,
      );
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
    }, buildOutputObject(resolvedData.inputFields) ?? {});
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
      return this.executeDownstreamBranches(
        session,
        nodeId,
        adjacency.get(nodeId) || [],
        workflow.edges,
        visited,
        id => nodeMap.get(id),
        execFrom,
        node => node.type !== 'start',
      );
    };
    return execFrom(startNode.id);
  }

  private async executeDownstreamBranches(
    session: ExecutionSession,
    sourceNodeId: string,
    outgoingEdges: WorkflowEdge[],
    dependencyEdges: WorkflowEdge[],
    visited: Set<string>,
    getNode: (nodeId: string) => WorkflowNode | undefined,
    execFrom: (nodeId: string) => Promise<unknown>,
    shouldUseNodeResult: (node: WorkflowNode) => boolean = () => true,
  ): Promise<unknown> {
    if (shouldInterrupt(session)) return undefined;

    const branches: Array<Promise<unknown>> = [];
    for (const edge of outgoingEdges) {
      if (shouldInterrupt(session)) break;
      if (edge.source !== sourceNodeId || !this.isActiveEdge(session, edge)) continue;

      const nextNode = getNode(edge.target);
      if (!nextNode || visited.has(nextNode.id)) continue;
      if (!this.areIncomingNodesCompleted(session, nextNode.id, dependencyEdges, visited)) continue;

      visited.add(nextNode.id);
      branches.push((async () => {
        const result = await this.executeNode(session, nextNode);
        if (result === 'interrupted' || shouldInterrupt(session)) return undefined;

        let lastResult = shouldUseNodeResult(nextNode)
          ? this.getNodeExecutionData(session, nextNode.id)
          : undefined;
        const downstream = await execFrom(nextNode.id);
        if (downstream !== undefined) lastResult = downstream;
        return lastResult;
      })());
    }

    const results = await Promise.all(branches);
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i] !== undefined) return results[i];
    }
    return undefined;
  }

  // ---- Private: Condition evaluation ----

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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
