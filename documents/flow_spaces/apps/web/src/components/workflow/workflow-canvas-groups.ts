'use client';

import type { Workflow } from '@agent-spaces/shared';
import { getLayoutNodeSize } from './workflow-canvas-utils';

export type WorkflowNodeSizeOverrides = Map<string, { x?: number; y?: number; width: number; height: number }>;

export function cleanupGroupsOnNodeDelete(
  groups: Workflow['groups'] | undefined,
  deletedNodeIds: Set<string>,
): Workflow['groups'] {
  return (groups || [])
    .map(group => ({
      ...group,
      childNodeIds: group.childNodeIds.filter(id => !deletedNodeIds.has(id)),
      childGroupIds: [...group.childGroupIds],
      savedNodeStates: Object.fromEntries(
        Object.entries(group.savedNodeStates || {}).filter(([nodeId]) => !deletedNodeIds.has(nodeId)),
      ),
    }));
}

export function computeGroupBounds(
  nodes: Workflow['nodes'],
  childNodeIds: string[],
  sizeOverrides?: WorkflowNodeSizeOverrides,
): Pick<NonNullable<Workflow['groups']>[0], 'x' | 'y' | 'width' | 'height'> | null {
  const childNodes = childNodeIds
    .map(id => nodes.find(node => node.id === id))
    .filter((node): node is Workflow['nodes'][0] => !!node);
  if (childNodes.length === 0) return null;
  const getNodeBounds = (node: Workflow['nodes'][0]) => {
    const override = sizeOverrides?.get(node.id);
    const size = override ?? getLayoutNodeSize(node);
    return {
      x: override?.x ?? node.position.x,
      y: override?.y ?? node.position.y,
      width: size.width,
      height: size.height,
    };
  };
  const minX = Math.min(...childNodes.map(node => getNodeBounds(node).x));
  const minY = Math.min(...childNodes.map(node => getNodeBounds(node).y));
  const maxX = Math.max(...childNodes.map((node) => {
    const bounds = getNodeBounds(node);
    return bounds.x + bounds.width;
  }));
  const maxY = Math.max(...childNodes.map((node) => {
    const bounds = getNodeBounds(node);
    return bounds.y + bounds.height;
  }));
  return {
    x: minX - 24,
    y: minY - 48,
    width: Math.max(240, maxX - minX + 48),
    height: Math.max(160, maxY - minY + 72),
  };
}

export function collectWorkflowGroupNodeIds(
  groups: NonNullable<Workflow['groups']>,
  groupId: string,
  visited = new Set<string>(),
): Set<string> {
  const result = new Set<string>();
  if (visited.has(groupId)) return result;
  visited.add(groupId);
  const group = groups.find(item => item.id === groupId);
  if (!group) return result;

  for (const nodeId of group.childNodeIds) result.add(nodeId);
  for (const childGroupId of group.childGroupIds) {
    for (const nodeId of collectWorkflowGroupNodeIds(groups, childGroupId, visited)) {
      result.add(nodeId);
    }
  }
  return result;
}

export function collectWorkflowGroupIds(
  groups: NonNullable<Workflow['groups']>,
  groupId: string,
  visited = new Set<string>(),
): Set<string> {
  const result = new Set<string>();
  if (visited.has(groupId)) return result;
  visited.add(groupId);
  const group = groups.find(item => item.id === groupId);
  if (!group) return result;
  result.add(groupId);
  for (const childGroupId of group.childGroupIds) {
    for (const id of collectWorkflowGroupIds(groups, childGroupId, visited)) {
      result.add(id);
    }
  }
  return result;
}
