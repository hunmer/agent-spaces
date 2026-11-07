import React, { useCallback, useRef } from 'react';
import { type Node } from '@xyflow/react';
import type { Workflow } from '@agent-spaces/shared';
import { getNodeDefinition } from '@/lib/workflow-nodes';

const DEBUG_WORKFLOW_CANVAS = process.env.NODE_ENV !== 'production';

export function useCanvasDebug(
  rfNodes: Node[],
  reactFlowWrapper: React.RefObject<HTMLDivElement | null>,
  workflow: Pick<Workflow, 'id' | 'name' | 'nodes' | 'edges'>,
) {
  const lastCanvasDebugSignature = useRef<string | null>(null);
  const lastCanvasDomDebugSignature = useRef<string | null>(null);

  const getNodeDebugSnapshot = useCallback((nodeId?: string | null) => {
    const wrapper = reactFlowWrapper.current;
    const domNodes = wrapper
      ? Array.from(wrapper.querySelectorAll<HTMLElement>('.react-flow__node'))
          .filter(element => !nodeId || element.getAttribute('data-id') === nodeId)
          .map(element => {
            const rect = element.getBoundingClientRect();
            const computedStyle = window.getComputedStyle(element);
            return {
              id: element.getAttribute('data-id'),
              rect: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              },
              visibility: computedStyle.visibility,
              display: computedStyle.display,
              opacity: computedStyle.opacity,
              transform: computedStyle.transform,
            };
          })
      : [];
    const flowNodes = rfNodes
      .filter(node => !nodeId || node.id === nodeId)
      .map(node => ({
        id: node.id,
        type: node.type,
        workflowType: node.data?.nodeType,
        position: node.position,
        width: node.width,
        height: node.height,
        initialWidth: node.initialWidth,
        initialHeight: node.initialHeight,
        measured: node.measured,
      }));

    return { flowNodes, domNodes };
  }, [rfNodes, reactFlowWrapper]);

  React.useEffect(() => {
    if (!DEBUG_WORKFLOW_CANVAS) return;

    const wrapperRect = reactFlowWrapper.current?.getBoundingClientRect();
    const rawNodes = workflow.nodes.map(n => ({
      id: n.id,
      type: n.type,
      label: n.label,
      position: n.position,
      dataKeys: Object.keys(n.data || {}),
    }));
    const mappedNodes = rfNodes.map(node => ({
      id: node.id,
      reactFlowType: node.type,
      workflowType: node.data?.nodeType,
      label: node.data?.label,
      position: node.position,
      style: node.style,
      hasDefinition: !!getNodeDefinition(String(node.data?.nodeType || '')),
    }));

    const wrapperSize = wrapperRect
      ? { width: Math.round(wrapperRect.width), height: Math.round(wrapperRect.height) }
      : null;
    const debugSignature = JSON.stringify({
      workflowId: workflow.id,
      rawNodeCount: workflow.nodes.length,
      edgeCount: workflow.edges.length,
      wrapperSize,
      rawNodes,
      mappedNodes,
    });

    if (lastCanvasDebugSignature.current === debugSignature) return;
    lastCanvasDebugSignature.current = debugSignature;

    console.debug('[WorkflowCanvas] input changed', {
      workflowId: workflow.id,
      workflowName: workflow.name,
      rawNodeCount: workflow.nodes.length,
      edgeCount: workflow.edges.length,
      wrapperSize,
      rawNodes,
      mappedNodes,
    });

    if (workflow.nodes.length > 0 && wrapperRect && (wrapperRect.width === 0 || wrapperRect.height === 0)) {
      console.warn('[WorkflowCanvas] wrapper has zero size while workflow has nodes', {
        workflowId: workflow.id,
        wrapperSize: { width: wrapperRect.width, height: wrapperRect.height },
      });
    }

    for (const node of mappedNodes) {
      if (!node.hasDefinition) {
        console.warn('[WorkflowCanvas] node definition missing after mapping', node);
      }
    }

    const frame = window.requestAnimationFrame(() => {
      const wrapper = reactFlowWrapper.current;
      if (!wrapper) return;

      const reactFlowNodes = Array.from(wrapper.querySelectorAll<HTMLElement>('.react-flow__node'));
      const domNodes = reactFlowNodes.map(element => {
        const rect = element.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(element);
        return {
          id: element.getAttribute('data-id'),
          className: element.className,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          transform: computedStyle.transform,
          display: computedStyle.display,
          visibility: computedStyle.visibility,
          opacity: computedStyle.opacity,
          pointerEvents: computedStyle.pointerEvents,
        };
      });
      const viewport = wrapper.querySelector<HTMLElement>('.react-flow__viewport');
      const viewportStyle = viewport ? window.getComputedStyle(viewport) : null;
      const domSignature = JSON.stringify({
        workflowId: workflow.id,
        expectedNodeCount: workflow.nodes.length,
        renderedNodeCount: reactFlowNodes.length,
        viewportTransform: viewportStyle?.transform,
        domNodes,
      });

      if (lastCanvasDomDebugSignature.current === domSignature) return;
      lastCanvasDomDebugSignature.current = domSignature;

      console.debug('[WorkflowCanvas] DOM snapshot', {
        workflowId: workflow.id,
        expectedNodeCount: workflow.nodes.length,
        renderedNodeCount: reactFlowNodes.length,
        viewportTransform: viewportStyle?.transform,
        viewportDisplay: viewportStyle?.display,
        domNodes,
      });

      if (workflow.nodes.length > 0 && reactFlowNodes.length === 0) {
        console.warn('[WorkflowCanvas] React Flow rendered zero DOM nodes', {
          workflowId: workflow.id,
          expectedNodeCount: workflow.nodes.length,
        });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [workflow.id, workflow.name, workflow.nodes, workflow.edges.length, rfNodes, reactFlowWrapper]);

  return { getNodeDebugSnapshot };
}
