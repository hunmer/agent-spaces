import React from 'react';
import { Handle } from '@xyflow/react';
import { Flag, Grip, Loader2, MoveDiagonal, Play, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { WorkflowNodeDefinitionIcon, type WorkflowNodeIconDefinition } from './workflow-node-icon';
import {
  DEFAULT_SOURCE_HANDLE_COLOR,
  LOOP_BODY_SOURCE_HANDLE_COLOR,
  DEFAULT_DYNAMIC_HANDLE_COLOR,
  DEFAULT_DYNAMIC_FALLBACK_HANDLE_COLOR,
  SOURCE_HANDLE_KEY,
} from './workflow-node-utils';
import { getSourceLabelStyle, type HandleContext } from './workflow-node-handles';
import { getWorkflowFieldHandleId } from './workflow-field-handles';
import { CompatibilityHandle } from './workflow-node-handles-render';
import type { OutputField } from '@agent-spaces/shared';
import { LOOP_BODY_SOURCE_HANDLE } from '@agent-spaces/shared';

type Position = import('@xyflow/react').Position;

export type SourceHandleDef = { id: string; label?: string };
export type DynamicHandleDef = { id: string; label: string; index: number; total: number };

type GetSourceHandleStyle = (
  handleId: string,
  fallback: string,
  position: Position,
  index: number,
  total: number,
) => React.CSSProperties;
type OpenHandleColorMenu = (event: React.MouseEvent, handleId: string) => void;
type RenderHandleColorPopover = (handleId: string, trigger: React.ReactElement) => React.ReactElement;

const EXTERNAL_HANDLE_OFFSET = -8;

function getExternalHandleStyle(position: Position): React.CSSProperties {
  switch (position) {
    case 'left':
      return { left: EXTERNAL_HANDLE_OFFSET };
    case 'right':
      return { right: EXTERNAL_HANDLE_OFFSET };
    case 'top':
      return { top: EXTERNAL_HANDLE_OFFSET };
    case 'bottom':
      return { bottom: EXTERNAL_HANDLE_OFFSET };
    default:
      return {};
  }
}

/* ----------------------------------------------------------------------------
 * 状态徽章 + 断点徽章 + 断点暂停操作条
 * ------------------------------------------------------------------------- */
export interface NodeBodyBadgesProps {
  showFullNode: boolean;
  stateBadge: string;
  breakpointBadge: string;
  currentNodeState: string;
  currentBreakpoint: string | null;
  isPausedAtThisNode: boolean;
  onResumeFromBreakpoint: (event: React.MouseEvent) => void;
  onStopAtBreakpoint: (event: React.MouseEvent) => void;
}

export function NodeBodyBadges(props: NodeBodyBadgesProps) {
  const {
    showFullNode,
    stateBadge,
    breakpointBadge,
    currentNodeState,
    currentBreakpoint,
    isPausedAtThisNode,
    onResumeFromBreakpoint,
    onStopAtBreakpoint,
  } = props;
  const t = useTranslations('workflows');

  return (
    <>
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
            onClick={onResumeFromBreakpoint}
          >
            <Play className="h-3 w-3" />
            {t('nodeUi.resume')}
          </button>
          <button
            type="button"
            className="inline-flex h-6 flex-1 items-center justify-center gap-1 rounded bg-destructive px-2 text-[10px] font-medium text-destructive-foreground hover:bg-destructive/90"
            onClick={onStopAtBreakpoint}
          >
            <Square className="h-3 w-3" />
            {t('nodeUi.abort')}
          </button>
        </div>
      ) : null}
    </>
  );
}

/* ----------------------------------------------------------------------------
 * 右上角拖拽手柄 + 右下角缩放手柄
 * ------------------------------------------------------------------------- */
export interface NodeBodyCornerControlsProps {
  showFullNode: boolean;
  selected: boolean;
  isCanvasLocked: boolean;
  isNodeCollapsed: boolean;
  hasCustomView: boolean;
  isLoopBody: boolean;
  canShowPropertyNodeView: boolean;
  onCustomViewDragPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onResizePointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}

export function NodeBodyCornerControls(props: NodeBodyCornerControlsProps) {
  const {
    showFullNode,
    selected,
    isCanvasLocked,
    isNodeCollapsed,
    hasCustomView,
    isLoopBody,
    canShowPropertyNodeView,
    onCustomViewDragPointerDown,
    onResizePointerDown,
  } = props;
  const t = useTranslations('workflows');

  return (
    <>
      <div className="absolute -right-1 -top-1 z-30 flex items-center gap-1">
        {showFullNode && hasCustomView && !isLoopBody && !isCanvasLocked ? (
          <button
            type="button"
            className="nodrag nopan inline-flex h-5 w-5 cursor-grab items-center justify-center rounded-full border border-border bg-background/95 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground active:cursor-grabbing"
            title={t('nodeUi.drag')}
            aria-label={t('nodeUi.drag')}
            onPointerDown={onCustomViewDragPointerDown}
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
            onPointerDown={onResizePointerDown}
          >
            <MoveDiagonal className="h-3 w-3" />
          </button>
        ) : null}
      </div>
    </>
  );
}

