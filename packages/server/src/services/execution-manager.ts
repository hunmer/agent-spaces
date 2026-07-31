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
  EngineStatus,
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
import { createErrorShape, isRuntimeWorkflowEdge } from '@agent-spaces/shared';
import * as workflowStore from '../storage/workflow-store.js';
import { getWorkflowSettings } from '../storage/workflow-settings-store.js';
import * as pluginService from './plugin.js';
import { getNestedValue, normalizeVariablePath, setNestedValue } from './execution-value-access.js';
import {
  clone,
  normalizeNodeResult,
  isClientPluginNode,
  getClientPluginId,
  executePluckArrayKey,
  executeFlattenArray,
  executeMergeArrays,
  executeParseJson,
  executeStringConcat,
  executeStringSplit,
  executeRandomText,
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
  applyNodeInputMiddleware,
  applyNodeOutputMiddleware,
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
import { executeAgentIntent, executeAgentRun } from './execution-agent-runner.js';
import {
  shouldInterrupt,
  getNodesForExecutionScope,
  findCompositeChildByRole,
  getCompositeParentId,
  isGeneratedWorkflowNode,
  normalizeEmbeddedWorkflow,
  mergeLoopItemResult,
} from './execution-composite-helpers.js';

const JSON_PRESETS_KEY = '__jsonPresets';
const SELECTED_JSON_PRESET_KEY = '__selectedJsonPresetId';

type PluginConfigValues = Record<string, string>;
type PluginConfigTree = Record<string, string | PluginConfigValues>;
type WorkflowPluginConfigTree = Record<string, PluginConfigTree>;

// 保留公共导出（外部测试直接引用），实际定义已移至 execution-value-access.ts
export { getNestedValue } from './execution-value-access.js';
export function __resolveWorkflowConfigValueForTest(
  config: WorkflowPluginConfigTree,
  template: string,
): any {
  return resolveWorkflowConfigString(config, template);
}

export function __normalizeExecutionSnapshotNodesForTest(nodes: WorkflowNode[]): WorkflowNode[] {
  return normalizeExecutionSnapshotNodes(nodes);
}

export function __normalizeExecutionSnapshotNodesWithConfigForTest(
  nodes: WorkflowNode[],
  config: WorkflowPluginConfigTree,
): WorkflowNode[] {
  return normalizeExecutionSnapshotNodes(nodes, (_node, data) => resolveSnapshotDataForTest(data, config));
}

export function __isWorkflowEdgeActiveForTest(
  edge: WorkflowEdge,
  edges: WorkflowEdge[],
  activeHandle: string | undefined,
): boolean {
  return isBranchActiveEdge(edge, edges, activeHandle);
}

interface SubWorkflowExecutionContext {
  id: string
  workflow: Workflow
  startedAt: number
  finishedAt?: number
  status: ExecutionLog['status']
}

function buildSubWorkflowExecutionLog(
  execution: SubWorkflowExecutionContext,
  steps: ExecutionStep[],
): ExecutionLog {
  return {
    id: execution.id,
    workflowId: execution.workflow.id,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    status: execution.status,
    steps: clone(steps.filter(step => step.subWorkflowExecutionIds?.includes(execution.id))),
    snapshot: {
      nodes: normalizeExecutionSnapshotNodes(clone(execution.workflow.nodes)),
      edges: clone(execution.workflow.edges),
      groups: clone(execution.workflow.groups || []),
      variables: clone(execution.workflow.variables || []),
    },
  };
}

export function __buildSubWorkflowExecutionLogForTest(
  execution: SubWorkflowExecutionContext,
  steps: ExecutionStep[],
): ExecutionLog {
  return buildSubWorkflowExecutionLog(execution, steps);
}

const MAX_RECENT_EVENTS = 100;
const FINISHED_RECOVERY_TTL_MS = 2 * 60_000;
const DELAY_NODE_MIN_MS = 100;
const DELAY_NODE_MAX_MS = 30_000;
const WORKFLOW_SOURCE_BY_OWNER_CLIENT_ID: Record<string, string> = {
  '__cron__': 'cron',
  '__hook__': 'hook',
  'agent-tools': 'agent-tools',
};

function parseExecutionFieldHandle(handleId: string | null | undefined): { kind: 'input' | 'property' | 'output'; key: string } | null {
  if (!handleId) return null;
  const separatorIndex = handleId.indexOf(':');
  if (separatorIndex <= 0) return null;

  const kind = handleId.slice(0, separatorIndex);
  if (kind !== 'input' && kind !== 'property' && kind !== 'output') return null;

  const key = handleId.slice(separatorIndex + 1).trim();
  return key ? { kind, key } : null;
}

function buildReferenceEdgeTemplate(edge: WorkflowEdge): string | null {
  const sourceField = parseExecutionFieldHandle(edge.sourceHandle);
  if (!sourceField) return null;
  if (sourceField.kind === 'output') return `{{ __data__["${edge.source}"].${sourceField.key} }}`;
  if (sourceField.kind === 'input') return `{{ __inputs__["${edge.source}"].${sourceField.key} }}`;
  return null;
}

function appendReferenceTemplate(currentValue: unknown, template: string): string {
  if (typeof currentValue !== 'string' || !currentValue.trim()) return template;
  if (currentValue.includes(template)) return currentValue;
  return `${currentValue}\n${template}`;
}

function applyReferenceTemplateToInputField(
  inputFields: unknown,
  key: string,
  template: string,
): unknown {
  if (!Array.isArray(inputFields)) return inputFields;
  return inputFields.map((field) => {
    if (!field || typeof field !== 'object' || Array.isArray(field)) return field;
    const fieldRecord = field as Record<string, unknown>;
    if (fieldRecord.key !== key) return field;
    return {
      ...fieldRecord,
      value: appendReferenceTemplate(fieldRecord.value, template),
    };
  });
}

function getBranchComparableSourceHandle(edge: WorkflowEdge, edges: WorkflowEdge[]): string | null | undefined {
  if (edge.sourceHandle) return edge.sourceHandle;
  const caseEdges = edges.filter(candidate => (
    candidate.source === edge.source
    && !candidate.sourceHandle
  ));
  const caseIndex = caseEdges.findIndex(candidate => (
    candidate === edge || (candidate.id !== undefined && candidate.id === edge.id)
  ));
  return caseIndex >= 0 ? `case-${caseIndex}` : edge.sourceHandle;
}

function isBranchActiveEdge(
  edge: WorkflowEdge,
  edges: WorkflowEdge[],
  activeHandle: string | undefined,
): boolean {
  if (activeHandle === undefined) return true;
  return getBranchComparableSourceHandle(edge, edges) === activeHandle;
}

function inferWorkflowSource(ownerClientId: string): string {
  if (ownerClientId.startsWith('sse:')) return 'api';
  return WORKFLOW_SOURCE_BY_OWNER_CLIENT_ID[ownerClientId] ?? 'web';
}

function buildWorkflowContextObject(
  workflow: Workflow,
  executionId: string,
  ownerClientId: string,
  workspaceId?: string,
): Record<string, unknown> {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description ?? '',
    type: workflow.type ?? 'normal',
    folderId: workflow.folderId,
    tags: Array.isArray(workflow.tags) ? [...workflow.tags] : [],
    published: workflow.published === true,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    executionId,
    ownerClientId,
    source: inferWorkflowSource(ownerClientId),
    ...(workspaceId ? { workspaceId } : {}),
  };
}

