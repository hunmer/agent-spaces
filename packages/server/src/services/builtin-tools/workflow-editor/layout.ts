import Dagre from '@dagrejs/dagre';
import type { NodeTypeDefinition, WorkflowEdge, WorkflowNode } from '@agent-spaces/shared';
import {
  getCompositeParentId,
  isHiddenWorkflowEdge,
  isHiddenWorkflowNode,
  isScopeBoundaryWorkflowNode,
  LOOP_BODY_NODE_TYPE,
} from '@agent-spaces/shared';

const SCOPE_CONTAINER_PADDING = { top: 80, right: 100, bottom: 80, left: 80 };
const MIN_SCOPE_CONTAINER_SIZE = { width: 220, height: 160 };
const LOOP_BODY_MIN_SCOPE_CONTAINER_SIZE = { width: 150, height: 260 };

export function layoutNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  definitions: NodeTypeDefinition[],
  direction: 'LR' | 'TB',
): WorkflowNode[] {
  let nextNodes = nodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data } }));
  nextNodes = layoutScopeNodes(nextNodes, edges, definitions, direction, null);

  const scopeNodeIds = nextNodes
    .filter((node) => !isHiddenWorkflowNode(node) && isScopeBoundaryWorkflowNode(node))
    .map((node) => node.id);

  for (const scopeNodeId of scopeNodeIds) {
    nextNodes = layoutScopeNodes(nextNodes, edges, definitions, direction, scopeNodeId);
    syncScopeBoundaryLayout(nextNodes, definitions, scopeNodeId);
  }

  return nextNodes;
}

function layoutScopeNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  definitions: NodeTypeDefinition[],
  direction: 'LR' | 'TB',
  scopeNodeId: string | null,
): WorkflowNode[] {
  const graph = new Dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 });

  const definitionByType = new Map(definitions.map((definition) => [definition.type, definition]));
  const layoutNodes = nodes.filter((node) => !isHiddenWorkflowNode(node) && getCompositeParentId(node) === scopeNodeId);
  const layoutNodeIds = new Set(layoutNodes.map((node) => node.id));
  const nodeSizes = new Map<string, { width: number; height: number }>();
  const scopeNode = scopeNodeId ? nodes.find((node) => node.id === scopeNodeId) : null;

  for (const node of layoutNodes) {
    const definition = definitionByType.get(node.type);
    const size = {
      width: typeof node.data?.nodeWidth === 'number' ? node.data.nodeWidth : definition?.customViewMinSize?.width || 220,
      height: typeof node.data?.nodeHeight === 'number' ? node.data.nodeHeight : definition?.customViewMinSize?.height || 120,
    };
    nodeSizes.set(node.id, size);
    graph.setNode(node.id, size);
  }

  for (const edge of edges.filter((edge) =>
    !isHiddenWorkflowEdge(edge)
    && layoutNodeIds.has(edge.source)
    && layoutNodeIds.has(edge.target)
  )) {
    graph.setEdge(edge.source, edge.target);
  }

  Dagre.layout(graph);

  const nextNodes = nodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data } }));
  const nodeById = new Map(nextNodes.map((node) => [node.id, node]));
  const bounds = getLayoutGraphBounds(layoutNodes, graph, nodeSizes);
  const scopeOffset = scopeNode && bounds ? {
    x: scopeNode.position.x + SCOPE_CONTAINER_PADDING.left - bounds.minX,
    y: scopeNode.position.y + SCOPE_CONTAINER_PADDING.top - bounds.minY,
  } : { x: 0, y: 0 };

  for (const node of layoutNodes) {
    const nextNode = nodeById.get(node.id);
    const layoutPosition = graph.node(node.id);
    const size = nodeSizes.get(node.id);
    if (!nextNode || !layoutPosition) continue;

    const nextPosition = {
      x: layoutPosition.x - (size?.width ?? 220) / 2 + scopeOffset.x,
      y: layoutPosition.y - (size?.height ?? 120) / 2 + scopeOffset.y,
    };

    if (isScopeBoundaryWorkflowNode(nextNode)) {
      const dx = nextPosition.x - nextNode.position.x;
      const dy = nextPosition.y - nextNode.position.y;
      for (const child of nextNodes.filter((item) => getCompositeParentId(item) === nextNode.id)) {
        child.position = {
          x: child.position.x + dx,
          y: child.position.y + dy,
        };
      }
    }

    nextNode.position = nextPosition;
  }

  return nextNodes;
}

