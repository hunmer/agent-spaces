'use client';

import type { Workflow } from '@agent-spaces/shared';
import type { Node } from '@xyflow/react';
import {
  LOOP_BODY_ROLE,
  LOOP_BODY_NODE_TYPE,
  LOOP_BODY_SOURCE_HANDLE,
  LOOP_NEXT_SOURCE_HANDLE,
  findCompositeChildByRole,
  getCompositeParentId,
  getCompositeRootId,
  isHiddenWorkflowNode,
  isScopeBoundaryWorkflowNode,
  createWorkflowNodesForDefinition,
} from '@agent-spaces/shared';

export {
  getCompositeParentId,
  getCompositeRootId,
  isScopeBoundaryWorkflowNode,
};
import { createWorkflowEdgeId } from '@/lib/workflow-edge-id';
import { getAllNodeDefinitions, getNodeDefinition } from '@/lib/workflow-nodes';
import { getWorkflowNodeSize } from './workflow-node-size';
import { getPropertyModeBadgeLayoutOverflow } from './workflow-node-property-mode';

// ---- Type guards & helpers ----

export function areStringArraysEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function isNodePositionOrDimensionChange(
  change: import('@xyflow/react').NodeChange,
): change is import('@xyflow/react').NodeChange & { type: 'position' | 'dimensions'; id: string } {
  return change.type === 'position' || change.type === 'dimensions';
}

export function isNodeRemoveChange(
  change: import('@xyflow/react').NodeChange,
): change is import('@xyflow/react').NodeChange & { type: 'remove'; id: string } {
  return change.type === 'remove';
}

export function isSameHandle(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null);
}

function canUseEdgeForDeleteReconnect(edge: Workflow['edges'][0]): boolean {
  return !edge.composite?.hidden && !edge.composite?.locked;
}

export function reconnectEdgesAfterNodeDelete(
  edges: Workflow['edges'],
  deletedNodeIds: Set<string>,
): Workflow['edges'] {
  let nextEdges: Workflow['edges'] = edges.map(edge => ({
    ...edge,
    composite: edge.composite ? { ...edge.composite } : undefined,
  }));

  for (const deletedNodeId of deletedNodeIds) {
    const incomingEdges = nextEdges.filter(edge =>
      edge.target === deletedNodeId
      && edge.source !== deletedNodeId
      && canUseEdgeForDeleteReconnect(edge)
    );
    const outgoingEdges = nextEdges.filter(edge =>
      edge.source === deletedNodeId
      && edge.target !== deletedNodeId
      && canUseEdgeForDeleteReconnect(edge)
    );
    nextEdges = nextEdges.filter(edge => edge.source !== deletedNodeId && edge.target !== deletedNodeId);

    for (const incomingEdge of incomingEdges) {
      for (const outgoingEdge of outgoingEdges) {
        if (incomingEdge.source === outgoingEdge.target) continue;
        const nextEdge: Workflow['edges'][0] = {
          id: createWorkflowEdgeId({
            source: incomingEdge.source,
            target: outgoingEdge.target,
            sourceHandle: incomingEdge.sourceHandle,
            targetHandle: outgoingEdge.targetHandle,
          }),
          source: incomingEdge.source,
          target: outgoingEdge.target,
          sourceHandle: incomingEdge.sourceHandle,
          targetHandle: outgoingEdge.targetHandle,
        };
        if (!nextEdges.some(edge => edge.id === nextEdge.id)) nextEdges.push(nextEdge);
      }
    }
  }

  return nextEdges;
}

export function isGeneratedWorkflowNode(node: Workflow['nodes'][0]): boolean {
  return !!node.composite?.generated;
}

export function canDeleteWorkflowNode(nodes: Workflow['nodes'], nodeId: string): boolean {
  const node = nodes.find(item => item.id === nodeId);
  if (!node) return false;
  if (isScopeBoundaryWorkflowNode(node)) return false;
  const parentNode = node.composite?.parentId
    ? nodes.find(item => item.id === node.composite?.parentId)
    : null;
  if (parentNode && isScopeBoundaryWorkflowNode(parentNode)) {
    return node.type !== 'start' && node.type !== 'end';
  }
  return !isGeneratedWorkflowNode(node);
}

// ---- Composite / node ID helpers ----

