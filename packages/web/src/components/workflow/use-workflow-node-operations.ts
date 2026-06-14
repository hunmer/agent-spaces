'use client';

import { useState, useCallback, useEffect } from 'react';
import type { OutputField, Workflow } from '@agent-spaces/shared';
import { createWorkflowEdgeId } from '@/lib/workflow-edge-id';
import { workflowApi } from '@/lib/workflow-api';
import { getNodeDefinition } from '@/lib/workflow-nodes';
import { useWorkflowStore } from '@/stores/workflow';
import type { NodeSelectContext } from './workflow-editor-types';
import {
  areStringArraysEqual,
  createNodesForDefinition,
  getCompositeParentId,
  getCompositeRootId,
  getInsertScopeNode,
  getOutgoingSourceHandle,
  getWorkflowNodeDeleteIds,
  isSameHandle,
  reconnectEdgesAfterNodeDelete,
  canDeleteWorkflowNode,
  cloneData,
  resolveWorkflowNodeCollisions,
  syncScopeBoundaryLayout,
} from './workflow-canvas-utils';
import { cleanupGroupsOnNodeDelete } from './workflow-canvas-groups';
import {
  collectExternalReferences,
  makeInputReference,
  makeDataReference,
  normalizeInputKey,
  getReferenceFieldKey,
  replaceReferences,
  replaceReferenceNodeIds,
  clearStartInputFieldValues,
  remapSelectedWorkflowNodes,
} from './workflow-canvas-references';

