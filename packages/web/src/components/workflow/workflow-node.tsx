'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Handle, NodeToolbar, Position, useConnection, useNodeConnections, useStore, useUpdateNodeInternals } from '@xyflow/react';
import type { NodeProps, ReactFlowState } from '@xyflow/react';
import {
  ChevronDown,
  ChevronUp,
  Flag,
  Grip,
  Loader2,
  MoveDiagonal,
  Palette,
  Play,
  Square,
  X,
} from 'lucide-react';
import { getNodeDefinition, getPluginNodesVersion, subscribePluginNodesVersion, useLocalizedNodeDefinition } from '@/lib/workflow-nodes';
import {
  type ExecutionStep,
  type WorkflowNode as SharedWorkflowNode,
  type OutputField,
  LOOP_BODY_NODE_TYPE,
  LOOP_BODY_SOURCE_HANDLE,
} from '@agent-spaces/shared';
import { BorderGlide } from '@/components/ui/border-glide';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { WorkflowNodeDefinitionIcon } from './workflow-node-icon';
import { getWorkflowNodeSize, getWorkflowNodeVariableReferences } from './workflow-node-size';
import {
  isPluginWorkflowCustomViewDefinition,
  PluginWorkflowCustomView,
} from './plugin-workflow-custom-view';
import {
  NODE_COLORS,
  NODE_COLOR_MAP,
  type WorkflowNodeData,
  type WorkflowCustomViewProps,
  type PluginNodeDefinitionMeta,
} from './workflow-node-types';
import { WorkflowNodeContextMenu } from './workflow-node-context-menu';
import { useWorkflowLogsCollapsed } from './workflow-logs-collapsed-context';
import {
  HANDLE_POSITION_MAP,
  getHandleStyle,
  getHandleTop,
  getSourceLabelStyle,
  getTargetHandleStyle,
  WORKFLOW_NODE_DRAG_HANDLE_CLASS,
  type HandleContext,
} from './workflow-node-handles';
import { WorkflowNodeExecutionLog } from './workflow-node-execution-log';
import {
  EXECUTION_DATA_KEY,
  EXECUTION_INPUT_FIELDS_KEY,
  EXECUTION_OUTPUTS_KEY,
} from './workflow-execution-snapshot-fields';
import {
  areWorkflowHandleValueTypesCompatible,
  getWorkflowHandleValueType,
  mapPropertyDataTypeToWorkflowHandleType,
} from './workflow-handle-types';
import { getEffectiveDataType } from './workflow-properties-utils';
import { getWorkflowFieldHandleId } from './workflow-field-handles';
import { JSON_PRESETS_KEY, SELECTED_JSON_PRESET_KEY, getJsonPresets } from './workflow-properties-utils';
import { VariableBadgeInput } from './workflow-variable-input';
import { WorkflowPropertiesPanel } from './workflow-properties-panel';
import { useWorkflowNodeActions } from './use-workflow-node-actions';
import { areWorkflowNodePropsEqual } from './workflow-node-memo';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const DEFAULT_SOURCE_HANDLE_COLOR = '#10b981';
const LOOP_BODY_SOURCE_HANDLE_COLOR = '#3b82f6';
const DEFAULT_DYNAMIC_HANDLE_COLOR = '#10b981';
const DEFAULT_DYNAMIC_FALLBACK_HANDLE_COLOR = '#f97316';
const SOURCE_HANDLE_KEY = 'source';
const COMPACT_NODE_ZOOM_THRESHOLD = 0.65;
const COLLAPSED_NODE_SIZE = 56;
const showFullNodeSelector = (state: ReactFlowState) =>
  state.transform[2] >= COMPACT_NODE_ZOOM_THRESHOLD;
const canvasZoomSelector = (state: ReactFlowState) => state.transform[2] || 1;

const workflowNodesSelector = (state: ReactFlowState) => state.nodes;
type NodePreviewDragPhase = 'start' | 'move' | 'end' | 'cancel';

function getWorkflowFields(value: unknown): OutputField[] {
  return Array.isArray(value) ? value.filter((field): field is OutputField => (
    !!field && typeof field === 'object' && typeof (field as OutputField).key === 'string'
  )) : [];
}

function getRecordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

type PropertyModeHandle = {
  id: string;
  label: string;
  side: 'left' | 'right';
  type: 'target' | 'source';
  color: string;
  valueType?: string;
  tooltip?: string;
  depth?: number;
};

function getVariableContextNodeLabel(
  nodeType: string,
  data: Record<string, unknown>,
  fallbackLabel: unknown,
  t: (key: string) => string,
): string {
  const resolveLabel = (value: unknown) => {
    const label = String(value ?? '');
    return label && !label.startsWith('nodes.') ? label : '';
  };
  const definition = getNodeDefinition(nodeType);
  const label = resolveLabel(data.label) || resolveLabel(fallbackLabel) || definition?.label || nodeType;
  return label.startsWith('nodes.') ? t(label) : label;
}

