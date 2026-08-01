import type { NodeChange } from '@xyflow/react';
import type { LocalPoint } from './workflow-canvas-types';

export function areStringArraysEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function isNonNull<T>(value: T | null): value is T {
  return value !== null;
}

export function findSmallestContainingRectId(
  point: { x: number; y: number },
  targets: Array<{ id: string; rect: { left: number; top: number; right: number; bottom: number } }>,
) {
  return targets
    .filter(({ rect }) => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom)
    .sort((a, b) => (a.rect.right - a.rect.left) * (a.rect.bottom - a.rect.top)
      - (b.rect.right - b.rect.left) * (b.rect.bottom - b.rect.top))[0]?.id ?? null;
}

export function resolveGroupBoundsNode<T>(liveNode: T, initialNode: T | undefined, freeze: boolean) {
  return freeze && initialNode ? initialNode : liveNode;
}

export function addCloneToSourceGroups<T extends { childNodeIds: string[] }>(
  groups: T[] | undefined,
  sourceNodeId: string,
  clonedNodeId: string,
) {
  return groups?.map(group => group.childNodeIds.includes(sourceNodeId)
    ? { ...group, childNodeIds: [...group.childNodeIds, clonedNodeId] }
    : group);
}

export function appendImmediateCanvasClone<T extends {
  id: string;
  position: { x: number; y: number };
}>(nodes: T[], sourceNode: T, clonedNodeId: string): T[] {
  return [...nodes, {
    ...sourceNode,
    id: clonedNodeId,
    position: { ...sourceNode.position },
    selected: false,
    dragging: false,
  }];
}

export function getGridLayoutPositions(
  nodes: Array<{ id: string; width: number; height: number; badgeLeft: number; badgeTop: number }>,
  columns: number,
  horizontalGap: number,
  verticalGap: number,
) {
  const columnCount = Math.max(1, Math.min(columns, nodes.length));
  const columnWidths = Array.from({ length: columnCount }, () => 0);
  const rowHeights = Array.from({ length: Math.ceil(nodes.length / columnCount) }, () => 0);
  nodes.forEach((node, index) => {
    columnWidths[index % columnCount] = Math.max(columnWidths[index % columnCount], node.width);
    rowHeights[Math.floor(index / columnCount)] = Math.max(rowHeights[Math.floor(index / columnCount)], node.height);
  });

  let x = 0;
  const columnX = columnWidths.map(width => {
    const current = x;
    x += width + horizontalGap;
    return current;
  });
  let y = 0;
  const rowY = rowHeights.map(height => {
    const current = y;
    y += height + verticalGap;
    return current;
  });

  return new Map(nodes.map((node, index) => [node.id, {
    x: columnX[index % columnCount] + node.badgeLeft,
    y: rowY[Math.floor(index / columnCount)] + node.badgeTop,
  }]));
}

export function alignAutoLayoutLayers(
  nodes: Array<{ id: string; width: number; height: number; badgeLeft: number; badgeTop: number }>,
  edges: Array<{ source: string; target: string }>,
  positions: Map<string, { x: number; y: number }>,
  direction: 'LR' | 'TB',
  layerGap: number,
) {
  const nodeIds = new Set(nodes.map(node => node.id));
  const indegree = new Map(nodes.map(node => [node.id, 0]));
  const outgoing = new Map(nodes.map(node => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target) continue;
    outgoing.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const layers = new Map(nodes.map(node => [node.id, 0]));
  const queue = nodes.filter(node => indegree.get(node.id) === 0).map(node => node.id);
  for (let index = 0; index < queue.length; index += 1) {
    const sourceId = queue[index];
    for (const targetId of outgoing.get(sourceId) ?? []) {
      layers.set(targetId, Math.max(layers.get(targetId) ?? 0, (layers.get(sourceId) ?? 0) + 1));
      const nextIndegree = (indegree.get(targetId) ?? 1) - 1;
      indegree.set(targetId, nextIndegree);
      if (nextIndegree === 0) queue.push(targetId);
    }
  }

  const nodesByLayer = new Map<number, typeof nodes>();
  for (const node of nodes) {
    const layer = layers.get(node.id) ?? 0;
    const layerNodes = nodesByLayer.get(layer);
    if (layerNodes) layerNodes.push(node);
    else nodesByLayer.set(layer, [node]);
  }
  const result = new Map(positions);
  let axis = 0;
  for (const [, layerNodes] of [...nodesByLayer.entries()].sort(([a], [b]) => a - b)) {
    for (const node of layerNodes) {
      const position = result.get(node.id);
      if (!position) continue;
      result.set(node.id, direction === 'TB'
        ? { ...position, y: axis + node.badgeTop }
        : { ...position, x: axis + node.badgeLeft });
    }
    axis += Math.max(...layerNodes.map(node => direction === 'TB' ? node.height : node.width)) + layerGap;
  }
  return result;
}

export function isPositionNodeChange(
  change: NodeChange,
): change is NodeChange & { type: 'position'; id: string; position: { x: number; y: number } } {
  return change.type === 'position' && !!change.position;
}

export function isConnectionEndOnCanvasNode(
  position: { x: number; y: number },
  options?: { ignoredNodeIds?: Set<string> },
) {
  const ignoredNodeIds = options?.ignoredNodeIds ?? new Set<string>();
  return document.elementsFromPoint(position.x, position.y).some((element) => {
    if (element.closest('.react-flow__handle')) return true;

    const nodeElement = element.closest<HTMLElement>('.react-flow__node');
    if (!nodeElement) return false;

    const nodeId = nodeElement.dataset.id;
    return !nodeId || !ignoredNodeIds.has(nodeId);
  });
}

export function isPointInPolygon(point: LocalPoint, polygon: LocalPoint[]) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const current = polygon[i];
    const previous = polygon[j];
    const intersects = ((current.y > point.y) !== (previous.y > point.y))
      && point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;

    if (intersects) inside = !inside;
  }

  return inside;
}

export function pointsToSvgPath(points: LocalPoint[]) {
  if (points.length === 0) return '';

  const [first, ...rest] = points;
  return [
    `M ${first.x} ${first.y}`,
    ...rest.map(point => `L ${point.x} ${point.y}`),
    points.length > 2 ? 'Z' : '',
  ].join(' ');
}