export function collectCompositeDescendantIds(nodes: Workflow['nodes'], parentIds: Set<string>): Set<string> {
  const result = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      const parentId = getCompositeParentId(node);
      if (!parentId || result.has(node.id)) continue;
      if (parentIds.has(parentId) || result.has(parentId)) {
        result.add(node.id);
        changed = true;
      }
    }
  }
  return result;
}

export function getWorkflowNodeDeleteIds(
  nodes: Workflow['nodes'],
  nodeId: string,
): { ids: Set<string>; rootId: string | null } | null {
  const removedNode = nodes.find(node => node.id === nodeId);
  if (!removedNode || !canDeleteWorkflowNode(nodes, nodeId)) return null;

  const parentId = getCompositeParentId(removedNode);
  const parentNode = parentId ? nodes.find(node => node.id === parentId) : null;
  const ids = new Set<string>();
  let rootId: string | null = null;

  if (parentNode && isScopeBoundaryWorkflowNode(parentNode)) {
    ids.add(nodeId);
    return { ids, rootId };
  }

  rootId = getCompositeRootId(removedNode);
  for (const node of nodes) {
    if (getCompositeRootId(node) === rootId) ids.add(node.id);
  }
  for (const descendantId of collectCompositeDescendantIds(nodes, ids)) {
    ids.add(descendantId);
  }

  return { ids, rootId };
}

export function createWorkflowNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneWorkflowNodes(nodes: Workflow['nodes']): Workflow['nodes'] {
  return nodes.map(node => ({
    ...node,
    position: { ...node.position },
    data: { ...node.data },
    composite: node.composite ? { ...node.composite } : undefined,
  }));
}

export function getLayoutNodeSize(node: Workflow['nodes'][0]): { width: number; height: number } {
  return {
    width: typeof node.data?.nodeWidth === 'number'
      ? node.data.nodeWidth
      : typeof node.data?.width === 'number' ? node.data.width : DEFAULT_SCOPE_CHILD_SIZE.width,
    height: typeof node.data?.nodeHeight === 'number'
      ? node.data.nodeHeight
      : typeof node.data?.height === 'number' ? node.data.height : DEFAULT_SCOPE_CHILD_SIZE.height,
  };
}

export type WorkflowNodeVisualBounds = {
  position: { x: number; y: number };
  width: number;
  height: number;
  bodyWidth: number;
  bodyHeight: number;
  overflow: { left: number; right: number; top: number; bottom: number };
};

export function getWorkflowNodeVisualBounds(
  node: Workflow['nodes'][0],
  body?: {
    position?: { x: number; y: number };
    width?: number;
    height?: number;
  },
): WorkflowNodeVisualBounds {
  const layoutSize = getLayoutNodeSize(node);
  const position = body?.position ?? node.position;
  const bodyWidth = body?.width ?? layoutSize.width;
  const bodyHeight = body?.height ?? layoutSize.height;
  const definition = getNodeDefinition(node.type);
  const overflow = getPropertyModeBadgeLayoutOverflow(definition, node.data, bodyHeight);

  return {
    position: {
      x: position.x - overflow.left,
      y: position.y - overflow.top,
    },
    width: bodyWidth + overflow.left + overflow.right,
    height: bodyHeight + overflow.top + overflow.bottom,
    bodyWidth,
    bodyHeight,
    overflow,
  };
}

export function sanitizeFieldKey(value: string): string {
  const key = value.trim().replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '');
  return key || 'input';
}

// ---- Layout constants ----

export const SCOPE_CONTAINER_PADDING = {
  top: 100,
  right: 56,
  bottom: 44,
  left: 56,
};

export const MIN_SCOPE_CONTAINER_SIZE = {
  width: 520,
  height: 260,
};

export const LOOP_BODY_MIN_SCOPE_CONTAINER_SIZE = {
  width: 150,
  height: 260,
};

const DEFAULT_SCOPE_CHILD_SIZE = {
  width: 220,
  height: 120,
};

export type CollisionAlgorithmOptions = {
  maxIterations: number;
  overlapThreshold: number;
  margin: number;
};

export const WORKFLOW_COLLISION_OPTIONS: CollisionAlgorithmOptions = {
  maxIterations: 50,
  overlapThreshold: 0.5,
  margin: 15,
};

type CollisionBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  moved: boolean;
  node: Node;
};

function getCollisionBoxesFromNodes(nodes: Node[], margin: number): CollisionBox[] {
  return nodes.map(node => ({
    x: node.position.x - margin,
    y: node.position.y - margin,
    width: (node.width ?? node.measured?.width ?? 0) + margin * 2,
    height: (node.height ?? node.measured?.height ?? 0) + margin * 2,
    node,
    moved: false,
  }));
}

export function resolveNodeCollisions(
  nodes: Node[],
  { maxIterations, overlapThreshold, margin }: CollisionAlgorithmOptions,
): Node[] {
  const boxes = getCollisionBoxesFromNodes(nodes, margin);
  const iterationLimit = Number.isFinite(maxIterations) ? maxIterations : 1000;

  for (let iter = 0; iter <= iterationLimit; iter += 1) {
    let moved = false;

    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const centerAX = a.x + a.width * 0.5;
        const centerAY = a.y + a.height * 0.5;
        const centerBX = b.x + b.width * 0.5;
        const centerBY = b.y + b.height * 0.5;
        const dx = centerAX - centerBX;
        const dy = centerAY - centerBY;
        const px = (a.width + b.width) * 0.5 - Math.abs(dx);
        const py = (a.height + b.height) * 0.5 - Math.abs(dy);

        if (px > overlapThreshold && py > overlapThreshold) {
          a.moved = true;
          b.moved = true;
          moved = true;

          if (px < py) {
            const sx = dx > 0 ? 1 : -1;
            const moveAmount = (px / 2) * sx;
            a.x += moveAmount;
            b.x -= moveAmount;
          } else {
            const sy = dy > 0 ? 1 : -1;
            const moveAmount = (py / 2) * sy;
            a.y += moveAmount;
            b.y -= moveAmount;
          }
        }
      }
    }

    if (!moved) break;
  }

  return boxes.map(box => {
    if (!box.moved) return box.node;
    return {
      ...box.node,
      position: {
        x: box.x + margin,
        y: box.y + margin,
      },
    };
  });
}

export function resolveWorkflowNodeCollisions(
  nodes: Workflow['nodes'],
  options: CollisionAlgorithmOptions = WORKFLOW_COLLISION_OPTIONS,
): Workflow['nodes'] {
  const collisionNodes = nodes
    .filter(node => !isHiddenWorkflowNode(node))
    .filter(node => !isScopeBoundaryWorkflowNode(node));
  const flowNodes = collisionNodes.map((node) => {
    const definition = getNodeDefinition(node.type);
    const { width, height } = getWorkflowNodeSize(definition, node.data);
    return {
      id: node.id,
      position: node.position,
      width,
      height,
      measured: { width, height },
      data: {},
    } as Node;
  });
  const resolvedNodeById = new Map(
    resolveNodeCollisions(flowNodes, options).map(node => [node.id, node]),
  );

  return nodes.map((node) => {
    const resolvedNode = resolvedNodeById.get(node.id);
    if (!resolvedNode) return node;
    if (
      node.position.x === resolvedNode.position.x
      && node.position.y === resolvedNode.position.y
    ) {
      return node;
    }
    return {
      ...node,
      position: { ...resolvedNode.position },
    };
  });
}

// ---- Scope boundary layout ----

