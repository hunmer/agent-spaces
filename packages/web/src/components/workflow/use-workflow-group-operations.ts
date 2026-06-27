'use client';

import { useCallback } from 'react';
import type { Workflow } from '@agent-spaces/shared';
import {
  canDeleteWorkflowNode,
  collectCompositeDescendantIds,
  getCompositeRootId,
} from './workflow-canvas-utils';
import {
  cleanupGroupsOnNodeDelete,
  collectWorkflowGroupNodeIds,
  collectWorkflowGroupIds,
  computeGroupBounds,
  type WorkflowNodeSizeOverrides,
} from './workflow-canvas-groups';

interface UseGroupOperationsParams {
  workflow: Workflow | null;
  isReadOnly: boolean;
  setWorkflow: React.Dispatch<React.SetStateAction<Workflow | null>>;
  markDirty: () => void;
  pushUndo: (description?: string) => void;
  selectedNodeId: string | null;
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedNodeIds: string[];
  setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>;
}

type MergeNodesToGroupOptions = {
  nodeSizes?: WorkflowNodeSizeOverrides;
};

export function useGroupOperations({
  workflow, isReadOnly, setWorkflow, markDirty, pushUndo,
  selectedNodeId, setSelectedNodeId, selectedNodeIds, setSelectedNodeIds,
}: UseGroupOperationsParams) {
  const handleMergeNodesToGroup = useCallback((nodeIds: string[], options?: MergeNodesToGroupOptions) => {
    if (!workflow || isReadOnly) return;
    const childNodeIds = nodeIds.filter(id => canDeleteWorkflowNode(workflow.nodes, id));
    if (childNodeIds.length < 2) return;

    pushUndo('create group');
    const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setWorkflow(w => {
      if (!w) return null;
      const groups = w.groups || [];
      const childGroupIds = new Set<string>();
      const standaloneNodeIds: string[] = [];

      for (const nodeId of childNodeIds) {
        const oldGroup = groups.find(group => group.childNodeIds.includes(nodeId));
        if (oldGroup) {
          childGroupIds.add(oldGroup.id);
        } else {
          standaloneNodeIds.push(nodeId);
        }
      }

      const nestedGroupIds = Array.from(childGroupIds);
      const existingGroups = groups.map(group => ({
        ...group,
        childNodeIds: [...group.childNodeIds],
        childGroupIds: group.childGroupIds.filter(id => !childGroupIds.has(id)),
        savedNodeStates: { ...(group.savedNodeStates || {}) },
      }));
      const bounds = computeGroupBounds(w.nodes, childNodeIds, options?.nodeSizes);
      console.debug('[WorkflowGroupBoundsDebug] create group bounds', {
        groupId,
        childNodeIds,
        nodeSizes: options?.nodeSizes ? Object.fromEntries(options.nodeSizes) : null,
        bounds,
      });
      return {
        ...w,
        groups: [
          ...existingGroups,
          {
            id: groupId,
            name: `分组 ${existingGroups.length + 1}`,
            childNodeIds: standaloneNodeIds,
            childGroupIds: nestedGroupIds,
            locked: false,
            disabled: false,
            savedNodeStates: {},
            ...(bounds || {}),
          },
        ],
      };
    });
    markDirty();
  }, [workflow, isReadOnly, pushUndo, setWorkflow, markDirty]);

  const handleRenameGroup = useCallback((groupId: string, name: string) => {
    const trimmed = name.trim();
    if (!workflow || isReadOnly || !trimmed) return;
    const group = workflow.groups?.find(item => item.id === groupId);
    if (!group || group.name === trimmed) return;

    pushUndo('rename group');
    setWorkflow(w => w ? {
      ...w,
      groups: (w.groups || []).map(item => item.id === groupId ? { ...item, name: trimmed } : item),
    } : null);
    markDirty();
  }, [workflow, isReadOnly, pushUndo, setWorkflow, markDirty]);

  const handleUpdateGroup = useCallback((groupId: string, updates: Partial<NonNullable<Workflow['groups']>[number]>) => {
    if (!workflow || isReadOnly) return;
    const group = workflow.groups?.find(item => item.id === groupId);
    if (!group) return;

    const nextUpdates = { ...updates };
    if (typeof nextUpdates.name === 'string') {
      const trimmed = nextUpdates.name.trim();
      if (!trimmed) delete nextUpdates.name;
      else nextUpdates.name = trimmed;
    }
    if (Object.keys(nextUpdates).length === 0) return;

    pushUndo('update group');
    setWorkflow(w => w ? {
      ...w,
      groups: (w.groups || []).map(item => item.id === groupId ? { ...item, ...nextUpdates } : item),
    } : null);
    markDirty();
  }, [workflow, isReadOnly, pushUndo, setWorkflow, markDirty]);

  const handleUngroup = useCallback((groupId: string) => {
    if (!workflow || isReadOnly) return;
    const group = workflow.groups?.find(item => item.id === groupId);
    if (!group) return;

    pushUndo('ungroup');
    setWorkflow(w => {
      if (!w) return null;
      const groups = w.groups || [];
      const parentGroup = groups.find(item => item.childGroupIds.includes(groupId));
      return {
        ...w,
        groups: groups
          .filter(item => item.id !== groupId)
          .map((item) => {
            if (!parentGroup || item.id !== parentGroup.id) return item;
            return {
              ...item,
              childNodeIds: [
                ...item.childNodeIds,
                ...group.childNodeIds.filter(id => !item.childNodeIds.includes(id)),
              ],
              childGroupIds: [
                ...item.childGroupIds.filter(id => id !== groupId),
                ...group.childGroupIds.filter(id => !item.childGroupIds.includes(id)),
              ],
            };
          }),
      };
    });
    markDirty();
  }, [workflow, isReadOnly, pushUndo, setWorkflow, markDirty]);

  const handleBatchUngroup = useCallback((groupIds: string[]) => {
    if (!workflow || isReadOnly) return;
    const ids = new Set(groupIds);
    const removableGroups = (workflow.groups || []).filter(group => ids.has(group.id) && !group.locked);
    if (removableGroups.length === 0) return;

    pushUndo('batch ungroup');
    setWorkflow(w => {
      if (!w) return null;
      const removedById = new Map(removableGroups.map(group => [group.id, group]));
      return {
        ...w,
        groups: (w.groups || [])
          .filter(group => !removedById.has(group.id))
          .map((group) => {
            const directRemovedChildren = group.childGroupIds
              .map(id => removedById.get(id))
              .filter((item): item is NonNullable<Workflow['groups']>[number] => !!item);
            if (directRemovedChildren.length === 0) return group;
            const promotedChildGroupIds = directRemovedChildren.flatMap(item => item.childGroupIds);
            return {
              ...group,
              childGroupIds: [
                ...group.childGroupIds.filter(id => !removedById.has(id)),
                ...promotedChildGroupIds.filter(id => !group.childGroupIds.includes(id)),
              ],
            };
          }),
      };
    });
    markDirty();
  }, [workflow, isReadOnly, pushUndo, setWorkflow, markDirty]);

  const handleFocusGroup = useCallback((groupId: string) => {
    const group = workflow?.groups?.find(item => item.id === groupId);
    if (!group) return;
    const nodeIds = group.childNodeIds.filter(id => workflow?.nodes.some(node => node.id === id));
    setSelectedNodeIds(nodeIds);
    setSelectedNodeId(nodeIds.length === 1 ? nodeIds[0] : null);
  }, [workflow, setSelectedNodeId, setSelectedNodeIds]);

  const handleMoveGroup = useCallback((groupId: string, delta: { x: number; y: number }, options?: { pushUndo?: boolean }) => {
    if (!workflow || isReadOnly) return;
    if (delta.x === 0 && delta.y === 0) return;
    const groups = workflow.groups || [];
    const group = groups.find(item => item.id === groupId);
    if (!group || group.locked) return;

    const movedNodeIds = collectWorkflowGroupNodeIds(groups, groupId);
    for (const descendantId of collectCompositeDescendantIds(workflow.nodes, movedNodeIds)) {
      movedNodeIds.add(descendantId);
    }
    const movedGroupIds = collectWorkflowGroupIds(groups, groupId);

    if (options?.pushUndo !== false) pushUndo('move group');
    setWorkflow(w => {
      if (!w) return null;
      return {
        ...w,
        nodes: w.nodes.map(node => movedNodeIds.has(node.id)
          ? { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } }
          : node),
        groups: (w.groups || []).map(item => movedGroupIds.has(item.id)
          ? {
              ...item,
              x: typeof item.x === 'number' ? item.x + delta.x : item.x,
              y: typeof item.y === 'number' ? item.y + delta.y : item.y,
            }
          : item),
      };
    });
    markDirty();
  }, [workflow, isReadOnly, pushUndo, setWorkflow, markDirty]);

  return {
    handleMergeNodesToGroup,
    handleRenameGroup,
    handleUpdateGroup,
    handleUngroup,
    handleBatchUngroup,
    handleFocusGroup,
    handleMoveGroup,
  };
}