/* ----------------------------------------------------------------------------
 * 节点头部：图标 + label 编辑 + partial test + json preset 徽标
 * ------------------------------------------------------------------------- */
export interface NodeBodyHeaderProps {
  iconDefinition: WorkflowNodeIconDefinition;
  isEditing: boolean;
  editLabel: string;
  displayLabel: string;
  currentNodeState: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  isFirstConnectedNode: boolean;
  isBoundaryNode: boolean;
  isPreview: boolean;
  isExecutionBusy: boolean;
  isPartialTesting: boolean;
  selectedJsonPreset: { name: string } | null;
  onEditLabelChange: (value: string) => void;
  onFinishEdit: () => void;
  onStartEdit: () => void;
  onPartialTest: (event: React.MouseEvent) => void;
}

export function NodeBodyHeader(props: NodeBodyHeaderProps) {
  const {
    iconDefinition,
    isEditing,
    editLabel,
    displayLabel,
    currentNodeState,
    inputRef,
    isFirstConnectedNode,
    isBoundaryNode,
    isPreview,
    isExecutionBusy,
    isPartialTesting,
    selectedJsonPreset,
    onEditLabelChange,
    onFinishEdit,
    onStartEdit,
    onPartialTest,
  } = props;
  const t = useTranslations('workflows');

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
      <WorkflowNodeDefinitionIcon definition={iconDefinition} className="h-4 w-4 shrink-0 text-muted-foreground" />
      {isEditing ? (
        <input
          ref={inputRef}
          value={editLabel}
          onChange={(e) => onEditLabelChange(e.target.value)}
          onBlur={onFinishEdit}
          onKeyDown={(e) => { if (e.key === 'Enter') onFinishEdit(); }}
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
          onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(); }}
        >
          {displayLabel}
        </div>
      )}
      {isFirstConnectedNode && !isBoundaryNode && !isPreview ? (
        <button
          type="button"
          className="nodrag nopan shrink-0 inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isExecutionBusy}
          title={t('nodeUi.test.partial')}
          onClick={onPartialTest}
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
  );
}

/* ----------------------------------------------------------------------------
 * Source handle 渲染：静态（单/多）+ 动态（switch）
 * ------------------------------------------------------------------------- */
export interface NodeBodySourceHandlesProps {
  showSourceHandle: boolean;
  canShowNodeContent: boolean;
  dynamicHandles: DynamicHandleDef[] | null;
  staticSourceHandles: SourceHandleDef[];
  handlePositions: { source: Position };
  handleCtx: HandleContext;
  floatingHandleClassName: string;
  floatingLabelClassName: string;
  getSourceHandleStyle: GetSourceHandleStyle;
  openHandleColorMenu: OpenHandleColorMenu;
  renderHandleColorPopover: RenderHandleColorPopover;
}

export function NodeBodySourceHandles(props: NodeBodySourceHandlesProps) {
  const {
    showSourceHandle,
    canShowNodeContent,
    dynamicHandles,
    staticSourceHandles,
    handlePositions,
    handleCtx,
    floatingHandleClassName,
    floatingLabelClassName,
    getSourceHandleStyle,
    openHandleColorMenu,
    renderHandleColorPopover,
  } = props;

  return (
    <>
      {/* Source handles (static) */}
      {showSourceHandle && !dynamicHandles && (
        staticSourceHandles.length === 0 ? (
          renderHandleColorPopover(
            SOURCE_HANDLE_KEY,
            <Handle
              id="source" type="source" position={handlePositions.source}
              className={cn('!z-10 !h-2.5 !w-2.5 max-md:!h-4 max-md:!w-4 !border-2 handle-dot', floatingHandleClassName)}
              style={{
                ...getSourceHandleStyle(SOURCE_HANDLE_KEY, DEFAULT_SOURCE_HANDLE_COLOR, handlePositions.source, 0, 1),
                ...getExternalHandleStyle(handlePositions.source),
              }}
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
                    className={cn('!z-10 !h-2 !w-2 max-md:!h-4 max-md:!w-4 !border-2 handle-dot', floatingHandleClassName)}
                    style={{
                      ...getSourceHandleStyle(
                        h.id,
                        h.id === LOOP_BODY_SOURCE_HANDLE ? LOOP_BODY_SOURCE_HANDLE_COLOR : DEFAULT_SOURCE_HANDLE_COLOR,
                        handlePositions.source,
                        index,
                        staticSourceHandles.length,
                      ),
                      ...getExternalHandleStyle(handlePositions.source),
                    }}
                    onContextMenu={(event) => openHandleColorMenu(event, h.id)}
                  />,
                )}
              </React.Fragment>
            ))}
          </>
        )
      )}

      {/* Dynamic source handles (switch) */}
      {dynamicHandles && (
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
                  className={cn('!z-10 !h-2 !w-2 max-md:!h-4 max-md:!w-4 !border-2 handle-dot', floatingHandleClassName)}
                  style={{
                    ...getSourceHandleStyle(
                      h.id,
                      h.id === 'default' ? DEFAULT_DYNAMIC_FALLBACK_HANDLE_COLOR : DEFAULT_DYNAMIC_HANDLE_COLOR,
                      handlePositions.source,
                      h.index,
                      h.total,
                    ),
                    ...getExternalHandleStyle(handlePositions.source),
                  }}
                  onContextMenu={(event) => openHandleColorMenu(event, h.id)}
                />,
              )}
            </React.Fragment>
          ))}
        </>
      )}
    </>
  );
}

