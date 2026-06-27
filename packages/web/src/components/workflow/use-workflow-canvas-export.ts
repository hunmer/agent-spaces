import React, { useCallback, useState } from 'react';
import { toPng, toJpeg } from 'html-to-image';
import { useReactFlow, getViewportForBounds, type Node, type Rect, type Viewport } from '@xyflow/react';

const EXPORT_MIN_WIDTH = 1024;
const EXPORT_MIN_HEIGHT = 768;
const EXPORT_MAX_SIZE = 4096;
const EXPORT_PADDING = 96;
const EXPORT_MIN_ZOOM = 0.001;
const EXPORT_MAX_ZOOM = 2;
const EXPORT_VIEWPORT_PADDING = 0.12;

function clampExportSize(value: number, min: number) {
  return Math.max(min, Math.min(EXPORT_MAX_SIZE, Math.ceil(value)));
}

function nextFrame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

function mergeBounds(a: Rect, b: Rect | null): Rect {
  if (!b) return a;
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function getRenderedNodesBounds(root: HTMLElement, nodes: Node[], viewport: Viewport): Rect | null {
  if (!Number.isFinite(viewport.zoom) || viewport.zoom <= 0) return null;

  const rootRect = root.getBoundingClientRect();
  const nodeIds = new Set(nodes.map(node => node.id));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const element of Array.from(root.querySelectorAll<HTMLElement>('.react-flow__node'))) {
    const nodeId = element.dataset.id;
    if (nodeId && !nodeIds.has(nodeId)) continue;

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    const left = (rect.left - rootRect.left - viewport.x) / viewport.zoom;
    const top = (rect.top - rootRect.top - viewport.y) / viewport.zoom;
    const right = (rect.right - rootRect.left - viewport.x) / viewport.zoom;
    const bottom = (rect.bottom - rootRect.top - viewport.y) / viewport.zoom;

    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function inlineSvgComputedStyles(root: HTMLElement) {
  const elements = Array.from(root.querySelectorAll<SVGElement>('.react-flow__edge path, .react-flow__edge circle'));
  const restore = elements.map((element) => {
    const previous = {
      stroke: element.style.stroke,
      strokeWidth: element.style.strokeWidth,
      strokeDasharray: element.style.strokeDasharray,
      fill: element.style.fill,
      filter: element.style.filter,
    };
    const computed = window.getComputedStyle(element);

    element.style.stroke = computed.stroke;
    element.style.strokeWidth = computed.strokeWidth;
    element.style.strokeDasharray = computed.strokeDasharray;
    element.style.fill = computed.fill;
    element.style.filter = computed.filter === 'none' ? '' : computed.filter;

    return () => {
      element.style.stroke = previous.stroke;
      element.style.strokeWidth = previous.strokeWidth;
      element.style.strokeDasharray = previous.strokeDasharray;
      element.style.fill = previous.fill;
      element.style.filter = previous.filter;
    };
  });

  return () => restore.forEach(item => item());
}

export function useCanvasExport(
  reactFlowWrapper: React.RefObject<HTMLDivElement | null>,
  workflowName: string,
) {
  const { getViewport, setViewport, getNodes, getNodesBounds } = useReactFlow();
  const [minimapVisible, setMinimapVisible] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('agent-spaces:workflow-minimap-visible') !== 'false';
  });
  const [isExporting, setIsExporting] = useState(false);

  const toggleMinimap = useCallback(() => {
    setMinimapVisible((current) => {
      const next = !current;
      try { localStorage.setItem('agent-spaces:workflow-minimap-visible', String(next)); } catch {}
      return next;
    });
  }, []);

  const exportCanvas = useCallback(async (format: 'png' | 'jpeg') => {
    const flowRoot = reactFlowWrapper.current;
    const viewportEl = flowRoot?.querySelector<HTMLElement>('.react-flow__viewport');
    if (!flowRoot || !viewportEl || isExporting) return;

    setIsExporting(true);
    const viewport = getViewport();
    let restoreSvgStyles: (() => void) | null = null;
    try {
      const nodes = getNodes();
      if (nodes.length === 0) return;

      const nodesBounds = mergeBounds(
        getNodesBounds(nodes),
        getRenderedNodesBounds(flowRoot, nodes, viewport),
      );
      const imageWidth = clampExportSize(nodesBounds.width + EXPORT_PADDING * 2, EXPORT_MIN_WIDTH);
      const imageHeight = clampExportSize(nodesBounds.height + EXPORT_PADDING * 2, EXPORT_MIN_HEIGHT);
      const { x, y, zoom } = getViewportForBounds(
        nodesBounds,
        imageWidth,
        imageHeight,
        EXPORT_MIN_ZOOM,
        EXPORT_MAX_ZOOM,
        EXPORT_VIEWPORT_PADDING,
      );

      await setViewport({ x, y, zoom }, { duration: 0 });
      await nextFrame();
      restoreSvgStyles = inlineSvgComputedStyles(viewportEl);

      const name = (workflowName || 'workflow').replace(/[^\p{L}\p{N}_-]+/gu, '-');
      const toImage = format === 'jpeg' ? toJpeg : toPng;
      const dataUrl = await toImage(viewportEl, {
        backgroundColor: format === 'jpeg' ? '#ffffff' : undefined,
        quality: format === 'jpeg' ? 0.95 : undefined,
        pixelRatio: 2,
        width: imageWidth,
        height: imageHeight,
        style: {
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          transform: `translate(${x}px, ${y}px) scale(${zoom})`,
        },
      });

      const link = document.createElement('a');
      link.download = `${name}-${Date.now()}.${format}`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('[WorkflowCanvas] export failed', error);
    } finally {
      restoreSvgStyles?.();
      void setViewport(viewport, { duration: 0 });
      setIsExporting(false);
    }
  }, [getNodes, getNodesBounds, getViewport, isExporting, setViewport, workflowName, reactFlowWrapper]);

  return { minimapVisible, isExporting, toggleMinimap, exportCanvas };
}
