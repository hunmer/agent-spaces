'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Archive,
  ArchiveRestore,
  CircleCheck,
  CircleSlash,
  ClipboardCopy,
  Copy,
  Flag,
  FlagOff,
  Group,
  Info,
  Palette,
  Settings,
  SkipForward,
  Trash2,
  Workflow,
} from 'lucide-react';
import type { NodeBreakpoint, NodeRunState } from '@agent-spaces/shared';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { NODE_COLORS, type NodeColorDef } from './workflow-node-types';

export type WorkflowNodeContextMenuProps = {
  nodeId: string;
  selectedNodeIds?: string[];
  isCanvasLocked: boolean;
  isDeleteProtected: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
  onSetColor: (color: string | null) => void;
  onSetState: (state: NodeRunState) => void;
  onSetBreakpoint: (breakpoint: NodeBreakpoint | null) => void;
  onShowInfo: () => void;
  onCopy: () => void;
  onClone: () => void;
  onStage: () => void;
  onMoveToStage: () => void;
  onDelete: () => void;
  onMergeToWorkflow?: () => void;
  onMergeToGroup?: () => void;
  onBatchDelete?: () => void;
};

function ColorItem({ color, onClick }: { color: NodeColorDef; onClick: () => void }) {
  const t = useTranslations('workflows');
  return (
    <ContextMenuItem className="text-xs gap-2" onClick={onClick}>
      <span className={cn('h-3.5 w-3.5 shrink-0 rounded-sm', color.className)} />
      {t(color.label)}
    </ContextMenuItem>
  );
}

export function WorkflowNodeContextMenu({
  selectedNodeIds = [],
  isDeleteProtected,
  isCanvasLocked,
  children,
  style,
  onSetColor,
  onSetState,
  onSetBreakpoint,
  onShowInfo,
  onCopy,
  onClone,
  onStage,
  onMoveToStage,
  onDelete,
  onMergeToWorkflow,
  onMergeToGroup,
  onBatchDelete,
}: WorkflowNodeContextMenuProps) {
  const t = useTranslations('workflows');
  const isMultiSelect = selectedNodeIds.length >= 2;
  const showContextMenu = !isCanvasLocked;

  const handleContextMenu = (event: React.MouseEvent) => {
    if (showContextMenu) return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <ContextMenu key={showContextMenu ? 'context-menu-enabled' : 'context-menu-disabled'}>
      <ContextMenuTrigger className="block" style={style} onContextMenu={handleContextMenu}>
        {children}
      </ContextMenuTrigger>
      {showContextMenu && (
        <ContextMenuContent className="w-48">
          {isMultiSelect ? (
            <>
              <ContextMenuItem className="text-xs gap-2" onClick={onMergeToWorkflow}>
                <Workflow className="h-3 w-3" />
                合并为工作流
              </ContextMenuItem>
              <ContextMenuSub>
                <ContextMenuSubTrigger className="text-xs gap-2">
                  <Group className="h-3 w-3" />
                  分组
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-40">
                  <ContextMenuItem className="text-xs gap-2" onClick={onMergeToGroup}>
                    <Group className="h-3 w-3" />
                    合并成组
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSeparator />
              <ContextMenuItem className="text-xs gap-2" variant="destructive" onClick={onBatchDelete}>
                <Trash2 className="h-3 w-3" />
                批量删除
              </ContextMenuItem>
            </>
          ) : (
            <>
              <ContextMenuSub>
                <ContextMenuSubTrigger className="text-xs gap-2">
                  <Palette className="h-3 w-3" />
                  {t('nodeUi.contextMenu.color')}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-40">
                  {NODE_COLORS.map(color => (
                    <ColorItem key={color.value ?? 'default'} color={color} onClick={() => onSetColor(color.value)} />
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSub>
                <ContextMenuSubTrigger className="text-xs gap-2">
                  <Settings className="h-3 w-3" />
                  {t('nodeUi.contextMenu.state')}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-44">
                  <ContextMenuItem className="text-xs gap-2" onClick={() => onSetState('normal')}>
                    <CircleCheck className="h-3 w-3 text-green-500" />
                    {t('nodeUi.contextMenu.stateNormal')}
                  </ContextMenuItem>
                  <ContextMenuItem className="text-xs gap-2" onClick={() => onSetState('disabled')}>
                    <CircleSlash className="h-3 w-3 text-red-500" />
                    {t('nodeUi.contextMenu.stateDisabled')}
                  </ContextMenuItem>
                  <ContextMenuItem className="text-xs gap-2" onClick={() => onSetState('skipped')}>
                    <SkipForward className="h-3 w-3 text-yellow-500" />
                    {t('nodeUi.contextMenu.stateSkipped')}
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSub>
                <ContextMenuSubTrigger className="text-xs gap-2">
                  <Flag className="h-3 w-3" />
                  {t('nodeUi.contextMenu.breakpoint')}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-44">
                  <ContextMenuItem className="text-xs gap-2" onClick={() => onSetBreakpoint('start')}>
                    <Flag className="h-3 w-3 text-blue-500" />
                    {t('nodeUi.contextMenu.breakpointStart')}
                  </ContextMenuItem>
                  <ContextMenuItem className="text-xs gap-2" onClick={() => onSetBreakpoint('end')}>
                    <Flag className="h-3 w-3 text-purple-500" />
                    {t('nodeUi.contextMenu.breakpointEnd')}
                  </ContextMenuItem>
                  <ContextMenuItem className="text-xs gap-2" onClick={() => onSetBreakpoint(null)}>
                    <FlagOff className="h-3 w-3 text-muted-foreground" />
                    {t('nodeUi.contextMenu.breakpointClear')}
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSeparator />
              <ContextMenuItem className="text-xs gap-2" onClick={onShowInfo}>
                <Info className="h-3 w-3" />
                {t('nodeUi.contextMenu.info')}
              </ContextMenuItem>
              <ContextMenuItem className="text-xs gap-2" onClick={onCopy}>
                <Copy className="h-3 w-3" />
                {t('nodeUi.contextMenu.copy')}
              </ContextMenuItem>
              <ContextMenuItem className="text-xs gap-2" onClick={onClone}>
                <ClipboardCopy className="h-3 w-3" />
                {t('nodeUi.contextMenu.clone')}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem className="text-xs gap-2" onClick={onStage}>
                <Archive className="h-3 w-3" />
                {t('nodeUi.contextMenu.stage')}
              </ContextMenuItem>
              {!isDeleteProtected ? (
                <ContextMenuItem className="text-xs gap-2" onClick={onMoveToStage}>
                  <ArchiveRestore className="h-3 w-3" />
                  {t('nodeUi.contextMenu.moveToStage')}
                </ContextMenuItem>
              ) : null}
              <ContextMenuSeparator />
              {!isDeleteProtected ? (
                <ContextMenuItem className="text-xs gap-2" variant="destructive" onClick={onDelete}>
                  <Trash2 className="h-3 w-3" />
                  {t('nodeUi.contextMenu.delete')}
                </ContextMenuItem>
              ) : null}
            </>
          )}
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
}