function WorkflowNodeComponent({ id, data, type, selected }: NodeProps) {
  const nodeData = data as WorkflowNodeData;
  const t = useTranslations('workflows');
  const showFullNode = useStore(showFullNodeSelector);
  const canvasZoom = useStore(canvasZoomSelector);
  const workflowNodes = useStore(workflowNodesSelector);
  const connectionState = useConnection();
  const workflowNodeType = typeof nodeData.nodeType === 'string' ? nodeData.nodeType : type;
  const updateNodeInternals = useUpdateNodeInternals();
  useSyncExternalStore(
    subscribePluginNodesVersion,
    getPluginNodesVersion,
    getPluginNodesVersion,
  );
  const definition = useLocalizedNodeDefinition(workflowNodeType || 'unknown');
  const pluginMeta = definition as (typeof definition & PluginNodeDefinitionMeta);
  const iconDefinition = definition ? { ...definition, ...pluginMeta } : null;
  const pluginCustomView = isPluginWorkflowCustomViewDefinition(definition?.customView)
    ? definition.customView
    : null;
  const CustomView = !pluginCustomView
    ? definition?.customView as React.ComponentType<WorkflowCustomViewProps> | undefined
    : undefined;
  const hasCustomView = !!CustomView || !!pluginCustomView;

  const { collapsed: logsCollapsed } = useWorkflowLogsCollapsed();
  const [isLogExpanded, setIsLogExpanded] = useState(false);
  const [isNodeCollapsed, setIsNodeCollapsed] = useState(false);
  // 全局切换时同步本地状态
  useEffect(() => {
    setIsLogExpanded(!logsCollapsed);
  }, [logsCollapsed]);
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [handleColorMenuId, setHandleColorMenuId] = useState<string | null>(null);
  const [continueDialogOpen, setContinueDialogOpen] = useState(false);
  const [continuePresetId, setContinuePresetId] = useState('debug');
  const inputRef = useRef<HTMLInputElement>(null);
  const nodeBodyRef = useRef<HTMLDivElement>(null);
  const propertyNodeViewRef = useRef<HTMLDivElement>(null);
  const propertyContentRef = useRef<HTMLDivElement | null>(null);
  const [measuredPropertyHeight, setMeasuredPropertyHeight] = useState<number>(0);
  const rafCleanupRef = useRef<(() => void) | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  const displayLabel = useMemo(
    () => {
      const raw = nodeData.label;
      const resolved = raw && !raw.startsWith('nodes.') ? raw : '';
      return resolved || definition?.label || workflowNodeType || '';
    },
    [nodeData.label, definition?.label, workflowNodeType],
  );

  const isStartNode = definition?.type === 'start';
  const isEndNode = definition?.type === 'end';
  const isBoundaryNode = isStartNode || isEndNode;
  const isLoopBody = definition?.type === LOOP_BODY_NODE_TYPE;
  const canDeleteNode = !isLoopBody;
  const isCanvasLocked = nodeData.isCanvasLocked;
  const selectedNodeIds = useMemo(
    () => Array.isArray(nodeData.selectedNodeIds) ? nodeData.selectedNodeIds : [],
    [nodeData.selectedNodeIds],
  );
  const canShowNodeToolbar = !isCanvasLocked;
  const handleColors = useMemo(() => {
    const raw = nodeData.handleColors;
    return raw && typeof raw === 'object' ? raw : {};
  }, [nodeData.handleColors]);

  React.useEffect(() => {
    if (isCanvasLocked) setIsEditing(false);
  }, [isCanvasLocked]);

  const showTargetHandle = definition?.handles?.target !== false;
  const showSourceHandle = definition?.handles?.source !== false;
  const targetConnectionCount = definition?.handles?.connectionCount ?? 1;
  const targetConnections = useNodeConnections({ id, handleType: 'target', handleId: 'target' });
  const isTargetConnectable = targetConnections.length < targetConnectionCount;
  const staticSourceHandles = definition?.handles?.sourceHandles || [];
  const handlePositionMode = nodeData.handlePosition || 'left-right';
  const handlePositions = HANDLE_POSITION_MAP[handlePositionMode] || HANDLE_POSITION_MAP['left-right'];
  const logPanelLayout = nodeData.logPanelLayout === 'tabs' ? 'tabs' : 'vertical';
  const nodeDisplayMode = nodeData.nodeDisplayMode === 'properties' ? 'properties' : 'normal';
  const floatingHandles = !isNodeCollapsed && (nodeData.floatingHandles === true || nodeDisplayMode === 'properties');
  const floatingHandleClassName = floatingHandles ? 'workflow-node-floating-handle' : '';
  const floatingLabelClassName = floatingHandles ? 'workflow-node-floating-handle-label' : '';
  const inputFields = useMemo(() => getWorkflowFields(nodeData.inputFields), [nodeData.inputFields]);
  const outputFields = useMemo(() => getWorkflowFields(nodeData.outputs), [nodeData.outputs]);
  const propertyFields = useMemo(() => (
    definition?.properties?.filter(prop => !prop.visibleWhen || (
      'equals' in prop.visibleWhen
        ? nodeData[prop.visibleWhen.key] === prop.visibleWhen.equals
        : prop.visibleWhen.in?.includes(nodeData[prop.visibleWhen.key])
    )) ?? []
  ), [definition?.properties, nodeData]);
  const canShowPropertyNodeView = nodeDisplayMode === 'properties' && !isLoopBody && !hasCustomView && !isNodeCollapsed;
  const propertyModeHandles = useMemo<PropertyModeHandle[]>(() => {
    if (!canShowPropertyNodeView) return [];
    const isStartNode = workflowNodeType === 'start';

    const inputHandles = inputFields.map((field, index) => ({
      id: getWorkflowFieldHandleId(isStartNode ? 'output' : 'input', field.key, index),
      label: field.key,
      side: isStartNode ? 'right' as const : 'left' as const,
      type: isStartNode ? 'source' as const : 'target' as const,
      color: '#3b82f6',
      valueType: field.type,
      tooltip: field.description,
    }));
    const propertyHandles = propertyFields.map((field, index) => ({
      id: getWorkflowFieldHandleId('property', field.key, index),
      label: field.label || field.key,
      side: 'left' as const,
      type: 'target' as const,
      color: '#8b5cf6',
      valueType: mapPropertyDataTypeToWorkflowHandleType(getEffectiveDataType(field)),
      tooltip: field.tooltip,
    }));
    const outputHandles = outputFields.reduce<PropertyModeHandle[]>((acc, field, index) => {
      const appendOutputField = (current: OutputField, parentKey: string, depth: number) => {
        const compositeKey = parentKey ? `${parentKey}.${current.key}` : current.key;
        acc.push({
          id: getWorkflowFieldHandleId('output', compositeKey, index),
          label: parentKey ? `↳ ${current.key}` : current.key,
          side: 'right' as const,
          type: 'source' as const,
          color: DEFAULT_SOURCE_HANDLE_COLOR,
          valueType: current.type,
          tooltip: current.description,
          depth,
        });
        if (current.type === 'object' && Array.isArray(current.children) && current.children.length > 0) {
          current.children.forEach((child) => appendOutputField(child, compositeKey, depth + 1));
        }
      };
      appendOutputField(field, '', 0);
      return acc;
    }, []);

    return [...inputHandles, ...propertyHandles, ...outputHandles];
  }, [canShowPropertyNodeView, inputFields, outputFields, propertyFields, workflowNodeType]);
  const propertyModeLeftHandles = useMemo(
    () => propertyModeHandles.filter(handle => handle.side === 'left'),
    [propertyModeHandles],
  );
  const propertyModeRightHandles = useMemo(
    () => propertyModeHandles.filter(handle => handle.side === 'right'),
    [propertyModeHandles],
  );
  const getHandleValueType = useCallback((nodeId: string, handleId: string | null | undefined): OutputField['type'] | undefined => {
    const node = workflowNodes.find(item => item.id === nodeId);
    return getWorkflowHandleValueType(node as SharedWorkflowNode | undefined, handleId);
  }, [workflowNodes]);
  const validatePropertyModeConnection = useCallback((handle: PropertyModeHandle) => (
    (connection: { source?: string | null; target?: string | null; sourceHandle?: string | null; targetHandle?: string | null }) => {
      if (!connection.source || !connection.target) return true;
      const sourceType = handle.type === 'source'
        ? handle.valueType
        : getHandleValueType(connection.source, connection.sourceHandle);
      const targetType = handle.type === 'target'
        ? handle.valueType
        : getHandleValueType(connection.target, connection.targetHandle);
      return areWorkflowHandleValueTypesCompatible(sourceType, targetType);
    }
  ), [getHandleValueType]);
  const getPropertyHandleVisualState = useCallback((handle: PropertyModeHandle) => {
    const fromHandle = connectionState.fromHandle;
    const inProgress = connectionState.inProgress;
    if (!inProgress || !fromHandle) {
      return {
        isActiveSource: false,
        isIncompatibleTarget: false,
        sourceType: undefined as OutputField['type'] | undefined,
      };
    }

    const sourceType = getHandleValueType(fromHandle.nodeId, fromHandle.id);
    const isActiveSource = handle.type === 'source'
      && fromHandle.nodeId === id
      && fromHandle.id === handle.id
      && fromHandle.type === 'source';
    const isIncompatibleTarget = handle.type === 'target'
      && fromHandle.type === 'source'
      && !areWorkflowHandleValueTypesCompatible(sourceType, handle.valueType);

    return { isActiveSource, isIncompatibleTarget, sourceType };
  }, [connectionState.fromHandle, connectionState.inProgress, getHandleValueType, id]);
  const variableReferences = useMemo(
    () => Array.from(new Set(getWorkflowNodeVariableReferences(nodeData))),
    [nodeData],
  );
  const variableContext = useMemo(() => ({
    nodes: workflowNodes.map((node): SharedWorkflowNode => {
      const currentData = node.data as Record<string, unknown>;
      const currentType = typeof currentData.nodeType === 'string' ? currentData.nodeType : node.type || '';
      return {
        id: node.id,
        type: currentType,
        label: getVariableContextNodeLabel(currentType, currentData, node.id, t),
        position: node.position,
        data: currentData,
      };
    }),
    edges: [],
  }), [workflowNodes, t]);

  // Dynamic handles for switch node
  const dynamicSource = definition?.handles?.dynamicSource;
  const dynamicHandles = useMemo(() => {
    if (!dynamicSource) return null;
    const conditions = (data as Record<string, unknown>)?.[dynamicSource.dataKey];
    const arr: unknown[] = Array.isArray(conditions) ? conditions : [];
    const extra = dynamicSource.extraCount || 0;
    const total = arr.length + extra;
    if (total === 0) return null;
    return Array.from({ length: total }, (_, i) => ({
      id: i < arr.length ? `case-${i}` : 'default',
      label: i < arr.length ? t('nodeUi.condition', { index: i + 1 }) : t('nodeUi.conditionDefault'),
      index: i,
      total,
    }));
  }, [dynamicSource, data, t]);

  const nodeSize = useMemo(
    () => getWorkflowNodeSize(definition, nodeData),
    [definition, nodeData],
  );
  const {
    minWidth: nodeMinWidth,
    minHeight: nodeMinHeight,
    width: nodeWidth,
    height: nodeHeight,
    sourceHandleCount,
  } = nodeSize;
  const displayNodeWidth = isNodeCollapsed ? COLLAPSED_NODE_SIZE : nodeWidth;
  const displayNodeHeight = isNodeCollapsed
    ? COLLAPSED_NODE_SIZE
    : (canShowPropertyNodeView && measuredPropertyHeight > 0 ? measuredPropertyHeight : nodeHeight);
  const canShowNodeContent = showFullNode && !isNodeCollapsed;
  const keepCustomViewMounted = hasCustomView && !isNodeCollapsed;
  const canShowVariableReferences = !isLoopBody && !hasCustomView && variableReferences.length > 0;
  const selectedJsonPresetId = typeof nodeData[SELECTED_JSON_PRESET_KEY] === 'string'
    ? nodeData[SELECTED_JSON_PRESET_KEY]
    : '';
  const selectedJsonPreset = selectedJsonPresetId
    ? getJsonPresets(nodeData[JSON_PRESETS_KEY]).find(preset => preset.id === selectedJsonPresetId) ?? null
    : null;

  React.useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals, sourceHandleCount, showTargetHandle, showSourceHandle, displayNodeHeight, handlePositions.target, handlePositions.source, workflowNodeType, nodeDisplayMode, inputFields.length, outputFields.length, propertyFields.length]);

  // 属性模式：测量面板实际内容高度，动态撑开节点
  // 依赖 canShowNodeContent：缩放到图标态会卸载 panel，放大回来需重新挂载测量/监听
  React.useEffect(() => {
    if (!canShowPropertyNodeView || !canShowNodeContent || typeof ResizeObserver === 'undefined') return;
    const wrapper = propertyContentRef.current;
    if (!wrapper) return;
    const measureTarget = wrapper.firstElementChild as HTMLElement | null;
    if (!measureTarget) return;
    // 用 scrollHeight 取完整内容高度（不受外层节点高度钳制），getBoundingClientRect 在长内容时会被 flex 链路限制
    const update = () => {
      const next = Math.ceil(measureTarget.scrollHeight);
      if (next > 0) setMeasuredPropertyHeight(prev => (prev === next ? prev : next));
    };
    // 首次延迟到布局稳定后测量（双 rAF 应对 panel 异步内容），ResizeObserver 负责后续变化
    const raf1 = requestAnimationFrame(() => {
      update();
      const raf2 = requestAnimationFrame(update);
      rafCleanupRef.current = () => cancelAnimationFrame(raf2);
    });
    rafCleanupRef.current = () => cancelAnimationFrame(raf1);
    const observer = new ResizeObserver(update);
    observer.observe(measureTarget);
    return () => {
      rafCleanupRef.current?.();
      rafCleanupRef.current = null;
      observer.disconnect();
    };
  }, [canShowPropertyNodeView, canShowNodeContent]);

  const handleCtx: HandleContext = useMemo(
    () => ({ isLoopBody, nodeHeight: displayNodeHeight, handlePositions }),
    [isLoopBody, displayNodeHeight, handlePositions],
  );

  const getSourceHandleColor = useCallback((handleId: string, fallback: string) => {
    const colorKey = handleColors[handleId];
    return colorKey ? NODE_COLOR_MAP[colorKey] ?? fallback : fallback;
  }, [handleColors]);

  const getSourceHandleStyle = useCallback((
    handleId: string,
    fallback: string,
    position: Position,
    index: number,
    total: number,
  ): React.CSSProperties => {
    const color = getSourceHandleColor(handleId, fallback);
    return {
      ...getHandleStyle(position, index, total, handleCtx),
      backgroundColor: color,
      borderColor: color,
      borderWidth: '2px',
    };
  }, [getSourceHandleColor, handleCtx]);

  const openHandleColorMenu = useCallback((event: React.MouseEvent, handleId: string) => {
    if (isCanvasLocked) return;
    event.preventDefault();
    event.stopPropagation();
    setHandleColorMenuId(handleId);
  }, [isCanvasLocked]);

  const startEdit = useCallback(() => {
    if (isCanvasLocked) return;
    setEditLabel(displayLabel);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [displayLabel, isCanvasLocked]);

  const finishEdit = useCallback(() => {
    setIsEditing(false);
    if (!isCanvasLocked && editLabel && editLabel !== displayLabel) {
      window.dispatchEvent(new CustomEvent('workflow:update-node-data', {
        detail: { nodeId: id, data: { label: editLabel } },
      }));
    }
  }, [editLabel, displayLabel, id, isCanvasLocked]);

  // Execution status is injected by WorkflowCanvas from the current execution log.
  const executionStep = nodeData.executionStep;
  const nodeStatus = nodeData.isRunning ? 'running' : executionStep?.status || 'idle';
  const currentNodeState = nodeData.nodeState || 'normal';
  const currentBreakpoint = nodeData.breakpoint || null;
  const isCurrentNodeDebugging = nodeData.debugNodeId === id && nodeData.debugStatus === 'running';
  const currentNodeDebugStatus = nodeData.debugNodeId === id ? nodeData.debugStatus : 'idle';
  const hasCurrentNodeDebugResult = nodeData.debugNodeId === id && currentNodeDebugStatus !== 'idle';
  const isDebugging = nodeData.debugStatus === 'running';
  const isExecutionBusy = nodeData.execStatus === 'running' || nodeData.execStatus === 'paused';
  const isDeleteDisabled = isExecutionBusy || isDebugging;
  const isPartialTesting = nodeData.execStatus === 'running' && nodeData.partialExecutionStartNodeId === id;
  const isPausedAtThisNode = nodeData.execStatus === 'paused'
    && nodeData.pausedNodeId === id
    && (
      nodeData.pausedReason === 'breakpoint-start'
      || nodeData.pausedReason === 'breakpoint-end'
      || !!currentBreakpoint
    );
  const debugExecutionStep = useMemo<ExecutionStep | undefined>(() => {
    if (!hasCurrentNodeDebugResult) return undefined;
    const status = currentNodeDebugStatus === 'error'
      ? 'error'
      : currentNodeDebugStatus === 'running' ? 'running' : 'completed';
    return {
      nodeId: id,
      nodeLabel: displayLabel,
      startedAt: 0,
      finishedAt: status === 'running' ? undefined : 0,
      status,
    };
  }, [currentNodeDebugStatus, displayLabel, hasCurrentNodeDebugResult, id]);
  const displayExecutionStep = executionStep ?? debugExecutionStep;
  const canContinueFromPreview = nodeData.isPreview === true
    && displayExecutionStep?.status === 'completed'
    && !isBoundaryNode;
  const canShowExecutionLog = !!displayExecutionStep
    && (
      displayExecutionStep.status === 'running'
      || displayExecutionStep.status === 'completed'
      || displayExecutionStep.status === 'error'
    );

  const stateBadge = currentNodeState === 'disabled'
    ? t('nodeUi.stateBadge.disabled')
    : currentNodeState === 'skipped' ? t('nodeUi.stateBadge.skipped') : '';
  const breakpointBadge = currentBreakpoint === 'start'
    ? t('nodeUi.breakpointBadge.start')
    : currentBreakpoint === 'end' ? t('nodeUi.breakpointBadge.end') : '';
  const nodeColor = NODE_COLORS.find(color => color.value === nodeData.nodeColor);
  const stateBackgroundClass = currentNodeState === 'disabled'
    ? 'bg-red-500/10'
    : currentNodeState === 'skipped' ? 'bg-yellow-500/10' : nodeColor?.backgroundClassName || 'bg-background';

  const statusColor = isPausedAtThisNode
    ? 'border-blue-600 ring-2 ring-blue-500 shadow-blue-500/40 shadow-md animate-pulse'
    : currentNodeDebugStatus === 'completed'
    ? 'border-green-500 shadow-green-500/15 shadow-sm'
    : currentNodeDebugStatus === 'error'
    ? 'border-destructive shadow-destructive/20 shadow-sm'
    : nodeStatus === 'running'
    ? 'border-blue-500 shadow-blue-500/30 shadow-md'
    : nodeStatus === 'completed'
      ? 'border-green-500/70 shadow-green-500/15 shadow-sm'
      : nodeStatus === 'error'
        ? 'border-destructive/70 shadow-destructive/15 shadow-sm'
        : nodeStatus === 'skipped'
          ? 'border-yellow-500'
    : nodeColor?.borderClassName || 'border-border';

  const actions = useWorkflowNodeActions({
    id,
    isCanvasLocked: !!isCanvasLocked,
    isBoundaryNode,
    isCurrentNodeDebugging,
    isExecutionBusy,
    isDeleteDisabled,
    selectedNodeIds,
    nodeMinWidth,
    nodeMinHeight,
  });

  const dispatchResizePreview = useCallback((rect: { left: number; top: number; width: number; height: number } | null) => {
    window.dispatchEvent(new CustomEvent('workflow:node-resize-preview', { detail: { rect } }));
  }, []);

  useEffect(() => () => {
    resizeCleanupRef.current?.();
    dispatchResizePreview(null);
  }, [dispatchResizePreview]);

  const handleResizePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (isCanvasLocked) return;
    event.preventDefault();
    event.stopPropagation();

    const nodeRect = nodeBodyRef.current?.getBoundingClientRect();
    if (!nodeRect) return;

    resizeCleanupRef.current?.();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = displayNodeWidth;
    const startHeight = displayNodeHeight;
    const zoom = canvasZoom || 1;
    let nextSize = { width: startWidth, height: startHeight };

    const updatePreview = (size: { width: number; height: number }) => {
      dispatchResizePreview({
        left: nodeRect.left,
        top: nodeRect.top,
        width: size.width * zoom,
        height: size.height * zoom,
      });
    };

    updatePreview(nextSize);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const width = Math.max(nodeMinWidth, Math.round(startWidth + (moveEvent.clientX - startX) / zoom));
      const height = Math.max(nodeMinHeight, Math.round(startHeight + (moveEvent.clientY - startY) / zoom));
      nextSize = { width, height };
      updatePreview(nextSize);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      resizeCleanupRef.current = null;
    };

    const handlePointerUp = () => {
      cleanup();
      dispatchResizePreview(null);
      actions.handleResizeEnd(null, nextSize);
    };

    const handlePointerCancel = () => {
      cleanup();
      dispatchResizePreview(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    resizeCleanupRef.current = handlePointerCancel;
  }, [actions, canvasZoom, dispatchResizePreview, displayNodeHeight, displayNodeWidth, isCanvasLocked, nodeMinHeight, nodeMinWidth]);

  const dispatchNodePreviewDrag = useCallback((phase: NodePreviewDragPhase, screenDelta: { x: number; y: number }) => {
    window.dispatchEvent(new CustomEvent('workflow:node-preview-drag', {
      detail: { nodeId: id, phase, screenDelta },
    }));
  }, [id]);

  const handleCustomViewDragPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (isCanvasLocked) return;
    event.preventDefault();
    event.stopPropagation();

    const pointerId = event.pointerId;
    const element = event.currentTarget;
    const start = { x: event.clientX, y: event.clientY };
    let frameId: number | null = null;
    let pendingScreenDelta = { x: 0, y: 0 };

    dispatchNodePreviewDrag('start', pendingScreenDelta);
    element.setPointerCapture(pointerId);

    const flushPreview = () => {
      frameId = null;
      dispatchNodePreviewDrag('move', pendingScreenDelta);
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      pendingScreenDelta = {
        x: moveEvent.clientX - start.x,
        y: moveEvent.clientY - start.y,
      };
      if (frameId === null) {
        frameId = requestAnimationFrame(flushPreview);
      }
    };

    const finishDrag = (phase: 'end' | 'cancel') => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      dispatchNodePreviewDrag(phase, pendingScreenDelta);
      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
    };

    const handlePointerUp = () => finishDrag('end');
    const handlePointerCancel = () => finishDrag('cancel');

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
  }, [dispatchNodePreviewDrag, isCanvasLocked]);

  const handleContinueFromPreview = useCallback(() => {
    const presetId = continuePresetId.trim() || 'debug';
    window.dispatchEvent(new CustomEvent('workflow:continue-from-preview-node', {
      detail: { nodeId: id, presetId },
    }));
    setContinueDialogOpen(false);
  }, [continuePresetId, id]);

  const setHandleColor = useCallback((handleId: string, color: string | null) => {
    const nextColors = { ...handleColors };
    if (color) {
      nextColors[handleId] = color;
    } else {
      delete nextColors[handleId];
    }
    actions.dispatchNodeUpdate({ handleColors: nextColors });
    setHandleColorMenuId(null);
  }, [actions, handleColors]);

  const handlePropertyPanelDataChange = useCallback((nodeId: string, nextData: Record<string, unknown>) => {
    window.dispatchEvent(new CustomEvent('workflow:update-node-data', {
      detail: { nodeId, data: nextData },
    }));
  }, []);

  const handlePropertyPanelDebug = useCallback((nodeId: string) => {
    if (isCanvasLocked || isBoundaryNode) return;
    window.dispatchEvent(new CustomEvent('workflow:debug-node', { detail: { nodeId } }));
  }, [isBoundaryNode, isCanvasLocked]);

  const handlePropertyPanelCancelDebug = useCallback(() => {
    window.dispatchEvent(new CustomEvent('workflow:cancel-debug-node', { detail: { nodeId: id } }));
  }, [id]);

  const renderHandleColorPopover = useCallback((handleId: string, trigger: React.ReactElement) => (
    <Popover
      open={handleColorMenuId === handleId}
      onOpenChange={(open) => {
        if (!open && handleColorMenuId === handleId) setHandleColorMenuId(null);
      }}
    >
      <PopoverTrigger render={trigger} nativeButton={false} />
      <PopoverContent
        side="right"
        align="center"
        sideOffset={8}
        className="nodrag nopan w-40 gap-0 p-1"
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <div className="flex items-center gap-1.5 px-1.5 py-1 text-xs font-medium text-muted-foreground">
          <Palette className="h-3 w-3" />
          颜色
        </div>
        {NODE_COLORS.map(color => (
          <button
            key={color.value ?? 'default'}
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            onClick={(event) => {
              event.stopPropagation();
              setHandleColor(handleId, color.value);
            }}
          >
            <span className={cn('h-3.5 w-3.5 shrink-0 rounded-sm', color.className)} />
            {t(color.label)}
          </button>
        ))}
      </PopoverContent>
      </Popover>
    ),
  [handleColorMenuId, setHandleColor, t]);

  const renderPropertyModeBadgeHandle = useCallback((handle: PropertyModeHandle, index: number, total: number) => {
    const isSourceHandle = handle.type === 'source';
    const visualState = getPropertyHandleVisualState(handle);
    const depth = handle.depth ?? 0;
    // 子属性相对父 object 向外（远离节点边缘）偏移，形成层级区分
    const depthOffset = depth * 16;
    const horizontalStyle = handle.side === 'left'
      ? { left: depthOffset }
      : { right: depthOffset };
    const transform = handle.side === 'left'
      ? 'translate(-100%, -50%)'
      : 'translate(100%, -50%)';

    const badge = (
      <span
        className={cn(
          'pointer-events-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap shadow-sm transition-colors',
          visualState.isIncompatibleTarget && 'border-destructive bg-destructive/10 text-destructive opacity-70',
          visualState.isActiveSource && 'ring-1 ring-primary/50',
        )}
        style={{
          borderColor: visualState.isIncompatibleTarget ? undefined : handle.color,
          backgroundColor: visualState.isIncompatibleTarget ? undefined : `${handle.color}1a`,
          color: visualState.isIncompatibleTarget ? undefined : handle.color,
        }}
      >
        <span>{handle.label}</span>
        {handle.valueType ? (
          <span className="rounded bg-background/60 px-1 py-px text-[9px] leading-none opacity-80">
            {handle.valueType}
          </span>
        ) : null}
      </span>
    );

    return (
      <div
        key={handle.id}
        className={cn(
          'pointer-events-none absolute z-30 flex',
          handle.side === 'left' ? 'left-0 justify-start' : 'right-0 justify-end',
        )}
        style={{
          top: getHandleTop(index, total, handleCtx),
          width: 0,
        }}
      >
        <div className="relative flex items-center">
          {renderHandleColorPopover(
            handle.id,
            <Handle
              id={handle.id}
              type={handle.type}
              position={handle.side === 'left' ? Position.Left : Position.Right}
              isConnectable
              isValidConnection={validatePropertyModeConnection(handle)}
              className={cn('!z-30 !h-7 !w-auto !min-w-0 !rounded-full !border-0 !bg-transparent !p-0 shadow-none', floatingHandleClassName)}
              style={{
                ...horizontalStyle,
                top: 0,
                transform,
              }}
              onContextMenu={isSourceHandle ? (event) => openHandleColorMenu(event, handle.id) : undefined}
            >
              {handle.tooltip || handle.valueType ? (
                <TooltipProvider delay={300}>
                  <Tooltip>
                    <TooltipTrigger render={badge} />
                    <TooltipContent side={handle.side === 'left' ? 'left' : 'right'} className="max-w-56 text-xs">
                      {handle.tooltip ? <div>{handle.tooltip}</div> : null}
                      {handle.valueType ? <div className={handle.tooltip ? 'mt-1 opacity-70' : 'opacity-70'}>类型: {handle.valueType}</div> : null}
                      {visualState.isIncompatibleTarget ? (
                        <div className="mt-1 text-destructive">
                          类型不兼容
                          {visualState.sourceType ? `: ${visualState.sourceType} -> ${handle.valueType || 'unknown'}` : ''}
                        </div>
                      ) : null}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : badge}
            </Handle>,
          )}
        </div>
      </div>
    );
  }, [floatingHandleClassName, getPropertyHandleVisualState, handleCtx, openHandleColorMenu, renderHandleColorPopover, validatePropertyModeConnection]);

  const renderCompatibilityHandle = useCallback((
    handleId: string,
    handleType: 'target' | 'source',
    position: Position,
    index: number,
    total: number,
  ) => (
    <Handle
      key={`${handleType}-${handleId}`}
      id={handleId}
      type={handleType}
      position={position}
      isConnectable={false}
      className="!pointer-events-none !opacity-0 !border-0 !bg-transparent"
      style={{
        ...getHandleStyle(position, index, total, handleCtx),
        width: 1,
        height: 1,
      }}
    />
  ), [handleCtx]);

  const nodeBody = (
    <div
      ref={nodeBodyRef}
      className={`border-2 rounded-lg shadow-sm cursor-pointer transition-colors relative flex flex-col overflow-visible
        ${statusColor} ${selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-md' : ''}
        ${floatingHandles ? 'workflow-node-has-floating-handles' : ''}
        ${selected || canShowPropertyNodeView ? 'workflow-node-floating-handles-visible' : ''}
        ${stateBackgroundClass}`}
      style={{
        minWidth: isNodeCollapsed ? COLLAPSED_NODE_SIZE : nodeMinWidth,
        minHeight: isNodeCollapsed ? COLLAPSED_NODE_SIZE : nodeMinHeight,
        width: displayNodeWidth,
        height: displayNodeHeight,
      }}
    >
      {(nodeData.isRunning || isCurrentNodeDebugging) && (
        <BorderGlide
          className="absolute inset-0 z-20 rounded-lg pointer-events-none"
          duration={2200}
          color={isCurrentNodeDebugging ? '#22c55e' : '#3b82f6'}
          width="1.75rem"
          height="1.75rem"
          opacity={0.75}
          rx="0.5rem"
          ry="0.5rem"
        >
          <div className="h-full w-full" />
        </BorderGlide>
      )}
      {showFullNode && selected ? (
        <button
          type="button"
          className="nodrag nopan absolute -left-2 -top-2 z-30 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background/95 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
          title={isNodeCollapsed ? t('nodeUi.expand') : t('nodeUi.collapse')}
          aria-label={isNodeCollapsed ? t('nodeUi.expand') : t('nodeUi.collapse')}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIsNodeCollapsed(prev => !prev);
          }}
        >
          {isNodeCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      ) : null}

      {/* Target handle */}
      {showTargetHandle && !canShowPropertyNodeView && (
        <Handle
          id="target" type="target" position={handlePositions.target}
          isConnectable={isTargetConnectable}
          className={cn('!z-10 !w-3 !h-3 !bg-blue-500 !border-2 !border-blue-300 handle-dot', floatingHandleClassName)}
          style={getTargetHandleStyle(handlePositions.target, handleCtx)}
        />
      )}
      {!canShowPropertyNodeView && inputFields.map((field, index) => (
        renderCompatibilityHandle(
          getWorkflowFieldHandleId('input', field.key, index),
          'target',
          handlePositions.target,
          index,
          Math.max(1, inputFields.length + propertyFields.length),
        )
      ))}
      {!canShowPropertyNodeView && propertyFields.map((field, index) => (
        renderCompatibilityHandle(
          getWorkflowFieldHandleId('property', field.key, index),
          'target',
          handlePositions.target,
          inputFields.length + index,
          Math.max(1, inputFields.length + propertyFields.length),
        )
      ))}
      {!canShowPropertyNodeView && outputFields.map((field, index) => (
        renderCompatibilityHandle(
          getWorkflowFieldHandleId('output', field.key, index),
          'source',
          handlePositions.source,
          index,
          Math.max(1, outputFields.length),
        )
      ))}
      <div className="absolute -right-1 -top-1 z-30 flex items-center gap-1">
        {showFullNode && hasCustomView && !isLoopBody && !isCanvasLocked ? (
          <button
            type="button"
            className="nodrag nopan inline-flex h-5 w-5 cursor-grab items-center justify-center rounded-full border border-border bg-background/95 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground active:cursor-grabbing"
            title={t('nodeUi.drag')}
            aria-label={t('nodeUi.drag')}
            onPointerDown={handleCustomViewDragPointerDown}
          >
            <Grip className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      <div className="absolute -bottom-1 -right-1 z-30 flex items-center gap-1">
        {showFullNode && selected && !isCanvasLocked && !isNodeCollapsed && !canShowPropertyNodeView ? (
          <button
            type="button"
            className="nodrag nopan inline-flex h-5 w-5 cursor-nwse-resize items-center justify-center rounded-full border border-border bg-background/95 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
            title={t('nodeUi.resize')}
            aria-label={t('nodeUi.resize')}
            onPointerDown={handleResizePointerDown}
          >
            <MoveDiagonal className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      {showFullNode && stateBadge ? (
        <span
          className={cn(
            'absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-full px-1.5 py-0 text-[10px] font-medium text-white',
            currentNodeState === 'disabled' ? 'bg-red-500' : 'bg-yellow-500',
          )}
        >
          {stateBadge}
        </span>
      ) : null}

      {showFullNode && breakpointBadge ? (
        <span
          className={cn(
            'absolute -bottom-2 left-2 z-10 inline-flex items-center gap-1 rounded-full px-1.5 py-0 text-[10px] font-medium text-white',
            currentBreakpoint === 'start' ? 'bg-blue-500' : 'bg-purple-500',
          )}
        >
          <Flag className="h-2.5 w-2.5" />
          {breakpointBadge}
        </span>
      ) : null}

      {showFullNode && isPausedAtThisNode ? (
        <div className="nodrag nopan absolute left-2 right-2 -bottom-10 z-40 flex items-center gap-1 rounded border border-blue-500/40 bg-background/95 p-1 shadow-lg">
          <button
            type="button"
            className="inline-flex h-6 flex-1 items-center justify-center gap-1 rounded bg-blue-500 px-2 text-[10px] font-medium text-white hover:bg-blue-600"
            onClick={actions.handleResumeFromBreakpoint}
          >
            <Play className="h-3 w-3" />
            {t('nodeUi.resume')}
          </button>
          <button
            type="button"
            className="inline-flex h-6 flex-1 items-center justify-center gap-1 rounded bg-destructive px-2 text-[10px] font-medium text-destructive-foreground hover:bg-destructive/90"
            onClick={actions.handleStopAtBreakpoint}
          >
            <Square className="h-3 w-3" />
            {t('nodeUi.abort')}
          </button>
        </div>
      ) : null}

      {!showFullNode ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <WorkflowNodeDefinitionIcon definition={iconDefinition} className="h-8 w-8 text-muted-foreground" />
        </div>
      ) : null}

      {showFullNode && isNodeCollapsed ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-9 w-9 items-center justify-center rounded border border-border bg-muted/40">
            <WorkflowNodeDefinitionIcon definition={iconDefinition} className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      ) : null}

      {/* Header */}
      {canShowNodeContent && !isLoopBody && !hasCustomView && !canShowPropertyNodeView && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
          <WorkflowNodeDefinitionIcon definition={iconDefinition} className="h-4 w-4 shrink-0 text-muted-foreground" />
          {isEditing ? (
            <input
              ref={inputRef}
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onBlur={finishEdit}
              onKeyDown={(e) => { if (e.key === 'Enter') finishEdit(); }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="nodrag nopan flex-1 text-xs bg-transparent outline-none border-b border-primary min-w-0"
              autoFocus
            />
          ) : (
            <div
              className={cn(
                'text-xs truncate hover:bg-muted/50 rounded px-1 py-0.5 min-w-0 flex-1',
                currentNodeState === 'disabled' && 'opacity-50 line-through',
              )}
              onDoubleClick={(e) => { e.stopPropagation(); startEdit(); }}
            >
              {displayLabel}
            </div>
          )}
          {nodeData.isFirstConnectedNode && !isBoundaryNode && !nodeData.isPreview ? (
            <button
              type="button"
              className="nodrag nopan shrink-0 inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isExecutionBusy}
              title={t('nodeUi.test.partial')}
              onClick={actions.handlePartialTest}
            >
              {isPartialTesting ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Play className="h-2.5 w-2.5" />}
              {t('nodeUi.test.partial')}
            </button>
          ) : null}
          {selectedJsonPreset ? (
            <span
              className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
              title={`预设：${selectedJsonPreset.name}`}
            >
              {selectedJsonPreset.name}
            </span>
          ) : null}
        </div>
      )}

      {canShowPropertyNodeView ? (
        <div ref={propertyNodeViewRef} className="relative min-h-0 flex-1 overflow-visible rounded-md">
          {showTargetHandle ? renderCompatibilityHandle('target', 'target', Position.Left, 0, 1) : null}
          {showSourceHandle ? renderCompatibilityHandle('source', 'source', Position.Right, 0, 1) : null}
          {propertyModeLeftHandles.map((handle, index) => renderPropertyModeBadgeHandle(handle, index, propertyModeLeftHandles.length))}
          {propertyModeRightHandles.map((handle, index) => renderPropertyModeBadgeHandle(handle, index, propertyModeRightHandles.length))}
          {canShowNodeContent ? (
            <div
              ref={propertyContentRef}
              className="self-start overflow-x-hidden bg-background"
              data-workflow-property-content="true"
              onWheelCapture={(event) => {
                if (event.ctrlKey || event.metaKey) return;
                event.stopPropagation();
              }}
            >
              <WorkflowPropertiesPanel
                node={{
                  id,
                  type: workflowNodeType || 'unknown',
                  label: displayLabel,
                  position: { x: 0, y: 0 },
                  data: nodeData,
                  nodeState: currentNodeState,
                  breakpoint: currentBreakpoint ?? undefined,
                  nodeColor: typeof nodeData.nodeColor === 'string' ? nodeData.nodeColor : undefined,
                }}
                nodes={variableContext.nodes}
                edges={variableContext.edges}
                variableContextWorkflow={variableContext}
                isPreview={nodeData.isPreview === true}
                onUpdateData={handlePropertyPanelDataChange}
                onPreviewUpdateData={handlePropertyPanelDataChange}
                debugNodeId={typeof nodeData.debugNodeId === 'string' ? nodeData.debugNodeId : null}
                debugStatus={nodeData.debugStatus}
                onDebugNode={handlePropertyPanelDebug}
                onCancelDebug={handlePropertyPanelCancelDebug}
                dragHandleClassName={WORKFLOW_NODE_DRAG_HANDLE_CLASS}
                contentScrollable={false}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {canShowNodeContent && canShowVariableReferences && !canShowPropertyNodeView ? (
        <div className="flex w-full min-w-0 flex-wrap gap-1 overflow-hidden px-3 py-1.5">
          {variableReferences.map(reference => (
            <VariableBadgeInput
              key={reference}
              value={reference}
              readOnly
              showClear={false}
              className="min-w-0 max-w-full flex-none px-0"
              badgeClassName="h-4 max-w-full rounded px-1.5 text-[9px] font-normal"
              variableContext={variableContext}
              onClear={() => undefined}
            />
          ))}
        </div>
      ) : null}

      {keepCustomViewMounted && CustomView ? (
        <div className={cn(
          'absolute inset-0 overflow-hidden rounded-lg',
          !showFullNode && 'pointer-events-none opacity-0',
          isLoopBody && 'pointer-events-none',
        )}>
          <CustomView nodeId={id} data={nodeData} />
        </div>
      ) : null}

      {keepCustomViewMounted && pluginCustomView ? (
        <div className={cn(
          'absolute inset-0 overflow-hidden rounded-lg',
          !showFullNode && 'pointer-events-none opacity-0',
          isLoopBody && 'pointer-events-none',
        )}>
          <PluginWorkflowCustomView nodeId={id} data={nodeData} view={pluginCustomView} />
        </div>
      ) : null}

      {/* Source handles (static) */}
      {showSourceHandle && !dynamicHandles && !canShowPropertyNodeView && (
        staticSourceHandles.length === 0 ? (
          renderHandleColorPopover(
            SOURCE_HANDLE_KEY,
            <Handle
              id="source" type="source" position={handlePositions.source}
              className={cn('!z-10 !w-3 !h-3 !border-2 handle-dot', floatingHandleClassName)}
              style={getSourceHandleStyle(SOURCE_HANDLE_KEY, DEFAULT_SOURCE_HANDLE_COLOR, handlePositions.source, 0, 1)}
              onContextMenu={(event) => openHandleColorMenu(event, SOURCE_HANDLE_KEY)}
            />,
          )
        ) : (
          <>
            {staticSourceHandles.map((h, index) => (
              <React.Fragment key={h.id}>
                {canShowNodeContent ? (
                  <div
                    className={cn('source-handle-label', floatingLabelClassName)}
                    style={getSourceLabelStyle(index, staticSourceHandles.length, handleCtx)}
                  >
                    <span className="text-[9px] text-muted-foreground mr-1 whitespace-nowrap">{h.label || h.id}</span>
                  </div>
                ) : null}
                {renderHandleColorPopover(
                  h.id,
                  <Handle
                    id={h.id} type="source" position={handlePositions.source}
                    className={cn('!z-10 !w-2.5 !h-2.5 !border-2 handle-dot', floatingHandleClassName)}
                    style={getSourceHandleStyle(
                      h.id,
                      h.id === LOOP_BODY_SOURCE_HANDLE ? LOOP_BODY_SOURCE_HANDLE_COLOR : DEFAULT_SOURCE_HANDLE_COLOR,
                      handlePositions.source,
                      index,
                      staticSourceHandles.length,
                    )}
                    onContextMenu={(event) => openHandleColorMenu(event, h.id)}
                  />,
                )}
              </React.Fragment>
            ))}
          </>
        )
      )}

      {/* Dynamic source handles (switch) */}
      {dynamicHandles && !canShowPropertyNodeView && (
        <>
          {dynamicHandles.map(h => (
            <React.Fragment key={h.id}>
              {canShowNodeContent ? (
                <div
                  className={cn('source-handle-label', floatingLabelClassName)}
                  style={getSourceLabelStyle(h.index, h.total, handleCtx)}
                >
                  <span className="text-[9px] text-muted-foreground mr-1 whitespace-nowrap">{h.label}</span>
                </div>
              ) : null}
              {renderHandleColorPopover(
                h.id,
                <Handle
                  id={h.id} type="source" position={handlePositions.source}
                  className={cn('!z-10 !w-2.5 !h-2.5 !border-2 handle-dot', floatingHandleClassName)}
                  style={getSourceHandleStyle(
                    h.id,
                    h.id === 'default' ? DEFAULT_DYNAMIC_FALLBACK_HANDLE_COLOR : DEFAULT_DYNAMIC_HANDLE_COLOR,
                    handlePositions.source,
                    h.index,
                    h.total,
                  )}
                  onContextMenu={(event) => openHandleColorMenu(event, h.id)}
                />,
              )}
            </React.Fragment>
          ))}
        </>
      )}
    </div>
  );

  return (
    <>
      {showFullNode && canShowNodeToolbar ? (
        <NodeToolbar
          position={Position.Top}
          align={isNodeCollapsed ? 'start' : 'center'}
          offset={8}
          className="nodrag nopan flex items-center gap-1 rounded-full border border-border bg-background/95 p-1 shadow-md"
        >
          {isStartNode ? (
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isExecutionBusy}
              onClick={actions.handleExecuteWorkflow}
              title={t('nodeUi.test.node')}
              aria-label={t('nodeUi.test.node')}
            >
              {isExecutionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            </button>
          ) : null}
          {!isBoundaryNode ? (
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={actions.handleTestNode}
              title={isCurrentNodeDebugging ? t('nodeUi.test.cancel') : t('nodeUi.test.node')}
              aria-label={isCurrentNodeDebugging ? t('nodeUi.test.cancel') : t('nodeUi.test.node')}
            >
              {isCurrentNodeDebugging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            </button>
          ) : null}
          {canContinueFromPreview ? (
            <button
              type="button"
              className="inline-flex h-7 items-center justify-center gap-1 rounded-full bg-blue-500 px-2.5 text-[10px] font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={(event) => {
                event.stopPropagation();
                if (!isExecutionBusy) setContinueDialogOpen(true);
              }}
              disabled={isExecutionBusy}
              title="从当前节点开始继续运行"
              aria-label="从当前节点开始继续运行"
            >
              <Play className="h-3.5 w-3.5" />
              继续运行
            </button>
          ) : null}
          {canDeleteNode && !isDeleteDisabled ? (
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/80"
              onClick={actions.handleDelete}
              title={t('nodeUi.delete')}
              aria-label={t('nodeUi.delete')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </NodeToolbar>
      ) : null}
      <WorkflowNodeContextMenu
        nodeId={id}
        selectedNodeIds={selectedNodeIds}
        isDeleteProtected={!canDeleteNode}
        isCanvasLocked={!!isCanvasLocked}
        style={{ width: displayNodeWidth, height: displayNodeHeight }}
        onSetColor={actions.setNodeColor}
        onSetState={actions.setNodeState}
        onSetBreakpoint={actions.setNodeBreakpoint}
        onShowInfo={actions.handleShowInfo}
        onCopy={actions.handleCopy}
        onClone={actions.handleClone}
        onStage={actions.handleStage}
        onMoveToStage={actions.handleMoveToStage}
        onDelete={actions.handleDelete}
        onMergeToWorkflow={actions.handleMergeToWorkflow}
        onMergeToGroup={actions.handleMergeToGroup}
        onBatchDelete={actions.handleBatchDelete}
      >
        {nodeBody}
      </WorkflowNodeContextMenu>

      <Dialog open={continueDialogOpen} onOpenChange={setContinueDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">从当前节点开始继续运行</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <div className="text-xs font-medium">统一的预设 ID</div>
            <Input
              value={continuePresetId}
              onChange={(event) => setContinuePresetId(event.target.value)}
              className="h-8 text-xs"
              placeholder="debug"
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleContinueFromPreview();
              }}
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded border border-border px-3 text-xs hover:bg-muted"
              onClick={() => setContinueDialogOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              onClick={handleContinueFromPreview}
            >
              运行
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Collapsible execution log card below the node */}
      {!isNodeCollapsed && canShowExecutionLog && displayExecutionStep ? (
        <WorkflowNodeExecutionLog
          nodeId={id}
          executionStep={displayExecutionStep}
          executionSteps={Array.isArray(nodeData.executionSteps) ? nodeData.executionSteps : undefined}
          nodeType={workflowNodeType}
          loopExecutionScopeId={nodeData.loopExecutionScopeId}
          data={getRecordValue(nodeData[EXECUTION_DATA_KEY] ?? nodeData.executionLogData)}
          inputFields={Array.isArray(nodeData[EXECUTION_INPUT_FIELDS_KEY])
            ? nodeData[EXECUTION_INPUT_FIELDS_KEY]
            : Array.isArray(nodeData.inputFields) ? nodeData.inputFields : []}
          outputs={Array.isArray(nodeData[EXECUTION_OUTPUTS_KEY])
            ? nodeData[EXECUTION_OUTPUTS_KEY]
            : Array.isArray(nodeData.outputs) ? nodeData.outputs : []}
          nodeWidth={nodeWidth}
          layout={logPanelLayout}
          isLogExpanded={isLogExpanded}
          showOutputPreview={nodeData.outputPreviewEnabled !== false}
          onToggleLog={() => setIsLogExpanded(prev => !prev)}
        />
      ) : null}

      <style>{`
        .handle-dot { transition: scale 0.2s ease, box-shadow 0.2s ease; }
        .handle-dot:hover { scale: 1.6; box-shadow: 0 0 6px currentColor; }
        .workflow-node-floating-handle,
        .workflow-node-floating-handle-label {
          opacity: 0;
          transition: opacity 0.16s ease, scale 0.2s ease, box-shadow 0.2s ease;
        }
        .workflow-node-has-floating-handles:hover .workflow-node-floating-handle,
        .workflow-node-has-floating-handles:hover .workflow-node-floating-handle-label,
        .workflow-node-floating-handles-visible .workflow-node-floating-handle,
        .workflow-node-floating-handles-visible .workflow-node-floating-handle-label,
        .workflow-canvas-show-floating-handles .workflow-node-floating-handle,
        .workflow-canvas-show-floating-handles .workflow-node-floating-handle-label {
          opacity: 1;
        }
        .workflow-node-floating-handle .react-flow__handle {
          width: auto;
          height: auto;
        }
        .source-handle-label { position: absolute; display: flex; align-items: center; pointer-events: none; }
      `}</style>
    </>
  );
}

export const WorkflowNode = React.memo(WorkflowNodeComponent, areWorkflowNodePropsEqual);
