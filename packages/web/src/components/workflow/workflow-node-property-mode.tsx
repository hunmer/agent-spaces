import React, { useCallback, useMemo } from 'react';
import { Handle, Position, type ConnectionState } from '@xyflow/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { WorkflowNode as SharedWorkflowNode, DataType } from '@agent-spaces/shared';
import type { OutputField } from '@agent-spaces/shared';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { getWorkflowFieldHandleId } from './workflow-field-handles';
import { getEffectiveDataType } from './workflow-properties-utils';
import {
  areWorkflowHandleValueTypesCompatible,
  getWorkflowHandleValueType,
  mapPropertyDataTypeToWorkflowHandleType,
} from './workflow-handle-types';
import type { HandleContext } from './workflow-node-handles';
import {
  DEFAULT_SOURCE_HANDLE_COLOR,
  type PropertyModeHandle,
} from './workflow-node-utils';

type WorkflowNodeLike = { id: string; type?: string | null; data?: unknown };

type RenderHandleColorPopover = (handleId: string, trigger: React.ReactElement) => React.ReactElement;
type OpenHandleColorMenu = (event: React.MouseEvent, handleId: string) => void;
type ToggleOutputHandleCollapsed = (collapsedKey: string) => void;
type PropertyModeBadgePosition = 'top' | 'center' | 'bottom';

export interface PropertyModeField {
  key: string;
  label?: string;
  tooltip?: string;
  type: string;
  dataType?: DataType;
}

export interface UseWorkflowNodePropertyModeParams {
  id: string;
  canShowPropertyNodeView: boolean;
  inputFields: OutputField[];
  outputFields: OutputField[];
  propertyFields: PropertyModeField[];
  workflowNodeType: string;
  collapsedOutputKeys: Record<string, boolean>;
  workflowNodes: WorkflowNodeLike[];
  connectionState: ConnectionState;
  propertyModeBadgePosition: PropertyModeBadgePosition;
  handleCtx: HandleContext;
  floatingHandleClassName: string;
  toggleOutputHandleCollapsed: ToggleOutputHandleCollapsed;
  openHandleColorMenu: OpenHandleColorMenu;
  renderHandleColorPopover: RenderHandleColorPopover;
}

type VisualState = {
  isActiveSource: boolean;
  isIncompatibleTarget: boolean;
  sourceType: OutputField['type'] | undefined;
};

/**
 * 属性模式（nodeDisplayMode === 'properties'）下的 handle 计算 + badge 渲染。
 *
 * 把原主组件里 propertyModeHandles / isOutputHandleVisible / validate* /
 * getPropertyHandleVisualState / renderPropertyModeBadgeHandle 这一组逻辑整体迁出，
 * 行为与原内联实现完全一致。
 */
