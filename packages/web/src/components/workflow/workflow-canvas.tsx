'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ViewportPortal,
  getOutgoers,
  useReactFlow,
  applyNodeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type OnConnectEnd,
  type OnConnectStart,
  type OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ExecutionLog, Workflow, StagedNode } from '@agent-spaces/shared';
import { WORKFLOW_NODE_DRAG_MIME, WORKFLOW_STAGED_NODE_DRAG_MIME } from './workflow-drag-types';
import { WorkflowNode as WorkflowNodeComponent } from './workflow-node';
import { WorkflowLogsCollapsedContext } from './workflow-logs-collapsed-context';
import { WorkflowEdge as WorkflowEdgeComponent } from './workflow-edge';
import { WorkflowGroupOverlay } from './workflow-group-node';
import { WorkflowHelperLines } from './workflow-helper-lines';
import {
  CUSTOM_WORKFLOW_CANVAS_THEME,
  getWorkflowCanvasThemePreset,
  parseWorkflowCanvasCustomTheme,
} from './workflow-canvas-theme';
import { CanvasToolbar, type WorkflowClipboardRecord } from './workflow-canvas-toolbar';
import { useCanvasData } from './use-workflow-canvas-data';
import { useCanvasDomEvents } from './use-workflow-canvas-dom-events';
import { useCanvasExport } from './use-workflow-canvas-export';
import { getNodeDefinition } from '@/lib/workflow-nodes';
import { getWorkflowNodeSize } from './workflow-node-size';
import { parseWorkflowFieldHandleId } from './workflow-field-handles';
import {
  areWorkflowHandleValueTypesCompatible,
  getNormalizedWorkflowSourceHandle,
  getWorkflowHandleValueType,
} from './workflow-handle-types';
import type { HandlePositionMode } from './workflow-node-types';
import { isScopeBoundaryWorkflowNode, resolveNodeCollisions, WORKFLOW_COLLISION_OPTIONS } from './workflow-canvas-utils';
import { useTheme } from '@/components/layout/theme-provider';
import { WorkflowSelectionConnectionLine } from './workflow-selection-connection-line';
import { DragPreviewOverlay, RectangleOverlayRect } from './workflow-canvas-overlays';
import { LassoSelectionTool, RectangleDrawTool } from './workflow-canvas-selection-tools';
import { WorkflowSelectionMenu } from './workflow-canvas-selection-menu';
import {
  GROUP_DRAG_PREVIEW_BACKGROUND,
  LOOP_BODY_DRAG_PREVIEW_BACKGROUND,
  type DragPreview,
  type DrawArea,
  type LocalRect,
  type NodePreviewDragEventDetail,
  type WorkflowNodeResizePreviewEventDetail,
} from './workflow-canvas-types';
import {
  areStringArraysEqual,
  isConnectionEndOnCanvasNode,
  isNonNull,
  isPositionNodeChange,
} from './workflow-canvas-helpers';

const nodeTypes = { custom: WorkflowNodeComponent };
const edgeTypes = { custom: WorkflowEdgeComponent };
type WorkflowBadgeHandleTarget = {
  nodeId: string;
  handleId: string;
  handleType: 'target' | 'source';
};

function getWorkflowBadgeHandleTarget(clientPosition: { x: number; y: number }): WorkflowBadgeHandleTarget | null {
  const element = document.elementFromPoint(clientPosition.x, clientPosition.y);
  const handleElement = element?.closest<HTMLElement>(
    '[data-workflow-node-id][data-workflow-handle-id][data-workflow-handle-type]',
  );
  if (!handleElement) return null;

  const nodeId = handleElement.dataset.workflowNodeId;
  const handleId = handleElement.dataset.workflowHandleId;
  const handleType = handleElement.dataset.workflowHandleType;
  if (!nodeId || !handleId || (handleType !== 'target' && handleType !== 'source')) return null;
  return { nodeId, handleId, handleType };
}

type CanvasViewportRef = {
  exportCanvas: (format: 'png' | 'jpeg') => void;
  getViewportCenter: () => { x: number; y: number };
  focusNode: (nodeId: string) => void;
  selectAll: () => void;
  invertSelection: () => void;
};

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable
    || target.closest('.monaco-editor, .monaco-editor *') !== null
    || target.closest('[contenteditable="true"], [role="textbox"]') !== null
  );
}

