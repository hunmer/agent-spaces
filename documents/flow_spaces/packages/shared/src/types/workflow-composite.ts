// ============================================================
// Workflow Composite Node Utilities
// ============================================================
// Pure functions for composite node traversal (loop, group, etc.)

import type { EmbeddedWorkflow, WorkflowNode, WorkflowEdge } from './workflow.js'

// ---- Loop Constants ----

export const LOOP_NODE_TYPE = 'loop'
export const LOOP_BODY_NODE_TYPE = 'loop_body'
export const LOOP_BREAK_NODE_TYPE = 'loop_break'
export const LOOP_ROOT_ROLE = 'loop'
export const LOOP_BODY_ROLE = 'loop_body'
export const LOOP_BODY_SOURCE_HANDLE = 'loop-body'
export const LOOP_NEXT_SOURCE_HANDLE = 'loop-next'

// ---- Node Lookup ----

export function findWorkflowNode(nodes: WorkflowNode[], nodeId: string | null | undefined): WorkflowNode | undefined {
  if (!nodeId) return undefined
  return nodes.find((node) => node.id === nodeId)
}

// ---- Composite Meta Helpers ----

export function getCompositeRootId(node: WorkflowNode): string {
  return node.composite?.rootId || node.id
}

export function getCompositeParentId(node: WorkflowNode): string | null {
  return node.composite?.parentId ?? null
}

export function isGeneratedWorkflowNode(node: WorkflowNode): boolean {
  return !!node.composite?.generated
}

export function isHiddenWorkflowNode(node: WorkflowNode): boolean {
  return !!node.composite?.hidden
}

export function isScopeBoundaryWorkflowNode(node: WorkflowNode): boolean {
  return !!node.composite?.scopeBoundary
}

export function isGeneratedWorkflowEdge(edge: WorkflowEdge): boolean {
  return !!edge.composite?.generated
}

export function isHiddenWorkflowEdge(edge: WorkflowEdge): boolean {
  return !!edge.composite?.hidden
}

export function isLockedWorkflowEdge(edge: WorkflowEdge): boolean {
  return !!edge.composite?.locked
}

export function isReferenceWorkflowEdge(edge: WorkflowEdge): boolean {
  return edge.edgeKind === 'reference'
}

export function isRuntimeWorkflowEdge(edge: WorkflowEdge): boolean {
  return edge.edgeKind !== 'reference'
}

// ---- Composite Tree Traversal ----

export function findCompositeChildren(nodes: WorkflowNode[], parentId: string): WorkflowNode[] {
  return nodes.filter((node) => getCompositeParentId(node) === parentId)
}

export function findCompositeChildByRole(
  nodes: WorkflowNode[],
  rootId: string,
  role: string,
): WorkflowNode | undefined {
  return nodes.find((node) => node.composite?.rootId === rootId && node.composite?.role === role)
}

export function isNodeDescendantOf(
  nodes: WorkflowNode[],
  nodeOrId: WorkflowNode | string,
  ancestorId: string,
): boolean {
  let current = typeof nodeOrId === 'string' ? findWorkflowNode(nodes, nodeOrId) : nodeOrId
  while (current) {
    const parentId = getCompositeParentId(current)
    if (!parentId) return false
    if (parentId === ancestorId) return true
    current = findWorkflowNode(nodes, parentId)
  }
  return false
}

export function getNearestScopeAnchorId(
  nodes: WorkflowNode[],
  nodeOrId: WorkflowNode | string,
): string | null {
  const currentNode = typeof nodeOrId === 'string' ? findWorkflowNode(nodes, nodeOrId) : nodeOrId
  if (!currentNode) return null
  if (isScopeBoundaryWorkflowNode(currentNode)) {
    return currentNode.id
  }

  let current = currentNode
  while (current) {
    const parentId = getCompositeParentId(current)
    if (!parentId) return null
    const parent = findWorkflowNode(nodes, parentId)
    if (!parent) return null
    if (isScopeBoundaryWorkflowNode(parent)) {
      return parent.id
    }
    current = parent
  }
  return null
}

export function getNodesForExecutionScope(
  nodes: WorkflowNode[],
  scopeAnchorId: string | null,
): WorkflowNode[] {
  return nodes.filter((node) => {
    if (isHiddenWorkflowNode(node)) return false
    return getNearestScopeAnchorId(nodes, node) === scopeAnchorId
  })
}

// ---- Embedded Workflow Factory ----

type CreateId = () => string

interface DefaultEmbeddedWorkflowOptions {
  boundaryLabelPrefix?: string
}

function defaultCreateId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function createBoundaryNode(
  type: 'start' | 'end',
  label: string,
  position: { x: number; y: number },
  createId: CreateId,
): WorkflowNode {
  return {
    id: createId(),
    type,
    label,
    position,
    data: {},
  }
}

function createBoundaryLabel(type: 'start' | 'end', prefix?: string): string {
  const suffix = type === 'start' ? '开始' : '结束'
  return prefix ? `${prefix}${suffix}` : suffix
}

export function createDefaultEmbeddedWorkflow(
  createId: CreateId = defaultCreateId,
  options: DefaultEmbeddedWorkflowOptions = {},
): EmbeddedWorkflow {
  const startNode = createBoundaryNode('start', createBoundaryLabel('start', options.boundaryLabelPrefix), { x: 80, y: 140 }, createId)
  const endNode = createBoundaryNode('end', createBoundaryLabel('end', options.boundaryLabelPrefix), { x: 420, y: 140 }, createId)

  return {
    nodes: [startNode, endNode],
    edges: [
      {
        id: `e-${startNode.id}-${endNode.id}`,
        source: startNode.id,
        target: endNode.id,
      },
    ],
  }
}

export function normalizeEmbeddedWorkflow(
  value: unknown,
  createId: CreateId = defaultCreateId,
): EmbeddedWorkflow {
  if (
    value
    && typeof value === 'object'
    && Array.isArray((value as EmbeddedWorkflow).nodes)
    && Array.isArray((value as EmbeddedWorkflow).edges)
  ) {
    return value as EmbeddedWorkflow
  }

  return createDefaultEmbeddedWorkflow(createId)
}
