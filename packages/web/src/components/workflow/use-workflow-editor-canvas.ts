'use client';

import { useEffect } from 'react';
import type { Workflow } from '@agent-spaces/shared';
import {
  cloneWorkflowNodes,
  ensureLoopBodyBoundaryNodes,
  syncAllScopeBoundaryLayouts,
} from './workflow-canvas-utils';
import { useNodeOperations } from './use-workflow-node-operations';
import { useEdgeOperations } from './use-workflow-edge-operations';
import { useGroupOperations } from './use-workflow-group-operations';

interface UseWorkflowEditorCanvasParams {
  workflow: Workflow | null;
  isReadOnly?: boolean;
  setWorkflow: React.Dispatch<React.SetStateAction<Workflow | null>>;
  markDirty: () => void;
  pushUndo: (description?: string) => void;
  selectedNodeId: string | null;
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedNodeIds: string[];
  setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>;
  onCopyNodes?: (nodeIds: string[]) => void;
  onStageNode?: (nodeId: string) => void;
}

export function useWorkflowEditorCanvas({
  workflow, isReadOnly = false, setWorkflow, markDirty, pushUndo,
  selectedNodeId, setSelectedNodeId, selectedNodeIds, setSelectedNodeIds,
  onCopyNodes, onStageNode,
}: UseWorkflowEditorCanvasParams) {
  const workflowId = workflow?.id;

  useEffect(() => {
    if (!workflowId) return;
    setWorkflow(current => {
      if (!current) return null;
      const nextNodes = cloneWorkflowNodes(current.nodes);
      const nextEdges = current.edges.map(edge => ({
        ...edge,
        composite: edge.composite ? { ...edge.composite } : undefined,
      }));
      const boundaryChanged = ensureLoopBodyBoundaryNodes(nextNodes, nextEdges);
      const layoutChanged = syncAllScopeBoundaryLayouts(nextNodes);
      return boundaryChanged || layoutChanged ? { ...current, nodes: nextNodes, edges: nextEdges } : current;
    });
  }, [workflowId, setWorkflow]);

  const sharedParams = { workflow, isReadOnly, setWorkflow, markDirty, pushUndo };

  const nodeOps = useNodeOperations({
    ...sharedParams,
    selectedNodeId,
    setSelectedNodeId,
    selectedNodeIds,
    setSelectedNodeIds,
    onCopyNodes,
    onStageNode,
  });

  const edgeOps = useEdgeOperations({
    ...sharedParams,
    selectedNodeId,
    selectedNodeIds,
  });

  const groupOps = useGroupOperations({
    ...sharedParams,
    selectedNodeId,
    setSelectedNodeId,
    selectedNodeIds,
    setSelectedNodeIds,
  });

  return {
    // Node select dialog
    nodeSelectOpen: nodeOps.nodeSelectOpen,
    handleNodeSelectOpenChange: nodeOps.handleNodeSelectOpenChange,
    handleNodeSelectFromDialog: nodeOps.handleNodeSelectFromDialog,

    // Node operations
    handleNodeAdd: nodeOps.handleNodeAdd,
    handleInsertNodeOnEdge: nodeOps.handleInsertNodeOnEdge,
    handleNodeDelete: nodeOps.handleNodeDelete,
    handleNodeCopy: nodeOps.handleNodeCopy,
    handleNodeClone: nodeOps.handleNodeClone,
    handleNodeStage: nodeOps.handleNodeStage,
    handleMergeNodesToWorkflow: nodeOps.handleMergeNodesToWorkflow,
    handleMergeNodesToGroup: groupOps.handleMergeNodesToGroup,
    handleBatchDeleteNodes: nodeOps.handleBatchDeleteNodes,
    handleRenameGroup: groupOps.handleRenameGroup,
    handleUpdateGroup: groupOps.handleUpdateGroup,
    handleUngroup: groupOps.handleUngroup,
    handleBatchUngroup: groupOps.handleBatchUngroup,
    handleFocusGroup: groupOps.handleFocusGroup,
    handleMoveGroup: groupOps.handleMoveGroup,
    handleNodeSelect: nodeOps.handleNodeSelect,
    handleNodesSelect: nodeOps.handleNodesSelect,
    handleNodeDataUpdate: nodeOps.handleNodeDataUpdate,
    handleConnectionDrop: nodeOps.handleConnectionDrop,
    handleRectangleDrawNodeSelect: nodeOps.handleRectangleDrawNodeSelect,

    // Edge operations
    handleConnect: edgeOps.handleConnect,
    handleNodesChange: edgeOps.handleNodesChange,
    handleEdgesChange: edgeOps.handleEdgesChange,
    handleEdgeDataUpdate: edgeOps.handleEdgeDataUpdate,
    handleInsertExistingNodeOnEdge: edgeOps.handleInsertExistingNodeOnEdge,
    handleAutoLayout: edgeOps.handleAutoLayout,

    // Canvas preferences
    handleCanvasPreferencesChange: edgeOps.handleCanvasPreferencesChange,
  };
}