interface WorkflowCanvasProps {
  workflow: Workflow;
  isPreview: boolean;
  execStatus?: string;
  isRunning?: boolean;
  executionLog?: ExecutionLog | null;
  selectedNodeId?: string | null;
  selectedNodeIds?: string[];
  onNodeAdd: (type: string, position: { x: number; y: number }, size?: { width: number; height: number }, data?: Record<string, unknown>) => void;
  onStagedNodeDrop?: (node: StagedNode, position: { x: number; y: number }) => void;
  onNodeDelete: (id: string) => void;
  onNodeCopy?: (id: string) => void;
  onNodeClone?: (id: string) => void;
  onNodeStage?: (id: string) => void;
  onMergeNodesToWorkflow?: (ids: string[]) => void;
  onMergeNodesToGroup?: (ids: string[]) => void;
  onBatchDeleteNodes?: (ids: string[]) => void;
  onGroupUpdate?: (groupId: string, updates: Partial<NonNullable<Workflow['groups']>[number]>) => void;
  onGroupDelete?: (groupId: string) => void;
  onGroupMove?: (groupId: string, delta: { x: number; y: number }, options?: { pushUndo?: boolean }) => void;
  debugNodeId?: string | null;
  debugStatus?: 'idle' | 'running' | 'completed' | 'error';
  onNodeDebug?: (id: string) => void;
  onCancelDebug?: () => void;
  onExecuteFromNode?: (id?: string) => void;
  onResumeExecution?: () => void;
  onStopExecution?: () => void;
  pausedNodeId?: string | null;
  pausedReason?: string | null;
  partialExecutionStartNodeId?: string | null;
  onNodeSelect: (id: string | null, multi?: boolean) => void;
  onNodesSelect?: (ids: string[], options?: { primaryNodeId?: string | null }) => void;
  onNodeDataUpdate: (id: string, data: Record<string, unknown>) => void;
  onEdgeDataUpdate: (id: string, data: Record<string, unknown>) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onExitPreview?: () => void;
  onAutoLayout?: (direction: 'LR' | 'TB', options?: { layoutEngine?: string; parentId?: string; nodeIds?: string[] }) => void;
  copiedNodeCount?: number;
  copiedRecords?: WorkflowClipboardRecord[];
  onPasteRecord?: (id: string) => void;
  onMoveRecord?: (id: string) => void;
  onClearCopiedNodes?: () => void;
  onConnectionDrop?: (context: {
    sourceNodeId: string;
    sourceHandle: string | null;
    position: { x: number; y: number } | null;
  }) => void;
  onRectangleDrawNodeSelect?: (context: DrawArea) => void;
  onInsertExistingNodeOnEdge?: (edgeId: string, nodeId: string) => void;
  canvasExportRef?: React.RefObject<CanvasViewportRef | null>;
  onNodeDragStateChange?: (dragging: boolean) => void;
}

