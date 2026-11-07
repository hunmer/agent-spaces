'use client';

import type { DragPreview, LocalRect } from './workflow-canvas-types';

export function DragPreviewOverlay({ preview }: { preview: DragPreview }) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: preview.bounds.x + preview.delta.x,
        top: preview.bounds.y + preview.delta.y,
        width: preview.bounds.width,
        height: preview.bounds.height,
        border: '2px solid var(--primary)',
        borderRadius: 8,
        backgroundColor: preview.backgroundColor,
        boxShadow: '0 0 0 1px rgba(255,255,255,0.6)',
        zIndex: 2,
      }}
    />
  );
}

export function RectangleOverlayRect({ rect }: { rect: LocalRect }) {
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-md border-2 border-dashed border-primary bg-primary/10 shadow-sm"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
    />
  );
}
