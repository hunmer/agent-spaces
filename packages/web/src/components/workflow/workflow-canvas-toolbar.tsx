'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Workflow } from '@agent-spaces/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Archive, ClipboardPaste, Copy, Trash2,
  EyeOff, LassoSelect, LayoutGrid, Map as MapIcon, RotateCcw, RotateCw, SquareDashedMousePointer,
  PanelBottomClose, PanelBottomOpen,
  ExternalLink,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';

export interface WorkflowClipboardRecord {
  id: string;
  label: string;
  count: number;
}

function CanvasToolbarButton({
  tooltip,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { tooltip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="sm" className="h-7 w-7 p-0" {...props} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function CanvasToolbar({
  workflow,
  isPreview,
  canUndo,
  canRedo,
  rectangleDrawActive,
  lassoSelectionActive,
  minimapVisible,
  onUndo,
  onRedo,
  onExitPreview,
  onAutoLayout,
  layoutEngine,
  copiedNodeCount = 0,
  copiedRecords = [],
  onPasteRecord,
  onMoveRecord,
  onClearCopiedNodes,
  onToggleRectangleDraw,
  onToggleLassoSelection,
  onToggleMinimap,
  clickConnectEnabled = true,
  onClickConnectEnabledChange,
  logsCollapsed,
  onToggleLogsCollapsed,
  embeddedMode = null,
  workspaceId,
  issueId,
}: {
  workflow: Workflow;
  isPreview: boolean;
  canUndo: boolean;
  canRedo: boolean;
  rectangleDrawActive: boolean;
  lassoSelectionActive: boolean;
  minimapVisible: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onExitPreview?: () => void;
  onAutoLayout?: (direction: 'LR' | 'TB', options?: { layoutEngine?: string }) => void;
  layoutEngine?: string;
  copiedNodeCount?: number;
  copiedRecords?: WorkflowClipboardRecord[];
  onPasteRecord?: (id: string) => void;
  onMoveRecord?: (id: string) => void;
  onClearCopiedNodes?: () => void;
  onToggleRectangleDraw?: () => void;
  onToggleLassoSelection?: () => void;
  onToggleMinimap: () => void;
  clickConnectEnabled?: boolean;
  onClickConnectEnabledChange?: (enabled: boolean) => void;
  logsCollapsed: boolean;
  onToggleLogsCollapsed: () => void;
  embeddedMode?: 'issue' | null;
  workspaceId?: string;
  issueId?: string;
}) {
  const t = useTranslations("workflows");
  const [clipboardOpen, setClipboardOpen] = useState(false);
  const hasNodes = workflow.nodes.length > 0;
  const autoLayoutOptions = layoutEngine ? { layoutEngine } : undefined;
  const openWorkflowInNewWindow = () => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (workspaceId) params.set('returnWorkspaceId', workspaceId);
    if (issueId) params.set('returnIssueId', issueId);
    const qs = params.toString();
    window.open(`/workflows/${workflow.id}${qs ? `?${qs}` : ''}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-background/90 px-2 py-1 shadow-sm backdrop-blur-sm">
      <TooltipProvider delay={400}>
        {isPreview && onExitPreview ? (
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-orange-500 hover:text-orange-600" onClick={onExitPreview} />}>
              <EyeOff className="h-3.5 w-3.5" />
              <span className="text-xs">{t('canvasToolbar.exitPreview')}</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">{t('canvasToolbar.exitPreviewTooltip')}</TooltipContent>
          </Tooltip>
        ) : null}

        {isPreview && (
          <CanvasToolbarButton
            tooltip={logsCollapsed ? t('canvasToolbar.expandLogs') : t('canvasToolbar.collapseLogs')}
            className={`h-7 w-7 p-0 ${!logsCollapsed ? 'text-blue-500' : ''}`}
            onClick={onToggleLogsCollapsed}
          >
            {logsCollapsed ? <PanelBottomOpen className="h-3.5 w-3.5" /> : <PanelBottomClose className="h-3.5 w-3.5" />}
          </CanvasToolbarButton>
        )}
        {embeddedMode === 'issue' && (
          <CanvasToolbarButton tooltip={t('canvasToolbar.openInNewWindow')} onClick={openWorkflowInNewWindow}>
            <ExternalLink className="h-3.5 w-3.5" />
          </CanvasToolbarButton>
        )}
        {canUndo && (
          <CanvasToolbarButton tooltip={t('canvasToolbar.undo')} onClick={onUndo}>
            <RotateCcw className="h-3.5 w-3.5" />
          </CanvasToolbarButton>
        )}
        {canRedo && (
          <CanvasToolbarButton tooltip={t('canvasToolbar.redo')} onClick={onRedo}>
            <RotateCw className="h-3.5 w-3.5" />
          </CanvasToolbarButton>
        )}

        {copiedRecords.length > 0 && (
          <Popover open={clipboardOpen} onOpenChange={setClipboardOpen}>
            <Tooltip>
              <TooltipTrigger
                render={(
                  <PopoverTrigger
                    render={<Button variant="ghost" size="sm" className="relative h-7 w-7 p-0 text-blue-500" />}
                  />
                )}
              >
                <Copy className="h-3.5 w-3.5" />
                <span className="absolute -right-0.5 -bottom-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] leading-none text-primary-foreground">
                  {copiedNodeCount}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">{t('canvasToolbar.copiedNodes')}</TooltipContent>
            </Tooltip>
            <PopoverContent align="center" side="top" className="w-60 gap-0 p-1.5">
              <div className="flex max-h-72 flex-col overflow-y-auto">
                {copiedRecords.map((record) => (
                  <div key={record.id} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-accent">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{record.label}</div>
                      <div className="text-[10px] text-muted-foreground">{t('canvasToolbar.recordCount', { count: record.count })}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 shrink-0 p-0"
                      disabled={!onPasteRecord}
                      onClick={() => { setClipboardOpen(false); onPasteRecord?.(record.id); }}
                    >
                      <ClipboardPaste className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 shrink-0 p-0"
                      disabled={!onMoveRecord}
                      onClick={() => { setClipboardOpen(false); onMoveRecord?.(record.id); }}
                    >
                      <Archive className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              {onClearCopiedNodes && (
                <div className="mt-1 border-t border-border pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-full justify-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => { setClipboardOpen(false); onClearCopiedNodes(); }}
                  >
                    <Trash2 className="h-3 w-3" />
                    {t('canvasToolbar.clearCopiedNodes')}
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}

        {onToggleRectangleDraw && (
          <CanvasToolbarButton
            tooltip={t('canvasToolbar.drawAreaAddNode')}
            className={`h-7 w-7 p-0 ${rectangleDrawActive ? 'text-blue-500' : ''}`}
            onClick={onToggleRectangleDraw}
          >
            <SquareDashedMousePointer className="h-3.5 w-3.5" />
          </CanvasToolbarButton>
        )}

        {onToggleLassoSelection && (
          <CanvasToolbarButton
            tooltip={t('canvasToolbar.drawAreaSelectNode')}
            className={`h-7 w-7 p-0 ${lassoSelectionActive ? 'text-blue-500' : ''}`}
            onClick={onToggleLassoSelection}
          >
            <LassoSelect className="h-3.5 w-3.5" />
          </CanvasToolbarButton>
        )}

        {hasNodes && onAutoLayout && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-7 w-7 p-0" />}>
              <LayoutGrid className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top">
              <DropdownMenuItem onClick={() => onAutoLayout('LR', autoLayoutOptions)}>{t('canvasToolbar.horizontalLayout')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAutoLayout('TB', autoLayoutOptions)}>{t('canvasToolbar.verticalLayout')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <CanvasToolbarButton
          tooltip={minimapVisible ? t('canvasToolbar.hideMinimap') : t('canvasToolbar.showMinimap')}
          className={`h-7 w-7 p-0 ${minimapVisible ? 'text-blue-500' : ''}`}
          onClick={onToggleMinimap}
        >
          <MapIcon className="h-3.5 w-3.5" />
        </CanvasToolbarButton>

        {onClickConnectEnabledChange && (
          <Tooltip>
            <TooltipTrigger
              render={(
                <label className="flex h-7 items-center gap-1.5 rounded-md px-1.5 md:hidden">
                  <span className="text-[10px] text-muted-foreground">{t('canvasToolbar.clickConnect')}</span>
                  <Switch
                    size="sm"
                    checked={clickConnectEnabled}
                    onCheckedChange={onClickConnectEnabledChange}
                  />
                </label>
              )}
            />
            <TooltipContent side="top" className="text-xs">{t('canvasToolbar.clickConnectTooltip')}</TooltipContent>
          </Tooltip>
        )}

      </TooltipProvider>
    </div>
  );
}
