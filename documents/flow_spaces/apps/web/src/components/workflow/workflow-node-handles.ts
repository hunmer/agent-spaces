import type { CSSProperties } from 'react';
import { Position } from '@xyflow/react';
import { HEADER_HEIGHT, HANDLE_MARGIN, type HandlePositionMode } from './workflow-node-types';

export const HANDLE_POSITION_MAP: Record<HandlePositionMode, { target: Position; source: Position }> = {
  'top-bottom': { target: Position.Top, source: Position.Bottom },
  'left-right': { target: Position.Left, source: Position.Right },
  'bottom-top': { target: Position.Bottom, source: Position.Top },
  'right-left': { target: Position.Right, source: Position.Left },
};

export const WORKFLOW_NODE_DRAG_HANDLE_CLASS = 'workflow-node-drag-handle';

export type HandleContext = {
  isLoopBody: boolean;
  nodeHeight: number;
  handlePositions: { target: Position; source: Position };
};

export function getHandleTop(index: number, total: number, ctx: HandleContext): string {
  if (ctx.isLoopBody) return `${((index + 1) / (total + 1)) * 100}%`;
  return `${HEADER_HEIGHT + HANDLE_MARGIN + ((ctx.nodeHeight - HEADER_HEIGHT - HANDLE_MARGIN * 2) / (total + 1)) * (index + 1)}px`;
}

export function getHandleOffset(index: number, total: number): string {
  return `${((index + 1) / (total + 1)) * 100}%`;
}

export function getHandleStyle(position: Position, index: number, total: number, ctx: HandleContext): CSSProperties | undefined {
  if (ctx.isLoopBody) return { top: getHandleTop(index, total, ctx) };
  if (position === Position.Left || position === Position.Right) {
    return { top: getHandleTop(index, total, ctx) };
  }
  return { left: getHandleOffset(index, total) };
}

export function getTargetHandleStyle(position: Position, ctx: HandleContext): CSSProperties | undefined {
  if (ctx.isLoopBody) {
    if (position === Position.Left || position === Position.Right) {
      return { top: `${HEADER_HEIGHT + HANDLE_MARGIN * 2}px` };
    }

    return { left: getHandleOffset(0, 1) };
  }

  return getHandleStyle(position, 0, 1, ctx);
}

export function getSourceLabelStyle(index: number, total: number, ctx: HandleContext): CSSProperties {
  const offset = getHandleOffset(index, total);
  if (ctx.handlePositions.source === Position.Left) {
    return { top: getHandleTop(index, total, ctx), left: 10, transform: 'translateY(-50%)' };
  }
  if (ctx.handlePositions.source === Position.Top) {
    return { left: offset, top: -16, transform: 'translateX(-50%)' };
  }
  if (ctx.handlePositions.source === Position.Bottom) {
    return { left: offset, bottom: -16, transform: 'translateX(-50%)' };
  }
  return { top: getHandleTop(index, total, ctx), right: 10, transform: 'translateY(-50%)' };
}
