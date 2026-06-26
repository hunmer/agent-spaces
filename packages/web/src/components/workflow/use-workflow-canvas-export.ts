import React, { useCallback, useState } from 'react';
import { toPng, toJpeg } from 'html-to-image';
import { useReactFlow, getNodesBounds, getViewportForBounds } from '@xyflow/react';

const EXPORT_MIN_WIDTH = 1024;
const EXPORT_MIN_HEIGHT = 768;
const EXPORT_MAX_SIZE = 4096;
const EXPORT_PADDING = 96;

function clampExportSize(value: number, min: number) {
  return Math.max(min, Math.min(EXPORT_MAX_SIZE, Math.ceil(value)));
}

function nextFrame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
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
  const { getViewport, setViewport, getNodes } = useReactFlow();
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
    const viewportEl = reactFlowWrapper.current?.querySelector<HTMLElement>('.react-flow__viewport');
    if (!viewportEl || isExporting) return;

    setIsExporting(true);
    const viewport = getViewport();
    let restoreSvgStyles: (() => void) | null = null;
    try {
      const nodes = getNodes();
      if (nodes.length === 0) return;

      const nodesBounds = getNodesBounds(nodes);
      const imageWidth = clampExportSize(nodesBounds.width + EXPORT_PADDING * 2, EXPORT_MIN_WIDTH);
      const imageHeight = clampExportSize(nodesBounds.height + EXPORT_PADDING * 2, EXPORT_MIN_HEIGHT);
      const { x, y, zoom } = getViewportForBounds(nodesBounds, imageWidth, imageHeight, 0.05, 2, 0.12);

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
  }, [getNodes, getViewport, isExporting, setViewport, workflowName, reactFlowWrapper]);

  return { minimapVisible, isExporting, toggleMinimap, exportCanvas };
}
