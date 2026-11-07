'use client';

import React, { useCallback, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { Workflow } from '@agent-spaces/shared';
import type { DrawArea, DrawPoint, LocalPoint, LocalRect } from './workflow-canvas-types';
import { RectangleOverlayRect } from './workflow-canvas-overlays';
import { isPointInPolygon, pointsToSvgPath } from './workflow-canvas-helpers';

export function RectangleDrawTool({
  onComplete,
}: {
  onComplete: (area: DrawArea) => void;
}) {
  const [start, setStart] = useState<DrawPoint | null>(null);
  const [end, setEnd] = useState<DrawPoint | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  const getPoint = useCallback((event: React.PointerEvent<HTMLDivElement>): DrawPoint => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      clientX: event.clientX,
      clientY: event.clientY,
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  }, []);

  const reset = useCallback(() => {
    setStart(null);
    setEnd(null);
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getPoint(event);
    setStart(point);
    setEnd(point);
  }, [getPoint]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!start || event.buttons !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    setEnd(getPoint(event));
  }, [getPoint, start]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!start) return;
    event.preventDefault();
    event.stopPropagation();
    const finalEnd = getPoint(event);
    const width = Math.abs(finalEnd.x - start.x);
    const height = Math.abs(finalEnd.y - start.y);
    reset();
    if (width < 12 || height < 12) return;

    const minClientX = Math.min(start.clientX, finalEnd.clientX);
    const minClientY = Math.min(start.clientY, finalEnd.clientY);
    const maxClientX = Math.max(start.clientX, finalEnd.clientX);
    const maxClientY = Math.max(start.clientY, finalEnd.clientY);
    const position = screenToFlowPosition({ x: minClientX, y: minClientY }, { snapToGrid: false });
    const endPosition = screenToFlowPosition({ x: maxClientX, y: maxClientY }, { snapToGrid: false });

    onComplete({
      position: {
        x: Math.round(position.x),
        y: Math.round(position.y),
      },
      size: {
        width: Math.round(Math.abs(endPosition.x - position.x)),
        height: Math.round(Math.abs(endPosition.y - position.y)),
      },
    });
  }, [getPoint, onComplete, reset, screenToFlowPosition, start]);

  const rect: LocalRect | null = start && end
    ? {
        left: Math.min(start.x, end.x),
        top: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      }
    : null;

  return (
    <div
      className="nopan nodrag absolute inset-0 z-10 cursor-crosshair"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={reset}
    >
      {rect ? <RectangleOverlayRect rect={rect} /> : null}
    </div>
  );
}

export function LassoSelectionTool({
  workflow,
  onSelect,
}: {
  workflow: Workflow;
  onSelect: (ids: string[]) => void;
}) {
  const [points, setPoints] = useState<LocalPoint[]>([]);
  const pointsRef = useRef<LocalPoint[]>([]);
  const { flowToScreenPosition, getInternalNode } = useReactFlow();

  const getPoint = useCallback((event: React.PointerEvent<HTMLDivElement>): LocalPoint => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  }, []);

  const getSelectedNodeIds = useCallback((polygon: LocalPoint[], bounds: DOMRect) => {
    if (polygon.length < 3) return [];

    return workflow.nodes
      .filter((node) => {
        const internalNode = getInternalNode(node.id);
        if (!internalNode) return false;

        const { x, y } = internalNode.internals.positionAbsolute;
        const width = internalNode.measured.width ?? 0;
        const height = internalNode.measured.height ?? 0;
        if (width <= 0 || height <= 0) return false;

        const corners = [
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + height },
          { x, y: y + height },
        ].map((point) => {
          const screenPoint = flowToScreenPosition(point);
          return {
            x: screenPoint.x - bounds.left,
            y: screenPoint.y - bounds.top,
          };
        });

        return corners.every(point => isPointInPolygon(point, polygon));
      })
      .map(node => node.id);
  }, [flowToScreenPosition, getInternalNode, workflow.nodes]);

  const updateSelection = useCallback((nextPoints: LocalPoint[], bounds: DOMRect) => {
    onSelect(getSelectedNodeIds(nextPoints, bounds));
  }, [getSelectedNodeIds, onSelect]);

  const reset = useCallback(() => {
    pointsRef.current = [];
    setPoints([]);
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getPoint(event);
    const nextPoints = [point];
    pointsRef.current = nextPoints;
    setPoints(nextPoints);
  }, [getPoint]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.buttons !== 1 || pointsRef.current.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getPoint(event);
    const previous = pointsRef.current[pointsRef.current.length - 1];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < 3) return;

    const nextPoints = [...pointsRef.current, point];
    pointsRef.current = nextPoints;
    setPoints(nextPoints);
    updateSelection(nextPoints, event.currentTarget.getBoundingClientRect());
  }, [getPoint, updateSelection]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (pointsRef.current.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    updateSelection(pointsRef.current, event.currentTarget.getBoundingClientRect());
    event.currentTarget.releasePointerCapture(event.pointerId);
    reset();
  }, [reset, updateSelection]);

  const path = pointsToSvgPath(points);

  return (
    <div
      className="nopan nodrag absolute inset-0 z-10 cursor-crosshair"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={reset}
    >
      <svg className="pointer-events-none h-full w-full">
        {path && (
          <path
            d={path}
            fill="rgba(59, 130, 246, 0.12)"
            stroke="rgba(37, 99, 235, 0.9)"
            strokeDasharray="4 3"
            strokeWidth={1.5}
          />
        )}
      </svg>
    </div>
  );
}
