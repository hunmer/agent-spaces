'use client';

import { useCallback, useRef } from 'react';
import Dagre from '@dagrejs/dagre';
import ELK from 'elkjs/lib/elk.bundled';
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import type { NodeChange, EdgeChange, Connection } from '@xyflow/react';
import type { ElkNode } from 'elkjs/lib/elk-api';
import type { Workflow } from '@agent-spaces/shared';
import {
  isHiddenWorkflowEdge,
  isHiddenWorkflowNode,
  getCompositeParentId,
  LOOP_BODY_NODE_TYPE,
} from '@agent-spaces/shared';
import { createWorkflowEdgeId } from '@/lib/workflow-edge-id';
import { getNodeDefinition } from '@/lib/workflow-nodes';
import { getWorkflowNodeSize } from './workflow-node-size';
import { getPropertyModeBadgeLayoutOverflow } from './workflow-node-property-mode';
import { makeDataReference, makeInputReference } from './workflow-canvas-references';
import { parseWorkflowFieldHandleId } from './workflow-field-handles';
import {
  isNodeRemoveChange,
  isNodePositionOrDimensionChange,
  isScopeBoundaryWorkflowNode,
  cloneWorkflowNodes,
  getOutgoingSourceHandle,
  getWorkflowNodeDeleteIds,
  reconnectEdgesAfterNodeDelete,
  syncScopeBoundaryLayout,
  syncAllScopeBoundaryLayouts,
  shiftScopeChildren,
  ensureLoopBodyBoundaryNodes,
} from './workflow-canvas-utils';
import { cleanupGroupsOnNodeDelete } from './workflow-canvas-groups';
import {
  areWorkflowHandleValueTypesCompatible,
  getNormalizedWorkflowSourceHandle,
  getWorkflowHandleValueType,
} from './workflow-handle-types';
import { syncWorkflowReferenceEdges } from './workflow-reference-edges';

interface UseEdgeOperationsParams {
  workflow: Workflow | null;
  isReadOnly: boolean;
  setWorkflow: React.Dispatch<React.SetStateAction<Workflow | null>>;
  markDirty: () => void;
  pushUndo: (description?: string) => void;
  selectedNodeId?: string | null;
  selectedNodeIds?: string[];
}

type AutoLayoutDebugBounds = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  badgeLeft: number;
  badgeRight: number;
  badgeTop: number;
  badgeBottom: number;
  measuredWidth?: number;
  measuredHeight?: number;
};

type AutoLayoutNodeDisplayMode = 'normal' | 'properties';
type AutoLayoutPropertyModeBadgePosition = 'top' | 'center' | 'bottom';
type AutoLayoutDisplayPrefs = {
  nodeDisplayMode: AutoLayoutNodeDisplayMode;
  propertyModeBadgePosition: AutoLayoutPropertyModeBadgePosition;
};

