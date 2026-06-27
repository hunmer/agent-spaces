import { useCallback, useEffect, useState } from 'react';
import { type EdgeChange } from '@xyflow/react';
import type { Workflow } from '@agent-spaces/shared';
import type { WorkflowNodeSizeOverrides } from './workflow-canvas-groups';

interface UseCanvasDomEventsParams {
  isCanvasLocked: boolean;
  workflowEdges: Workflow['edges'];
  onEdgesChange: (changes: EdgeChange[]) => void;
  onNodeSelect: (id: string | null, multi?: boolean) => void;
  onNodeDelete: (id: string, options?: { reconnect?: boolean }) => void;
  onNodeDataUpdate: (id: string, data: Record<string, unknown>) => void;
  onEdgeDataUpdate: (id: string, data: Record<string, unknown>) => void;
  onNodeCopy?: (id: string) => void;
  onNodeClone?: (id: string) => void;
  onNodeStage?: (id: string) => void;
  onMergeNodesToWorkflow?: (ids: string[]) => void;
  onMergeNodesToGroup?: (ids: string[], options?: { nodeSizes?: WorkflowNodeSizeOverrides }) => void;
  onBatchDeleteNodes?: (ids: string[]) => void;
  onNodeDebug?: (id: string) => void;
  onCancelDebug?: () => void;
  onExecuteFromNode?: (id?: string) => void;
  onResumeExecution?: () => void;
  onStopExecution?: () => void;
}

function getNodeIdsFromEvent(event: Event): string[] {
  const detail = (event as CustomEvent).detail as { nodeIds?: unknown } | undefined;
  return Array.isArray(detail?.nodeIds) ? detail.nodeIds.filter((id): id is string => typeof id === 'string') : [];
}

