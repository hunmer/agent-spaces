export type DragPreview = {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  delta: { x: number; y: number };
  backgroundColor: string;
};
type LoopBodyDragEventDetail = {
  nodeId: string;
  phase: 'start' | 'move' | 'end' | 'cancel';
  screenDelta: { x: number; y: number };
};
export type NodePreviewDragEventDetail = LoopBodyDragEventDetail;
export type DrawPoint = {
  clientX: number;
  clientY: number;
  x: number;
  y: number;
};
export type DrawArea = {
  position: { x: number; y: number };
  size: { width: number; height: number };
};
export type LocalPoint = { x: number; y: number };
export type LocalRect = { left: number; top: number; width: number; height: number };
export type WorkflowNodeResizePreviewEventDetail = {
  rect: { left: number; top: number; width: number; height: number } | null;
};
export type WorkflowNodeRuntimeSizeEventDetail = {
  nodeId: string;
  width: number;
  height: number;
};
export const GROUP_DRAG_PREVIEW_BACKGROUND = 'rgba(59,130,246,0.06)';
export const LOOP_BODY_DRAG_PREVIEW_BACKGROUND = 'rgba(6,182,212,0.06)';