interface UseNodeOperationsParams {
  workflow: Workflow | null;
  isReadOnly: boolean;
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

type NodeSize = { width: number; height: number };

export function useNodeOperations({
  workflow, isReadOnly, setWorkflow, markDirty, pushUndo,
  selectedNodeId, setSelectedNodeId, selectedNodeIds, setSelectedNodeIds,
  onCopyNodes, onStageNode,
}: UseNodeOperationsParams) {
  const upsertWorkflow = useWorkflowStore(store => store.upsertWorkflow);
  const [nodeSelectOpen, setNodeSelectOpen] = useState(false);
  const [nodeSelectContext, setNodeSelectContext] = useState<NodeSelectContext | null>(null);

  const handleNodeAdd = useCallback((type: string, position: { x: number; y: number }, size?: NodeSize, data?: Record<string, unknown>) => {
    if (!workflow || isReadOnly) return;
    const rootData = {
      ...(size ? { nodeWidth: size.width, nodeHeight: size.height } : {}),
      ...(data || {}),
    };
    const created = createNodesForDefinition(type, position, rootData);
    if (!created) return;
    pushUndo('add node');
    setWorkflow(w => w ? { ...w, nodes: [...w.nodes, ...created.nodes], edges: [...w.edges, ...created.edges] } : null);
    setSelectedNodeId(created.rootNode.id);
    setSelectedNodeIds([created.rootNode.id]);
    markDirty();
  }, [workflow, isReadOnly, pushUndo, markDirty, setWorkflow, setSelectedNodeId, setSelectedNodeIds]);

  const handleConnectionDrop = useCallback((context: {
    sourceNodeId: string;
    sourceHandle: string | null;
    position: { x: number; y: number } | null;
  }) => {
    if (isReadOnly) return;
    setNodeSelectContext({ mode: 'connection-drop', ...context });
    setNodeSelectOpen(true);
  }, [isReadOnly]);

  const handleRectangleDrawNodeSelect = useCallback((context: {
    position: { x: number; y: number };
    size: NodeSize;
  }) => {
    if (isReadOnly) return;
    setNodeSelectContext({ mode: 'rectangle-draw', ...context });
    setNodeSelectOpen(true);
  }, [isReadOnly]);

  useEffect(() => {
    const handleOpenNodeSelect = (event: Event) => {
      if (isReadOnly) return;
      const detail = (event as CustomEvent).detail as {
        edgeId?: string | null;
        source?: string | null;
        target?: string | null;
        sourceHandle?: string | null;
      } | undefined;
      if (!detail?.source || !detail.target) return;
      setNodeSelectContext({
        mode: 'edge-insert',
        edgeId: detail.edgeId ?? null,
        sourceNodeId: detail.source,
        targetNodeId: detail.target,
        sourceHandle: detail.sourceHandle ?? null,
      });
      setNodeSelectOpen(true);
    };

    window.addEventListener('workflow:open-node-select', handleOpenNodeSelect);
    return () => window.removeEventListener('workflow:open-node-select', handleOpenNodeSelect);
  }, [isReadOnly]);

  const handleNodeSelectOpenChange = useCallback((open: boolean) => {
    setNodeSelectOpen(open);
    if (!open) setNodeSelectContext(null);
  }, []);

  const handleNodeSelectFromDialog = useCallback((type: string) => {
    if (!workflow || !nodeSelectContext || isReadOnly) return;
    const def = getNodeDefinition(type);
    if (def?.manualCreate === false) return;
    if (def?.singleton && workflow.nodes.some(node => node.type === type)) return;

    if (nodeSelectContext.mode === 'rectangle-draw') {
      const created = createNodesForDefinition(type, nodeSelectContext.position, nodeSelectContext.size);
      if (!created) return;

      pushUndo('add node');
      setWorkflow(current => current ? {
        ...current,
        nodes: [...current.nodes, ...created.nodes],
        edges: [...current.edges, ...created.edges],
      } : null);
      setSelectedNodeId(created.rootNode.id);
      setSelectedNodeIds([created.rootNode.id]);
      markDirty();
      return;
    }

    if (nodeSelectContext.mode === 'connection-drop') {
      const sourceNode = workflow.nodes.find(node => node.id === nodeSelectContext.sourceNodeId);
      if (!sourceNode) return;
      const position = nodeSelectContext.position ?? {
        x: sourceNode.position.x + 250,
        y: sourceNode.position.y,
      };
      const scopeNode = getInsertScopeNode(
        workflow.nodes,
        nodeSelectContext.sourceNodeId,
        nodeSelectContext.sourceHandle,
      );
      const created = createNodesForDefinition(type, position, {
        sourceNodeId: nodeSelectContext.sourceNodeId,
        sourceHandle: nodeSelectContext.sourceHandle,
      }, scopeNode);
      if (!created) return;
      const newEdge: Workflow['edges'][0] = {
        id: createWorkflowEdgeId({
          source: nodeSelectContext.sourceNodeId,
          target: created.rootNode.id,
          sourceHandle: nodeSelectContext.sourceHandle,
        }),
        source: nodeSelectContext.sourceNodeId,
        target: created.rootNode.id,
        sourceHandle: nodeSelectContext.sourceHandle || undefined,
        targetHandle: undefined,
      };

      pushUndo('add connected node');
      setWorkflow(current => {
        if (!current) return null;
        const nextNodes = [...current.nodes, ...created.nodes];
        if (scopeNode) syncScopeBoundaryLayout(nextNodes, scopeNode.id);
        return {
          ...current,
          nodes: nextNodes,
          edges: [...current.edges, newEdge, ...created.edges],
        };
      });
      setSelectedNodeId(created.rootNode.id);
      setSelectedNodeIds([created.rootNode.id]);
      markDirty();
      return;
    }

    const sourceNode = workflow.nodes.find(node => node.id === nodeSelectContext.sourceNodeId);
    const targetNode = workflow.nodes.find(node => node.id === nodeSelectContext.targetNodeId);
    if (!sourceNode || !targetNode) return;

    const position = {
      x: (sourceNode.position.x + targetNode.position.x) / 2,
      y: (sourceNode.position.y + targetNode.position.y) / 2,
    };
    const scopeNode = getInsertScopeNode(
      workflow.nodes,
      nodeSelectContext.sourceNodeId,
      nodeSelectContext.sourceHandle,
    );
    const created = createNodesForDefinition(type, position, {
      sourceNodeId: nodeSelectContext.sourceNodeId,
      sourceHandle: nodeSelectContext.sourceHandle,
    }, scopeNode);
    if (!created) return;
    const outgoingSourceHandle = getOutgoingSourceHandle(type);
    const firstEdge: Workflow['edges'][0] = {
      id: createWorkflowEdgeId({
        source: nodeSelectContext.sourceNodeId,
        target: created.rootNode.id,
        sourceHandle: nodeSelectContext.sourceHandle,
      }),
      source: nodeSelectContext.sourceNodeId,
      target: created.rootNode.id,
      sourceHandle: nodeSelectContext.sourceHandle || undefined,
      targetHandle: undefined,
    };
    const secondEdge: Workflow['edges'][0] = {
      id: createWorkflowEdgeId({
        source: created.rootNode.id,
        target: nodeSelectContext.targetNodeId,
        sourceHandle: outgoingSourceHandle,
      }),
      source: created.rootNode.id,
      target: nodeSelectContext.targetNodeId,
      sourceHandle: outgoingSourceHandle,
      targetHandle: undefined,
    };

    pushUndo('insert node');
    setWorkflow(current => {
      if (!current) return null;
      let nextNodes = [...current.nodes, ...created.nodes];
      if (current.layoutSnapshot?.collisionBoxEnabled !== false) {
        nextNodes = resolveWorkflowNodeCollisions(nextNodes);
      }
      if (scopeNode) syncScopeBoundaryLayout(nextNodes, scopeNode.id);
      return {
        ...current,
        nodes: nextNodes,
        edges: [
          ...current.edges.filter(edge => {
            if (nodeSelectContext.edgeId && edge.id === nodeSelectContext.edgeId) return false;
            return !(
              edge.source === nodeSelectContext.sourceNodeId
              && edge.target === nodeSelectContext.targetNodeId
              && isSameHandle(edge.sourceHandle, nodeSelectContext.sourceHandle)
            );
          }),
          firstEdge,
          ...created.edges,
          secondEdge,
        ],
      };
    });
    setSelectedNodeId(created.rootNode.id);
    setSelectedNodeIds([created.rootNode.id]);
    markDirty();
  }, [workflow, nodeSelectContext, isReadOnly, pushUndo, markDirty, setSelectedNodeId, setSelectedNodeIds]);

  const handleNodeDelete = useCallback((nodeId: string) => {
    if (!workflow || isReadOnly) return;
    const deletePlan = getWorkflowNodeDeleteIds(workflow.nodes, nodeId);
    if (!deletePlan) return;
    pushUndo('delete node');
    setWorkflow(w => {
      if (!w) return null;
      const removedNode = w.nodes.find(node => node.id === nodeId);
      const currentDeletePlan = getWorkflowNodeDeleteIds(w.nodes, nodeId);
      if (!removedNode || !currentDeletePlan) return w;
      const parentId = removedNode ? getCompositeParentId(removedNode) : null;
      const deleteNodeIds = currentDeletePlan.ids;
      const rootId = currentDeletePlan.rootId;

      const nextNodes = w.nodes.filter(node => !deleteNodeIds.has(node.id));
      if (parentId && !deleteNodeIds.has(parentId)) syncScopeBoundaryLayout(nextNodes, parentId);
      const nextEdgesAfterDelete = w.edges.filter(edge =>
        !deleteNodeIds.has(edge.source)
        && !deleteNodeIds.has(edge.target)
        && (!rootId || edge.composite?.rootId !== rootId)
      );
      const autoConnectAfterNodeDelete = w.layoutSnapshot?.autoConnectAfterNodeDelete !== false;

      return {
        ...w,
        nodes: nextNodes,
        edges: autoConnectAfterNodeDelete
          ? reconnectEdgesAfterNodeDelete(w.edges, deleteNodeIds)
            .filter(edge => !rootId || edge.composite?.rootId !== rootId)
          : nextEdgesAfterDelete,
        groups: cleanupGroupsOnNodeDelete(w.groups, deleteNodeIds),
      };
    });
    if (selectedNodeId && deletePlan.ids.has(selectedNodeId)) setSelectedNodeId(null);
    setSelectedNodeIds(ids => ids.filter(id => !deletePlan.ids.has(id)));
    markDirty();
  }, [workflow, isReadOnly, pushUndo, markDirty, selectedNodeId, setSelectedNodeId, setSelectedNodeIds]);

  const handleBatchDeleteNodes = useCallback((nodeIds: string[]) => {
    if (!workflow || isReadOnly) return;
    const deleteNodeIds = new Set<string>();
    const deletedRootIds = new Set<string>();
    for (const nodeId of nodeIds) {
      const deletePlan = getWorkflowNodeDeleteIds(workflow.nodes, nodeId);
      if (!deletePlan) continue;
      for (const id of deletePlan.ids) deleteNodeIds.add(id);
      if (deletePlan.rootId) deletedRootIds.add(deletePlan.rootId);
    }
    if (deleteNodeIds.size === 0) return;

    pushUndo('batch delete nodes');
    setWorkflow(w => {
      if (!w) return null;
      const nextEdgesAfterDelete = w.edges.filter(edge =>
        !deleteNodeIds.has(edge.source)
        && !deleteNodeIds.has(edge.target)
        && (!edge.composite?.rootId || !deletedRootIds.has(edge.composite.rootId))
      );
      const autoConnectAfterNodeDelete = w.layoutSnapshot?.autoConnectAfterNodeDelete !== false;

      return {
        ...w,
        nodes: w.nodes.filter(node => !deleteNodeIds.has(node.id)),
        edges: autoConnectAfterNodeDelete
          ? reconnectEdgesAfterNodeDelete(w.edges, deleteNodeIds)
            .filter(edge => !edge.composite?.rootId || !deletedRootIds.has(edge.composite.rootId))
          : nextEdgesAfterDelete,
        groups: cleanupGroupsOnNodeDelete(w.groups, deleteNodeIds),
      };
    });
    if (selectedNodeId && deleteNodeIds.has(selectedNodeId)) setSelectedNodeId(null);
    setSelectedNodeIds(ids => ids.filter(id => !deleteNodeIds.has(id)));
    markDirty();
  }, [workflow, isReadOnly, pushUndo, markDirty, selectedNodeId, setSelectedNodeId, setSelectedNodeIds]);

  const handleMergeNodesToWorkflow = useCallback(async (nodeIds: string[]) => {
    if (!workflow || isReadOnly) return;
    const rootIds = new Set(nodeIds.filter(id => (
      workflow.nodes.some(node => node.id === id) && canDeleteWorkflowNode(workflow.nodes, id)
    )));
    if (rootIds.size < 2) return;

    const selectedIds = new Set<string>();
    for (const node of workflow.nodes) {
      const rootId = getCompositeRootId(node);
      if (rootIds.has(rootId)) selectedIds.add(node.id);
    }
    const nodes = workflow.nodes.filter(node => selectedIds.has(node.id));
    if (nodes.length < 2) return;

    const startNodeId = crypto.randomUUID();
    const endNodeId = crypto.randomUUID();
    const subNodeId = crypto.randomUUID();
    const bounds = {
      minX: Math.min(...nodes.map(node => node.position.x)),
      minY: Math.min(...nodes.map(node => node.position.y)),
      maxX: Math.max(...nodes.map(node => node.position.x)),
    };

    const usedInputKeys = new Set<string>();
    const replacements = new Map<string, string>();
    const selectedBoundaryReplacements = new Map<string, string>();
    const startInputFields: OutputField[] = [];
    const subNodeInputFields: OutputField[] = [];

    for (const node of nodes) {
      if (!rootIds.has(node.id)) continue;
      if (node.type === 'start') selectedBoundaryReplacements.set(node.id, startNodeId);
      if (node.type === 'end') selectedBoundaryReplacements.set(node.id, endNodeId);
    }

    for (const refItem of collectExternalReferences(nodes.map(node => node.data), selectedIds)) {
      if (replacements.has(refItem.raw)) continue;
      const sourceNode = workflow.nodes.find(node => node.id === refItem.nodeId);
      const inputKey = normalizeInputKey(getReferenceFieldKey(sourceNode, refItem.fieldPath), usedInputKeys);
      const originalReference = refItem.source === '__inputs__'
        ? makeInputReference(refItem.nodeId, refItem.fieldPath)
        : makeDataReference(refItem.nodeId, refItem.fieldPath);
      startInputFields.push({ key: inputKey, type: 'any' });
      subNodeInputFields.push({ key: inputKey, type: 'any', value: originalReference });
      replacements.set(refItem.raw, makeInputReference(startNodeId, inputKey));
    }

    const selectedSnapshot = remapSelectedWorkflowNodes(
      workflow.nodes,
      workflow.edges,
      selectedIds,
      rootIds,
      startNodeId,
      endNodeId,
    );
    const extractedNodes = selectedSnapshot.nodes.map(node => ({
      ...node,
      data: replaceReferenceNodeIds(
        replaceReferences(node.data, replacements),
        selectedBoundaryReplacements,
      ) as Record<string, unknown>,
      position: {
        x: node.position.x - bounds.minX + 260,
        y: node.position.y - bounds.minY + 120,
      },
    }));
    clearStartInputFieldValues({ nodes: extractedNodes });

    const now = Date.now();
    const workflowToCreate: Partial<Workflow> = {
      name: `${workflow.name}-子工作流`,
      folderId: workflow.folderId,
      nodes: [
        { id: startNodeId, type: 'start', label: '开始', position: { x: 80, y: 120 }, data: { inputFields: startInputFields } },
        ...extractedNodes,
        { id: endNodeId, type: 'end', label: '结束', position: { x: bounds.maxX - bounds.minX + 520, y: 120 }, data: {} },
      ],
      edges: selectedSnapshot.edges,
      createdAt: now,
      updatedAt: now,
      enabledPlugins: workflow.enabledPlugins ? cloneData(workflow.enabledPlugins) : undefined,
      pluginConfigSchemes: workflow.pluginConfigSchemes ? cloneData(workflow.pluginConfigSchemes) : undefined,
      agentConfig: workflow.agentConfig ? cloneData(workflow.agentConfig) : undefined,
    };
    const createdWorkflow = await workflowApi.create(workflowToCreate);
    upsertWorkflow(createdWorkflow);

    const incomingEdges = workflow.edges.filter(edge => !selectedIds.has(edge.source) && selectedIds.has(edge.target));
    const outgoingEdges = workflow.edges.filter(edge => selectedIds.has(edge.source) && !selectedIds.has(edge.target));
    const replacementNode: Workflow['nodes'][0] = {
      id: subNodeId,
      type: 'sub_workflow',
      label: '子工作流',
      position: { x: bounds.minX, y: bounds.minY },
      data: {
        workflowId: createdWorkflow.id,
        workflowName: createdWorkflow.name,
        inputFields: subNodeInputFields,
      },
    };

    const replacementEdges: Workflow['edges'] = [];
    for (const edge of incomingEdges) {
      const nextEdge = {
        ...cloneData(edge),
        target: subNodeId,
        targetHandle: null,
      };
      nextEdge.id = createWorkflowEdgeId(nextEdge);
      if (!replacementEdges.some(item => item.id === nextEdge.id)) replacementEdges.push(nextEdge);
    }
    for (const edge of outgoingEdges) {
      const nextEdge = {
        ...cloneData(edge),
        source: subNodeId,
        sourceHandle: null,
      };
      nextEdge.id = createWorkflowEdgeId(nextEdge);
      if (!replacementEdges.some(item => item.id === nextEdge.id)) replacementEdges.push(nextEdge);
    }

    pushUndo('merge to sub workflow');
    setWorkflow(w => {
      if (!w) return null;
      return {
        ...w,
        nodes: [
          ...w.nodes.filter(node => !selectedIds.has(node.id)),
          replacementNode,
        ],
        edges: [
          ...w.edges.filter(edge => !selectedIds.has(edge.source) && !selectedIds.has(edge.target)),
          ...replacementEdges,
        ],
        groups: cleanupGroupsOnNodeDelete(w.groups, selectedIds),
      };
    });
    setSelectedNodeId(subNodeId);
    setSelectedNodeIds([subNodeId]);
    markDirty();
  }, [workflow, isReadOnly, upsertWorkflow, pushUndo, setWorkflow, setSelectedNodeId, setSelectedNodeIds, markDirty]);

  const handleNodeClone = useCallback((nodeId: string) => {
    if (!workflow || isReadOnly) return;
    const node = workflow.nodes.find(n => n.id === nodeId);
    if (!node) return;
    pushUndo('clone node');
    const newId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const cloned = {
      ...node,
      id: newId,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      data: JSON.parse(JSON.stringify(node.data)),
    };
    setWorkflow(w => w ? { ...w, nodes: [...w.nodes, cloned] } : null);
    setSelectedNodeId(newId);
    setSelectedNodeIds([newId]);
    markDirty();
  }, [workflow, isReadOnly, pushUndo, markDirty, setSelectedNodeId, setSelectedNodeIds]);

  const handleNodeCopy = useCallback((nodeId: string) => {
    if (isReadOnly) return;
    onCopyNodes?.([nodeId]);
  }, [isReadOnly, onCopyNodes]);

  const handleNodeStage = useCallback((nodeId: string) => {
    if (isReadOnly) return;
    onStageNode?.(nodeId);
  }, [isReadOnly, onStageNode]);

  const handleNodeSelect = useCallback((id: string | null, multi = false) => {
    if (!id) {
      if (!selectedNodeId && selectedNodeIds.length === 0) return;
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
      return;
    }

    if (!multi) {
      if (selectedNodeId === id && areStringArraysEqual(selectedNodeIds, [id])) return;
      setSelectedNodeId(id);
      setSelectedNodeIds([id]);
      return;
    }

    const selected = selectedNodeIds.includes(id);
    const next = selected ? selectedNodeIds.filter(item => item !== id) : [...selectedNodeIds, id];
    setSelectedNodeIds(next);
    setSelectedNodeId(selected ? next[next.length - 1] ?? null : id);
  }, [selectedNodeId, selectedNodeIds, setSelectedNodeId, setSelectedNodeIds]);

  const handleNodesSelect = useCallback((ids: string[], options?: { primaryNodeId?: string | null }) => {
    const primaryNodeId = options?.primaryNodeId ?? (ids.length === 1 ? ids[0] : null);
    if (selectedNodeId === primaryNodeId && areStringArraysEqual(selectedNodeIds, ids)) return;
    setSelectedNodeIds(ids);
    setSelectedNodeId(primaryNodeId);
  }, [selectedNodeId, selectedNodeIds, setSelectedNodeId, setSelectedNodeIds]);

  const handleNodeDataUpdate = useCallback((nodeId: string, data: Record<string, unknown>) => {
    if (isReadOnly) return;
    setWorkflow(w => {
      if (!w) return null;
      const { nodeState, breakpoint, nodeColor, ...nodeData } = data;
      const currentNode = w.nodes.find(node => node.id === nodeId);
      const parentId = currentNode ? getCompositeParentId(currentNode) : null;
      const nextNodes = w.nodes.map(n => n.id === nodeId ? {
        ...n,
        label: typeof data.label === 'string' ? data.label : n.label,
        ...(typeof nodeState === 'string' ? { nodeState: nodeState as typeof n.nodeState } : {}),
        ...('breakpoint' in data ? { breakpoint: breakpoint === null ? undefined : breakpoint as typeof n.breakpoint } : {}),
        ...('nodeColor' in data ? { nodeColor: nodeColor === null ? undefined : nodeColor as string | undefined } : {}),
        data: { ...n.data, ...nodeData },
      } : n);
      if (parentId) syncScopeBoundaryLayout(nextNodes, parentId);
      return {
        ...w,
        nodes: nextNodes,
      };
    });
    markDirty();
  }, [isReadOnly, markDirty, setWorkflow]);

  return {
    nodeSelectOpen,
    handleNodeSelectOpenChange,
    handleNodeSelectFromDialog,
    handleNodeAdd,
    handleRectangleDrawNodeSelect,
    handleConnectionDrop,
    handleNodeDelete,
    handleBatchDeleteNodes,
    handleMergeNodesToWorkflow,
    handleNodeClone,
    handleNodeCopy,
    handleNodeStage,
    handleNodeSelect,
    handleNodesSelect,
    handleNodeDataUpdate,
  };
}
