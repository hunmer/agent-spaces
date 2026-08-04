import { useMemo } from 'react';
import { type Node, type Edge } from '@xyflow/react';
import {
  isHiddenWorkflowEdge,
  isHiddenWorkflowNode,
  isScopeBoundaryWorkflowNode,
  getCompositeParentId,
  LOOP_BODY_NODE_TYPE,
  LOOP_NODE_TYPE,
  type Workflow,
  type WorkflowNode,
  type ExecutionLog,
  type ExecutionStep,
} from '@agent-spaces/shared';
import { getNodeDefinition } from '@/lib/workflow-nodes';
import { getWorkflowNodeSize } from './workflow-node-size';
import { NODE_COLOR_MAP, type HandlePositionMode, type WorkflowLogPanelLayout, type WorkflowNodeDisplayMode, type WorkflowPropertyModeBadgePosition } from './workflow-node-types';
import { WORKFLOW_NODE_DRAG_HANDLE_CLASS } from './workflow-node-handles';
import { parseWorkflowFieldHandleId } from './workflow-field-handles';
import { isGeneratedRuntimeReferenceEdge } from './workflow-edge-capacity';
import type { WorkflowFieldKeyRenameParams } from './workflow-properties-io-sections';

const DEFAULT_SOURCE_HANDLE_ID = 'source';
const LOOP_BODY_NODE_Z_INDEX = -100;
const DEFAULT_NODE_Z_INDEX = 1;
const SCOPED_CHILD_NODE_Z_INDEX = 1000;
const ACTIVE_NODE_Z_INDEX = 2000;

function getStepSortTime(step: ExecutionStep): number {
  return step.finishedAt ?? step.startedAt;
}

function getAggregateStatus(steps: ExecutionStep[]): ExecutionStep['status'] {
  if (steps.some(step => step.status === 'error')) return 'error';
  if (steps.some(step => step.status === 'running')) return 'running';
  if (steps.length > 0 && steps.every(step => step.status === 'skipped')) return 'skipped';
  return 'completed';
}

function createScopeIterationSteps(
  scopeNode: WorkflowNode,
  childNodes: WorkflowNode[],
  executionStepsByNodeId: Map<string, ExecutionStep[]>,
): ExecutionStep[] {
  const childStepGroups = childNodes
    .map(node => ({
      node,
      steps: executionStepsByNodeId.get(node.id) || [],
    }))
    .filter(group => group.steps.length > 0);

  const iterationCount = Math.max(0, ...childStepGroups.map(group => group.steps.length));
  if (iterationCount === 0) return [];

  return Array.from({ length: iterationCount }, (_, index) => {
    const iterationSteps = childStepGroups
      .map(group => {
        const step = group.steps[index];
        return step ? { node: group.node, step } : null;
      })
      .filter((item): item is { node: WorkflowNode; step: ExecutionStep } => !!item)
      .sort((a, b) => getStepSortTime(a.step) - getStepSortTime(b.step));

    const steps = iterationSteps.map(item => item.step);
    const startedAt = Math.min(...steps.map(step => step.startedAt));
    const finishedAt = steps.every(step => step.finishedAt != null)
      ? Math.max(...steps.map(step => step.finishedAt || step.startedAt))
      : undefined;
    const failedStep = steps.find(step => step.status === 'error');

    return {
      nodeId: scopeNode.id,
      nodeLabel: scopeNode.label || scopeNode.type,
      startedAt,
      finishedAt,
      status: getAggregateStatus(steps),
      input: Object.fromEntries(iterationSteps.map(({ node, step }) => [
        node.label || step.nodeLabel || node.id,
        step.input ?? null,
      ])),
      output: Object.fromEntries(iterationSteps.map(({ node, step }) => [
        node.label || step.nodeLabel || node.id,
        step.output ?? null,
      ])),
      error: failedStep?.error,
      logs: iterationSteps.flatMap(({ node, step }) =>
        (step.logs || []).map(entry => ({
          ...entry,
          message: `${node.label || step.nodeLabel || node.id}: ${entry.message}`,
        })),
      ),
    };
  });
}