function normalizeExecutionSnapshotNodes(
  nodes: WorkflowNode[],
  resolveData?: (node: WorkflowNode, data: Record<string, any>) => Record<string, any>,
): WorkflowNode[] {
  return nodes.map((node) => {
    const { inputFields, outputs, ...data } = node.data || {};
    const normalizedData = resolveData ? resolveData(node, data) : data;
    return {
      ...node,
      ...(inputFields === undefined ? {} : { inputFields }),
      ...(outputs === undefined ? {} : { outputs }),
      data: normalizedData,
    } as WorkflowNode;
  });
}

export class ExecutionManager {
  private sessions = new Map<string, ExecutionSession>();
  private finishedRecoveries = new Map<string, FinishedExecutionRecovery>();
  private loopWorkerState = new AsyncLocalStorage<LoopWorkerState>();
  private executionGraphScope = new AsyncLocalStorage<{
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    config: WorkflowPluginConfigTree;
  }>();
  private subWorkflowExecutionScope = new AsyncLocalStorage<string[]>();
  private subWorkflowExecutions = new Map<string, SubWorkflowExecutionContext[]>();

  constructor(private deps: ExecutionManagerDeps) {}

  private getExecutionNodes(session: ExecutionSession): WorkflowNode[] {
    return this.executionGraphScope.getStore()?.nodes ?? session.nodes;
  }

  private getExecutionEdges(session: ExecutionSession): WorkflowEdge[] {
    return this.executionGraphScope.getStore()?.edges ?? session.edges;
  }

  private getExecutionConfig(session: ExecutionSession): WorkflowPluginConfigTree {
    return this.executionGraphScope.getStore()?.config ?? session.context.__config__ ?? {};
  }

  getRunningSessionCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.status === 'running' || session.status === 'paused') count++;
    }
    return count;
  }

  async __executeScopedBodyForTest(
    session: ExecutionSession,
    bodyNode: WorkflowNode,
    scopeNodes: WorkflowNode[],
  ): Promise<unknown> {
    return this.executeScopedBody(session, bodyNode, scopeNodes);
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

    const { executionSnapshot, logSnapshot } = this.resolveExecutionSnapshot(workflow, request);
    const executionId = randomUUID();
    const session = this.createSession(
      executionId, workflow, ownerClientId, request.input || {}, executionSnapshot, request.context, request.env, eventSink, workspaceId,
      request.dryRun,
    );
    session.pluginConfigs = request.pluginConfigs ? clone(request.pluginConfigs) : undefined;
    // 容错模式：请求显式指定时优先，否则回退到全局 workflow-settings
    const globalFaultTolerance = request.faultTolerance
      ? (request.faultTolerance === 'stop' ? 'stop' : 'ignore')
      : getWorkflowSettings().faultTolerance;
    session.faultTolerance = globalFaultTolerance;
    if (logSnapshot) session.logSnapshot = clone(logSnapshot);
    if (request.startNodeId) session.partialStartNodeId = request.startNodeId;
    this.recordContextPresetSteps(session);
    session.context.__config__ = this.loadPluginConfigs(session, workflow, session.nodes, session.pluginConfigs);

    this.sessions.set(executionId, session);
    // Stamp last-run timestamp so the workflows page can sort by "last run".
    try {
      workflowStore.updateWorkflow({ ...workflow, lastRunAt: Date.now() });
    } catch { /* non-critical: ignore write errors */ }
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
        error: formatErrorWithStack(error),
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
  ): {
    executionSnapshot?: { nodes: WorkflowNode[]; edges: WorkflowEdge[]; groups?: WorkflowGroup[]; variables?: OutputField[] }
    logSnapshot?: { nodes: WorkflowNode[]; edges: WorkflowEdge[]; groups?: WorkflowGroup[]; variables?: OutputField[] }
  } {
    const baseNodes = request.snapshot?.nodes ? clone(request.snapshot.nodes) : clone(workflow.nodes);
    const baseEdges = request.snapshot?.edges ? clone(request.snapshot.edges) : clone(workflow.edges);
    const baseGroups = request.snapshot?.groups ? clone(request.snapshot.groups) : clone(workflow.groups || []);
    const baseVariables = request.snapshot?.variables ? clone(request.snapshot.variables) : clone(workflow.variables || []);
    const fullSnapshot = request.snapshot
      ? { nodes: baseNodes, edges: baseEdges, groups: baseGroups, variables: baseVariables }
      : undefined;

    const rootNodes = getNodesForExecutionScope(baseNodes, null);
    const startNodes = rootNodes.filter(n => n.type === 'start');

    if (request.startNodeId) {
      const startNode = rootNodes.find(n => n.id === request.startNodeId);
      if (!startNode) {
        throw createErrorShape('BAD_REQUEST', `Start node not found: ${request.startNodeId}`);
      }
      return {
        executionSnapshot: this.buildReachableSnapshot(baseNodes, baseEdges, baseGroups, baseVariables, startNode.id),
        logSnapshot: fullSnapshot,
      };
    }

    if (startNodes.length > 1) {
      const choices = startNodes.map(n => `${n.label || 'Start'}(${n.id})`).join(', ');
      throw createErrorShape('BAD_REQUEST', `Multiple start nodes, specify startNodeId: ${choices}`);
    }

    return { executionSnapshot: fullSnapshot, logSnapshot: fullSnapshot };
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

    const dependencyQueue = [...reachableIds];
    while (dependencyQueue.length > 0) {
      const targetId = dependencyQueue.shift()!;
      for (const edge of edges) {
        if (!isRuntimeWorkflowEdge(edge) || edge.target !== targetId || reachableIds.has(edge.source)) continue;
        reachableIds.add(edge.source);
        dependencyQueue.push(edge.source);
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

  private recordContextPresetSteps(session: ExecutionSession): void {
    const data = session.context.__data__;
    if (!data || typeof data !== 'object') return;
    const executionNodeIds = new Set(session.nodes.map(node => node.id));
    const logNodes = session.logSnapshot?.nodes ?? [];
    const now = Date.now();
    for (const node of logNodes) {
      if (executionNodeIds.has(node.id)) continue;
      if (!Object.prototype.hasOwnProperty.call(data, node.id)) continue;
      session.steps.push({
        nodeId: node.id,
        nodeLabel: node.label,
        startedAt: now,
        finishedAt: now,
        status: 'completed',
        input: session.context.__inputs__?.[node.id],
        output: data[node.id],
        logs: [{ level: 'info', message: 'JSON preset output used', timestamp: now }],
      });
    }
  }

  private createSession(
    executionId: string, workflow: Workflow, ownerClientId: string,
    input: Record<string, unknown>,
    snapshot?: { nodes: WorkflowNode[]; edges: WorkflowEdge[]; groups?: WorkflowGroup[]; variables?: OutputField[] },
    context?: Record<string, unknown>,
    env?: Record<string, unknown>,
    eventSink?: (channel: string, payload: unknown) => void,
    workspaceId?: string,
    dryRun?: WorkflowExecuteRequest['dryRun'],
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
        __WORKFLOW__: buildWorkflowContextObject(workflow, executionId, ownerClientId, workspaceId),
      },
      status: 'idle', executionOrder: [], currentIndex: 0,
      pauseRequested: false, stopRequested: false,
      startedAt: Date.now(), steps: [],
      activeBranches: new Map(), persisted: false,
      lastUpdatedAt: Date.now(), eventSequence: 0,
      recentEvents: [], loopStack: [],
      breakpointBypassKeys: new Set(), dryRun, eventSink,
      faultTolerance: 'ignore',
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
      if (session.partialStartNodeId) {
        await this.runPartialFromNode(session, session.partialStartNodeId);
        return;
      }
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
    const currentNode = session.executionOrder[session.currentIndex];
    const formattedError = error instanceof Error ? error.message : String(error);
    if (currentNode) {
      const existingStep = [...session.steps].reverse().find(step => (
        step.nodeId === currentNode.id && step.status === 'running'
      ));
      if (existingStep) {
        existingStep.finishedAt = Date.now();
        existingStep.status = 'error';
        existingStep.error = formatErrorWithStack(error);
      } else {
        session.steps.push({
          nodeId: currentNode.id,
          nodeLabel: currentNode.label,
          startedAt: Date.now(),
          finishedAt: Date.now(),
          status: 'error',
          error: formatErrorWithStack(error),
        });
      }
      this.emitLog(session);
    }
    session.status = 'error';
    session.lastErrorMessage = formattedError;
    session.finishedAt = Date.now();
    this.emitWorkflowError(session);
    this.persistAndCleanup(session);
  }

  private async runPartialFromNode(session: ExecutionSession, startNodeId: string): Promise<void> {
    try {
      const startNode = session.nodes.find(node => node.id === startNodeId);
      if (!startNode) throw new Error(`Start node not found: ${startNodeId}`);
      if (startNode.type === 'start') {
        await this.runFromIndex(session, 0);
        return;
      }
      const rootNodeIds = new Set(getNodesForExecutionScope(session.nodes, null).map(node => node.id));
      const completedNodeIds = new Set(
        session.steps
          .filter(step => this.doesStepSatisfyDownstreamDependency(step))
          .map(step => step.nodeId),
      );
      const visited = new Set<string>([startNode.id]);
      const startIndex = Math.max(0, session.executionOrder.findIndex(node => node.id === startNode.id));
      const result = await this.executeWorkflowNodeAtIndex(session, startNode, startIndex);
      if (result === 'paused') return;
      if (result === 'interrupted' || session.status === 'error' || session.stopRequested) {
        if (session.stopRequested && session.status !== 'error') {
          session.status = 'error';
          session.lastErrorMessage = 'Execution stopped';
        }
        session.finishedAt = Date.now();
        this.emitLog(session);
        this.emitWorkflowError(session);
        this.persistAndCleanup(session);
        return;
      }
      completedNodeIds.add(startNode.id);

      const runtimeEdges = session.edges.filter(isRuntimeWorkflowEdge);
      const adjacency = new Map<string, WorkflowEdge[]>();
      for (const edge of runtimeEdges) {
        if (!rootNodeIds.has(edge.source) || !rootNodeIds.has(edge.target)) continue;
        const list = adjacency.get(edge.source) || [];
        list.push(edge);
        adjacency.set(edge.source, list);
      }
      const nodeMap = new Map(session.nodes
        .filter(node => rootNodeIds.has(node.id))
        .map(node => [node.id, node]));
      const execFrom = async (nodeId: string): Promise<unknown> => {
        return this.executeDownstreamBranches(
          session,
          nodeId,
          adjacency.get(nodeId) || [],
          runtimeEdges,
          visited,
          completedNodeIds,
          id => nodeMap.get(id),
          execFrom,
        );
      };
      await execFrom(startNode.id);

      if (session.status === 'paused') return;
      const statusAfterDownstream = session.status as EngineStatus;
      if (statusAfterDownstream === 'error' || session.stopRequested) {
        if (session.stopRequested && statusAfterDownstream !== 'error') {
          session.status = 'error';
          session.lastErrorMessage = 'Execution stopped';
        }
        session.finishedAt = Date.now();
        this.emitLog(session);
        this.emitWorkflowError(session);
        this.persistAndCleanup(session);
        return;
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
    } catch (error) {
      this.handleExecutionError(session, error);
    }
  }

  private async runFromIndex(session: ExecutionSession, startIndex: number): Promise<void> {
    const executionNodeIds = new Set(session.executionOrder.map(node => node.id));
    const completedNodeIds = new Set(
      session.steps
        .filter(step => executionNodeIds.has(step.nodeId))
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
        if (!this.areIncomingNodesCompleted(session, node.id, session.edges.filter(isRuntimeWorkflowEdge), completedNodeIds)) continue;

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

    const dryRunInput = this.getDryRunNodeValue(session, 'inputs', node.id);
    const step: ExecutionStep = {
      nodeId: node.id, nodeLabel: node.label, startedAt: Date.now(), status: 'running',
      ...(this.subWorkflowExecutionScope.getStore()?.length
        ? { subWorkflowExecutionIds: [...this.subWorkflowExecutionScope.getStore()!] }
        : {}),
    };
    session.steps.push(step);

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
      const strictDataReferences = node.type !== 'variable_aggregate';
      const nodeDataWithReferences = this.applyReferenceEdgeBindings(session, node);
      const resolvedData = applyNodeInputMiddleware(this.normalizeResolvedNodeDataTypes(node, this.applyDryRunInput(
        this.resolveContextVariables(session, nodeDataWithReferences, { strictDataReferences }),
        dryRunInput,
      )));
      const stepInput = dryRunInput ?? getStepInput(node, resolvedData);
      if (stepInput !== undefined) step.input = stepInput;
      this.setNodeExecutionInput(session, node.id, dryRunInput ?? (node.type === 'end' ? {} : buildOutputObject(resolvedData.inputFields) ?? {}));

      this.emitEvent(session, 'node:start', {
        executionId: session.id, workflowId: session.workflow.id,
        timestamp: Date.now(), nodeId: node.id, nodeLabel: node.label, input: stepInput,
      });
      this.emitLog(session);

      const dryRunOutput = this.getDryRunNodeValue(session, 'outputs', node.id);
      if (dryRunOutput !== undefined) appendLog('info', 'Dry run output override used');
      const presetOutput = dryRunOutput === undefined ? this.getSelectedJsonPresetOutput(node) : undefined;
      if (presetOutput !== undefined) appendLog('info', 'JSON preset output used');
      const result = dryRunOutput ?? presetOutput ?? applyNodeOutputMiddleware(
        await this.dispatchNode(session, node, resolvedData, appendLog),
        resolvedData,
      );
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
      step.error = formatErrorWithStack(error);
      step.logs = stepLogs.length ? [...stepLogs] : undefined;
      const nodeErrorMessage = step.error;
      this.emitEvent(session, 'node:error', {
        executionId: session.id, workflowId: session.workflow.id,
        timestamp: Date.now(), nodeId: node.id, step: { ...step },
        error: createErrorShape('WORKFLOW_ERROR', step.error),
      });
      this.emitLog(session);
      // 容错模式：忽略错误时仅记录到步骤日志，控制台输出，不终止工作流
      if (session.faultTolerance === 'ignore') {
        // eslint-disable-next-line no-console
        console.error(`[workflow] node "${node.label || node.id}" failed but ignored (faultTolerance=ignore):`, nodeErrorMessage);
        return 'completed';
      }
      session.status = 'error';
      session.lastErrorMessage = nodeErrorMessage;
    }

    return 'completed';
  }

  private getSelectedJsonPresetOutput(node: WorkflowNode): unknown {
    const selectedPresetId = node.data?.[SELECTED_JSON_PRESET_KEY];
    if (typeof selectedPresetId !== 'string' || !selectedPresetId) return undefined;
    const presets = node.data?.[JSON_PRESETS_KEY];
    if (!Array.isArray(presets)) return undefined;
    const preset = presets.find((item): item is { id: string; outputs?: unknown } =>
      !!item && typeof item === 'object' && (item as { id?: unknown }).id === selectedPresetId
    );
    return preset && preset.outputs !== undefined ? clone(preset.outputs) : undefined;
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
        return this.buildEndNodeOutput(session, node, resolvedData);
      case 'gallery_preview':
        return { items: Array.isArray(resolvedData.items) ? resolvedData.items : [] };
      case 'table_display':
        return this.executeTableDisplay(session, node, resolvedData);
      case 'show_miniapp':
        return this.executeShowMiniApp(session, node, resolvedData);
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
      case 'merge_arrays':
        return executeMergeArrays(resolvedData);
      case 'pluck_array_key':
        return executePluckArrayKey(resolvedData);
      case 'array_text_replace':
        return executeArrayTextReplace(resolvedData);
      case 'parse_json':
        return executeParseJson(resolvedData);
      case 'random_text':
        return executeRandomText(resolvedData);
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
        return this.executeSubWorkflow(session, node, resolvedData, appendLog);
      case 'loop':
        return this.executeLoopNode(session, node, resolvedData, appendLog);
      case 'agent_run':
        return executeAgentRun(session, node, resolvedData, appendLog);
      case 'agent_intent':
        return executeAgentIntent(session, node, resolvedData, appendLog);
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

  private getDryRunNodeValue(
    session: ExecutionSession,
    kind: 'inputs' | 'outputs',
    nodeId: string,
  ): unknown {
    const dryRun = session.dryRun;
    if (!dryRun) return undefined;
    if (Array.isArray(dryRun.nodeIds) && dryRun.nodeIds.length > 0 && !dryRun.nodeIds.includes(nodeId)) {
      return undefined;
    }
    const values = dryRun[kind];
    if (!values || typeof values !== 'object' || Array.isArray(values)) return undefined;
    return Object.prototype.hasOwnProperty.call(values, nodeId)
      ? (values as Record<string, unknown>)[nodeId]
      : undefined;
  }

  private applyDryRunInput(resolvedData: Record<string, any>, input: unknown): Record<string, any> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return resolvedData;
    const inputRecord = input as Record<string, unknown>;
    const next: Record<string, any> = { ...resolvedData, ...inputRecord };
    if (Array.isArray(resolvedData.inputFields)) {
      next.inputFields = resolvedData.inputFields.map((field: unknown) => {
        if (!field || typeof field !== 'object' || Array.isArray(field)) return field;
        const key = (field as Record<string, unknown>).key;
        if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(inputRecord, key)) return field;
        return { ...(field as Record<string, unknown>), value: inputRecord[key] };
      });
    }
    return next;
  }

  private normalizeResolvedNodeDataTypes(node: WorkflowNode, resolvedData: Record<string, any>): Record<string, any> {
    if (!pluginService.canExecuteWorkflowNode(node.type)) return resolvedData;
    const definition = pluginService.getWorkflowNodeDefinitionByType(node.type);
    if (!definition?.properties?.length) return resolvedData;

    const next: Record<string, any> = { ...resolvedData };
    for (const property of definition.properties) {
      if (!property?.key || !Object.prototype.hasOwnProperty.call(next, property.key)) continue;
      const dataType = property.dataType
        ?? (property.type === 'number' ? 'number' : undefined)
        ?? (property.type === 'checkbox' ? 'boolean' : undefined);
      next[property.key] = pluginService.coerceByDataType(next[property.key], dataType);
    }
    return next;
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

  private async executeShowMiniApp(
    session: ExecutionSession,
    node: WorkflowNode,
    resolvedData: Record<string, any>,
  ): Promise<Record<string, unknown>> {
    const miniAppId = typeof resolvedData.miniAppId === 'string' ? resolvedData.miniAppId.trim() : '';
    if (!miniAppId) {
      throw new Error('show_miniapp requires miniAppId');
    }

    const route = typeof resolvedData.route === 'string' && resolvedData.route.trim()
      ? resolvedData.route.trim()
      : '/';

    let params: Record<string, unknown> = {};
    if (resolvedData.params && typeof resolvedData.params === 'object' && !Array.isArray(resolvedData.params)) {
      params = resolvedData.params as Record<string, unknown>;
    } else if (typeof resolvedData.params === 'string' && resolvedData.params.trim()) {
      try {
        const parsed = JSON.parse(resolvedData.params);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          params = parsed as Record<string, unknown>;
        }
      } catch {
        throw new Error('show_miniapp params must be valid JSON object');
      }
    }

    console.info('[show_miniapp][server] interaction request payload', {
      executionId: session.id,
      workflowId: session.workflow.id,
      nodeId: node.id,
      miniAppId,
      route,
      params,
    });

    const result = await this.deps.interactionManager.request({
      clientId: session.ownerClientId,
      executionId: session.id,
      workflowId: session.workflow.id,
      nodeId: node.id,
      interactionType: 'miniapp_confirm' as any,
      schema: {
        miniAppId,
        route,
        params,
        title: miniAppId,
      },
    });
    console.info('[show_miniapp][server] interaction resolved', {
      executionId: session.id,
      workflowId: session.workflow.id,
      nodeId: node.id,
      miniAppId,
      route,
      params,
      result,
    });

    return {
      submittedData: result,
      miniAppId,
      route,
      params,
      confirmed: true,
    };
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
      : this.getExecutionEdges(session).find(edge => isRuntimeWorkflowEdge(edge) && edge.target === node.id && this.isActiveEdge(session, edge))?.source;
    if (!sourceNodeId) return {};

    const sourceOutput = this.getNodeExecutionData(session, sourceNodeId);
    if (sourceOutput && typeof sourceOutput === 'object' && !Array.isArray(sourceOutput)) {
      return { ...sourceOutput };
    }
    return sourceOutput === undefined ? {} : { input: sourceOutput };
  }

  private buildEndNodeOutput(
    session: ExecutionSession,
    node: WorkflowNode,
    resolvedData: Record<string, any>,
  ): Record<string, any> | null {
    const output = buildOutputObject(resolvedData.outputs) ?? {};
    const incomingEdges = this.getExecutionEdges(session).filter((edge) => (
      isRuntimeWorkflowEdge(edge)
      && edge.target === node.id
      && this.isActiveEdge(session, edge)
    ));

    for (const edge of incomingEdges) {
      const targetField = parseExecutionFieldHandle(edge.targetHandle);
      if (targetField?.kind !== 'output') continue;

      const sourceField = parseExecutionFieldHandle(edge.sourceHandle);
      const sourceValue = sourceField?.kind === 'output'
        ? getNestedValue(this.getNodeExecutionData(session, edge.source), sourceField.key)
        : sourceField?.kind === 'input'
          ? getNestedValue(this.getNodeExecutionInput(session, edge.source), sourceField.key)
          : this.getNodeExecutionData(session, edge.source);

      if (sourceValue === undefined) continue;
      setNestedValue(
        output,
        targetField.key,
        sourceValue && typeof sourceValue === 'object' ? clone(sourceValue) : sourceValue,
      );
    }

    return output;
  }

  private applyReferenceEdgeBindings(
    session: ExecutionSession,
    node: WorkflowNode,
  ): Record<string, any> {
    const nodeData = clone({ ...node.data });
    const executionEdges = this.getExecutionEdges(session);
    const incomingReferenceEdges = executionEdges.filter((edge) => (
      edge.edgeKind === 'reference'
      && edge.target === node.id
      && isBranchActiveEdge(edge, executionEdges, this.getActiveBranches(session).get(edge.source))
    ));

    for (const edge of incomingReferenceEdges) {
      const template = buildReferenceEdgeTemplate(edge);
      const targetField = parseExecutionFieldHandle(edge.targetHandle);
      if (!template || !targetField) continue;

      if (targetField.kind === 'property') {
        const currentValue = getNestedValue(nodeData, targetField.key);
        setNestedValue(nodeData, targetField.key, appendReferenceTemplate(currentValue, template));
        continue;
      }

      if (targetField.kind === 'input') {
        nodeData.inputFields = applyReferenceTemplateToInputField(nodeData.inputFields, targetField.key, template);
      }
    }

    return nodeData;
  }

  // ---- Private: Loop execution ----

  private async executeLoopNode(
    session: ExecutionSession, node: WorkflowNode,
    resolvedData: Record<string, any>,
    appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<any> {
    const bodyNode = findCompositeChildByRole(this.getExecutionNodes(session), node.id, 'loop_body');
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
          items[index] = mergeLoopItemResult(iterations.items[index], result);
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
    const scopeNodes = getNodesForExecutionScope(this.getExecutionNodes(session), bodyNode.id);
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
    const bodyEdges = this.getExecutionEdges(session).filter(e => {
      if (!isRuntimeWorkflowEdge(e)) return false;
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
    const completedNodeIds = new Set<string>([bodyNode.id]);
    const execFrom = async (nodeId: string): Promise<unknown> => {
      return this.executeDownstreamBranches(
        session,
        nodeId,
        adjacency.get(nodeId) || [],
        bodyEdges,
        visited,
        completedNodeIds,
        id => scopeNodes.find(n => n.id === id),
        execFrom,
      );
    };
    const result = await execFrom(bodyNode.id);
    const endNode = scopeNodes.find(n => n.type === 'end' && this.getNodeExecutionData(session, n.id) !== undefined);
    return endNode ? this.getNodeExecutionData(session, endNode.id) : result;
  }

  private async executeSubWorkflow(
    session: ExecutionSession, node: WorkflowNode, resolvedData: Record<string, any>,
    appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<unknown> {
    const workflowId = typeof resolvedData.workflowId === 'string' ? resolvedData.workflowId : '';
    if (!workflowId) throw new Error('sub_workflow missing workflowId');
    if (workflowId === session.workflow.id) throw new Error('sub_workflow cannot call itself');

    const target = workflowStore.getWorkflow(workflowId);
    if (!target) throw new Error(`sub_workflow target not found: ${workflowId}`);

    const execution: SubWorkflowExecutionContext = {
      id: randomUUID(),
      workflow: target,
      startedAt: Date.now(),
      status: 'running',
    };
    const executions = this.subWorkflowExecutions.get(session.id) ?? [];
    executions.push(execution);
    this.subWorkflowExecutions.set(session.id, executions);
    const parentStep = session.steps.at(-1);
    if (parentStep?.nodeId === node.id) {
      parentStep.subWorkflowId = target.id;
      parentStep.subWorkflowExecutionId = execution.id;
    }
    this.emitLog(session);

    appendLog('info', `Starting sub_workflow: ${target.name}`);
    try {
      const parentScope = this.subWorkflowExecutionScope.getStore() ?? [];
      const config = {
        ...this.getExecutionConfig(session),
        ...this.loadPluginConfigs(session, target, target.nodes, session.pluginConfigs),
      };
      const result = await this.subWorkflowExecutionScope.run(
        [...parentScope, execution.id],
        () => this.executeEmbeddedWorkflow(session, {
          nodes: clone(target.nodes), edges: clone(target.edges),
        }, buildOutputObject(resolvedData.inputFields) ?? {}, config),
      );
      execution.status = session.status === 'error' || session.stopRequested ? 'error' : 'completed';
      execution.finishedAt = Date.now();
      this.emitSubWorkflowLog(session, execution);
      appendLog('info', `Completed sub_workflow: ${target.name}`);
      return result;
    } catch (error) {
      execution.status = 'error';
      execution.finishedAt = Date.now();
      this.emitSubWorkflowLog(session, execution);
      throw error;
    } finally {
      const active = this.subWorkflowExecutions.get(session.id)?.filter(item => item.id !== execution.id) ?? [];
      if (active.length > 0) this.subWorkflowExecutions.set(session.id, active);
      else this.subWorkflowExecutions.delete(session.id);
    }
  }

  private async executeEmbeddedWorkflow(
    session: ExecutionSession,
    workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
    input?: Record<string, any>,
    config: WorkflowPluginConfigTree = this.getExecutionConfig(session),
  ): Promise<unknown> {
    return this.executionGraphScope.run({ nodes: workflow.nodes, edges: workflow.edges, config }, async () => {
      const rootNodes = getNodesForExecutionScope(workflow.nodes, null);
      const rootNodeIds = new Set(rootNodes.map(node => node.id));
      const nodeMap = new Map(rootNodes.map(node => [node.id, node]));
      const adjacency = new Map<string, WorkflowEdge[]>();
      const runtimeEdges = workflow.edges.filter(edge => (
        isRuntimeWorkflowEdge(edge)
        && rootNodeIds.has(edge.source)
        && rootNodeIds.has(edge.target)
      ));
      for (const edge of runtimeEdges) {
        const arr = adjacency.get(edge.source) || [];
        arr.push(edge);
        adjacency.set(edge.source, arr);
      }

      const startNode = rootNodes.find(n => n.type === 'start');
      if (!startNode) throw new Error('Embedded workflow missing start node');

      const startInput = input ?? {};
      const startedAt = Date.now();
      const startStep: ExecutionStep = {
        nodeId: startNode.id,
        nodeLabel: startNode.label,
        startedAt,
        finishedAt: startedAt,
        status: 'completed',
        output: startInput,
        ...(this.subWorkflowExecutionScope.getStore()?.length
          ? { subWorkflowExecutionIds: [...this.subWorkflowExecutionScope.getStore()!] }
          : {}),
      };
      session.steps.push(startStep);
      this.setNodeExecutionData(session, startNode.id, startInput);
      this.setNodeExecutionInput(session, startNode.id, startInput);
      this.emitEvent(session, 'node:start', {
        executionId: session.id, workflowId: session.workflow.id,
        timestamp: startedAt, nodeId: startNode.id, nodeLabel: startNode.label,
      });
      this.emitEvent(session, 'node:complete', {
        executionId: session.id, workflowId: session.workflow.id,
        timestamp: startedAt, nodeId: startNode.id, step: { ...startStep },
      });
      this.emitContext(session);
      this.emitLog(session);

      const visited = new Set<string>([startNode.id]);
      const completedNodeIds = new Set<string>([startNode.id]);
      const execFrom = async (nodeId: string): Promise<unknown> => {
        return this.executeDownstreamBranches(
          session,
          nodeId,
          adjacency.get(nodeId) || [],
          runtimeEdges,
          visited,
          completedNodeIds,
          id => nodeMap.get(id),
          execFrom,
          node => node.type !== 'start',
        );
      };
      return execFrom(startNode.id);
    });
  }

  private async executeDownstreamBranches(
    session: ExecutionSession,
    sourceNodeId: string,
    outgoingEdges: WorkflowEdge[],
    dependencyEdges: WorkflowEdge[],
    visited: Set<string>,
    completedNodeIds: Set<string>,
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
      if (!this.areIncomingNodesCompleted(session, nextNode.id, dependencyEdges, completedNodeIds)) continue;

      visited.add(nextNode.id);
      branches.push((async () => {
        const result = await this.executeNode(session, nextNode);
        if (result === 'interrupted' || shouldInterrupt(session)) return undefined;
        completedNodeIds.add(nextNode.id);

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

  private loadPluginConfigs(
    session: ExecutionSession,
    workflow: Workflow = session.workflow,
    nodes: WorkflowNode[] = session.nodes,
    overrides?: WorkflowExecuteRequest['pluginConfigs'],
  ): WorkflowPluginConfigTree {
    const pluginIds = this.getReferencedPluginIds(workflow, nodes);
    const schemes = workflow.pluginConfigSchemes || {};
    const config: Record<string, Record<string, string>> = {};

    for (const pluginId of pluginIds) {
      try {
        const schemeName = schemes[pluginId];
        if (!schemeName) {
          config[pluginId] = pluginService.getPluginConfig(pluginId);
          continue;
        }
        try {
          config[pluginId] = pluginService.readPluginConfigScheme(pluginId, schemeName);
        } catch {
          const legacyConfig = workflowStore.readPluginScheme(workflow.id, pluginId, schemeName);
          pluginService.savePluginConfigScheme(pluginId, schemeName, legacyConfig);
          config[pluginId] = legacyConfig;
        }
      } catch {
        config[pluginId] = pluginService.getPluginConfig(pluginId);
      }
    }

    if (overrides) {
      const installedPlugins = pluginService.listPlugins();
      const localizedPlugins = [...pluginService.listPlugins('zh'), ...pluginService.listPlugins('en')];
      for (const [pluginIdentifier, override] of Object.entries(overrides)) {
        const idMatch = installedPlugins.find(plugin => plugin.id === pluginIdentifier);
        const nameMatchIds = new Set(localizedPlugins.filter(plugin => plugin.name === pluginIdentifier).map(plugin => plugin.id));
        if (!idMatch && nameMatchIds.size > 1) {
          throw new Error(`Plugin name is ambiguous: ${pluginIdentifier}; use plugin ID instead`);
        }
        const nameMatchId = nameMatchIds.values().next().value as string | undefined;
        const plugin = idMatch ?? installedPlugins.find(item => item.id === nameMatchId);
        if (!plugin) throw new Error(`Plugin not found: ${pluginIdentifier}`);

        if (typeof override === 'string') {
          const schemeName = override.trim();
          if (!schemeName) throw new Error(`Plugin config scheme is empty: ${pluginIdentifier}`);
          config[plugin.id] = pluginService.readPluginConfigScheme(plugin.id, schemeName);
          continue;
        }
        if (!override || typeof override !== 'object' || Array.isArray(override)) {
          throw new Error(`Plugin config must be a scheme name or object: ${pluginIdentifier}`);
        }
        const normalized = Object.fromEntries(Object.entries(override).map(([key, value]) => [
          key,
          typeof value === 'string'
            ? value
            : value == null
              ? ''
              : typeof value === 'object'
                ? JSON.stringify(value)
                : String(value),
        ]));
        config[plugin.id] = {
          ...(config[plugin.id] ?? pluginService.getPluginConfig(plugin.id)),
          ...normalized,
        };
      }
    }

    return Object.fromEntries(Object.entries(config).map(([pluginId, activeConfig]) => {
      const namedConfigs: Record<string, PluginConfigValues> = {};
      for (const schemeName of pluginService.listPluginConfigSchemes(pluginId)) {
        try {
          namedConfigs[schemeName] = pluginService.readPluginConfigScheme(pluginId, schemeName);
        } catch {
          // Ignore stale scheme entries; active config remains available.
        }
      }
      return [pluginId, { ...namedConfigs, ...activeConfig }];
    }));
  }

  private getReferencedPluginIds(workflow: Workflow, nodes: WorkflowNode[]): string[] {
    const pluginIds = new Set(workflow.enabledPlugins || []);
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

    nodes.forEach(node => collect(node.data));
    return [...pluginIds];
  }

  // ---- Private: Variable resolution ----

  private resolveContextVariables(
    session: ExecutionSession,
    data: Record<string, any>,
    options: { strictDataReferences?: boolean } = {},
  ): Record<string, any> {
    return this.resolveValue(session, data, { strictDataReferences: options.strictDataReferences !== false });
  }

  private resolveValue(session: ExecutionSession, value: any, options: { strictDataReferences: boolean }): any {
    if (typeof value === 'string') return this.resolveStringValue(session, value, options);
    if (Array.isArray(value)) return value.map(item => this.resolveValue(session, item, options));
    if (value && typeof value === 'object') {
      const resolved: Record<string, any> = {};
      for (const [key, nested] of Object.entries(value)) {
        resolved[key] = this.resolveValue(session, nested, options);
      }
      return resolved;
    }
    return value;
  }

  private resolveStringValue(session: ExecutionSession, value: string, options: { strictDataReferences: boolean }): any {
    // Full match patterns (return raw value, not string)
    const loopVarMatch = value.match(/^\s*\{\{\s*__loop__\.vars\.([^}]+?)\s*\}\}\s*$/);
    if (loopVarMatch) return this.getLoopVariableValue(session, loopVarMatch[1]) ?? '';

    const loopMetaMatch = value.match(/^\s*\{\{\s*__loop__\.((?:index|count|item|isFirst|isLast)(?:\.[^}]+?)?)\s*\}\}\s*$/);
    if (loopMetaMatch) return this.getLoopMetaPathValue(session, loopMetaMatch[1]) ?? '';

    const envMatch = value.match(/^\s*\{\{\s*__env__\.([^}]+?)\s*\}\}\s*$/);
    if (envMatch) return getNestedValue(session.context.__env__ ?? {}, envMatch[1]) ?? '';

    const workflowMatch = value.match(/^\s*\{\{\s*__WORKFLOW__(?:\.([^}]+?))?\s*\}\}\s*$/);
    if (workflowMatch) {
      if (!workflowMatch[1]) return session.context.__WORKFLOW__ ?? {};
      return getNestedValue(session.context.__WORKFLOW__ ?? {}, workflowMatch[1]) ?? '';
    }

    const dataMatch = value.match(/^\s*\{\{\s*__data__\[(["'])([^"']+)\1\](?:\.|\[)([^}]+?)\s*\}\}\s*$/);
    if (dataMatch) {
      const data = this.getNodeExecutionData(session, dataMatch[2]);
      if (data != null) {
        const path = normalizeVariablePath(dataMatch[3]);
        const result = getNestedValue(data, path);
        if (result !== undefined) return result;
        if (!options.strictDataReferences) return '';
        throw new Error(`Workflow variable reference missing field: __data__["${dataMatch[2]}"].${path}`);
      }
      if (!options.strictDataReferences) return '';
      throw new Error(`Workflow variable reference missing node output: __data__["${dataMatch[2]}"]`);
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

    if (parseWorkflowConfigTemplate(value)) {
      return resolveWorkflowConfigString(this.getExecutionConfig(session), value);
    }

    const ctxMatch = value.match(/^\s*\{\{\s*context\.([^}]+?)\s*\}\}\s*$/);
    if (ctxMatch) return getNestedValue(session.context, ctxMatch[1]) ?? '';

    // Inline patterns (string replacement)
    let text = value
      .replace(/\{\{\s*__loop__\.vars\.([^}]+?)\s*\}\}/g, (_m, p) => String(this.getLoopVariableValue(session, p) ?? ''))
      .replace(/\{\{\s*__loop__\.((?:index|count|item|isFirst|isLast)(?:\.[^}]+?)?)\s*\}\}/g, (_m, p) => String(this.getLoopMetaPathValue(session, p) ?? ''))
      .replace(/\{\{\s*__env__\.([^}]+?)\s*\}\}/g, (_m, p) => String(getNestedValue(session.context.__env__ ?? {}, p) ?? ''))
      .replace(/\{\{\s*__WORKFLOW__(?:\.([^}]+?))?\s*\}\}/g, (_m, p) => (
        p ? String(getNestedValue(session.context.__WORKFLOW__ ?? {}, p) ?? '') : JSON.stringify(session.context.__WORKFLOW__ ?? {})
      ))
      .replace(/\{\{\s*__data__\[(["'])([^"']+)\1\](?:\.|\[)([^}]+?)\s*\}\}/g, (_m, _q, nid, fp) => {
        const d = this.getNodeExecutionData(session, nid);
        if (d == null) {
          if (!options.strictDataReferences) return '';
          throw new Error(`Workflow variable reference missing node output: __data__["${nid}"]`);
        }
        const path = normalizeVariablePath(fp);
        const resolved = getNestedValue(d, path);
        if (resolved === undefined) {
          if (!options.strictDataReferences) return '';
          throw new Error(`Workflow variable reference missing field: __data__["${nid}"].${path}`);
        }
        return String(resolved);
      })
      .replace(/\{\{\s*__inputs__\[(["'])([^"']+)\1\](?:\.|\[)([^}]+?)\s*\}\}/g, (_m, _q, nid, fp) => {
        const d = this.getNodeExecutionInput(session, nid);
        return d == null ? '' : String(getNestedValue(d, normalizeVariablePath(fp)) ?? '');
      })
      .replace(
        /\{\{\s*__config__(?:\[(?:"[^"]+"|'[^']+')\]){2,3}(?:\.\w+(?:\.\w+)*)?(?:\s*\|\|\s*(?:"[^"]*"|'[^']*'))?\s*\}\}/g,
        (match) => String(resolveWorkflowConfigString(this.getExecutionConfig(session), match) ?? ''),
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
    const runtimeEdges = edges.filter(isRuntimeWorkflowEdge);
    const incoming = runtimeEdges.filter(e => e.target === nodeId);
    if (incoming.length === 0) return true;
    for (const edge of incoming) {
      const activeHandle = this.getActiveBranches(session).get(edge.source);
      if (!isBranchActiveEdge(edge, runtimeEdges, activeHandle)) continue;
      if (this.isNodeReachable(session, edge.source, seen, runtimeEdges)) return true;
    }
    return false;
  }

  private areIncomingNodesCompleted(
    session: ExecutionSession,
    nodeId: string,
    edges: WorkflowEdge[],
    completedNodeIds?: Set<string>,
  ): boolean {
    const runtimeEdges = edges.filter(isRuntimeWorkflowEdge);
    const incoming = runtimeEdges.filter(edge => (
      edge.target === nodeId
      && this.isActiveEdge(session, edge)
      && (this.getActiveBranches(session).size === 0 || this.isNodeReachable(session, edge.source, undefined, runtimeEdges))
    ));
    if (incoming.length === 0) return true;
    return incoming.every(edge => this.isNodeCompleted(session, edge.source, completedNodeIds));
  }

  private isActiveEdge(session: ExecutionSession, edge: WorkflowEdge): boolean {
    const activeHandle = this.getActiveBranches(session).get(edge.source);
    return isRuntimeWorkflowEdge(edge) && isBranchActiveEdge(edge, this.getExecutionEdges(session).filter(isRuntimeWorkflowEdge), activeHandle);
  }

  private isNodeCompleted(
    session: ExecutionSession,
    nodeId: string,
    completedNodeIds?: Set<string>,
  ): boolean {
    if (completedNodeIds) return completedNodeIds.has(nodeId);
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
    const snapshot = session.logSnapshot ?? {
      nodes: session.nodes,
      edges: session.edges,
      groups: session.groups || [],
      variables: session.variables || [],
    };
    const issueId = typeof session.context.issueId === 'string' && session.context.issueId.trim()
      ? session.context.issueId.trim()
      : undefined;
    const issueTitle = typeof session.context.issueTitle === 'string' && session.context.issueTitle.trim()
      ? session.context.issueTitle.trim()
      : undefined;
    return {
      id: session.id, workflowId: session.workflow.id,
      issueId,
      issueTitle,
      startedAt: session.startedAt, finishedAt: session.finishedAt,
      status: session.status === 'running' ? 'running' : session.status === 'paused' ? 'paused' : session.status === 'completed' ? 'completed' : 'error',
      steps: clone(session.steps),
      snapshot: {
        nodes: normalizeExecutionSnapshotNodes(
          clone(snapshot.nodes),
          (_node, data) => this.resolveContextVariables(session, data, { strictDataReferences: false }),
        ),
        edges: clone(snapshot.edges),
        groups: clone(snapshot.groups || []),
        variables: clone(snapshot.variables || []),
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
      this.deps.emit(channel, payload, session.workspaceId);
    }
  }

  private emitLog(session: ExecutionSession): void {
    this.emitEvent(session, 'execution:log', {
      executionId: session.id, workflowId: session.workflow.id,
      timestamp: Date.now(), log: this.currentLog(session),
    });
    for (const execution of this.subWorkflowExecutions.get(session.id) ?? []) {
      this.emitSubWorkflowLog(session, execution);
    }
  }

  private emitSubWorkflowLog(session: ExecutionSession, execution: SubWorkflowExecutionContext): void {
    const status = execution.status === 'running' && session.status === 'paused' ? 'paused' : execution.status;
    const log = buildSubWorkflowExecutionLog({ ...execution, status }, session.steps);
    // ponytail: overwrite the small running log on each existing emit; throttle only if nested-log I/O becomes measurable.
    workflowStore.addExecutionLog(execution.workflow.id, log);
    const payload = {
      executionId: execution.id,
      workflowId: execution.workflow.id,
      timestamp: Date.now(),
      log,
    };
    if (session.workspaceId) this.deps.emit('execution:log', payload, session.workspaceId);
    else if (session.eventSink) session.eventSink('execution:log', payload);
    else this.deps.emit('execution:log', payload);
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

function parseWorkflowConfigTemplate(template: string): {
  keys: string[];
  nestedPath?: string;
  fallback?: string;
} | null {
  const match = template.match(/^\s*\{\{\s*(__config__(?:\[(?:"[^"]+"|'[^']+')\]){2,3})(?:\.(\w+(?:\.\w+)*))?(?:\s*\|\|\s*(["'])(.*?)\3)?\s*\}\}\s*$/);
  if (!match) return null;
  const keys = [...match[1].matchAll(/\[(["'])([^"']+)\1\]/g)].map(item => item[2]);
  return { keys, nestedPath: match[2], fallback: match[4] };
}

function resolveWorkflowConfigString(config: WorkflowPluginConfigTree, template: string): any {
  const parsed = parseWorkflowConfigTemplate(template);
  if (!parsed) return template;

  let raw: unknown = config;
  for (const key of parsed.keys) {
    if (!raw || typeof raw !== 'object') {
      raw = undefined;
      break;
    }
    raw = (raw as Record<string, unknown>)[key];
  }
  if (parsed.nestedPath && typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { /* keep raw string */ }
  }
  const result = parsed.nestedPath ? getNestedValue(raw, parsed.nestedPath) : raw;
  if (parsed.fallback !== undefined) return result ? result : parsed.fallback;
  return result ?? '';
}

function resolveSnapshotDataForTest(value: any, config: WorkflowPluginConfigTree): any {
  if (typeof value === 'string') return resolveWorkflowConfigString(config, value);
  if (Array.isArray(value)) return value.map(item => resolveSnapshotDataForTest(item, config));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, resolveSnapshotDataForTest(nested, config)]),
    );
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatErrorWithStack(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.stack || `${error.name}: ${error.message}`;
  if (error && typeof error === 'object') {
    const maybeError = error as { message?: unknown; stack?: unknown; name?: unknown };
    const message = typeof maybeError.message === 'string' ? maybeError.message : '';
    const stack = typeof maybeError.stack === 'string' ? maybeError.stack : '';
    if (stack) return stack;
    if (message) {
      const name = typeof maybeError.name === 'string' ? maybeError.name : 'Error';
      return `${name}: ${message}`;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}