export function useWorkflowNodePropertyMode(params: UseWorkflowNodePropertyModeParams) {
  const {
    id,
    canShowPropertyNodeView,
    inputFields,
    outputFields,
    propertyFields,
    workflowNodeType,
    collapsedOutputKeys,
    workflowNodes,
    connectionState,
    propertyModeBadgePosition,
    handleCtx,
    floatingHandleClassName,
    toggleOutputHandleCollapsed,
    openHandleColorMenu,
    renderHandleColorPopover,
  } = params;

  const propertyModeHandles = useMemo<PropertyModeHandle[]>(() => {
    if (!canShowPropertyNodeView) return [];
    const isStartNode = workflowNodeType === 'start';
    const isEndNode = workflowNodeType === 'end';

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
      const appendOutputField = (current: OutputField, parentKey: string, depth: number, parentCollapsedKey?: string) => {
        const compositeKey = parentKey ? `${parentKey}.${current.key}` : current.key;
        const hasChildren = current.type === 'object' && Array.isArray(current.children) && current.children.length > 0;
        acc.push({
          id: getWorkflowFieldHandleId('output', compositeKey, index),
          label: parentKey ? `↳ ${current.key}` : current.key,
          side: isEndNode ? 'left' as const : 'right' as const,
          type: isEndNode ? 'target' as const : 'source' as const,
          color: DEFAULT_SOURCE_HANDLE_COLOR,
          valueType: current.type,
          tooltip: current.description,
          depth,
          collapsible: hasChildren,
          collapsedKey: compositeKey,
          parentCollapsedKey,
        });
        if (hasChildren) {
          current.children!.forEach((child) => appendOutputField(child, compositeKey, depth + 1, compositeKey));
        }
      };
      appendOutputField(field, '', 0);
      return acc;
    }, []);

    return [...inputHandles, ...propertyHandles, ...outputHandles];
  }, [canShowPropertyNodeView, inputFields, outputFields, propertyFields, workflowNodeType]);

  // output 子属性：若任一祖先被折叠则隐藏
  const isOutputHandleVisible = useCallback((handle: PropertyModeHandle) => {
    let ancestor = handle.parentCollapsedKey;
    while (ancestor) {
      if (collapsedOutputKeys[ancestor]) return false;
      const ancestorHandle = propertyModeHandles.find(h => h.collapsedKey === ancestor);
      ancestor = ancestorHandle?.parentCollapsedKey;
    }
    return true;
  }, [collapsedOutputKeys, propertyModeHandles]);

  const propertyModeLeftHandles = useMemo(
    () => propertyModeHandles.filter(handle => handle.side === 'left' && isOutputHandleVisible(handle)),
    [propertyModeHandles, isOutputHandleVisible],
  );
  const propertyModeRightHandles = useMemo(
    () => propertyModeHandles.filter(handle => handle.side === 'right' && isOutputHandleVisible(handle)),
    [propertyModeHandles, isOutputHandleVisible],
  );

  const getHandleValueType = useCallback((nodeId: string, handleId: string | null | undefined): OutputField['type'] | undefined => {
    const node = workflowNodes.find(item => item.id === nodeId);
    return getWorkflowHandleValueType(node as SharedWorkflowNode | undefined, handleId);
  }, [workflowNodes]);

  const validatePropertyModeConnection = useCallback((handle: PropertyModeHandle) => (
    (connection: { source?: string | null; target?: string | null; sourceHandle?: string | null; targetHandle?: string | null }) => {
      if (!connection.source || !connection.target) {
        return true;
      }
      const sourceType = handle.type === 'source'
        ? handle.valueType
        : getHandleValueType(connection.source, connection.sourceHandle);
      const targetType = handle.type === 'target'
        ? handle.valueType
        : getHandleValueType(connection.target, connection.targetHandle);
      return areWorkflowHandleValueTypesCompatible(sourceType, targetType);
    }
  ), [getHandleValueType]);

  const getPropertyHandleVisualState = useCallback((handle: PropertyModeHandle): VisualState => {
    const fromHandle = connectionState.fromHandle;
    const inProgress = connectionState.inProgress;
    if (!inProgress || !fromHandle) {
      return {
        isActiveSource: false,
        isIncompatibleTarget: false,
        sourceType: undefined,
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

  const renderBadgeHandle = useCallback((handle: PropertyModeHandle, index: number, total: number) => {
    const isSourceHandle = handle.type === 'source';
    const visualState = getPropertyHandleVisualState(handle);
    const depth = handle.depth ?? 0;
    // 子属性相对父 object 向外（远离节点边缘）偏移，形成层级区分
    // 右侧：right 减小 = 定位点向右移；左侧：left 增大 = 定位点向左移
    const depthOffset = depth * 16;
    const horizontalStyle = handle.side === 'left'
      ? { left: depthOffset }
      : { right: -depthOffset };
    const transform = handle.side === 'left'
      ? 'translate(-100%, -50%)'
      : 'translate(100%, -50%)';
    const isCollapsed = !!handle.collapsedKey && collapsedOutputKeys[handle.collapsedKey];
    const rowGap = 28;
    const edgeOffset = 16;
    const top = propertyModeBadgePosition === 'top'
      ? edgeOffset + index * rowGap
      : propertyModeBadgePosition === 'bottom'
        ? handleCtx.nodeHeight - edgeOffset - (total - 1 - index) * rowGap
        : handleCtx.nodeHeight / 2 + (index - (total - 1) / 2) * rowGap;

    const badge = (
      <span
        data-workflow-node-id={id}
        data-workflow-handle-id={handle.id}
        data-workflow-handle-type={handle.type}
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
        {handle.collapsible ? (
          <button
            type="button"
            className="nodrag nopan -ml-0.5 inline-flex h-3 w-3 shrink-0 cursor-pointer items-center justify-center hover:opacity-70"
            title={isCollapsed ? '展开' : '收起'}
            aria-label={isCollapsed ? '展开' : '收起'}
            onPointerDown={(event) => { event.stopPropagation(); }}
            onClick={(event) => {
              event.stopPropagation();
              if (!handle.collapsedKey) return;
              toggleOutputHandleCollapsed(handle.collapsedKey);
            }}
          >
            {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        ) : null}
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
          // 固定行高、以节点中心对称堆叠，避免按节点高度等分导致间距过大
          top: `${top}px`,
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
              className={cn('!pointer-events-auto !z-30 !h-7 !w-auto !min-w-0 !rounded-full !border-0 !bg-transparent !p-0 shadow-none', floatingHandleClassName)}
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
  }, [floatingHandleClassName, getPropertyHandleVisualState, handleCtx, id, openHandleColorMenu, propertyModeBadgePosition, renderHandleColorPopover, validatePropertyModeConnection, collapsedOutputKeys, toggleOutputHandleCollapsed]);

  return {
    propertyModeLeftHandles,
    propertyModeRightHandles,
    renderBadgeHandle,
  };
}
