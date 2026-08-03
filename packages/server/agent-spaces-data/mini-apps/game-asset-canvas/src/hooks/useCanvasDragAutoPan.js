import { useCallback, useEffect, useRef } from 'react';
import { getDragAutoPanDelta, isCanvasFileDrag } from '../utils/drag-auto-pan';
import { CANVAS_DROP_MIME } from '../utils/canvas-constants';

export default function useCanvasDragAutoPan({ canvasRef, onPan }) {
  const frameRef = useRef(null);
  const deltaRef = useRef({ x: 0, y: 0 });

  const stop = useCallback(() => {
    deltaRef.current = { x: 0, y: 0 };
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (frameRef.current !== null) return;
    const move = () => {
      frameRef.current = null;
      const delta = deltaRef.current;
      if (!delta.x && !delta.y) return;
      onPan(delta);
      frameRef.current = requestAnimationFrame(move);
    };
    frameRef.current = requestAnimationFrame(move);
  }, [onPan]);

  const handleDragOver = useCallback((event) => {
    if (!isCanvasFileDrag(event.dataTransfer, CANVAS_DROP_MIME)) {
      stop();
      return;
    }
    const rect = canvasRef.current?.getBoundingClientRect();
    const delta = getDragAutoPanDelta(event.clientX, event.clientY, rect);
    deltaRef.current = delta;
    if (delta.x || delta.y) start();
    else stop();
  }, [canvasRef, start, stop]);

  const handleDragLeave = useCallback((event) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || event.clientX <= rect.left || event.clientX >= rect.right
      || event.clientY <= rect.top || event.clientY >= rect.bottom) {
      stop();
    }
  }, [canvasRef, stop]);

  useEffect(() => {
    window.addEventListener('dragend', stop, true);
    window.addEventListener('drop', stop, true);
    return () => {
      window.removeEventListener('dragend', stop, true);
      window.removeEventListener('drop', stop, true);
      stop();
    };
  }, [stop]);

  return { handleDragOver, handleDragLeave, stop };
}