/* ----------------------------------------------------------------------------
 * target handle + compatibility handles（input/property/output）
 * ------------------------------------------------------------------------- */
export interface NodeBodyTargetHandlesProps {
  showTargetHandle: boolean;
  isTargetConnectable: boolean;
  canShowPropertyNodeView: boolean;
  isStartNode: boolean;
  inputFields: OutputField[];
  propertyFields: { key: string }[];
  outputFields: OutputField[];
  handlePositions: { target: Position; source: Position };
  handleCtx: HandleContext;
  floatingHandleClassName: string;
  getTargetHandleStyle: (position: Position, ctx: HandleContext) => React.CSSProperties | undefined;
}

export function NodeBodyTargetHandles(props: NodeBodyTargetHandlesProps) {
  const {
    showTargetHandle,
    isTargetConnectable,
    canShowPropertyNodeView,
    isStartNode,
    inputFields,
    propertyFields,
    outputFields,
    handlePositions,
    handleCtx,
    floatingHandleClassName,
    getTargetHandleStyle,
  } = props;

  return (
    <>
      {/* Target handle */}
      {showTargetHandle && (
        <Handle
          id="target" type="target" position={handlePositions.target}
          isConnectable={isTargetConnectable}
          className={cn('!z-10 !h-2.5 !w-2.5 max-md:!h-4 max-md:!w-4 !bg-blue-500 !border-2 !border-blue-300 handle-dot', floatingHandleClassName)}
          style={{
            ...getTargetHandleStyle(handlePositions.target, handleCtx),
            ...getExternalHandleStyle(handlePositions.target),
          }}
        />
      )}
      {!canShowPropertyNodeView && inputFields.map((field, index) => (
        <CompatibilityHandle
          key={`input-${field.key}-${index}`}
          handleId={getWorkflowFieldHandleId(isStartNode ? 'output' : 'input', field.key, index)}
          handleType={isStartNode ? 'source' : 'target'}
          position={isStartNode ? handlePositions.source : handlePositions.target}
          index={index}
          total={Math.max(1, inputFields.length + propertyFields.length)}
          handleCtx={handleCtx}
        />
      ))}
      {!canShowPropertyNodeView && propertyFields.map((field, index) => (
        <CompatibilityHandle
          key={`property-${field.key}-${index}`}
          handleId={getWorkflowFieldHandleId('property', field.key, index)}
          handleType="target"
          position={handlePositions.target}
          index={inputFields.length + index}
          total={Math.max(1, inputFields.length + propertyFields.length)}
          handleCtx={handleCtx}
        />
      ))}
      {!canShowPropertyNodeView && outputFields.map((field, index) => (
        <CompatibilityHandle
          key={`output-${field.key}-${index}`}
          handleId={getWorkflowFieldHandleId('output', field.key, index)}
          handleType="source"
          position={handlePositions.source}
          index={index}
          total={Math.max(1, outputFields.length)}
          handleCtx={handleCtx}
        />
      ))}
    </>
  );
}

/* ----------------------------------------------------------------------------
 * 缩略态图标：未展开（紧凑缩略）+ 折叠态
 * ------------------------------------------------------------------------- */
export interface NodeBodyIconsProps {
  showFullNode: boolean;
  isNodeCollapsed: boolean;
  iconDefinition: WorkflowNodeIconDefinition;
}

export function NodeBodyIcons(props: NodeBodyIconsProps) {
  const { showFullNode, isNodeCollapsed, iconDefinition } = props;
  return (
    <>
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
    </>
  );
}
