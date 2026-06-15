import type { WorkflowEdge, WorkflowNode } from '@agent-spaces/shared';
import {
  findCompositeChildByRole,
  getCompositeParentId,
  isHiddenWorkflowNode,
  isScopeBoundaryWorkflowNode,
  LOOP_BODY_NODE_TYPE,
  LOOP_BODY_ROLE,
  LOOP_BODY_SOURCE_HANDLE,
} from '@agent-spaces/shared';
import { stringInput, stringInputAny } from './helpers.js';
import type { JsonRecord } from './types.js';

export function nextNodePosition(nodes: WorkflowNode[], scopeNode?: WorkflowNode | null): WorkflowNode['position'] {
  if (!scopeNode) {
    if (!nodes.length) return { x: 120, y: 120 };
    const maxX = Math.max(...nodes.map((node) => node.position.x));
    const avgY = nodes.reduce((sum, node) => sum + node.position.y, 0) / nodes.length;
    return { x: maxX + 260, y: Math.round(avgY) };
  }

  const children = nodes.filter((node) => getCompositeParentId(node) === scopeNode.id && !isHiddenWorkflowNode(node));
  if (!children.length) return { x: scopeNode.position.x + 80, y: scopeNode.position.y + 80 };
  const maxX = Math.max(...children.map((node) => node.position.x));
  const avgY = children.reduce((sum, node) => sum + node.position.y, 0) / children.length;
  return { x: maxX + 260, y: Math.round(avgY) };
}

export function resolveScopeNode(
  nodes: WorkflowNode[],
  input: JsonRecord,
): { success: true; scopeNode: WorkflowNode | null } | { success: false; message: string } {
  const scopeNodeId = stringInputAny(input, ['scopeNodeId', 'scope_node_id', 'parentId', 'parent_id']);
  if (scopeNodeId) {
    const scopeNode = nodes.find((node) => node.id === scopeNodeId);
    if (!scopeNode) return { success: false, message: `Scope node not found: ${scopeNodeId}` };
    if (!isScopeBoundaryWorkflowNode(scopeNode)) return { success: false, message: `Scope node is not a scope boundary: ${scopeNodeId}` };
    return { success: true, scopeNode };
  }

  return {
    success: true,
    scopeNode: getInsertScopeNode(
      nodes,
      stringInput(input, 'source'),
      stringInputAny(input, ['sourceHandle', 'source_handle']),
    ),
  };
}

export function getInsertScopeNode(
  nodes: WorkflowNode[],
  sourceNodeId?: string | null,
  sourceHandle?: string | null,
): WorkflowNode | null {
  if (!sourceNodeId) return null;
  const sourceNode = nodes.find((node) => node.id === sourceNodeId);
  if (sourceNode?.type === LOOP_BODY_NODE_TYPE) return sourceNode;
  if (sourceHandle === LOOP_BODY_SOURCE_HANDLE) {
    return findCompositeChildByRole(nodes, sourceNodeId, LOOP_BODY_ROLE) ?? null;
  }

  let current = sourceNode;
  while (current) {
    const parentId = getCompositeParentId(current);
    if (!parentId) return null;
    const parent = nodes.find((node) => node.id === parentId);
    if (!parent) return null;
    if (isScopeBoundaryWorkflowNode(parent)) return parent;
    current = parent;
  }
  return null;
}

export function replaceConflictingScopedEdges(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  edge: WorkflowEdge,
): { edges: WorkflowEdge[]; removedEdgeIds: string[] } {
  const sourceScopeId = getNodeScopeId(nodes, edge.source);
  const targetScopeId = getNodeScopeId(nodes, edge.target);
  if (!sourceScopeId || sourceScopeId !== targetScopeId) return { edges, removedEdgeIds: [] };

  const removedEdgeIds: string[] = [];
  const nextEdges = edges.filter((existing) => {
    if (existing.source === edge.source && existing.target === edge.target
      && normalizedHandle(existing.sourceHandle) === normalizedHandle(edge.sourceHandle)
      && normalizedHandle(existing.targetHandle) === normalizedHandle(edge.targetHandle)) {
      removedEdgeIds.push(existing.id);
      return false;
    }
    if (existing.composite?.locked) return true;
    if (getNodeScopeId(nodes, existing.source) !== sourceScopeId || getNodeScopeId(nodes, existing.target) !== sourceScopeId) {
      return true;
    }

    const conflictsWithSource = existing.source === edge.source
      && normalizedHandle(existing.sourceHandle) === normalizedHandle(edge.sourceHandle);
    const conflictsWithTarget = existing.target === edge.target
      && normalizedHandle(existing.targetHandle) === normalizedHandle(edge.targetHandle);
    if (!conflictsWithSource && !conflictsWithTarget) return true;

    removedEdgeIds.push(existing.id);
    return false;
  });

  return { edges: nextEdges, removedEdgeIds };
}

export function findReusableInsertNode(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  options: { type?: string; label?: string; data: JsonRecord; scopeNode: WorkflowNode | null },
): WorkflowNode | undefined {
  if (!options.type) return undefined;
  const scopeId = options.scopeNode?.id ?? null;
  return nodes.find((node) => {
    if (node.type !== options.type) return false;
    if (getCompositeParentId(node) !== scopeId) return false;
    if (isGeneratedWorkflowNodeLike(node)) return false;
    if (options.label && node.label !== options.label) return false;
    if (!objectContains(node.data ?? {}, options.data)) return false;
    return !edges.some((edge) => edge.source === node.id || edge.target === node.id);
  });
}

function isGeneratedWorkflowNodeLike(node: WorkflowNode): boolean {
  return !!node.composite?.generated;
}

function objectContains(actual: JsonRecord, expected: JsonRecord): boolean {
  return Object.entries(expected).every(([key, value]) => JSON.stringify(actual[key]) === JSON.stringify(value));
}

export function getNodeScopeId(nodes: WorkflowNode[], nodeId: string): string | null {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  return getCompositeParentId(node);
}

function normalizedHandle(value: string | null | undefined): string | null {
  return value ?? null;
}
