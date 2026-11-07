'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getStraightPath, getSmoothStepPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { LOOP_BODY_SOURCE_HANDLE } from '@agent-spaces/shared';
import { Check, Plus, Tags, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type EdgeLabelForm = {
  startLabel: string;
  middleLabel: string;
  endLabel: string;
};

function resolveText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function EdgeLabel({ label, transform }: { label: string; transform: string }) {
  if (!label) return null;
  return (
    <div
      style={{ position: 'absolute', transform, pointerEvents: 'none' }}
      className="nodrag nopan max-w-40 truncate rounded-md border border-border bg-background/90 px-2 py-1 text-xs font-medium text-foreground shadow-sm"
      title={label}
    >
      {label}
    </div>
  );
}

function WorkflowEdgeComponent({
  id, source, target,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data, selected,
}: EdgeProps) {
  const t = useTranslations('workflows');
  const isLocked = !!(data as Record<string, unknown>)?.composite && ((data as Record<string, unknown>).composite as Record<string, unknown>)?.locked;
  const isGenerated = !!(data as Record<string, unknown>)?.composite && ((data as Record<string, unknown>).composite as Record<string, unknown>)?.generated;
  const isNodeDropTarget = (data as Record<string, unknown>)?.isNodeDropTarget === true;
  const edgeSourceHandle = (data as Record<string, unknown>)?.sourceHandle as string | undefined ?? null;
  const isLoopBodyEdge = edgeSourceHandle === LOOP_BODY_SOURCE_HANDLE;
  const isRunning = (data as Record<string, unknown>)?.isRunning === true;
  const canEditEdge = (data as Record<string, unknown>)?.canEditEdge === true;
  const canDeleteEdge = (data as Record<string, unknown>)?.canDeleteEdge === true;
  const edgePathType = (data as Record<string, unknown>)?.edgePathType as string || 'bezier';
  const edgeOwnLineStyle = (data as Record<string, unknown>)?.edgeOwnLineStyle;
  const edgeLineStyle = (data as Record<string, unknown>)?.edgeLineStyle === 'dashed' ? 'dashed' : 'solid';
  const preferDashedLine = (data as Record<string, unknown>)?.preferDashedLine === true;
  const isFieldHandleEdge = (data as Record<string, unknown>)?.isFieldHandleEdge === true;
  const edgeColor = (data as Record<string, unknown>)?.edgeColor as string | undefined;
  const startLabel = resolveText((data as Record<string, unknown>)?.startLabel);
  const middleLabel = resolveText((data as Record<string, unknown>)?.middleLabel);
  const endLabel = resolveText((data as Record<string, unknown>)?.endLabel);
  const [menuPosition, setMenuPosition] = React.useState<{ x: number; y: number } | null>(null);
  const [labelDialogOpen, setLabelDialogOpen] = React.useState(false);
  const [labelForm, setLabelForm] = React.useState<EdgeLabelForm>({
    startLabel,
    middleLabel,
    endLabel,
  });

  const pathParams = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition };

  let edgePath: string, labelX: number, labelY: number;
  if (edgePathType === 'straight') {
    [edgePath, labelX, labelY] = getStraightPath(pathParams);
  } else if (edgePathType === 'step') {
    [edgePath, labelX, labelY] = getSmoothStepPath({ ...pathParams, borderRadius: 0 });
  } else if (edgePathType === 'smoothstep') {
    [edgePath, labelX, labelY] = getSmoothStepPath(pathParams);
  } else {
    [edgePath, labelX, labelY] = getBezierPath(pathParams);
  }

  const closeMenu = React.useCallback(() => {
    setMenuPosition(null);
  }, []);

  React.useEffect(() => {
    if (!menuPosition) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('[data-workflow-edge-menu="true"]')) return;
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [closeMenu, menuPosition]);

  React.useEffect(() => {
    if (!labelDialogOpen) return;
    setLabelForm({ startLabel, middleLabel, endLabel });
  }, [endLabel, labelDialogOpen, middleLabel, startLabel]);

  const insertNode = React.useCallback(() => {
    window.dispatchEvent(new CustomEvent('workflow:edge-insert-node', {
      detail: { edgeId: id, source, target, sourceHandle: edgeSourceHandle },
    }));
  }, [edgeSourceHandle, id, source, target]);

  const deleteEdge = React.useCallback(() => {
    window.dispatchEvent(new CustomEvent('workflow:delete-edge', { detail: { edgeId: id } }));
  }, [id]);

  const openLabelDialog = React.useCallback(() => {
    setLabelForm({ startLabel, middleLabel, endLabel });
    setLabelDialogOpen(true);
  }, [endLabel, middleLabel, startLabel]);

  const saveLabels = React.useCallback(() => {
    window.dispatchEvent(new CustomEvent('workflow:update-edge-data', {
      detail: {
        edgeId: id,
        data: {
          startLabel: labelForm.startLabel.trim(),
          middleLabel: labelForm.middleLabel.trim(),
          endLabel: labelForm.endLabel.trim(),
        },
      },
    }));
    setLabelDialogOpen(false);
  }, [id, labelForm]);

  const updateLineStyle = React.useCallback((nextLineStyle: 'default' | 'solid' | 'dashed') => {
    window.dispatchEvent(new CustomEvent('workflow:update-edge-data', {
      detail: {
        edgeId: id,
        data: { edgeLineStyle: nextLineStyle },
      },
    }));
  }, [id]);

  const openContextMenu = React.useCallback((event: React.MouseEvent) => {
    if (isLocked || !canEditEdge) return;
    event.preventDefault();
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent('workflow:select-edge', { detail: { edgeId: id } }));
    setMenuPosition({ x: event.clientX, y: event.clientY });
  }, [canEditEdge, id, isLocked]);

  return (
    <>
      <BaseEdge
        id={id} path={edgePath}
        style={{
          stroke: isNodeDropTarget ? 'var(--foreground)' : selected ? 'var(--ring)' : (isLocked ? 'rgba(74, 144, 164, 0.9)' : edgeColor || 'var(--primary)'),
          strokeWidth: isNodeDropTarget ? 4 : selected ? 3.5 : (isGenerated ? 2 : 2.5),
          strokeDasharray: isLocked && !isLoopBodyEdge ? '4 2' : (preferDashedLine || edgeLineStyle === 'dashed') ? '6 4' : 'none',
          filter: isNodeDropTarget || selected ? `drop-shadow(0 0 4px ${edgeColor || 'var(--primary)'})` : 'none',
          transition: 'stroke 0.2s ease, stroke-width 0.2s ease, stroke-dasharray 0.3s ease, filter 0.2s ease',
        }}
      />
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
        onClick={(e) => {
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent('workflow:select-edge', { detail: { edgeId: id } }));
        }}
        onContextMenu={openContextMenu}
      />
      {isRunning && !isFieldHandleEdge && (
        <circle r="5" fill={edgeColor || 'var(--primary)'} style={{ pointerEvents: 'none' }}>
          <animateMotion dur="1.4s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
      {(startLabel || middleLabel || endLabel) && (
        <EdgeLabelRenderer>
          <EdgeLabel
            transform={`translate(-50%, -50%) translate(${sourceX}px,${sourceY}px)`}
            label={startLabel}
          />
          <EdgeLabel
            transform={`translate(-50%, -50%) translate(${labelX}px,${labelY}px)`}
            label={middleLabel}
          />
          <EdgeLabel
            transform={`translate(-50%, -50%) translate(${targetX}px,${targetY}px)`}
            label={endLabel}
          />
        </EdgeLabelRenderer>
      )}
      {menuPosition && typeof document !== 'undefined' && createPortal(
        <div
          data-workflow-edge-menu="true"
          className="nodrag nopan fixed z-50 min-w-36 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
          style={{ left: menuPosition.x, top: menuPosition.y }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <button
            type="button"
            className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              insertNode();
              closeMenu();
            }}
          >
            <Plus className="h-3 w-3" />
            {t('edge.addNode')}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              openLabelDialog();
              closeMenu();
            }}
          >
            <Tags className="h-3 w-3" />
            {t('edge.setLabel')}
          </button>
          <div className="-mx-1 my-1 h-px bg-border" />
          <div className="px-1.5 py-1 text-[11px] font-medium text-muted-foreground">
            {t('edge.lineStyle')}
          </div>
          {(['default', 'solid', 'dashed'] as const).map(lineStyle => (
            <button
              key={lineStyle}
              type="button"
              className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                updateLineStyle(lineStyle);
                closeMenu();
              }}
            >
              <Check className={`h-3 w-3 ${
                (lineStyle === 'default' ? !edgeOwnLineStyle : edgeOwnLineStyle === lineStyle)
                  ? 'opacity-100'
                  : 'opacity-0'
              }`} />
              {t(`edge.lineStyleOptions.${lineStyle}`)}
            </button>
          ))}
          {canDeleteEdge && (
            <>
              <div className="-mx-1 my-1 h-px bg-border" />
              <button
                type="button"
                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-destructive hover:bg-destructive/10"
                onClick={() => {
                  deleteEdge();
                  closeMenu();
                }}
              >
                <Trash2 className="h-3 w-3" />
                {t('edge.deleteEdge')}
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
      {!isLocked && canEditEdge && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY + (middleLabel ? 28 : 0)}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                title={t('edge.insertNode')}
                className={`w-5 h-5 rounded-full border border-border bg-background text-muted-foreground
                  flex items-center justify-center leading-none
                  opacity-0 group-hover:opacity-100 transition-all
                  hover:opacity-100 hover:border-primary hover:text-primary hover:bg-primary/10
                  hover:scale-110
                  cursor-pointer shadow-sm ${selected ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  insertNode();
                }}
              >
                <Plus className="h-3 w-3" />
              </button>
              {canDeleteEdge && (
                <button
                  type="button"
                  title={t('edge.deleteEdge')}
                  className={`w-5 h-5 rounded-full border border-border bg-background text-muted-foreground
                    flex items-center justify-center leading-none
                    opacity-0 group-hover:opacity-100 transition-all
                    hover:opacity-100 hover:border-destructive hover:text-destructive hover:bg-destructive/10
                    hover:scale-110
                    cursor-pointer shadow-sm ${selected ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    deleteEdge();
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
      <Dialog open={labelDialogOpen} onOpenChange={setLabelDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{t('edge.labelDialogTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('edge.startPoint')}</label>
              <Input
                value={labelForm.startLabel}
                onChange={(event) => setLabelForm(form => ({ ...form, startLabel: event.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('edge.middlePoint')}</label>
              <Input
                value={labelForm.middleLabel}
                onChange={(event) => setLabelForm(form => ({ ...form, middleLabel: event.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('edge.endPoint')}</label>
              <Input
                value={labelForm.endLabel}
                onChange={(event) => setLabelForm(form => ({ ...form, endLabel: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => setLabelDialogOpen(false)}>
              {t('edge.cancel')}
            </Button>
            <Button type="button" size="sm" onClick={saveLabels}>
              {t('edge.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function areWorkflowEdgePropsEqual(prev: EdgeProps, next: EdgeProps): boolean {
  return prev.id === next.id
    && prev.source === next.source
    && prev.target === next.target
    && prev.sourceX === next.sourceX
    && prev.sourceY === next.sourceY
    && prev.targetX === next.targetX
    && prev.targetY === next.targetY
    && prev.sourcePosition === next.sourcePosition
    && prev.targetPosition === next.targetPosition
    && prev.selected === next.selected
    && areWorkflowEdgeDataEqual(prev.data, next.data);
}

export const WorkflowEdge = React.memo(WorkflowEdgeComponent, areWorkflowEdgePropsEqual);

function areWorkflowEdgeDataEqual(prevData: unknown, nextData: unknown): boolean {
  if (Object.is(prevData, nextData)) return true;
  if (!prevData || !nextData || typeof prevData !== 'object' || typeof nextData !== 'object') return false;

  const prevRecord = prevData as Record<string, unknown>;
  const nextRecord = nextData as Record<string, unknown>;
  const prevKeys = Object.keys(prevRecord);
  const nextKeys = Object.keys(nextRecord);
  if (prevKeys.length !== nextKeys.length) return false;

  return prevKeys.every(key => Object.prototype.hasOwnProperty.call(nextRecord, key)
    && Object.is(prevRecord[key], nextRecord[key]));
}