function getLoopExecutionScopeId(node: WorkflowNode, nodeById: Map<string, WorkflowNode>): string | undefined {
  if (node.type === LOOP_NODE_TYPE) return node.id;
  if (node.composite?.rootId) {
    const rootNode = nodeById.get(node.composite.rootId);
    if (rootNode?.type === LOOP_NODE_TYPE) return rootNode.id;
  }

  let current: WorkflowNode | undefined = node;
  while (current) {
    const parentId = getCompositeParentId(current);
    if (!parentId) return undefined;
    const parent = nodeById.get(parentId);
    if (parent?.type === LOOP_NODE_TYPE) return parent.id;
    current = parent;
  }

  return undefined;
}

function getSourceHandleColor(nodeData: Record<string, unknown>, sourceHandle: string | null | undefined): string | undefined {
  const handleColors = nodeData.handleColors;
  if (!handleColors || typeof handleColors !== 'object') return undefined;
  const handleId = sourceHandle || DEFAULT_SOURCE_HANDLE_ID;
  const colorKey = (handleColors as Record<string, unknown>)[handleId];
  return typeof colorKey === 'string' ? NODE_COLOR_MAP[colorKey] : undefined;
}

function canShowPropertyNodeView(node: WorkflowNode, nodeDisplayMode: WorkflowNodeDisplayMode): boolean {
  if (nodeDisplayMode !== 'properties') return false;
  if (node.type === LOOP_BODY_NODE_TYPE) return false;
  return true;
}

function getNormalizedTargetHandle(
  node: WorkflowNode | undefined,
  targetHandle: string | null | undefined,
  nodeDisplayMode: WorkflowNodeDisplayMode,
): string | undefined {
  if (!node) return targetHandle || undefined;
  if (!canShowPropertyNodeView(node, nodeDisplayMode)) {
    const parsed = parseWorkflowFieldHandleId(targetHandle);
    if (parsed?.kind === 'input' || parsed?.kind === 'property') return 'target';
    return targetHandle || 'target';
  }

  const parsed = parseWorkflowFieldHandleId(targetHandle);
  if (parsed?.kind === 'input' || parsed?.kind === 'property') return targetHandle || undefined;
  if (targetHandle) return targetHandle;
  return 'target';
}

function getNormalizedSourceHandle(
  node: WorkflowNode | undefined,
  sourceHandle: string | null | undefined,
  nodeDisplayMode: WorkflowNodeDisplayMode,
): string | undefined {
  if (!node) return sourceHandle || undefined;
  if (!canShowPropertyNodeView(node, nodeDisplayMode)) {
    const parsed = parseWorkflowFieldHandleId(sourceHandle);
    if (parsed?.kind === 'output') return 'source';
    return sourceHandle || 'source';
  }

  const parsed = parseWorkflowFieldHandleId(sourceHandle);
  if (parsed?.kind === 'output') return sourceHandle || undefined;
  if (sourceHandle) return sourceHandle;
  return 'source';
}

function getNormalDisplayEdgeKey(edge: Pick<Edge, 'source' | 'target'>): string {
  return [edge.source, edge.target].join('\u0000');
}

function createNormalNodeLevelAdjacency(edges: Workflow['edges']): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (isHiddenWorkflowEdge(edge) || isGeneratedRuntimeReferenceEdge(edge)) continue;
    const sourceHandle = parseWorkflowFieldHandleId(edge.sourceHandle);
    const targetHandle = parseWorkflowFieldHandleId(edge.targetHandle);
    if (edge.edgeKind === 'reference' || sourceHandle?.kind !== undefined || targetHandle?.kind !== undefined) continue;
    const targets = adjacency.get(edge.source);
    if (targets) targets.push(edge.target);
    else adjacency.set(edge.source, [edge.target]);
  }
  return adjacency;
}

function createNormalReachableNodePairKeys(adjacency: Map<string, string[]>): Set<string> {
  const reachable = new Set<string>();
  for (const source of adjacency.keys()) {
    const visited = new Set<string>();
    const stack = [...(adjacency.get(source) || [])];
    while (stack.length > 0) {
      const nodeId = stack.pop();
      if (!nodeId || visited.has(nodeId)) continue;
      visited.add(nodeId);
      reachable.add(getNormalDisplayEdgeKey({ source, target: nodeId }));
      stack.push(...(adjacency.get(nodeId) || []));
    }
  }
  return reachable;
}