function getLayoutGraphBounds(
  layoutNodes: WorkflowNode[],
  graph: InstanceType<typeof Dagre.graphlib.Graph>,
  nodeSizes: Map<string, { width: number; height: number }>,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!layoutNodes.length) return null;

  const bounds = layoutNodes
    .map((node) => {
      const layoutPosition = graph.node(node.id) as { x?: number; y?: number } | undefined;
      const size = nodeSizes.get(node.id);
      if (typeof layoutPosition?.x !== 'number' || typeof layoutPosition.y !== 'number' || !size) return null;
      return {
        minX: layoutPosition.x - size.width / 2,
        minY: layoutPosition.y - size.height / 2,
        maxX: layoutPosition.x + size.width / 2,
        maxY: layoutPosition.y + size.height / 2,
      };
    })
    .filter((item): item is { minX: number; minY: number; maxX: number; maxY: number } => !!item);

  if (!bounds.length) return null;
  return {
    minX: Math.min(...bounds.map((item) => item.minX)),
    minY: Math.min(...bounds.map((item) => item.minY)),
    maxX: Math.max(...bounds.map((item) => item.maxX)),
    maxY: Math.max(...bounds.map((item) => item.maxY)),
  };
}

function syncScopeBoundaryLayout(
  nodes: WorkflowNode[],
  definitions: NodeTypeDefinition[],
  scopeNodeId: string,
): void {
  const scopeNode = nodes.find((node) => node.id === scopeNodeId);
  if (!scopeNode || !isScopeBoundaryWorkflowNode(scopeNode)) return;

  const children = nodes.filter((node) => getCompositeParentId(node) === scopeNodeId && !isHiddenWorkflowNode(node));
  if (!children.length) return;

  const minX = Math.min(...children.map((node) => node.position.x));
  const minY = Math.min(...children.map((node) => node.position.y));
  const maxX = Math.max(...children.map((node) => {
    const size = getWorkflowNodeSize(node, definitions);
    return node.position.x + size.width;
  }));
  const maxY = Math.max(...children.map((node) => {
    const size = getWorkflowNodeSize(node, definitions);
    return node.position.y + size.height;
  }));
  const minSize = scopeNode.type === LOOP_BODY_NODE_TYPE ? LOOP_BODY_MIN_SCOPE_CONTAINER_SIZE : MIN_SCOPE_CONTAINER_SIZE;

  scopeNode.position = {
    x: minX - SCOPE_CONTAINER_PADDING.left,
    y: minY - SCOPE_CONTAINER_PADDING.top,
  };
  scopeNode.data = {
    ...scopeNode.data,
    nodeWidth: Math.max(minSize.width, maxX - minX + SCOPE_CONTAINER_PADDING.left + SCOPE_CONTAINER_PADDING.right),
    nodeHeight: Math.max(minSize.height, maxY - minY + SCOPE_CONTAINER_PADDING.top + SCOPE_CONTAINER_PADDING.bottom),
  };
}

function getWorkflowNodeSize(
  node: WorkflowNode,
  definitions: NodeTypeDefinition[],
): { width: number; height: number } {
  const definition = definitions.find((item) => item.type === node.type);
  return {
    width: typeof node.data?.nodeWidth === 'number'
      ? node.data.nodeWidth
      : typeof node.data?.width === 'number' ? node.data.width : definition?.customViewMinSize?.width || 220,
    height: typeof node.data?.nodeHeight === 'number'
      ? node.data.nodeHeight
      : typeof node.data?.height === 'number' ? node.data.height : definition?.customViewMinSize?.height || 120,
  };
}

export function countPositionChanges(before: WorkflowNode[], after: WorkflowNode[]): number {
  const beforeById = new Map(before.map((node) => [node.id, node.position]));
  return after.filter((node) => {
    const previous = beforeById.get(node.id);
    return previous && (previous.x !== node.position.x || previous.y !== node.position.y);
  }).length;
}
