import type { NodeTypeDefinition, WorkflowEdge, WorkflowNode } from './workflow.js'
import { LOOP_BODY_NODE_TYPE } from './workflow-composite.js'

export interface WorkflowNodeFactoryOptions {
  definitions: NodeTypeDefinition[]
  type: string
  position: WorkflowNode['position']
  rootLabel?: string
  rootData?: Record<string, unknown>
  scopeNode?: WorkflowNode | null
  createNodeId?: () => string
  createEdgeId?: (edge: Pick<WorkflowEdge, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>) => string
  getNodeSize?: (node: WorkflowNode) => { width: number; height: number }
}

export interface WorkflowNodeFactoryResult {
  rootNode: WorkflowNode
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

const LOOP_BODY_MIN_SCOPE_CONTAINER_SIZE = { width: 150, height: 260 }
const SCOPE_CONTAINER_PADDING = { top: 80, right: 100, bottom: 80, left: 80 }

export function createWorkflowNodesForDefinition({
  definitions,
  type,
  position,
  rootLabel,
  rootData,
  scopeNode,
  createNodeId = defaultCreateWorkflowNodeId,
  createEdgeId = defaultCreateWorkflowEdgeId,
  getNodeSize = defaultWorkflowNodeSize,
}: WorkflowNodeFactoryOptions): WorkflowNodeFactoryResult | null {
  const definitionByType = new Map(definitions.map((definition) => [definition.type, definition]))
  const definition = definitionByType.get(type)
  const scopeComposite = scopeNode
    ? {
        rootId: scopeNode.composite?.rootId || scopeNode.id,
        parentId: scopeNode.id,
        generated: false,
        hidden: false,
      }
    : undefined

  if (!definition?.compound) {
    const rootNode: WorkflowNode = {
      id: createNodeId(),
      type,
      label: rootLabel || definition?.label || type,
      position,
      data: { ...createDefaultNodeData(definition), ...(rootData || {}) },
      composite: scopeComposite,
    }
    return { rootNode, nodes: [rootNode], edges: [] }
  }

  const roleMap = new Map<string, WorkflowNode>()
  const rootRole = definition.compound.rootRole || definition.compound.children[0]?.role
  if (!rootRole) return null

  for (const childDef of definition.compound.children) {
    const isRoot = childDef.role === rootRole
    const childDefinition = definitionByType.get(childDef.type)
    const offset = childDef.offset || { x: 0, y: 0 }
    const node: WorkflowNode = {
      id: createNodeId(),
      type: childDef.type,
      label: isRoot
        ? rootLabel || definition.label || childDef.label || childDef.type
        : childDef.label || childDefinition?.label || childDef.type,
      position: {
        x: position.x + offset.x,
        y: position.y + offset.y,
      },
      data: {
        ...createDefaultNodeData(childDefinition),
        ...(childDef.data ? clone(childDef.data) : {}),
        ...(isRoot && rootData ? rootData : {}),
      },
      composite: {
        role: childDef.role,
        generated: !isRoot,
        hidden: !!childDef.hidden,
        scopeBoundary: !!childDef.scopeBoundary,
      },
    }
    roleMap.set(childDef.role, node)
  }

  const rootNode = roleMap.get(rootRole)
  if (!rootNode) return null

  rootNode.composite = {
    ...(rootNode.composite || {}),
    rootId: rootNode.id,
    parentId: null,
    generated: false,
    hidden: false,
  }

  for (const childDef of definition.compound.children) {
    const node = roleMap.get(childDef.role)
    if (!node || node.id === rootNode.id) continue
    const parentNode = roleMap.get(childDef.parentRole || rootRole)
    node.composite = {
      ...(node.composite || {}),
      rootId: rootNode.id,
      parentId: parentNode?.id || rootNode.id,
    }
  }

  if (scopeNode) {
    for (const node of roleMap.values()) {
      node.composite = {
        ...(node.composite || {}),
        rootId: scopeNode.composite?.rootId || scopeNode.id,
        parentId: scopeNode.id,
      }
    }
  }

  const edges: WorkflowEdge[] = []
  for (const edgeDef of definition.compound.edges || []) {
    const sourceNode = roleMap.get(edgeDef.sourceRole)
    const targetNode = roleMap.get(edgeDef.targetRole)
    if (!sourceNode || !targetNode) continue
    const edge = {
      source: sourceNode.id,
      target: targetNode.id,
      sourceHandle: edgeDef.sourceHandle ?? null,
      targetHandle: edgeDef.targetHandle ?? null,
    }
    edges.push({
      id: createEdgeId(edge),
      ...edge,
      composite: {
        rootId: rootNode.id,
        parentId: sourceNode.id,
        generated: true,
        hidden: !!edgeDef.hidden,
        locked: !!edgeDef.locked,
      },
    })
  }

  const nodes = [rootNode, ...Array.from(roleMap.values()).filter((node) => node.id !== rootNode.id)]
  const bodyNode = Array.from(roleMap.values()).find((node) => node.type === LOOP_BODY_NODE_TYPE)
  if (bodyNode) {
    const boundaries = createLoopBodyBoundaryNodes(rootNode, bodyNode, createNodeId, createEdgeId)
    nodes.push(...boundaries.nodes)
    edges.push(...boundaries.edges)
    syncScopeBoundaryLayout(nodes, bodyNode.id, getNodeSize)
  }

  return { rootNode, nodes, edges }
}

function createDefaultNodeData(definition: NodeTypeDefinition | undefined): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const property of definition?.properties ?? []) {
    if (property.default !== undefined) data[property.key] = clone(property.default)
  }
  if (definition?.outputs?.length) data.outputs = clone(definition.outputs)
  return data
}