function roundLayoutDebugValue(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapeCssAttributeValue(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

function getReactFlowViewportZoom(): number {
  if (typeof document === 'undefined') return 1;
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
  const transform = viewport ? window.getComputedStyle(viewport).transform : '';
  if (!transform || transform === 'none') return 1;

  const matrixMatch = transform.match(/^matrix\(([^,]+),/);
  if (matrixMatch?.[1]) {
    const scale = Number(matrixMatch[1]);
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  const matrix3dMatch = transform.match(/^matrix3d\(([^,]+),[^,]+,[^,]+,[^,]+,[^,]+,([^,]+),/);
  if (matrix3dMatch?.[1]) {
    const scale = Number(matrix3dMatch[1]);
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  return 1;
}

function getRenderedWorkflowNodeSize(nodeId: string): { width: number; height: number } | null {
  if (typeof document === 'undefined') return null;
  const nodeElement = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${escapeCssAttributeValue(nodeId)}"]`);
  if (!nodeElement) return null;

  const zoom = getReactFlowViewportZoom();
  const rect = nodeElement.getBoundingClientRect();
  const width = rect.width / zoom;
  const height = rect.height / zoom;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

function getAutoLayoutNodeData(
  node: Workflow['nodes'][number],
  displayPrefs: AutoLayoutDisplayPrefs,
): Workflow['nodes'][number]['data'] {
  return displayPrefs.nodeDisplayMode === 'properties'
    ? {
        ...node.data,
        nodeDisplayMode: displayPrefs.nodeDisplayMode,
        propertyModeBadgePosition: displayPrefs.propertyModeBadgePosition,
      }
    : node.data;
}

function getAutoLayoutDebugBounds(
  node: Workflow['nodes'][number],
  displayPrefs: AutoLayoutDisplayPrefs,
): AutoLayoutDebugBounds {
  const definition = getNodeDefinition(node.type);
  const data = getAutoLayoutNodeData(node, displayPrefs);
  const nodeSize = getWorkflowNodeSize(definition, data);
  const renderedSize = getRenderedWorkflowNodeSize(node.id);
  const staticBodyWidth = typeof data?.width === 'number' ? nodeSize.width : Math.max(nodeSize.width, 220);
  const staticBodyHeight = typeof data?.height === 'number' ? nodeSize.height : Math.max(nodeSize.height, 120);
  const bodyWidth = renderedSize ? Math.max(staticBodyWidth, renderedSize.width) : staticBodyWidth;
  const bodyHeight = renderedSize ? Math.max(staticBodyHeight, renderedSize.height) : staticBodyHeight;
  const badgeOverflow = getPropertyModeBadgeLayoutOverflow(definition, data, bodyHeight);

  return {
    id: node.id,
    type: node.type,
    x: roundLayoutDebugValue(node.position.x - badgeOverflow.left),
    y: roundLayoutDebugValue(node.position.y - badgeOverflow.top),
    width: roundLayoutDebugValue(bodyWidth + badgeOverflow.width),
    height: roundLayoutDebugValue(bodyHeight + badgeOverflow.height),
    badgeLeft: roundLayoutDebugValue(badgeOverflow.left),
    badgeRight: roundLayoutDebugValue(badgeOverflow.right),
    badgeTop: roundLayoutDebugValue(badgeOverflow.top),
    badgeBottom: roundLayoutDebugValue(badgeOverflow.bottom),
    ...(renderedSize ? {
      measuredWidth: roundLayoutDebugValue(renderedSize.width),
      measuredHeight: roundLayoutDebugValue(renderedSize.height),
    } : {}),
  };
}

function doAutoLayoutBoundsOverlap(a: AutoLayoutDebugBounds, b: AutoLayoutDebugBounds): boolean {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

function logAutoLayoutOverlapDebug(params: {
  direction: 'LR' | 'TB';
  layoutEngine: string;
  displayPrefs: AutoLayoutDisplayPrefs;
  layouts: Array<{ parentId?: string; nodeIds: string[] }>;
  nodes: Workflow['nodes'];
}) {
  const debugNodeIds = new Set(params.layouts.flatMap(layout => layout.nodeIds));
  const bounds = params.nodes
    .filter(node => debugNodeIds.has(node.id) && !isHiddenWorkflowNode(node))
    .map(node => getAutoLayoutDebugBounds(node, params.displayPrefs));
  const overlaps: Array<{ a: AutoLayoutDebugBounds; b: AutoLayoutDebugBounds }> = [];

  for (let i = 0; i < bounds.length; i += 1) {
    for (let j = i + 1; j < bounds.length; j += 1) {
      const a = bounds[i];
      const b = bounds[j];
      if (a && b && doAutoLayoutBoundsOverlap(a, b)) overlaps.push({ a, b });
    }
  }

  const payload = {
    direction: params.direction,
    layoutEngine: params.layoutEngine,
    nodeDisplayMode: params.displayPrefs.nodeDisplayMode,
    propertyModeBadgePosition: params.displayPrefs.propertyModeBadgePosition,
    scopeCount: params.layouts.length,
    nodeCount: bounds.length,
    overlapCount: overlaps.length,
    bounds,
    overlaps,
  };

  if (overlaps.length > 0) {
    console.warn('[workflow:auto-layout:overlap-check]', payload);
  } else {
    console.debug('[workflow:auto-layout:overlap-check]', payload);
  }
}

function parsePropertyPath(path: string): Array<string | number> {
  const segments: Array<string | number> = [];
  for (const match of path.matchAll(/([^[.\]]+)|\[(\d+)\]/g)) {
    if (match[1]) segments.push(match[1]);
    else if (match[2]) segments.push(Number(match[2]));
  }
  return segments;
}

function getValueAtPath(value: unknown, path: Array<string | number>): unknown {
  return path.reduce<unknown>((current, segment) => {
    if (current == null) return undefined;
    if (typeof segment === 'number') return Array.isArray(current) ? current[segment] : undefined;
    return typeof current === 'object' ? (current as Record<string, unknown>)[segment] : undefined;
  }, value);
}

function setValueAtPath(value: unknown, path: Array<string | number>, nextValue: unknown): unknown {
  if (path.length === 0) return nextValue;
  const [segment, ...rest] = path;
  if (typeof segment === 'number') {
    const next = Array.isArray(value) ? [...value] : [];
    next[segment] = setValueAtPath(next[segment], rest, nextValue);
    return next;
  }
  const current = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    ...current,
    [segment]: setValueAtPath(current[segment], rest, nextValue),
  };
}

export function useEdgeOperations({
  workflow, isReadOnly, setWorkflow, markDirty, pushUndo, selectedNodeId = null, selectedNodeIds = [],
}: UseEdgeOperationsParams) {
  const rejectedNodeDeleteIdsRef = useRef<Set<string>>(new Set());

  const canUseSourceHandle = useCallback((node: Workflow['nodes'][number], sourceHandle: string | null | undefined) => {
    const definition = getNodeDefinition(node.type);
    if (definition?.handles?.source === false) return false;

    const handleId = sourceHandle || 'source';
    const fieldHandle = parseWorkflowFieldHandleId(handleId);
    if (fieldHandle?.kind === 'output') return true;

    const staticSourceHandles = definition?.handles?.sourceHandles || [];
    if (staticSourceHandles.length > 0) return staticSourceHandles.some(handle => handle.id === handleId);

    const dynamicSource = definition?.handles?.dynamicSource;
    if (dynamicSource) {
      const values = node.data[dynamicSource.dataKey];
      const conditions = Array.isArray(values) ? values : [];
      const dynamicHandleIds = [
        ...conditions.map((_, index) => `case-${index}`),
        ...(dynamicSource.extraCount ? ['default'] : []),
      ];
      return dynamicHandleIds.includes(handleId);
    }

    return handleId === 'source';
  }, []);

  const getTargetConnectionCount = useCallback((node: Workflow['nodes'][number]) => {
    const definition = getNodeDefinition(node.type);
    return definition?.handles?.connectionCount ?? 1;
  }, []);

  const getFieldTargetConnectionCount = useCallback((targetHandle: string | null | undefined, node: Workflow['nodes'][number]) => {
    const parsed = parseWorkflowFieldHandleId(targetHandle);
    if (parsed?.kind === 'input' || parsed?.kind === 'property') return 1;
    return getTargetConnectionCount(node);
  }, [getTargetConnectionCount]);

  const isDefaultSourceHandle = useCallback((node: Workflow['nodes'][number], sourceHandle: string | null | undefined) => {
    const definition = getNodeDefinition(node.type);
    if (definition?.handles?.source === false) return false;
    if (definition?.handles?.sourceHandles?.length) return false;
    if (definition?.handles?.dynamicSource) return false;
    return !sourceHandle || sourceHandle === 'source';
  }, []);

  const applyFieldConnectionValue = useCallback((
    node: Workflow['nodes'][number],
    sourceNodeId: string,
    sourceHandle: string | null | undefined,
    targetHandle: string | null | undefined,
  ): Workflow['nodes'][number] => {
    const targetField = parseWorkflowFieldHandleId(targetHandle);
    if (!targetField || (targetField.kind !== 'input' && targetField.kind !== 'property')) return node;

    const sourceField = parseWorkflowFieldHandleId(sourceHandle);
    const sourceKey = sourceField?.key;
    if (!sourceKey) return node;
    const reference = sourceField.kind === 'input'
      ? makeInputReference(sourceNodeId, sourceKey)
      : makeDataReference(sourceNodeId, sourceKey);

    if (targetField.kind === 'property') {
      const path = parsePropertyPath(targetField.key);
      if (getValueAtPath(node.data, path) === reference) return node;
      return { ...node, data: setValueAtPath(node.data, path, reference) as Workflow['nodes'][number]['data'] };
    }

    const inputFields = Array.isArray(node.data.inputFields) ? node.data.inputFields : [];
    let changed = false;
    const nextInputFields = inputFields.map((field) => {
      if (!field || typeof field !== 'object') return field;
      const key = typeof (field as { key?: unknown }).key === 'string' ? (field as { key: string }).key : '';
      if (key !== targetField.key) return field;
      if ((field as { value?: unknown }).value === reference) return field;
      changed = true;
      return { ...field, value: reference };
    });
    return changed ? { ...node, data: { ...node.data, inputFields: nextInputFields } } : node;
  }, []);

  const clearFieldConnectionValue = useCallback((
    node: Workflow['nodes'][number],
    sourceNodeId: string,
    sourceHandle: string | null | undefined,
    targetHandle: string | null | undefined,
  ): Workflow['nodes'][number] => {
    const targetField = parseWorkflowFieldHandleId(targetHandle);
    if (!targetField || (targetField.kind !== 'input' && targetField.kind !== 'property')) return node;

    const sourceField = parseWorkflowFieldHandleId(sourceHandle);
    const sourceKey = sourceField?.key;
    if (!sourceKey) return node;
    const reference = sourceField.kind === 'input'
      ? makeInputReference(sourceNodeId, sourceKey)
      : makeDataReference(sourceNodeId, sourceKey);

    if (targetField.kind === 'property') {
      const path = parsePropertyPath(targetField.key);
      if (getValueAtPath(node.data, path) !== reference) return node;
      return { ...node, data: setValueAtPath(node.data, path, '') as Workflow['nodes'][number]['data'] };
    }

    const inputFields = Array.isArray(node.data.inputFields) ? node.data.inputFields : [];
    let changed = false;
    const nextInputFields = inputFields.map((field) => {
      if (!field || typeof field !== 'object') return field;
      const key = typeof (field as { key?: unknown }).key === 'string' ? (field as { key: string }).key : '';
      if (key !== targetField.key) return field;
      if ((field as { value?: unknown }).value !== reference) return field;
      changed = true;
      return { ...field, value: '' };
    });
    return changed ? { ...node, data: { ...node.data, inputFields: nextInputFields } } : node;
  }, []);

  const createUniqueEdgeId = useCallback((params: {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }) => {
    const baseId = createWorkflowEdgeId(params);
    if (!workflow?.edges.some(edge => edge.id === baseId)) return baseId;

    let index = 2;
    let nextId = `${baseId}-${index}`;
    while (workflow.edges.some(edge => edge.id === nextId)) {
      index += 1;
      nextId = `${baseId}-${index}`;
    }
    return nextId;
  }, [workflow]);

  const wouldCreateCycle = useCallback((source: string, target: string) => {
    const visited = new Set<string>();
    const visit = (nodeId: string): boolean => {
      if (nodeId === source) return true;
      if (visited.has(nodeId)) return false;
      visited.add(nodeId);
      return workflow?.edges
        .filter(edge => edge.source === nodeId)
        .some(edge => visit(edge.target)) || false;
    };

    return visit(target);
  }, [workflow?.edges]);

  const handleConnect = useCallback((connection: Connection) => {
    if (!workflow || isReadOnly) {
      return;
    }
    if (!connection.source || !connection.target) {
      return;
    }

    const selectedIds = selectedNodeIds.length > 0
      ? selectedNodeIds
      : selectedNodeId ? [selectedNodeId] : [];
    const shouldConnectSelection = selectedIds.includes(connection.source);
    const sourceIdSet = new Set(shouldConnectSelection ? selectedIds : [connection.source]);
    sourceIdSet.add(connection.source);
    sourceIdSet.delete(connection.target);

    const edgeIds = new Set(workflow.edges.map(edge => edge.id));
    const sourceNode = workflow.nodes.find(node => node.id === connection.source);
    const targetNode = workflow.nodes.find(node => node.id === connection.target);
    if (!sourceNode || !targetNode) {
      return;
    }
    const sourceHandle = getNormalizedWorkflowSourceHandle(sourceNode, connection.sourceHandle);
    const targetConnectionCount = getFieldTargetConnectionCount(connection.targetHandle, targetNode);
    const targetHandle = connection.targetHandle || undefined;
    const existingTargetConnectionCount = workflow.edges.filter(edge =>
      edge.target === connection.target
      && (edge.targetHandle || undefined) === targetHandle
    ).length;
    let remainingTargetConnections = Math.max(0, targetConnectionCount - existingTargetConnectionCount);
    if (remainingTargetConnections === 0) {
      return;
    }

    const nextEdges = workflow.nodes
      .filter(node => sourceIdSet.has(node.id))
      .filter((node) => {
        return canUseSourceHandle(node, sourceHandle);
      })
      .filter((node) => {
        const nodeSourceType = getWorkflowHandleValueType(node, sourceHandle);
        const nodeTargetType = getWorkflowHandleValueType(targetNode, connection.targetHandle);
        return areWorkflowHandleValueTypesCompatible(nodeSourceType, nodeTargetType);
      })
      .filter((node) => {
        return !wouldCreateCycle(node.id, connection.target!);
      })
      .map((node): Workflow['edges'][number] => {
        const parsedTargetHandle = parseWorkflowFieldHandleId(connection.targetHandle);
        const isFieldTarget = parsedTargetHandle?.kind === 'input' || parsedTargetHandle?.kind === 'property';
        return {
          id: isDefaultSourceHandle(node, sourceHandle)
            ? createUniqueEdgeId({
              source: node.id,
              target: connection.target,
              sourceHandle,
              targetHandle: connection.targetHandle,
            })
            : createWorkflowEdgeId({
            source: node.id,
            target: connection.target,
            sourceHandle,
            targetHandle: connection.targetHandle,
          }),
          source: node.id,
          target: connection.target!,
          edgeKind: isFieldTarget ? 'reference' : 'runtime',
          sourceHandle,
          targetHandle,
        };
      })
      .filter(edge => {
        if (remainingTargetConnections === 0) return false;
        if (edgeIds.has(edge.id)) return false;
        edgeIds.add(edge.id);
        remainingTargetConnections -= 1;
        return true;
      });

    if (nextEdges.length === 0) {
      return;
    }
    pushUndo('connect');
    setWorkflow(w => {
      if (!w) return null;
      const nextNodes = w.nodes.map(node => {
        const matchingEdge = nextEdges.find(edge => edge.target === node.id);
        if (!matchingEdge) return node;
        return applyFieldConnectionValue(node, matchingEdge.source, matchingEdge.sourceHandle, matchingEdge.targetHandle);
      });
      return syncWorkflowReferenceEdges({ ...w, nodes: nextNodes, edges: [...w.edges, ...nextEdges] });
    });
    markDirty();
  }, [applyFieldConnectionValue, canUseSourceHandle, createUniqueEdgeId, getFieldTargetConnectionCount, isDefaultSourceHandle, isReadOnly, markDirty, pushUndo, selectedNodeId, selectedNodeIds, setWorkflow, workflow, wouldCreateCycle]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    if (!workflow || isReadOnly) return;
    const hasDelete = changes.some(c => c.type === 'remove');
    const rejectedDeleteIds = new Set(
      changes
        .filter(isNodeRemoveChange)
        .filter(change => !getWorkflowNodeDeleteIds(workflow.nodes, change.id))
        .map(change => change.id),
    );
    rejectedNodeDeleteIdsRef.current = rejectedDeleteIds;
    const hasAllowedDelete = changes
      .filter(isNodeRemoveChange)
      .some(change => !!getWorkflowNodeDeleteIds(workflow.nodes, change.id));
    const hasDimensionChange = changes.some(c => c.type === 'dimensions');
    const hasPositionChange = changes.some(c => c.type === 'position' && !!c.position);
    if (!hasDelete && !hasDimensionChange && !hasPositionChange) return;

    const rfNodes = workflow.nodes
      .filter(n => !isHiddenWorkflowNode(n))
      .map(n => {
        const definition = getNodeDefinition(n.type);
        const { minWidth, minHeight, width, height } = getWorkflowNodeSize(definition, n.data);
        return {
          id: n.id,
          type: 'custom' as const,
          position: n.position,
          width,
          height,
          initialWidth: width,
          initialHeight: height,
          measured: { width, height },
          style: { minWidth, minHeight, width, height },
          data: { ...n.data, label: n.label, nodeType: n.type, width, height },
        };
      });
    const updated = applyNodeChanges(changes, rfNodes);
    const updatedById = new Map(updated.map(node => [node.id, node]));
    const dimensionNodeIds = new Set(
      changes
        .filter((change): change is NodeChange & { type: 'dimensions'; id: string } => change.type === 'dimensions')
        .map(change => change.id),
    );
    const changedNodeIds = new Set(
      changes
        .filter(isNodePositionOrDimensionChange)
        .map(change => change.id),
    );
    const canAttemptFastPositionUpdate = hasPositionChange && !hasDelete && !hasDimensionChange;

    setWorkflow(w => {
      if (!w) return null;

      if (canAttemptFastPositionUpdate) {
        const canFastUpdate = w.nodes.every((node) => {
          if (!changedNodeIds.has(node.id)) return true;
          return !isScopeBoundaryWorkflowNode(node) && !getCompositeParentId(node);
        });
        if (canFastUpdate) {
          let changed = false;
          const nextNodes = w.nodes.map((node) => {
            if (!changedNodeIds.has(node.id)) return node;
            const updatedNode = updatedById.get(node.id);
            const nextPosition = updatedNode?.position;
            if (!nextPosition) return node;
            if (node.position.x === nextPosition.x && node.position.y === nextPosition.y) return node;
            changed = true;
            return {
              ...node,
              position: { x: nextPosition.x, y: nextPosition.y },
            };
          });
          return changed ? { ...w, nodes: nextNodes } : w;
        }
      }

      const nextNodes = cloneWorkflowNodes(w.nodes);
      const nextEdges = w.edges.map(edge => ({
        ...edge,
        composite: edge.composite ? { ...edge.composite } : undefined,
      }));
      const removedNodeIds = new Set(
        changes
          .filter(isNodeRemoveChange)
          .flatMap(change => {
            const deletePlan = getWorkflowNodeDeleteIds(w.nodes, change.id);
            return deletePlan ? Array.from(deletePlan.ids) : [];
          }),
      );
      const removedRootIds = new Set(
        changes
          .filter(isNodeRemoveChange)
          .flatMap(change => {
            const deletePlan = getWorkflowNodeDeleteIds(w.nodes, change.id);
            return deletePlan?.rootId ? [deletePlan.rootId] : [];
          }),
      );
      const touchedScopeNodeIds = new Set<string>();
      const movedNodeIds = new Set(changedNodeIds);

      if (removedNodeIds.size > 0) {
        for (const node of nextNodes) {
          if (!removedNodeIds.has(node.id)) continue;
          const parentId = getCompositeParentId(node);
          if (parentId) touchedScopeNodeIds.add(parentId);
        }
      }

      for (const node of nextNodes) {
        if (removedNodeIds.has(node.id)) continue;
        if (!changedNodeIds.has(node.id)) continue;
        const updatedNode = updatedById.get(node.id);
        if (!updatedNode) continue;

        const nextPosition = updatedNode.position;
        const dx = nextPosition.x - node.position.x;
        const dy = nextPosition.y - node.position.y;

        node.position = nextPosition;
        if (dimensionNodeIds.has(node.id)) {
          const width = typeof updatedNode.width === 'number' ? Math.round(updatedNode.width) : node.data.nodeWidth;
          const height = typeof updatedNode.height === 'number' ? Math.round(updatedNode.height) : node.data.nodeHeight;
          node.data = { ...node.data, nodeWidth: width, nodeHeight: height };
        }

        if ((dx !== 0 || dy !== 0) && isScopeBoundaryWorkflowNode(node)) {
          movedNodeIds.add(node.id);
          shiftScopeChildren(nextNodes, node.id, dx, dy, movedNodeIds);
        }

        const parentId = getCompositeParentId(node);
        if (parentId) touchedScopeNodeIds.add(parentId);
      }

      const remainingNodes = nextNodes.filter(node => !removedNodeIds.has(node.id));
      for (const scopeNodeId of touchedScopeNodeIds) {
        syncScopeBoundaryLayout(remainingNodes, scopeNodeId);
      }
      if (ensureLoopBodyBoundaryNodes(remainingNodes, nextEdges)) {
        syncAllScopeBoundaryLayouts(remainingNodes);
      }

      const nextEdgesAfterDelete = nextEdges.filter(edge =>
        !removedNodeIds.has(edge.source)
        && !removedNodeIds.has(edge.target)
        && (!edge.composite?.rootId || !removedRootIds.has(edge.composite.rootId))
      );
      const autoConnectAfterNodeDelete = w.layoutSnapshot?.autoConnectAfterNodeDelete !== false;
      const remainingEdges = autoConnectAfterNodeDelete
        ? reconnectEdgesAfterNodeDelete(nextEdges, removedNodeIds)
          .filter(edge => !edge.composite?.rootId || !removedRootIds.has(edge.composite.rootId))
        : nextEdgesAfterDelete;

      return {
        ...w,
        nodes: remainingNodes,
        edges: remainingEdges,
        groups: cleanupGroupsOnNodeDelete(w.groups, removedNodeIds),
      };
    });
    if (hasAllowedDelete || hasDimensionChange || hasPositionChange) markDirty();
  }, [workflow, isReadOnly, markDirty, setWorkflow]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (!workflow || isReadOnly) return;
    const rejectedNodeDeleteIds = rejectedNodeDeleteIdsRef.current;
    rejectedNodeDeleteIdsRef.current = new Set();
    const allowedChanges = changes.filter(change => {
      if (change.type !== 'remove') return true;
      const edge = workflow.edges.find(item => item.id === change.id);
      if (edge && (rejectedNodeDeleteIds.has(edge.source) || rejectedNodeDeleteIds.has(edge.target))) return false;
      return !!edge && !edge.composite?.locked;
    });
    if (allowedChanges.length === 0) return;

    const hasDelete = allowedChanges.some(c => c.type === 'remove');
    if (hasDelete) pushUndo('delete edge');

    const rfEdges = workflow.edges.map(e => ({
      id: e.id, source: e.source, target: e.target, type: 'custom' as const,
      sourceHandle: e.sourceHandle || undefined, targetHandle: e.targetHandle || undefined,
      data: { composite: e.composite, sourceHandle: e.sourceHandle },
    }));
    const updated = applyEdgeChanges(allowedChanges, rfEdges);
    const remainingIds = new Set(updated.map(e => e.id));
    const removedEdges = workflow.edges.filter(edge => !remainingIds.has(edge.id));

    setWorkflow(w => {
      if (!w) return null;
      const nextNodes = removedEdges.length === 0
        ? w.nodes
        : w.nodes.map((node) => {
            const relatedRemovedEdges = removedEdges.filter(edge => edge.target === node.id);
            if (relatedRemovedEdges.length === 0) return node;
            return relatedRemovedEdges.reduce(
              (currentNode, edge) => clearFieldConnectionValue(currentNode, edge.source, edge.sourceHandle, edge.targetHandle),
              node,
            );
          });
      return syncWorkflowReferenceEdges({
        ...w,
        nodes: nextNodes,
        edges: w.edges.filter(e => remainingIds.has(e.id)),
      });
    });
    if (hasDelete) markDirty();
  }, [workflow, isReadOnly, pushUndo, markDirty, setWorkflow, clearFieldConnectionValue]);

  const handleEdgeDataUpdate = useCallback((edgeId: string, data: Record<string, unknown>) => {
    if (!workflow || isReadOnly) return;
    const edge = workflow.edges.find(item => item.id === edgeId);
    if (!edge || edge.composite?.locked) return;

    const nextStartLabel = typeof data.startLabel === 'string' ? data.startLabel : edge.startLabel;
    const nextMiddleLabel = typeof data.middleLabel === 'string' ? data.middleLabel : edge.middleLabel;
    const nextEndLabel = typeof data.endLabel === 'string' ? data.endLabel : edge.endLabel;
    const nextEdgeLineStyle = (() => {
      if (data.edgeLineStyle === 'solid' || data.edgeLineStyle === 'dashed') return data.edgeLineStyle;
      if (data.edgeLineStyle === 'default') return undefined;
      return edge.edgeLineStyle;
    })();
    if (
      (edge.startLabel || '') === (nextStartLabel || '')
      && (edge.middleLabel || '') === (nextMiddleLabel || '')
      && (edge.endLabel || '') === (nextEndLabel || '')
      && (edge.edgeLineStyle || 'solid') === (nextEdgeLineStyle || 'solid')
    ) {
      return;
    }

    pushUndo(typeof data.edgeLineStyle === 'string' ? 'update edge style' : 'update edge label');
    setWorkflow(w => w ? {
      ...w,
      edges: w.edges.map(item => item.id === edgeId
        ? {
            ...item,
            startLabel: nextStartLabel || undefined,
            middleLabel: nextMiddleLabel || undefined,
            endLabel: nextEndLabel || undefined,
            edgeLineStyle: nextEdgeLineStyle,
          }
        : item),
    } : null);
    markDirty();
  }, [workflow, isReadOnly, pushUndo, setWorkflow, markDirty]);

  const handleInsertExistingNodeOnEdge = useCallback((edgeId: string, nodeId: string) => {
    if (!workflow || isReadOnly) return;
    const edge = workflow.edges.find(item => item.id === edgeId);
    const node = workflow.nodes.find(item => item.id === nodeId);
    if (!edge || !node || edge.composite?.locked) return;
    if (edge.source === nodeId || edge.target === nodeId) return;

    const outgoingSourceHandle = getOutgoingSourceHandle(node.type);
    const firstEdge: Workflow['edges'][0] = {
      id: createWorkflowEdgeId({
        source: edge.source,
        target: nodeId,
        sourceHandle: edge.sourceHandle,
      }),
      source: edge.source,
      target: nodeId,
      sourceHandle: edge.sourceHandle,
      targetHandle: undefined,
    };
    const secondEdge: Workflow['edges'][0] = {
      id: createWorkflowEdgeId({
        source: nodeId,
        target: edge.target,
        sourceHandle: outgoingSourceHandle,
        targetHandle: edge.targetHandle,
      }),
      source: nodeId,
      target: edge.target,
      sourceHandle: outgoingSourceHandle,
      targetHandle: edge.targetHandle,
    };

    pushUndo('insert existing node');
    setWorkflow(w => {
      if (!w) return null;
      const nextEdges = w.edges.filter(item => item.id !== edgeId);
      for (const nextEdge of [firstEdge, secondEdge]) {
        if (!nextEdges.some(item => item.id === nextEdge.id)) nextEdges.push(nextEdge);
      }
      return { ...w, edges: nextEdges };
    });
    markDirty();
  }, [workflow, isReadOnly, pushUndo, setWorkflow, markDirty]);

  const handleCanvasPreferencesChange = useCallback((prefs: Record<string, unknown>) => {
    if (!workflow || isReadOnly) return;
    setWorkflow(w => w ? { ...w, layoutSnapshot: prefs } : null);
    markDirty();
  }, [workflow, isReadOnly, markDirty, setWorkflow]);

  const handleAutoLayout = useCallback(async (direction: 'LR' | 'TB', options?: { layoutEngine?: string; parentId?: string; nodeIds?: string[] }) => {
    if (!workflow || isReadOnly || workflow.nodes.length === 0) return;
    const parentId = options?.parentId;
    const optionNodeIds = options?.nodeIds;
    const explicitNodeIds = optionNodeIds && optionNodeIds.length > 0 ? new Set(optionNodeIds) : null;

    const layoutEngine = options?.layoutEngine || (workflow.layoutSnapshot?.layoutEngine as string) || 'dagre';
    const displayPrefs: AutoLayoutDisplayPrefs = {
      nodeDisplayMode: workflow.layoutSnapshot?.nodeDisplayMode === 'properties' ? 'properties' : 'normal',
      propertyModeBadgePosition: workflow.layoutSnapshot?.propertyModeBadgePosition === 'top' || workflow.layoutSnapshot?.propertyModeBadgePosition === 'bottom'
        ? workflow.layoutSnapshot.propertyModeBadgePosition
        : 'center',
    };
    const computeLayout = async (scopeParentId?: string) => {
      const layoutNodes = workflow.nodes.filter(node =>
        !isHiddenWorkflowNode(node)
        && (explicitNodeIds
          ? explicitNodeIds.has(node.id)
          : scopeParentId ? getCompositeParentId(node) === scopeParentId : !getCompositeParentId(node))
      );
      if (layoutNodes.length === 0) return null;

      const layoutNodeIds = new Set(layoutNodes.map(node => node.id));
      const nodeSizes = new Map<string, { width: number; height: number; badgeLeft: number; badgeTop: number }>();

      for (const node of layoutNodes) {
        const definition = getNodeDefinition(node.type);
        const data = getAutoLayoutNodeData(node, displayPrefs);
        const nodeSize = getWorkflowNodeSize(definition, data);
        const renderedSize = getRenderedWorkflowNodeSize(node.id);
        const staticBodyWidth = typeof data?.width === 'number' ? nodeSize.width : Math.max(nodeSize.width, 220);
        const staticBodyHeight = typeof data?.height === 'number' ? nodeSize.height : Math.max(nodeSize.height, 120);
        const bodyWidth = renderedSize ? Math.max(staticBodyWidth, renderedSize.width) : staticBodyWidth;
        const bodyHeight = renderedSize ? Math.max(staticBodyHeight, renderedSize.height) : staticBodyHeight;
        const badgeOverflow = getPropertyModeBadgeLayoutOverflow(definition, data, bodyHeight);
        const size = {
          width: bodyWidth + badgeOverflow.width,
          height: bodyHeight + badgeOverflow.height,
          badgeLeft: badgeOverflow.left,
          badgeTop: badgeOverflow.top,
        };
        nodeSizes.set(node.id, size);
      }

      const layoutEdges = workflow.edges.filter(edge =>
        !isHiddenWorkflowEdge(edge)
        && layoutNodeIds.has(edge.source)
        && layoutNodeIds.has(edge.target)
      );
      const layoutPositions = new Map<string, { x: number; y: number }>();

      if (layoutEngine === 'elk') {
        const elk = new ELK();
        const elkGraph: ElkNode = {
          id: scopeParentId ?? 'workflow',
          layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': direction === 'LR' ? 'RIGHT' : 'DOWN',
            'elk.spacing.nodeNode': '60',
            'elk.layered.spacing.nodeNodeBetweenLayers': '90',
          },
          children: layoutNodes.map(node => {
            const size = nodeSizes.get(node.id);
            return {
              id: node.id,
              width: size?.width ?? 220,
              height: size?.height ?? 120,
            };
          }),
          edges: layoutEdges.map(edge => ({
            id: edge.id,
            sources: [edge.source],
            targets: [edge.target],
          })),
        };
        const result = await elk.layout(elkGraph);
        for (const child of result.children ?? []) {
          if (typeof child.x === 'number' && typeof child.y === 'number') {
            const size = nodeSizes.get(child.id);
            layoutPositions.set(child.id, { x: child.x + (size?.badgeLeft ?? 0), y: child.y + (size?.badgeTop ?? 0) });
          }
        }
      } else {
        const graph = new Dagre.graphlib.Graph();
        graph.setDefaultEdgeLabel(() => ({}));
        graph.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 });

        for (const node of layoutNodes) {
          graph.setNode(node.id, nodeSizes.get(node.id) ?? { width: 220, height: 120 });
        }
        for (const edge of layoutEdges) {
          graph.setEdge(edge.source, edge.target);
        }

        Dagre.layout(graph);
        for (const node of layoutNodes) {
          const layoutPosition = graph.node(node.id);
          const size = nodeSizes.get(node.id);
          if (!layoutPosition) continue;
          layoutPositions.set(node.id, {
            x: layoutPosition.x - (size?.width ?? 220) / 2 + (size?.badgeLeft ?? 0),
            y: layoutPosition.y - (size?.height ?? 120) / 2 + (size?.badgeTop ?? 0),
          });
        }
      }

      return {
        parentId: scopeParentId,
        preserveOffset: !!scopeParentId || !!explicitNodeIds,
        nodeIds: layoutNodes.map(node => node.id),
        positions: layoutPositions,
      };
    };

    const rootLayout = await computeLayout(parentId);
    if (!rootLayout) return;
    pushUndo('auto layout');
    const childLayouts = parentId || explicitNodeIds
      ? []
      : (await Promise.all(
          workflow.nodes
            .filter(node => node.type === LOOP_BODY_NODE_TYPE && !isHiddenWorkflowNode(node))
            .map(node => computeLayout(node.id)),
        )).filter((layout): layout is NonNullable<typeof rootLayout> => !!layout);
    const layouts = [rootLayout, ...childLayouts];

    setWorkflow(current => {
      if (!current) return null;
      const nextNodes = current.nodes.map(node => ({ ...node, position: { ...node.position } }));
      const nextEdges = current.edges.map(edge => ({
        ...edge,
        composite: edge.composite ? { ...edge.composite } : undefined,
      }));
      const nodeById = new Map(nextNodes.map(node => [node.id, node]));
      const touchedScopeNodeIds = new Set<string>();

      for (const layout of layouts) {
        const layoutPositionValues = Array.from(layout.positions.values());
        if (layoutPositionValues.length === 0) continue;

        const currentNodes = layout.nodeIds
          .map(nodeId => nodeById.get(nodeId))
          .filter((node): node is Workflow['nodes'][number] => !!node);
        if (currentNodes.length === 0) continue;

        const layoutOffset = layout.preserveOffset
          ? {
              x: Math.min(...currentNodes.map(node => node.position.x)) - Math.min(...layoutPositionValues.map(position => position.x)),
              y: Math.min(...currentNodes.map(node => node.position.y)) - Math.min(...layoutPositionValues.map(position => position.y)),
            }
          : { x: 0, y: 0 };

        for (const nodeId of layout.nodeIds) {
          const nextNode = nodeById.get(nodeId);
          const nextPosition = layout.positions.get(nodeId);
          if (!nextNode || !nextPosition) continue;
          const shiftedPosition = {
            x: nextPosition.x + layoutOffset.x,
            y: nextPosition.y + layoutOffset.y,
          };

          if (isScopeBoundaryWorkflowNode(nextNode)) {
            const dx = shiftedPosition.x - nextNode.position.x;
            const dy = shiftedPosition.y - nextNode.position.y;
            shiftScopeChildren(nextNodes, nextNode.id, dx, dy, new Set([nextNode.id]));
            touchedScopeNodeIds.add(nextNode.id);
          }

          nextNode.position = shiftedPosition;
        }
        if (layout.parentId) {
          touchedScopeNodeIds.add(layout.parentId);
        }
      }
      if (ensureLoopBodyBoundaryNodes(nextNodes, nextEdges)) {
        syncAllScopeBoundaryLayouts(nextNodes);
      } else {
        for (const scopeNodeId of touchedScopeNodeIds) {
          syncScopeBoundaryLayout(nextNodes, scopeNodeId);
        }
      }

      logAutoLayoutOverlapDebug({
        direction,
        layoutEngine,
        displayPrefs,
        layouts,
        nodes: nextNodes,
      });

      return { ...current, nodes: nextNodes, edges: nextEdges };
    });
    markDirty();
  }, [workflow, isReadOnly, pushUndo, setWorkflow, markDirty]);

  return {
    handleConnect,
    handleNodesChange,
    handleEdgesChange,
    handleEdgeDataUpdate,
    handleInsertExistingNodeOnEdge,
    handleAutoLayout,
    handleCanvasPreferencesChange,
  };
}