export function syncScopeBoundaryLayout(nodes: Workflow['nodes'], scopeNodeId: string): boolean {
  const scopeNode = nodes.find(node => node.id === scopeNodeId);
  if (!scopeNode || !isScopeBoundaryWorkflowNode(scopeNode)) return false;

  const children = nodes.filter(node => getCompositeParentId(node) === scopeNodeId && !isHiddenWorkflowNode(node));
  if (!children.length) return false;

  const minX = Math.min(...children.map(node => node.position.x));
  const minY = Math.min(...children.map(node => node.position.y));
  const maxX = Math.max(...children.map(node => {
    const size = getLayoutNodeSize(node);
    return node.position.x + size.width;
  }));
  const maxY = Math.max(...children.map(node => {
    const size = getLayoutNodeSize(node);
    return node.position.y + size.height;
  }));

  const minSize = scopeNode.type === LOOP_BODY_NODE_TYPE
    ? LOOP_BODY_MIN_SCOPE_CONTAINER_SIZE
    : MIN_SCOPE_CONTAINER_SIZE;
  const nextPosition = {
    x: minX - SCOPE_CONTAINER_PADDING.left,
    y: minY - SCOPE_CONTAINER_PADDING.top,
  };
  const nextWidth = Math.max(
    minSize.width,
    maxX - minX + SCOPE_CONTAINER_PADDING.left + SCOPE_CONTAINER_PADDING.right,
  );
  const nextHeight = Math.max(
    minSize.height,
    maxY - minY + SCOPE_CONTAINER_PADDING.top + SCOPE_CONTAINER_PADDING.bottom,
  );

  const positionChanged = scopeNode.position.x !== nextPosition.x || scopeNode.position.y !== nextPosition.y;
  const sizeChanged = scopeNode.data.nodeWidth !== nextWidth || scopeNode.data.nodeHeight !== nextHeight;
  if (!positionChanged && !sizeChanged) return false;

  if (positionChanged) {
    scopeNode.position = nextPosition;
  }
  if (sizeChanged) {
    scopeNode.data = {
      ...scopeNode.data,
      nodeWidth: nextWidth,
      nodeHeight: nextHeight,
    };
  }
  return true;
}

export function syncAllScopeBoundaryLayouts(nodes: Workflow['nodes']): boolean {
  let changed = false;
  const scopeNodeIds = nodes
    .filter(node => isScopeBoundaryWorkflowNode(node))
    .map(node => node.id);

  for (let i = scopeNodeIds.length - 1; i >= 0; i -= 1) {
    changed = syncScopeBoundaryLayout(nodes, scopeNodeIds[i]) || changed;
  }
  return changed;
}

export function shiftScopeChildren(
  nodes: Workflow['nodes'],
  scopeNodeId: string,
  dx: number,
  dy: number,
  skippedNodeIds: Set<string>,
): void {
  if (dx === 0 && dy === 0) return;

  for (const child of nodes.filter(node => getCompositeParentId(node) === scopeNodeId)) {
    if (!skippedNodeIds.has(child.id)) {
      child.position = {
        x: child.position.x + dx,
        y: child.position.y + dy,
      };
      skippedNodeIds.add(child.id);
    }
    if (isScopeBoundaryWorkflowNode(child)) {
      shiftScopeChildren(nodes, child.id, dx, dy, skippedNodeIds);
    }
  }
}

export function createLoopBoundaryLabel(loopNode: Workflow['nodes'][0], type: 'start' | 'end'): string {
  return `${loopNode.label || '循环'}${type === 'start' ? '开始' : '结束'}`;
}

