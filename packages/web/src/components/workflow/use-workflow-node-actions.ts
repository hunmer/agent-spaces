import { useCallback } from 'react';
import type { NodeBreakpoint, NodeRunState } from '@agent-spaces/shared';

export interface UseWorkflowNodeActionsParams {
  id: string;
  isCanvasLocked: boolean;
  isBoundaryNode: boolean;
  isCurrentNodeDebugging: boolean;
  isExecutionBusy: boolean;
  isDeleteDisabled: boolean;
  selectedNodeIds: string[];
  nodeMinWidth: number;
  nodeMinHeight: number;
}

export function useWorkflowNodeActions(params: UseWorkflowNodeActionsParams) {
  const {
    id,
    isCanvasLocked,
    isBoundaryNode,
    isCurrentNodeDebugging,
    isExecutionBusy,
    isDeleteDisabled,
    selectedNodeIds,
    nodeMinWidth,
    nodeMinHeight,
  } = params;

  const dispatchNodeUpdate = useCallback((updates: Record<string, unknown>) => {
    if (isCanvasLocked) return;
    window.dispatchEvent(new CustomEvent('workflow:update-node-data', {
      detail: { nodeId: id, data: updates },
    }));
  }, [id, isCanvasLocked]);

  const dispatchDeleteNode = useCallback((reconnect?: boolean) => {
    if (isCanvasLocked || isDeleteDisabled) return;
    window.dispatchEvent(new CustomEvent('workflow:delete-node', {
      detail: { nodeId: id, ...(typeof reconnect === 'boolean' ? { reconnect } : {}) },
    }));
  }, [id, isCanvasLocked, isDeleteDisabled]);

  const handleDelete = useCallback(() => {
    dispatchDeleteNode();
  }, [dispatchDeleteNode]);

  const handleDeleteWithoutReconnect = useCallback(() => {
    dispatchDeleteNode(false);
  }, [dispatchDeleteNode]);

  const handleCopy = useCallback(() => {
    if (isCanvasLocked) return;
    window.dispatchEvent(new CustomEvent('workflow:copy-node', { detail: { nodeId: id } }));
  }, [id, isCanvasLocked]);

  const handleClone = useCallback(() => {
    if (isCanvasLocked) return;
    window.dispatchEvent(new CustomEvent('workflow:clone-node', { detail: { nodeId: id } }));
  }, [id, isCanvasLocked]);

  const handleStage = useCallback(() => {
    if (isCanvasLocked) return;
    window.dispatchEvent(new CustomEvent('workflow:stage-node', { detail: { nodeId: id } }));
  }, [id, isCanvasLocked]);

  const handleMoveToStage = useCallback(() => {
    if (isCanvasLocked || isDeleteDisabled) return;
    window.dispatchEvent(new CustomEvent('workflow:stage-node', { detail: { nodeId: id } }));
    window.dispatchEvent(new CustomEvent('workflow:delete-node', { detail: { nodeId: id } }));
  }, [id, isCanvasLocked, isDeleteDisabled]);

  const handleMergeToWorkflow = useCallback(() => {
    if (isCanvasLocked || selectedNodeIds.length < 2) return;
    window.dispatchEvent(new CustomEvent('workflow:merge-nodes-to-workflow', { detail: { nodeIds: selectedNodeIds } }));
  }, [isCanvasLocked, selectedNodeIds]);

  const handleMergeToGroup = useCallback(() => {
    if (isCanvasLocked || selectedNodeIds.length < 2) return;
    window.dispatchEvent(new CustomEvent('workflow:merge-nodes-to-group', { detail: { nodeIds: selectedNodeIds } }));
  }, [isCanvasLocked, selectedNodeIds]);

  const handleBatchDelete = useCallback(() => {
    if (isCanvasLocked || isDeleteDisabled || selectedNodeIds.length < 1) return;
    window.dispatchEvent(new CustomEvent('workflow:batch-delete-nodes', { detail: { nodeIds: selectedNodeIds } }));
  }, [isCanvasLocked, isDeleteDisabled, selectedNodeIds]);

  const handleShowInfo = useCallback(() => {
    window.dispatchEvent(new CustomEvent('workflow:show-node-info', { detail: { nodeId: id } }));
  }, [id]);

  const handleTestNode = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    if (isCurrentNodeDebugging) {
      window.dispatchEvent(new CustomEvent('workflow:cancel-debug-node', { detail: { nodeId: id } }));
      return;
    }
    if (isCanvasLocked || isBoundaryNode) return;
    window.dispatchEvent(new CustomEvent('workflow:debug-node', { detail: { nodeId: id } }));
  }, [id, isBoundaryNode, isCanvasLocked, isCurrentNodeDebugging]);

  const handleExecuteWorkflow = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    if (isCanvasLocked || isExecutionBusy) return;
    window.dispatchEvent(new CustomEvent('workflow:open-execution-input', { detail: { startNodeId: id } }));
  }, [id, isCanvasLocked, isExecutionBusy]);

  const handlePartialTest = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    if (isCanvasLocked || isBoundaryNode || isExecutionBusy) return;
    window.dispatchEvent(new CustomEvent('workflow:execute-from-node', { detail: { nodeId: id } }));
  }, [id, isBoundaryNode, isCanvasLocked, isExecutionBusy]);

  const handleResumeFromBreakpoint = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent('workflow:resume-execution', { detail: { nodeId: id } }));
  }, [id]);

  const handleStopAtBreakpoint = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent('workflow:stop-execution', { detail: { nodeId: id } }));
  }, [id]);

  const setNodeColor = useCallback((color: string | null) => {
    dispatchNodeUpdate({ nodeColor: color });
  }, [dispatchNodeUpdate]);

  const setNodeState = useCallback((state: NodeRunState) => {
    dispatchNodeUpdate({ nodeState: state });
  }, [dispatchNodeUpdate]);

  const setNodeBreakpoint = useCallback((breakpoint: NodeBreakpoint | null) => {
    dispatchNodeUpdate({ breakpoint });
  }, [dispatchNodeUpdate]);

  const handleResizeEnd = useCallback((_: unknown, params: { width: number; height: number }) => {
    if (isCanvasLocked) return;
    const width = Math.max(nodeMinWidth, Math.round(params.width));
    const height = Math.max(nodeMinHeight, Math.round(params.height));
    window.dispatchEvent(new CustomEvent('workflow:update-node-data', {
      detail: { nodeId: id, data: { nodeWidth: width, nodeHeight: height } },
    }));
  }, [id, isCanvasLocked, nodeMinHeight, nodeMinWidth]);

  return {
    dispatchNodeUpdate,
    handleDelete,
    handleDeleteWithoutReconnect,
    handleCopy,
    handleClone,
    handleStage,
    handleMoveToStage,
    handleMergeToWorkflow,
    handleMergeToGroup,
    handleBatchDelete,
    handleShowInfo,
    handleTestNode,
    handleExecuteWorkflow,
    handlePartialTest,
    handleResumeFromBreakpoint,
    handleStopAtBreakpoint,
    setNodeColor,
    setNodeState,
    setNodeBreakpoint,
    handleResizeEnd,
  };
}