export function WorkflowCanvas({
  workflow, isPreview, execStatus = 'idle', isRunning = false, executionLog, selectedNodeId,
  selectedNodeIds = [], onNodeAdd, onNodeDelete, onNodeSelect, onNodesSelect,
  onStagedNodeDrop, onNodeDataUpdate, onEdgeDataUpdate, onNodesChange, onEdgesChange, onConnect,
  canUndo = false, canRedo = false, onUndo, onRedo, onExitPreview, onAutoLayout,
  copiedNodeCount = 0, copiedRecords = [], onPasteRecord, onMoveRecord, onClearCopiedNodes,
  onConnectionDrop,
  onRectangleDrawNodeSelect,
  onInsertExistingNodeOnEdge,
  onNodeCopy, onNodeClone, onNodeStage,
  onMergeNodesToWorkflow, onMergeNodesToGroup, onBatchDeleteNodes,
  onGroupUpdate, onGroupDelete, onGroupMove,
  debugNodeId = null, debugStatus = 'idle', onNodeDebug, onCancelDebug,
  onExecuteFromNode, onResumeExecution, onStopExecution,
  pausedNodeId = null, pausedReason = null,
  partialExecutionStartNodeId = null,
  canvasExportRef,
  onNodeDragStateChange,
}: WorkflowCanvasProps) {
  const { resolvedTheme } = useTheme();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const connectSourceRef = useRef<{ nodeId: string; handleId: string | null; handleType: string | null } | null>(null);
  const connectSucceededRef = useRef(false);
  const isRangeSelectingRef = useRef(false);
  const pendingRangeSelectionRef = useRef<string[] | null>(null);
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number; nodeIds: string[] } | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [resizePreviewRect, setResizePreviewRect] = useState<LocalRect | null>(null);
  const [dropTargetEdgeId, setDropTargetEdgeId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [rectangleDrawActive, setRectangleDrawActive] = useState(false);
  const [lassoSelectionActive, setLassoSelectionActive] = useState(false);
  const [logsCollapsed, setLogsCollapsed] = useState(true);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const [helperHorizontal] = useState<number | undefined>();
  const [helperVertical] = useState<number | undefined>();
  const isCanvasLocked = isRunning;

  useEffect(() => {
    if (isCanvasLocked) {
      setRectangleDrawActive(false);
      setLassoSelectionActive(false);
      setResizePreviewRect(null);
    }
  }, [isCanvasLocked]);

  useEffect(() => {
    const handleResizePreview = (event: Event) => {
      const detail = (event as CustomEvent<WorkflowNodeResizePreviewEventDetail>).detail;
      if (!detail?.rect) {
        setResizePreviewRect(null);
        return;
      }

      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;

      setResizePreviewRect({
        left: detail.rect.left - bounds.left,
        top: detail.rect.top - bounds.top,
        width: detail.rect.width,
        height: detail.rect.height,
      });
    };

    window.addEventListener('workflow:node-resize-preview', handleResizePreview);
    return () => window.removeEventListener('workflow:node-resize-preview', handleResizePreview);
  }, []);

  // --- Canvas preferences (persisted in workflow.layoutSnapshot) ---
  const canvasPrefs = useMemo(() => workflow.layoutSnapshot ?? {}, [workflow.layoutSnapshot]);
  const canvasThemeKey = (canvasPrefs.canvasTheme as string) || 'default';
  const canvasThemePreset = getWorkflowCanvasThemePreset(canvasThemeKey);
  const canvasThemeStyle = useMemo(() => (
    canvasThemeKey === CUSTOM_WORKFLOW_CANVAS_THEME
      ? parseWorkflowCanvasCustomTheme(canvasPrefs.canvasCustomThemeCss)
      : canvasThemePreset.style
  ), [canvasPrefs.canvasCustomThemeCss, canvasThemeKey, canvasThemePreset.style]);
  const canvasThemeColorMode = canvasThemeKey === CUSTOM_WORKFLOW_CANVAS_THEME || canvasThemePreset.colorMode === 'system'
    ? resolvedTheme
    : canvasThemePreset.colorMode;
  const bgVariantKey = (canvasPrefs.bgVariant as string) || 'dots';
  const bgVariant = bgVariantKey === 'lines' ? BackgroundVariant.Lines
    : bgVariantKey === 'cross' ? BackgroundVariant.Cross
    : BackgroundVariant.Dots;
  const snapEnabled = canvasPrefs.snapGrid !== false;
  const layoutEngine = (canvasPrefs.layoutEngine as string) || 'dagre';
  const autoMergeNodeOnEdge = canvasPrefs.autoMergeNodeOnEdge !== false;
  const collisionBoxEnabled = canvasPrefs.collisionBoxEnabled !== false;
  const savedAttributionPosition = canvasPrefs.attributionPosition;
  const validPositions = ['top-bottom', 'left-right', 'bottom-top', 'right-left'] as const;
  const handlePosition = validPositions.includes(savedAttributionPosition as typeof validPositions[number])
    ? savedAttributionPosition as HandlePositionMode
    : 'left-right';
  const floatingHandles = canvasPrefs.floatingHandles === true;
  const nodeDisplayMode = canvasPrefs.nodeDisplayMode === 'properties' ? 'properties' : 'normal';
  const propertyModeBadgePosition = canvasPrefs.propertyModeBadgePosition === 'top' || canvasPrefs.propertyModeBadgePosition === 'bottom'
    ? canvasPrefs.propertyModeBadgePosition
    : 'center';
  const scopeBoundaryNodeIds = useMemo(
    () => new Set(workflow.nodes.filter(isScopeBoundaryWorkflowNode).map(item => item.id)),
    [workflow.nodes],
  );

  const closeSelectionMenu = useCallback(() => {
    setSelectionMenu(null);
  }, []);

  useEffect(() => {
    if (!selectionMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('[data-workflow-selection-menu="true"]')) return;
      closeSelectionMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSelectionMenu();
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [closeSelectionMenu, selectionMenu]);

  const handleSelectionContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (isCanvasLocked || selectedNodeIds.length < 2) return;

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('.react-flow__node')) return;
    const isSelectionOrPane = !!target.closest('.react-flow__nodesselection, .react-flow__selectionpane, .react-flow__pane');
    if (!isSelectionOrPane) return;

    event.preventDefault();
    event.stopPropagation();
    setSelectionMenu({
      x: event.clientX,
      y: event.clientY,
      nodeIds: [...selectedNodeIds],
    });
  }, [isCanvasLocked, selectedNodeIds]);

  const screenDeltaToFlowDelta = useCallback((delta: { x: number; y: number }) => {
    const origin = screenToFlowPosition({ x: 0, y: 0 }, { snapToGrid: false });
    const next = screenToFlowPosition({ x: delta.x, y: delta.y }, { snapToGrid: false });
    return {
      x: next.x - origin.x,
      y: next.y - origin.y,
    };
  }, [screenToFlowPosition]);

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    const reject = (reason?: string, details?: Record<string, unknown>) => {
      console.debug('[DEBUG-badge-connect] canvas reject', {
        reason,
        connection,
        ...details,
      });
      return false;
    };

    if (!connection.source || !connection.target) return reject('missing-source-or-target');
    if (connection.source === connection.target) return reject('same-source-and-target');

    const nodes = workflow.nodes;
    const edges = workflow.edges;
    const sourceNode = nodes.find(node => node.id === connection.source);
    const targetNode = nodes.find(node => node.id === connection.target);
    if (!sourceNode || !targetNode) return reject('source-or-target-node-not-found', {
      sourceFound: !!sourceNode,
      targetFound: !!targetNode,
    });
    const targetDefinition = getNodeDefinition(targetNode.type);
    const targetHandle = connection.targetHandle || undefined;
    const targetFieldHandle = parseWorkflowFieldHandleId(targetHandle);
    const sourceHandle = getNormalizedWorkflowSourceHandle(sourceNode, connection.sourceHandle || undefined);
    const sourceHandleType = getWorkflowHandleValueType(sourceNode, sourceHandle);
    const targetHandleType = getWorkflowHandleValueType(targetNode, targetHandle);
    console.debug('[DEBUG-badge-connect] canvas validate', {
      connection,
      sourceNodeType: sourceNode.type,
      targetNodeType: targetNode.type,
      sourceHandle,
      targetHandle,
      targetFieldHandle,
      sourceHandleType,
      targetHandleType,
    });
    if (!areWorkflowHandleValueTypesCompatible(sourceHandleType, targetHandleType)) {
      return reject('incompatible-handle-types', {
        sourceHandle,
        targetHandle,
        sourceHandleType,
        targetHandleType,
      });
    }
    const targetConnectionCount = targetFieldHandle?.kind === 'input' || targetFieldHandle?.kind === 'property'
      ? 1
      : targetDefinition?.handles?.connectionCount ?? 1;
    const existingTargetConnectionCount = edges.filter(edge =>
      edge.target === connection.target
      && (edge.targetHandle || undefined) === targetHandle
      && edge.id !== ('id' in connection ? connection.id : undefined)
    ).length;
    if (existingTargetConnectionCount >= targetConnectionCount) {
      return reject('target-handle-connection-limit-reached', {
        targetHandle,
        existingTargetConnectionCount,
        targetConnectionCount,
      });
    }

    const hasCycle = (node: typeof targetNode, visited = new Set<string>()): boolean => {
      if (visited.has(node.id)) return false;
      visited.add(node.id);

      for (const outgoer of getOutgoers(node, nodes, edges)) {
        if (outgoer.id === connection.source) return true;
        if (hasCycle(outgoer, visited)) return true;
      }

      return false;
    };

    if (hasCycle(targetNode)) return reject('would-create-cycle');
    return true;
  }, [workflow.edges, workflow.nodes]);

  // --- Extracted hooks ---
  const { selectedEdgeId, selectEdge } = useCanvasDomEvents({
    isCanvasLocked,
    workflowEdges: workflow.edges,
    onEdgesChange,
    onNodeSelect,
    onNodeDelete,
    onNodeDataUpdate,
    onEdgeDataUpdate,
    onNodeCopy,
    onNodeClone,
    onNodeStage,
    onMergeNodesToWorkflow,
    onMergeNodesToGroup,
    onBatchDeleteNodes,
    onNodeDebug,
    onCancelDebug,
    onExecuteFromNode,
    onResumeExecution,
    onStopExecution,
  });

  const { rfNodes, rfEdges } = useCanvasData({
    workflow,
    selectedNodeId,
    selectedNodeIds,
    selectedEdgeId,
    executionLog,
    isPreview,
    isCanvasLocked,
    execStatus,
    debugNodeId,
    debugStatus,
    pausedNodeId,
    pausedReason,
    partialExecutionStartNodeId,
    handlePosition,
    floatingHandles,
    nodeDisplayMode,
    propertyModeBadgePosition,
    logPanelLayout: canvasPrefs.logPanelLayout === 'tabs' ? 'tabs' : 'vertical',
    edgePathType: (canvasPrefs.edgePathType as string) || 'bezier',
    edgeLineStyle: (canvasPrefs.edgeLineStyle as string) || 'solid',
    onAutoLayout: isCanvasLocked ? undefined : onAutoLayout,
    layoutEngine,
  });

  const displayedEdges = useMemo(() => rfEdges.map(edge => (
    edge.id === dropTargetEdgeId
      ? { ...edge, data: { ...(edge.data as Record<string, unknown>), isNodeDropTarget: true } }
      : edge
  )), [dropTargetEdgeId, rfEdges]);
  const visibleNodeIds = useMemo(
    () => isPreview ? new Set(rfNodes.map(node => node.id)) : null,
    [isPreview, rfNodes],
  );

  const [canvasNodes, setCanvasNodes] = useState<Node[]>(rfNodes);
  const isNodeDraggingRef = useRef(false);
  const canvasNodesRef = useRef<Node[]>(rfNodes);
  const draggedNodeIdsRef = useRef<Set<string>>(new Set());
  const loopBodyDragSessionRef = useRef<{
    nodeId: string;
    position: { x: number; y: number };
    bounds: { x: number; y: number; width: number; height: number };
  } | null>(null);

  useEffect(() => {
    if (isNodeDraggingRef.current) return;
    setCanvasNodes(rfNodes);
    canvasNodesRef.current = rfNodes;
  }, [rfNodes]);

  useEffect(() => {
    const handleNodePreviewDrag = (event: Event) => {
      if (isCanvasLocked || !(event instanceof CustomEvent)) return;
      const detail = event.detail as Partial<NodePreviewDragEventDetail> | undefined;
      if (
        !detail
        || typeof detail.nodeId !== 'string'
        || (detail.phase !== 'start' && detail.phase !== 'move' && detail.phase !== 'end' && detail.phase !== 'cancel')
        || !detail.screenDelta
        || typeof detail.screenDelta.x !== 'number'
        || typeof detail.screenDelta.y !== 'number'
      ) {
        return;
      }

      if (detail.phase === 'start') {
        const canvasNode = canvasNodesRef.current.find(node => node.id === detail.nodeId);
        if (!canvasNode) return;
        const width = typeof canvasNode.width === 'number'
          ? canvasNode.width
          : typeof canvasNode.measured?.width === 'number' ? canvasNode.measured.width : 0;
        const height = typeof canvasNode.height === 'number'
          ? canvasNode.height
          : typeof canvasNode.measured?.height === 'number' ? canvasNode.measured.height : 0;
        const bounds = {
          x: canvasNode.position.x,
          y: canvasNode.position.y,
          width,
          height,
        };
        loopBodyDragSessionRef.current = {
          nodeId: detail.nodeId,
          position: canvasNode.position,
          bounds,
        };
        isNodeDraggingRef.current = true;
        draggedNodeIdsRef.current = new Set([detail.nodeId]);
        setDropTargetEdgeId(null);
        onNodeSelect(detail.nodeId);
        onNodeDragStateChange?.(true);
        setDragPreview({
          id: detail.nodeId,
          bounds,
          delta: { x: 0, y: 0 },
          backgroundColor: LOOP_BODY_DRAG_PREVIEW_BACKGROUND,
        });
        return;
      }

      const session = loopBodyDragSessionRef.current;
      if (!session || session.nodeId !== detail.nodeId) return;

      const flowDelta = screenDeltaToFlowDelta(detail.screenDelta);
      if (detail.phase === 'move') {
        setDragPreview({
          id: detail.nodeId,
          bounds: session.bounds,
          delta: flowDelta,
          backgroundColor: LOOP_BODY_DRAG_PREVIEW_BACKGROUND,
        });
        return;
      }

      setDragPreview(null);
      loopBodyDragSessionRef.current = null;
      isNodeDraggingRef.current = false;
      draggedNodeIdsRef.current = new Set();
      onNodeDragStateChange?.(false);

      if (detail.phase === 'end' && (flowDelta.x !== 0 || flowDelta.y !== 0)) {
        onNodesChange([{
          id: detail.nodeId,
          type: 'position',
          position: {
            x: session.position.x + flowDelta.x,
            y: session.position.y + flowDelta.y,
          },
          dragging: false,
        }]);
      }
    };

    window.addEventListener('workflow:loop-body-drag', handleNodePreviewDrag);
    window.addEventListener('workflow:node-preview-drag', handleNodePreviewDrag);
    return () => {
      window.removeEventListener('workflow:loop-body-drag', handleNodePreviewDrag);
      window.removeEventListener('workflow:node-preview-drag', handleNodePreviewDrag);
    };
  }, [isCanvasLocked, onNodeDragStateChange, onNodeSelect, onNodesChange, screenDeltaToFlowDelta]);

  const groupOverlayItems = useMemo(() => {
    const groups = workflow.groups || [];
    if (groups.length === 0) return [];
    const workflowNodeById = new Map(workflow.nodes.map(node => [node.id, node]));
    const groupById = new Map(groups.map(group => [group.id, group]));
    const collectGroupNodeIds = (groupId: string, visited = new Set<string>()): string[] => {
      if (visited.has(groupId)) return [];
      visited.add(groupId);
      const group = groupById.get(groupId);
      if (!group) return [];
      return [
        ...group.childNodeIds,
        ...group.childGroupIds.flatMap(childGroupId => collectGroupNodeIds(childGroupId, visited)),
      ];
    };

    return groups.map((group) => {
      const nodeIds = collectGroupNodeIds(group.id);
      const childNodes = nodeIds
        .map(nodeId => workflowNodeById.get(nodeId))
        .filter((node): node is Workflow['nodes'][number] => !!node && (!visibleNodeIds || visibleNodeIds.has(node.id)))
        .map((node) => {
          const definition = getNodeDefinition(node.type);
          const size = getWorkflowNodeSize(definition, node.data);
          return {
            id: node.id,
            position: node.position,
            width: size.width,
            height: size.height,
          };
        });
      return { group, childNodes };
    }).filter(({ childNodes }) => !isPreview || childNodes.length > 0);
  }, [isPreview, visibleNodeIds, workflow.groups, workflow.nodes]);

  const { minimapVisible, toggleMinimap, exportCanvas } = useCanvasExport(
    reactFlowWrapper,
    workflow.name,
  );

  const getViewportCenter = useCallback(() => {
    const bounds = reactFlowWrapper.current?.getBoundingClientRect();
    if (!bounds) return { x: 250, y: 250 };
    return screenToFlowPosition({
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    });
  }, [screenToFlowPosition]);

  const focusNode = useCallback((nodeId: string) => {
    fitView({ nodes: [{ id: nodeId }], duration: 500, maxZoom: 1, padding: 0.3 });
  }, [fitView]);

  const selectAll = useCallback(() => {
    if (isCanvasLocked) return;
    onNodesSelect?.(workflow.nodes.map(n => n.id), { primaryNodeId: null });
  }, [isCanvasLocked, workflow.nodes, onNodesSelect]);

  const invertSelection = useCallback(() => {
    if (isCanvasLocked) return;
    const selectedSet = new Set(selectedNodeIds);
    const nextIds = workflow.nodes.map(n => n.id).filter(id => !selectedSet.has(id));
    onNodesSelect?.(nextIds, { primaryNodeId: null });
  }, [isCanvasLocked, workflow.nodes, selectedNodeIds, onNodesSelect]);

  useEffect(() => {
    if (!canvasExportRef) return;
    canvasExportRef.current = { exportCanvas, getViewportCenter, focusNode, selectAll, invertSelection };
    return () => {
      if (canvasExportRef.current?.exportCanvas === exportCanvas) {
        canvasExportRef.current = null;
      }
    };
  }, [canvasExportRef, exportCanvas, getViewportCenter, focusNode, selectAll, invertSelection]);

  // --- Interaction handlers ---

  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (isCanvasLocked) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = Array.from(event.dataTransfer.types).includes(WORKFLOW_STAGED_NODE_DRAG_MIME)
        ? 'copy'
        : 'move';
    }
  }, [isCanvasLocked]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    if (isCanvasLocked) return;
    event.preventDefault();
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const stagedPayload = event.dataTransfer.getData(WORKFLOW_STAGED_NODE_DRAG_MIME);
    if (stagedPayload && onStagedNodeDrop) {
      try {
        onStagedNodeDrop(JSON.parse(stagedPayload) as StagedNode, position);
        return;
      } catch (error) {
        console.warn('[WorkflowCanvas] invalid staged node drag payload', error);
      }
    }

    const type = event.dataTransfer.getData(WORKFLOW_NODE_DRAG_MIME);
    if (!type) return;

    onNodeAdd(type, position);
  }, [isCanvasLocked, onStagedNodeDrop, screenToFlowPosition, onNodeAdd]);

  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    const multi = event.shiftKey || event.metaKey || event.ctrlKey;
    selectEdge(null);
    onNodeSelect(node.id, multi);
  }, [onNodeSelect, selectEdge]);

  const handlePaneClick = useCallback(() => {
    selectEdge(null);
    onNodeSelect(null);
  }, [onNodeSelect, selectEdge]);

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    selectEdge(edge.id);
  }, [selectEdge]);

  const getDropTargetEdgeId = useCallback((nodeId: string) => {
    const nodeDiv = Array.from(
      reactFlowWrapper.current?.querySelectorAll<HTMLElement>('.react-flow__node') ?? [],
    ).find(element => element.dataset.id === nodeId);
    if (!nodeDiv) return null;

    const rect = nodeDiv.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const edgeElement = document
      .elementsFromPoint(centerX, centerY)
      .map(element => element.closest<HTMLElement>('.react-flow__edge[data-id]'))
      .find((element): element is HTMLElement => !!element);
    const edgeId = edgeElement?.dataset.id;
    if (!edgeId) return null;

    const edge = workflow.edges.find(item => item.id === edgeId);
    if (!edge || edge.composite?.locked) return null;
    if (edge.source === nodeId || edge.target === nodeId) return null;
    return edgeId;
  }, [workflow.edges]);

  const handleNodeDrag: OnNodeDrag = useCallback((_, node) => {
    if (isCanvasLocked || !autoMergeNodeOnEdge || draggedNodeIdsRef.current.size > 1) {
      if (dropTargetEdgeId) setDropTargetEdgeId(null);
      return;
    }
    const nextEdgeId = getDropTargetEdgeId(node.id);
    setDropTargetEdgeId(current => current === nextEdgeId ? current : nextEdgeId);
  }, [autoMergeNodeOnEdge, dropTargetEdgeId, getDropTargetEdgeId, isCanvasLocked]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    if (isCanvasLocked) return;
    const positionChanges = changes.filter(isPositionNodeChange);
    const positionCount = positionChanges.length;
    const selectionChanges = changes.filter(
      (change): change is NodeChange & { type: 'select'; id: string; selected: boolean } => change.type === 'select',
    );
    if (selectionChanges.length > 0 && onNodesSelect) {
      const nextSelectedIds = new Set(selectedNodeIds);
      for (const change of selectionChanges) {
        if (change.selected) nextSelectedIds.add(change.id);
        else nextSelectedIds.delete(change.id);
      }
      const nextIds = workflow.nodes.map(node => node.id).filter(id => nextSelectedIds.has(id));
      if (!areStringArraysEqual(selectedNodeIds, nextIds)) {
        if (nextIds.length > 0) selectEdge(null);
        pendingRangeSelectionRef.current = nextIds;
        onNodesSelect(nextIds, {
          primaryNodeId: isRangeSelectingRef.current ? null : undefined,
        });
      }
    }

    if (positionCount > 0) {
      for (const change of positionChanges) {
        draggedNodeIdsRef.current.add(change.id);
      }
      setCanvasNodes((nodes) => {
        const nextNodes = applyNodeChanges(changes, nodes);
        canvasNodesRef.current = nextNodes;
        return nextNodes;
      });
    }

    const parentChanges = isNodeDraggingRef.current
      ? changes.filter(change => change.type !== 'position')
      : changes;
    if (parentChanges.length > 0) {
      onNodesChange(parentChanges);
    }
  }, [isCanvasLocked, onNodesChange, onNodesSelect, selectEdge, selectedNodeIds, workflow.nodes]);

  const handleEdgesChangeWithLock = useCallback((changes: EdgeChange[]) => {
    if (isCanvasLocked) return;
    onEdgesChange(changes);
  }, [isCanvasLocked, onEdgesChange]);

  useEffect(() => {
    if (isCanvasLocked) return;

    const handleCanvasDeleteKey = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (isEditableKeyboardTarget(event.target)) return;

      if (selectedEdgeId) {
        event.preventDefault();
        event.stopPropagation();
        selectEdge(null);
        onEdgesChange([{ id: selectedEdgeId, type: 'remove' }]);
        return;
      }

      if (selectedNodeIds.length === 0) return;

      event.preventDefault();
      event.stopPropagation();
      if (selectedNodeIds.length === 1) onNodeDelete(selectedNodeIds[0]);
      else onBatchDeleteNodes?.(selectedNodeIds);
    };

    window.addEventListener('keydown', handleCanvasDeleteKey, true);
    return () => window.removeEventListener('keydown', handleCanvasDeleteKey, true);
  }, [isCanvasLocked, onBatchDeleteNodes, onEdgesChange, onNodeDelete, selectEdge, selectedEdgeId, selectedNodeIds]);

  const handleSelectionStart = useCallback(() => {
    isRangeSelectingRef.current = true;
    pendingRangeSelectionRef.current = selectedNodeIds;
    onNodesSelect?.(selectedNodeIds, { primaryNodeId: null });
  }, [onNodesSelect, selectedNodeIds]);

  const handleSelectionEnd = useCallback(() => {
    isRangeSelectingRef.current = false;
    const ids = pendingRangeSelectionRef.current ?? selectedNodeIds;
    pendingRangeSelectionRef.current = null;
    onNodesSelect?.(ids, { primaryNodeId: ids.length === 1 ? ids[0] : null });
  }, [onNodesSelect, selectedNodeIds]);

  const handleLassoSelect = useCallback((ids: string[]) => {
    if (ids.length > 0) selectEdge(null);
    onNodesSelect?.(ids, { primaryNodeId: ids.length === 1 ? ids[0] : null });
  }, [onNodesSelect, selectEdge]);

  const handleConnect = useCallback((connection: Connection) => {
    if (isCanvasLocked) return;
    connectSucceededRef.current = true;
    onConnect(connection);
  }, [isCanvasLocked, onConnect]);

  const handleConnectStart: OnConnectStart = useCallback((_, params) => {
    if (!isCanvasLocked) {
      setIsConnecting(true);
      const nodeId = typeof params === 'object' && params && 'nodeId' in params
        ? String((params as { nodeId?: string | null }).nodeId || '')
        : '';
      const handleId = typeof params === 'object' && params && 'handleId' in params
        ? ((params as { handleId?: string | null }).handleId ?? null)
        : null;
      const handleType = typeof params === 'object' && params && 'handleType' in params
        ? ((params as { handleType?: string | null }).handleType ?? null)
        : null;
      connectSourceRef.current = nodeId ? { nodeId, handleId, handleType } : null;
      connectSucceededRef.current = false;
    }
  }, [isCanvasLocked]);

  const handleConnectEnd: OnConnectEnd = useCallback((event) => {
    setIsConnecting(false);
    const connectSource = connectSourceRef.current;
    if (!isCanvasLocked && connectSource && !connectSucceededRef.current) {
      const isSourceHandle = connectSource.handleType === 'source';
      if (!isSourceHandle) {
        connectSourceRef.current = null;
        connectSucceededRef.current = false;
        return;
      }

      let clientPosition: { x: number; y: number } | null = null;
      if ('clientX' in event && 'clientY' in event) {
        clientPosition = { x: event.clientX, y: event.clientY };
      } else if ('changedTouches' in event && event.changedTouches.length > 0) {
        const touch = event.changedTouches[0];
        clientPosition = { x: touch.clientX, y: touch.clientY };
      }

      const badgeTarget = clientPosition ? getWorkflowBadgeHandleTarget(clientPosition) : null;
      if (
        badgeTarget
        && badgeTarget.handleType === 'target'
        && badgeTarget.nodeId !== connectSource.nodeId
      ) {
        const connection: Connection = {
          source: connectSource.nodeId,
          sourceHandle: connectSource.handleId,
          target: badgeTarget.nodeId,
          targetHandle: badgeTarget.handleId,
        };
        connectSucceededRef.current = true;
        onConnect(connection);
        connectSourceRef.current = null;
        connectSucceededRef.current = false;
        return;
      }

      if (clientPosition && isConnectionEndOnCanvasNode(clientPosition, { ignoredNodeIds: scopeBoundaryNodeIds })) {
        connectSourceRef.current = null;
        connectSucceededRef.current = false;
        return;
      }

      const position = clientPosition ? screenToFlowPosition(clientPosition) : null;
      onConnectionDrop?.({
        sourceNodeId: connectSource.nodeId,
        sourceHandle: connectSource.handleId,
        position,
      });
    }

    connectSourceRef.current = null;
    connectSucceededRef.current = false;
  }, [isCanvasLocked, onConnect, onConnectionDrop, scopeBoundaryNodeIds, screenToFlowPosition]);

  const handleNodeDragStart = useCallback((_: React.MouseEvent, node: Node) => {
    isNodeDraggingRef.current = true;
    draggedNodeIdsRef.current = new Set([node.id]);
    canvasNodesRef.current = canvasNodes;
    setDropTargetEdgeId(null);
    onNodeDragStateChange?.(true);
  }, [canvasNodes, onNodeDragStateChange]);

  const handleNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    const edgeId = autoMergeNodeOnEdge && draggedNodeIdsRef.current.size === 1
      ? dropTargetEdgeId
      : null;
    const nextCanvasNodes = collisionBoxEnabled
      ? (() => {
          const collisionNodes = canvasNodesRef.current.filter(item => !scopeBoundaryNodeIds.has(item.id));
          const resolvedNodes = resolveNodeCollisions(collisionNodes, WORKFLOW_COLLISION_OPTIONS);
          const resolvedNodeById = new Map(resolvedNodes.map(item => [item.id, item]));
          return canvasNodesRef.current.map(item => resolvedNodeById.get(item.id) ?? item);
        })()
      : canvasNodesRef.current;
    canvasNodesRef.current = nextCanvasNodes;
    setCanvasNodes(nextCanvasNodes);
    const workflowNodeById = new Map(workflow.nodes.map(item => [item.id, item]));
    const positionChanges: NodeChange[] = nextCanvasNodes
      .map((canvasNode) => {
        const workflowNode = workflowNodeById.get(canvasNode.id);
        if (!workflowNode) return null;
        if (canvasNode.position.x === workflowNode.position.x && canvasNode.position.y === workflowNode.position.y) return null;
        return {
          id: canvasNode.id,
          type: 'position' as const,
          position: canvasNode.position,
          dragging: false,
        };
      })
      .filter(isNonNull);
    isNodeDraggingRef.current = false;
    draggedNodeIdsRef.current = new Set();
    onNodeDragStateChange?.(false);
    if (positionChanges.length > 0) {
      onNodesChange(positionChanges);
    }
    if (edgeId) {
      onInsertExistingNodeOnEdge?.(edgeId, node.id);
    }
    setDropTargetEdgeId(null);
  }, [autoMergeNodeOnEdge, collisionBoxEnabled, dropTargetEdgeId, onInsertExistingNodeOnEdge, onNodeDragStateChange, onNodesChange, scopeBoundaryNodeIds, workflow.nodes]);

  const handleReactFlowError = useCallback((code: string, message: string) => {
    console.warn('[WorkflowCanvas] ReactFlow error', { code, message });
  }, []);

  // --- Render ---
  return (
    <div
      ref={reactFlowWrapper}
      className={`relative flex-1 h-full w-full ${floatingHandles && isConnecting ? 'workflow-canvas-show-floating-handles' : ''}`}
      onContextMenuCapture={handleSelectionContextMenu}
    >
      <WorkflowLogsCollapsedContext.Provider value={{ collapsed: logsCollapsed, toggle: () => setLogsCollapsed(c => !c) }}>
      <ReactFlow
        className="h-full w-full"
        colorMode={canvasThemeColorMode}
        style={canvasThemeStyle}
        nodes={canvasNodes}
        edges={displayedEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChangeWithLock}
        onConnect={handleConnect}
        isValidConnection={isValidConnection}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onNodeClick={handleNodeClick}
        onNodeDragStart={handleNodeDragStart}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onEdgeClick={handleEdgeClick}
        onSelectionStart={handleSelectionStart}
        onSelectionEnd={handleSelectionEnd}
        onPaneClick={handlePaneClick}
        onError={handleReactFlowError}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionLineComponent={WorkflowSelectionConnectionLine}
        fitView
        snapToGrid={snapEnabled}
        snapGrid={[15, 15]}
        minZoom={0.2}
        maxZoom={4}
        deleteKeyCode={null}
        panActivationKeyCode={null}
        nodesDraggable={!isCanvasLocked}
        nodesConnectable={!isCanvasLocked}
        edgesReconnectable={!isCanvasLocked}
        elevateNodesOnSelect={false}
        defaultEdgeOptions={{ type: 'custom' }}
      >
        <ViewportPortal>
          {groupOverlayItems.map(({ group, childNodes }) => (
            <WorkflowGroupOverlay
              key={group.id}
              group={group}
              childNodes={childNodes}
              isSelected={selectedGroupId === group.id}
              onSelect={setSelectedGroupId}
              onDelete={(groupId) => onGroupDelete?.(groupId)}
              onUpdate={(groupId, updates) => onGroupUpdate?.(groupId, updates)}
              onMove={(groupId, delta, options) => onGroupMove?.(groupId, delta, options)}
              onAutoLayout={isCanvasLocked ? undefined : onAutoLayout}
              layoutEngine={layoutEngine}
              onDragPreviewChange={(preview) => {
                setDragPreview(preview
                  ? {
                      id: preview.groupId,
                      bounds: preview.bounds,
                      delta: preview.delta,
                      backgroundColor: GROUP_DRAG_PREVIEW_BACKGROUND,
                    }
                  : null);
              }}
              screenDeltaToFlowDelta={screenDeltaToFlowDelta}
            />
          ))}
          {dragPreview ? <DragPreviewOverlay preview={dragPreview} /> : null}
        </ViewportPortal>
        <Background variant={bgVariant} gap={15} size={1} />
        <Controls position="bottom-left" />
        {minimapVisible && <MiniMap />}
        <WorkflowHelperLines horizontal={helperHorizontal} vertical={helperVertical} />
      </ReactFlow>
      </WorkflowLogsCollapsedContext.Provider>
      {rectangleDrawActive && !isCanvasLocked && onRectangleDrawNodeSelect && (
        <RectangleDrawTool onComplete={onRectangleDrawNodeSelect} />
      )}
      {resizePreviewRect ? <RectangleOverlayRect rect={resizePreviewRect} /> : null}
      {lassoSelectionActive && !isCanvasLocked && onNodesSelect && (
        <LassoSelectionTool workflow={workflow} onSelect={handleLassoSelect} />
      )}
      {selectionMenu && (
        <WorkflowSelectionMenu
          menu={selectionMenu}
          onMergeNodesToWorkflow={onMergeNodesToWorkflow}
          onMergeNodesToGroup={onMergeNodesToGroup}
          onBatchDeleteNodes={onBatchDeleteNodes}
          onClose={closeSelectionMenu}
        />
      )}
      <CanvasToolbar
        workflow={workflow}
        isPreview={isPreview}
        canUndo={!isCanvasLocked && canUndo}
        canRedo={!isCanvasLocked && canRedo}
        rectangleDrawActive={rectangleDrawActive}
        lassoSelectionActive={lassoSelectionActive}
        minimapVisible={minimapVisible}
        onUndo={onUndo}
        onRedo={onRedo}
        onExitPreview={onExitPreview}
        onAutoLayout={isCanvasLocked ? undefined : onAutoLayout}
        layoutEngine={layoutEngine}
        copiedNodeCount={isCanvasLocked ? 0 : copiedNodeCount}
        copiedRecords={isCanvasLocked ? [] : copiedRecords}
        onPasteRecord={isCanvasLocked ? undefined : onPasteRecord}
        onMoveRecord={isCanvasLocked ? undefined : onMoveRecord}
        onClearCopiedNodes={isCanvasLocked ? undefined : onClearCopiedNodes}
        onToggleRectangleDraw={
          isCanvasLocked || !onRectangleDrawNodeSelect
            ? undefined
            : () => {
                setLassoSelectionActive(false);
                setRectangleDrawActive(active => !active);
              }
        }
        onToggleLassoSelection={
          isCanvasLocked || !onNodesSelect
            ? undefined
            : () => {
                setRectangleDrawActive(false);
                setLassoSelectionActive(active => !active);
              }
        }
        onToggleMinimap={toggleMinimap}
        logsCollapsed={logsCollapsed}
        onToggleLogsCollapsed={() => setLogsCollapsed(c => !c)}
      />
    </div>
  );
}
