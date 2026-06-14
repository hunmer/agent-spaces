import type { NodeChange } from '@xyflow/react';
import type { LocalPoint } from './workflow-canvas-types';

export function areStringArraysEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function isNonNull<T>(value: T | null): value is T {
  return value !== null;
}

export function isPositionNodeChange(
  change: NodeChange,
): change is NodeChange & { type: 'position'; id: string; position: { x: number; y: number } } {
  return change.type === 'position' && !!change.position;
}

export function isConnectionEndOnCanvasNode(position: { x: number; y: number }) {
  return document.elementsFromPoint(position.x, position.y).some(element =>
    element.closest('.react-flow__node, .react-flow__handle')
  );
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