interface UseCanvasDataParams {
  workflow: Pick<Workflow, 'nodes' | 'edges'>;
  selectedNodeId: string | null | undefined;
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  executionLog: ExecutionLog | null | undefined;
  isPreview: boolean;
  isCanvasLocked: boolean;
  execStatus?: string;
  debugNodeId?: string | null;
  debugStatus?: 'idle' | 'running' | 'completed' | 'error';
  pausedNodeId?: string | null;
  pausedReason?: string | null;
  partialExecutionStartNodeId?: string | null;
  handlePosition?: HandlePositionMode;
  floatingHandles?: boolean;
  logPanelLayout?: WorkflowLogPanelLayout;
  nodeDisplayMode?: WorkflowNodeDisplayMode;
  propertyModeBadgePosition?: WorkflowPropertyModeBadgePosition;
  edgePathType?: string;
  edgeLineStyle?: string;
  embeddedMode?: 'issue' | null;
  onAutoLayout?: (direction: 'LR' | 'TB', options?: { layoutEngine?: string; parentId?: string; nodeIds?: string[]; grid?: { rows: number; columns: number; horizontalGap: number; verticalGap: number } }) => void;
  onFieldKeyRename?: (params: WorkflowFieldKeyRenameParams) => void;
  layoutEngine?: string;
}