export function useCanvasDomEvents({
  isCanvasLocked,
  workflowEdges,
  onEdgesChange,
  onNodeSelect,
  onNodeDelete,
  onNodeDataUpdate,
  onEdgeDataUpdate,
  onNodeCopy,
  onNodeClone,
  onNodeStage,
  onMergeNodesToWorkflow,
  onMergeNodesToGroup,
  onBatchDeleteNodes,
  onNodeDebug,
  onCancelDebug,
  onExecuteFromNode,
  onResumeExecution,
  onStopExecution,
}: UseCanvasDomEventsParams) {
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const removeEdge = useCallback((edgeId: string) => {
    const edge = workflowEdges.find(item => item.id === edgeId);
    if (!edge || edge.composite?.locked || isCanvasLocked) return;
    setSelectedEdgeId(null);
    onEdgesChange([{ id: edgeId, type: 'remove' }]);
  }, [isCanvasLocked, onEdgesChange, workflowEdges]);

  const selectEdge = useCallback((edgeId: string | null) => {
    setSelectedEdgeId(edgeId);
    if (edgeId) onNodeSelect(null);
  }, [onNodeSelect]);

  const handleEdgeInsertNode = useCallback((e: Event) => {
    if (isCanvasLocked) return;
    const detail = (e as CustomEvent).detail;
    window.dispatchEvent(new CustomEvent('workflow:open-node-select', { detail }));
  }, [isCanvasLocked]);

  const handleEdgeSelect = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail as { edgeId?: string | null } | undefined;
    selectEdge(detail?.edgeId ?? null);
  }, [selectEdge]);

  const handleNodeSelectEvent = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail as { nodeId?: string | null; multi?: boolean } | undefined;
    if (!detail?.nodeId) return;
    setSelectedEdgeId(null);
    onNodeSelect(detail.nodeId, detail.multi === true);
  }, [onNodeSelect]);

  const handleEdgeDelete = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail as { edgeId?: string | null } | undefined;
    if (!detail?.edgeId) return;
    removeEdge(detail.edgeId);
  }, [removeEdge]);

  const handleNodeDelete = useCallback((e: Event) => {
    if (isCanvasLocked) return;
    const detail = (e as CustomEvent).detail as { nodeId?: string; reconnect?: boolean } | undefined;
    if (!detail?.nodeId) return;
    onNodeDelete(detail.nodeId, typeof detail.reconnect === 'boolean' ? { reconnect: detail.reconnect } : undefined);
  }, [isCanvasLocked, onNodeDelete]);

  const handleNodeDataUpdate = useCallback((e: Event) => {
    if (isCanvasLocked) return;
    const detail = (e as CustomEvent).detail;
    if (!detail?.nodeId || !detail?.data) return;
    onNodeDataUpdate(detail.nodeId, detail.data);
  }, [isCanvasLocked, onNodeDataUpdate]);

  const handleEdgeDataUpdate = useCallback((e: Event) => {
    if (isCanvasLocked) return;
    const detail = (e as CustomEvent).detail as { edgeId?: string; data?: Record<string, unknown> } | undefined;
    if (!detail?.edgeId || !detail?.data) return;
    onEdgeDataUpdate(detail.edgeId, detail.data);
  }, [isCanvasLocked, onEdgeDataUpdate]);

  const handleNodeCopyEvent = useCallback((e: Event) => {
    if (isCanvasLocked || !onNodeCopy) return;
    onNodeCopy((e as CustomEvent).detail.nodeId);
  }, [isCanvasLocked, onNodeCopy]);

  const handleNodeCloneEvent = useCallback((e: Event) => {
    if (isCanvasLocked || !onNodeClone) return;
    onNodeClone((e as CustomEvent).detail.nodeId);
  }, [isCanvasLocked, onNodeClone]);

  const handleNodeStageEvent = useCallback((e: Event) => {
    if (isCanvasLocked || !onNodeStage) return;
    onNodeStage((e as CustomEvent).detail.nodeId);
  }, [isCanvasLocked, onNodeStage]);

  const handleMergeNodesToWorkflowEvent = useCallback((e: Event) => {
    if (isCanvasLocked || !onMergeNodesToWorkflow) return;
    onMergeNodesToWorkflow(getNodeIdsFromEvent(e));
  }, [isCanvasLocked, onMergeNodesToWorkflow]);

  const handleMergeNodesToGroupEvent = useCallback((e: Event) => {
    if (isCanvasLocked || !onMergeNodesToGroup) return;
    onMergeNodesToGroup(getNodeIdsFromEvent(e));
  }, [isCanvasLocked, onMergeNodesToGroup]);

  const handleBatchDeleteNodesEvent = useCallback((e: Event) => {
    if (isCanvasLocked || !onBatchDeleteNodes) return;
    onBatchDeleteNodes(getNodeIdsFromEvent(e));
  }, [isCanvasLocked, onBatchDeleteNodes]);

  const handleNodeInfoEvent = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail as { nodeId?: string | null } | undefined;
    if (!detail?.nodeId) return;
    onNodeSelect(detail.nodeId);
  }, [onNodeSelect]);

  const handleNodeDebugEvent = useCallback((e: Event) => {
    if (isCanvasLocked || !onNodeDebug) return;
    const detail = (e as CustomEvent).detail as { nodeId?: string | null } | undefined;
    if (!detail?.nodeId) return;
    onNodeDebug(detail.nodeId);
  }, [isCanvasLocked, onNodeDebug]);

  const handleCancelDebugEvent = useCallback(() => {
    onCancelDebug?.();
  }, [onCancelDebug]);

  const handleExecuteFromNodeEvent = useCallback((e: Event) => {
    if (isCanvasLocked || !onExecuteFromNode) return;
    const detail = (e as CustomEvent).detail as { nodeId?: string | null } | undefined;
    onExecuteFromNode(detail?.nodeId || undefined);
  }, [isCanvasLocked, onExecuteFromNode]);

  const handleResumeExecutionEvent = useCallback(() => {
    onResumeExecution?.();
  }, [onResumeExecution]);

  const handleStopExecutionEvent = useCallback(() => {
    onStopExecution?.();
  }, [onStopExecution]);

  // Register custom event listeners
  useEffect(() => {
    window.addEventListener('workflow:edge-insert-node', handleEdgeInsertNode);
    window.addEventListener('workflow:select-edge', handleEdgeSelect);
    window.addEventListener('workflow:select-node', handleNodeSelectEvent);
    window.addEventListener('workflow:delete-edge', handleEdgeDelete);
    window.addEventListener('workflow:delete-node', handleNodeDelete);
    window.addEventListener('workflow:update-node-data', handleNodeDataUpdate);
    window.addEventListener('workflow:update-edge-data', handleEdgeDataUpdate);
    window.addEventListener('workflow:copy-node', handleNodeCopyEvent);
    window.addEventListener('workflow:clone-node', handleNodeCloneEvent);
    window.addEventListener('workflow:stage-node', handleNodeStageEvent);
    window.addEventListener('workflow:merge-nodes-to-workflow', handleMergeNodesToWorkflowEvent);
    window.addEventListener('workflow:merge-nodes-to-group', handleMergeNodesToGroupEvent);
    window.addEventListener('workflow:batch-delete-nodes', handleBatchDeleteNodesEvent);
    window.addEventListener('workflow:show-node-info', handleNodeInfoEvent);
    window.addEventListener('workflow:debug-node', handleNodeDebugEvent);
    window.addEventListener('workflow:cancel-debug-node', handleCancelDebugEvent);
    window.addEventListener('workflow:execute-from-node', handleExecuteFromNodeEvent);
    window.addEventListener('workflow:resume-execution', handleResumeExecutionEvent);
    window.addEventListener('workflow:stop-execution', handleStopExecutionEvent);
    return () => {
      window.removeEventListener('workflow:edge-insert-node', handleEdgeInsertNode);
      window.removeEventListener('workflow:select-edge', handleEdgeSelect);
      window.removeEventListener('workflow:select-node', handleNodeSelectEvent);
      window.removeEventListener('workflow:delete-edge', handleEdgeDelete);
      window.removeEventListener('workflow:delete-node', handleNodeDelete);
      window.removeEventListener('workflow:update-node-data', handleNodeDataUpdate);
      window.removeEventListener('workflow:update-edge-data', handleEdgeDataUpdate);
      window.removeEventListener('workflow:copy-node', handleNodeCopyEvent);
      window.removeEventListener('workflow:clone-node', handleNodeCloneEvent);
      window.removeEventListener('workflow:stage-node', handleNodeStageEvent);
      window.removeEventListener('workflow:merge-nodes-to-workflow', handleMergeNodesToWorkflowEvent);
      window.removeEventListener('workflow:merge-nodes-to-group', handleMergeNodesToGroupEvent);
      window.removeEventListener('workflow:batch-delete-nodes', handleBatchDeleteNodesEvent);
      window.removeEventListener('workflow:show-node-info', handleNodeInfoEvent);
      window.removeEventListener('workflow:debug-node', handleNodeDebugEvent);
      window.removeEventListener('workflow:cancel-debug-node', handleCancelDebugEvent);
      window.removeEventListener('workflow:execute-from-node', handleExecuteFromNodeEvent);
      window.removeEventListener('workflow:resume-execution', handleResumeExecutionEvent);
      window.removeEventListener('workflow:stop-execution', handleStopExecutionEvent);
    };
  }, [handleEdgeDataUpdate, handleEdgeDelete, handleEdgeInsertNode, handleEdgeSelect, handleNodeSelectEvent, handleNodeDelete, handleNodeDataUpdate, handleNodeCopyEvent, handleNodeCloneEvent, handleNodeStageEvent, handleMergeNodesToWorkflowEvent, handleMergeNodesToGroupEvent, handleBatchDeleteNodesEvent, handleNodeInfoEvent, handleNodeDebugEvent, handleCancelDebugEvent, handleExecuteFromNodeEvent, handleResumeExecutionEvent, handleStopExecutionEvent]);

  return { selectedEdgeId, selectEdge, removeEdge };
}