function createLoopBodyBoundaryNodes(
  loopNode: WorkflowNode,
  bodyNode: WorkflowNode,
  createNodeId: () => string,
  createEdgeId: NonNullable<WorkflowNodeFactoryOptions['createEdgeId']>,
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const startNode: WorkflowNode = {
    id: createNodeId(),
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
  }
  const endNode: WorkflowNode = {
    id: createNodeId(),
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
  }

  const entryEdge = {
    source: bodyNode.id,
    target: startNode.id,
    sourceHandle: null,
    targetHandle: 'target',
  }
  const defaultEdge = {
    source: startNode.id,
    target: endNode.id,
    sourceHandle: null,
    targetHandle: 'target',
  }

  return {
    nodes: [startNode, endNode],
    edges: [
      {
        id: createEdgeId(entryEdge),
        ...entryEdge,
        composite: {
          rootId: bodyNode.id,
          parentId: bodyNode.id,
          generated: true,
          hidden: true,
          locked: true,
        },
      },
      {
        id: createEdgeId(defaultEdge),
        ...defaultEdge,
      },
    ],
  }
}

function createLoopBoundaryLabel(loopNode: WorkflowNode, type: 'start' | 'end'): string {
  return `${loopNode.label || '循环'}${type === 'start' ? '开始' : '结束'}`
}

function syncScopeBoundaryLayout(
  nodes: WorkflowNode[],
  scopeNodeId: string,
  getNodeSize: NonNullable<WorkflowNodeFactoryOptions['getNodeSize']>,
): void {
  const scopeNode = nodes.find((node) => node.id === scopeNodeId)
  if (!scopeNode?.composite?.scopeBoundary) return

  const children = nodes.filter((node) => node.composite?.parentId === scopeNodeId && !node.composite?.hidden)
  if (!children.length) return

  const minX = Math.min(...children.map((node) => node.position.x))
  const minY = Math.min(...children.map((node) => node.position.y))
  const maxX = Math.max(...children.map((node) => node.position.x + getNodeSize(node).width))
  const maxY = Math.max(...children.map((node) => node.position.y + getNodeSize(node).height))

  scopeNode.position = {
    x: minX - SCOPE_CONTAINER_PADDING.left,
    y: minY - SCOPE_CONTAINER_PADDING.top,
  }
  scopeNode.data = {
    ...scopeNode.data,
    nodeWidth: Math.max(
      LOOP_BODY_MIN_SCOPE_CONTAINER_SIZE.width,
      maxX - minX + SCOPE_CONTAINER_PADDING.left + SCOPE_CONTAINER_PADDING.right,
    ),
    nodeHeight: Math.max(
      LOOP_BODY_MIN_SCOPE_CONTAINER_SIZE.height,
      maxY - minY + SCOPE_CONTAINER_PADDING.top + SCOPE_CONTAINER_PADDING.bottom,
    ),
  }
}

function defaultCreateWorkflowNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function defaultCreateWorkflowEdgeId({
  source,
  target,
  sourceHandle,
  targetHandle,
}: Pick<WorkflowEdge, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>): string {
  return `e-${source}-${sourceHandle || 'source'}-${target}-${targetHandle || 'target'}`
}

function defaultWorkflowNodeSize(node: WorkflowNode): { width: number; height: number } {
  return {
    width: typeof node.data?.nodeWidth === 'number'
      ? node.data.nodeWidth
      : typeof node.data?.width === 'number' ? node.data.width : 220,
    height: typeof node.data?.nodeHeight === 'number'
      ? node.data.nodeHeight
      : typeof node.data?.height === 'number' ? node.data.height : 120,
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