export function useCanvasData({
  workflow,
  selectedNodeId,
  selectedNodeIds,
  selectedEdgeId,
  executionLog,
  isPreview,
  isCanvasLocked,
  execStatus = 'idle',
  debugNodeId = null,
  debugStatus = 'idle',
  pausedNodeId = null,
  pausedReason = null,
  partialExecutionStartNodeId = null,
  handlePosition = 'left-right',
  floatingHandles = false,
  logPanelLayout = 'vertical',
  nodeDisplayMode = 'normal',
  propertyModeBadgePosition = 'center',
  edgePathType = 'bezier',
  edgeLineStyle = 'solid',
  embeddedMode = null,
  onAutoLayout,
  onFieldKeyRename,
  layoutEngine = 'dagre',
}: UseCanvasDataParams) {
  const selectedNodeIdSet = useMemo(
    () => new Set(selectedNodeIds.length > 0 ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : []),
    [selectedNodeId, selectedNodeIds],
  );

  const executionNodeIds = useMemo(() => {
    const running = new Set<string>();
    const completed = new Set<string>();
    if (!executionLog || executionLog.status !== 'running') return { running, completed };

    for (const step of executionLog.steps) {
      if (step.status === 'running') running.add(step.nodeId);
      if (step.status === 'completed') completed.add(step.nodeId);
    }

    return { running, completed };
  }, [executionLog]);

  const baseExecutionStepsByNodeId = useMemo(() => {
    const steps = new Map<string, ExecutionStep[]>();
    for (const step of executionLog?.steps || []) {
      const nodeSteps = steps.get(step.nodeId) || [];
      nodeSteps.push(step);
      steps.set(step.nodeId, nodeSteps);
    }
    return steps;
  }, [executionLog]);

  const baseExecutionStepByNodeId = useMemo(() => {
    const steps = new Map<string, ExecutionStep>();
    for (const [nodeId, nodeSteps] of baseExecutionStepsByNodeId) {
      const lastStep = nodeSteps[nodeSteps.length - 1];
      if (lastStep) steps.set(nodeId, lastStep);
    }
    return steps;
  }, [baseExecutionStepsByNodeId]);

  const executionStepsByNodeId = useMemo(() => {
    const steps = new Map(baseExecutionStepsByNodeId);

    for (const nodeType of [LOOP_BODY_NODE_TYPE, LOOP_NODE_TYPE]) {
      for (const node of workflow.nodes) {
        if (node.type !== nodeType) continue;
        const childNodes = workflow.nodes.filter(child => getCompositeParentId(child) === node.id);
        const iterationSteps = createScopeIterationSteps(node, childNodes, steps);
        if (iterationSteps.length > 0) {
          steps.set(node.id, iterationSteps);
        }
      }
    }

    return steps;
  }, [baseExecutionStepsByNodeId, workflow.nodes]);

  const executionStepByNodeId = useMemo(() => {
    const steps = new Map(baseExecutionStepByNodeId);
    for (const [nodeId, nodeSteps] of executionStepsByNodeId) {
      if (steps.has(nodeId)) continue;
      const lastStep = nodeSteps[nodeSteps.length - 1];
      if (lastStep) steps.set(nodeId, lastStep);
    }
    return steps;
  }, [baseExecutionStepByNodeId, executionStepsByNodeId]);

  const executionNodeIdsWithScope = useMemo(() => {
    const running = new Set(executionNodeIds.running);
    const completed = new Set(executionNodeIds.completed);

    for (const node of workflow.nodes) {
      if (node.type !== LOOP_BODY_NODE_TYPE && node.type !== LOOP_NODE_TYPE) continue;
      const step = executionStepByNodeId.get(node.id);
      if (!step) continue;
      if (step.status === 'running') running.add(node.id);
      if (step.status === 'completed') completed.add(node.id);
    }

    return { running, completed };
  }, [executionNodeIds, executionStepByNodeId, workflow.nodes]);

  const rfNodes: Node[] = useMemo(() =>
    {
      const nodeById = new Map(workflow.nodes.map(node => [node.id, node]));
      return workflow.nodes.filter(n => !isHiddenWorkflowNode(n)).map(n => {
      const definition = getNodeDefinition(n.type);
      const { minWidth, minHeight, width, height } = getWorkflowNodeSize(definition, n.data);
      const hasIncoming = workflow.edges.some(edge => edge.target === n.id);
      const hasOutgoing = workflow.edges.some(edge => edge.source === n.id);
      const parentId = getCompositeParentId(n);
      const isLoopBody = n.type === LOOP_BODY_NODE_TYPE;
      const isScopedChild = !!parentId && !isScopeBoundaryWorkflowNode(n);
      const hasCustomView = !!definition?.customView;
      const hasPropertyNodeView = nodeDisplayMode === 'properties' && !isLoopBody && !hasCustomView;
      const isSelected = selectedNodeIdSet.has(n.id);
      const baseZIndex = isLoopBody
        ? LOOP_BODY_NODE_Z_INDEX
        : isScopedChild ? SCOPED_CHILD_NODE_Z_INDEX : DEFAULT_NODE_Z_INDEX;
      const zIndex = isLoopBody ? LOOP_BODY_NODE_Z_INDEX : isSelected ? ACTIVE_NODE_Z_INDEX : baseZIndex;
      return {
        id: n.id,
        type: 'custom',
        position: n.position,
        dragHandle: hasCustomView || hasPropertyNodeView ? `.${WORKFLOW_NODE_DRAG_HANDLE_CLASS}` : undefined,
        selected: isSelected,
        zIndex,
        width,
        height,
        initialWidth: width,
        initialHeight: height,
        measured: { width, height },
        style: { minWidth, minHeight, width, height, zIndex },
        data: {
          ...n.data,
          executionLogData: n.data,
          label: n.data?.label || n.label,
          nodeType: n.type,
          embeddedMode,
          workflowEdges: workflow.edges,
          selectedNodeIds,
          nodeState: n.nodeState,
          breakpoint: n.breakpoint,
          nodeColor: n.nodeColor,
          isPreview,
          isCanvasLocked,
          width,
          height,
          isRunning: executionNodeIdsWithScope.running.has(n.id),
          execStatus,
          debugNodeId,
          debugStatus,
          pausedNodeId,
          pausedReason,
          partialExecutionStartNodeId,
          handlePosition,
          floatingHandles,
          logPanelLayout,
          nodeDisplayMode,
          propertyModeBadgePosition,
          loopExecutionScopeId: getLoopExecutionScopeId(n, nodeById),
          isFirstConnectedNode: hasOutgoing && !hasIncoming,
          executionStep: executionStepByNodeId.get(n.id),
          executionSteps: executionStepsByNodeId.get(n.id),
          onAutoLayout,
          onFieldKeyRename,
          layoutEngine,
        } as Record<string, unknown>,
      };
    });
    },
    [workflow.nodes, workflow.edges, selectedNodeIdSet, selectedNodeIds, isPreview, isCanvasLocked, executionNodeIdsWithScope, execStatus, debugNodeId, debugStatus, pausedNodeId, pausedReason, partialExecutionStartNodeId, handlePosition, floatingHandles, logPanelLayout, nodeDisplayMode, propertyModeBadgePosition, executionStepByNodeId, executionStepsByNodeId, embeddedMode, onAutoLayout, onFieldKeyRename, layoutEngine],
  );

  const runningEdgeIds = useMemo(() => {
    if (!executionLog || executionLog.status !== 'running') return new Set<string>();

    return new Set(
      workflow.edges
        .filter(edge => executionNodeIds.completed.has(edge.source) && executionNodeIds.running.has(edge.target))
        .map(edge => edge.id),
    );
  }, [executionLog, executionNodeIds, workflow.edges]);

  const rfEdges: Edge[] = useMemo(() => {
    const nodeById = new Map(workflow.nodes.map(node => [node.id, node]));
    const normalReachableNodePairKeys = nodeDisplayMode === 'normal'
      ? createNormalReachableNodePairKeys(createNormalNodeLevelAdjacency(workflow.edges))
      : null;
    const mappedEdges: Edge[] = [];
    workflow.edges.filter(edge => (
      !isHiddenWorkflowEdge(edge)
      && !isGeneratedRuntimeReferenceEdge(edge)
    )).forEach((e) => {
      const sourceNode = nodeById.get(e.source);
      const targetNode = nodeById.get(e.target);
      const displaySourceHandle = getNormalizedSourceHandle(sourceNode, e.sourceHandle, nodeDisplayMode);
      const displayTargetHandle = getNormalizedTargetHandle(targetNode, e.targetHandle, nodeDisplayMode);
      const parsedSourceHandle = parseWorkflowFieldHandleId(e.sourceHandle);
      const parsedTargetHandle = parseWorkflowFieldHandleId(e.targetHandle);
      const isFieldHandleEdge = parsedSourceHandle?.kind !== undefined || parsedTargetHandle?.kind !== undefined;
      const shouldPreferDashedLine = nodeDisplayMode === 'properties'
        && isFieldHandleEdge;
      if (
        normalReachableNodePairKeys
        && (e.edgeKind === 'reference' || isFieldHandleEdge)
        && normalReachableNodePairKeys.has(getNormalDisplayEdgeKey(e))
      ) {
        return;
      }
      mappedEdges.push({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'custom',
        sourceHandle: displaySourceHandle,
        targetHandle: displayTargetHandle,
        selected: e.id === selectedEdgeId,
        data: {
          composite: e.composite,
          sourceHandle: e.sourceHandle,
          startLabel: e.startLabel,
          middleLabel: e.middleLabel,
          endLabel: e.endLabel,
          edgeColor: sourceNode ? getSourceHandleColor(sourceNode.data, e.sourceHandle) : undefined,
          isRunning: runningEdgeIds.has(e.id),
          canEditEdge: !isCanvasLocked,
          canDeleteEdge: !isCanvasLocked,
          edgePathType,
          edgeOwnLineStyle: e.edgeLineStyle,
          edgeLineStyle: e.edgeLineStyle || (shouldPreferDashedLine ? 'dashed' : edgeLineStyle),
          preferDashedLine: shouldPreferDashedLine,
          isFieldHandleEdge,
        } as Record<string, unknown>,
      });
    });
    if (nodeDisplayMode === 'properties') return mappedEdges;

    const edgeByNormalKey = new Map<string, Edge>();
    for (const edge of mappedEdges) {
      const key = getNormalDisplayEdgeKey(edge);
      const existing = edgeByNormalKey.get(key);
      if (!existing) {
        edgeByNormalKey.set(key, edge);
        continue;
      }
      const existingIsFieldHandleEdge = (existing.data as Record<string, unknown>)?.isFieldHandleEdge === true;
      const nextIsFieldHandleEdge = (edge.data as Record<string, unknown>)?.isFieldHandleEdge === true;
      if (existingIsFieldHandleEdge && !nextIsFieldHandleEdge) {
        edgeByNormalKey.set(key, edge);
      }
    }
    return Array.from(edgeByNormalKey.values());
  }, [workflow.edges, workflow.nodes, runningEdgeIds, selectedEdgeId, isCanvasLocked, edgePathType, edgeLineStyle, nodeDisplayMode]);

  return { rfNodes, rfEdges, selectedNodeIdSet, executionNodeIds, executionStepByNodeId, executionStepsByNodeId, runningEdgeIds };
}