export function ensureLoopBodyBoundaryNodes(nodes: Workflow['nodes'], edges: Workflow['edges']): boolean {
  let changed = false;

  for (const bodyNode of nodes) {
    if (bodyNode.type !== LOOP_BODY_NODE_TYPE || bodyNode.composite?.role !== LOOP_BODY_ROLE) continue;

    const children = nodes.filter(node => getCompositeParentId(node) === bodyNode.id);
    for (const child of children) {
      const isBoundaryChild = child.type === 'start' || child.type === 'end';
      if (
        child.composite?.rootId === bodyNode.id
        && child.composite?.parentId === bodyNode.id
        && (!isBoundaryChild || (child.composite.generated === true && child.composite.hidden === false))
      ) {
        continue;
      }
      child.composite = {
        ...(child.composite || {}),
        rootId: bodyNode.id,
        parentId: bodyNode.id,
        ...(isBoundaryChild ? { generated: true, hidden: false } : {}),
      };
      changed = true;
    }

    const loopNode = nodes.find(node => node.id === bodyNode.composite?.rootId) || bodyNode;
    let startNode = children.find(node => node.type === 'start');
    let endNode = children.find(node => node.type === 'end');
    const hadStartNode = !!startNode;
    const hadEndNode = !!endNode;

    if (!startNode) {
      startNode = {
        id: createWorkflowNodeId(),
        type: 'start',
        label: createLoopBoundaryLabel(loopNode, 'start'),
        position: { x: bodyNode.position.x + 80, y: bodyNode.position.y + 140 },
        data: {},
        composite: {
          rootId: bodyNode.id,
          parentId: bodyNode.id,
          generated: true,
          hidden: false,
        },
      };
      nodes.push(startNode);
      changed = true;
    }

    if (!endNode) {
      endNode = {
        id: createWorkflowNodeId(),
        type: 'end',
        label: createLoopBoundaryLabel(loopNode, 'end'),
        position: { x: bodyNode.position.x + 420, y: bodyNode.position.y + 140 },
        data: {},
        composite: {
          rootId: bodyNode.id,
          parentId: bodyNode.id,
          generated: true,
          hidden: false,
        },
      };
      nodes.push(endNode);
      changed = true;
    }

    const entryEdgeId = createWorkflowEdgeId({
      source: bodyNode.id,
      target: startNode.id,
      sourceHandle: null,
      targetHandle: 'target',
    });
    const entryEdge = edges.find(edge => edge.id === entryEdgeId);
    const entryComposite = {
      rootId: bodyNode.id,
      parentId: bodyNode.id,
      generated: true,
      hidden: true,
      locked: true,
    };
    if (entryEdge) {
      if (
        entryEdge.sourceHandle !== null
        || entryEdge.targetHandle !== 'target'
        || entryEdge.composite?.rootId !== entryComposite.rootId
        || entryEdge.composite?.parentId !== entryComposite.parentId
        || entryEdge.composite?.generated !== true
        || entryEdge.composite?.hidden !== true
        || entryEdge.composite?.locked !== true
      ) {
        entryEdge.sourceHandle = null;
        entryEdge.targetHandle = 'target';
        entryEdge.composite = entryComposite;
        changed = true;
      }
    } else {
      edges.push({
        id: entryEdgeId,
        source: bodyNode.id,
        target: startNode.id,
        sourceHandle: null,
        targetHandle: 'target',
        composite: entryComposite,
      });
      changed = true;
    }

    if (!hadStartNode || !hadEndNode) {
      const startToEndId = createWorkflowEdgeId({
        source: startNode.id,
        target: endNode.id,
        sourceHandle: null,
        targetHandle: 'target',
      });
      if (!edges.some(edge => edge.id === startToEndId)) {
        edges.push({
          id: startToEndId,
          source: startNode.id,
          target: endNode.id,
          sourceHandle: null,
          targetHandle: 'target',
        });
        changed = true;
      }
    }
  }

  return changed;
}

// ---- Node creation ----

export function createNodesForDefinition(
  type: string,
  position: { x: number; y: number },
  rootData?: Record<string, unknown>,
  scopeNode?: Workflow['nodes'][0] | null,
): { rootNode: Workflow['nodes'][0]; nodes: Workflow['nodes']; edges: Workflow['edges'] } | null {
  return createWorkflowNodesForDefinition({
    definitions: getAllNodeDefinitions(),
    type,
    position,
    rootData,
    scopeNode,
    createNodeId: createWorkflowNodeId,
    createEdgeId: createWorkflowEdgeId,
    getNodeSize: getLayoutNodeSize,
  });
}

export function getOutgoingSourceHandle(type: string): string | undefined {
  const def = getNodeDefinition(type);
  if (def?.compound && def.handles?.sourceHandles?.some(handle => handle.id === LOOP_NEXT_SOURCE_HANDLE)) {
    return LOOP_NEXT_SOURCE_HANDLE;
  }
  return undefined;
}

export function getInsertScopeNode(
  nodes: Workflow['nodes'],
  sourceNodeId?: string | null,
  sourceHandle?: string | null,
): Workflow['nodes'][0] | null {
  if (!sourceNodeId) return null;
  const sourceNode = nodes.find(node => node.id === sourceNodeId);
  if (sourceNode?.type === LOOP_BODY_NODE_TYPE) return sourceNode;
  if (sourceHandle === LOOP_BODY_SOURCE_HANDLE) {
    return findCompositeChildByRole(nodes, sourceNodeId, LOOP_BODY_ROLE) ?? null;
  }

  let current = sourceNode;
  while (current) {
    const parentId = getCompositeParentId(current);
    if (!parentId) return null;
    const parent = nodes.find(node => node.id === parentId);
    if (!parent) return null;
    if (isScopeBoundaryWorkflowNode(parent)) return parent;
    current = parent;
  }
  return null;
}
