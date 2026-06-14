'use client';

import { Group, Trash2, Workflow as WorkflowIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface WorkflowSelectionMenuProps {
  menu: { x: number; y: number; nodeIds: string[] };
  onMergeNodesToWorkflow?: (ids: string[]) => void;
  onMergeNodesToGroup?: (ids: string[]) => void;
  onBatchDeleteNodes?: (ids: string[]) => void;
  onClose: () => void;
}

export function WorkflowSelectionMenu({
  menu,
  onMergeNodesToWorkflow,
  onMergeNodesToGroup,
  onBatchDeleteNodes,
  onClose,
}: WorkflowSelectionMenuProps) {
  const t = useTranslations('workflows');

  const runAction = (action?: (ids: string[]) => void) => {
    if (!action) return;
    action(menu.nodeIds);
    onClose();
  };

  return (
    <div
      data-workflow-selection-menu="true"
      className="fixed z-50 min-w-40 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <button
        type="button"
        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
        onClick={() => runAction(onMergeNodesToWorkflow)}
      >
        <WorkflowIcon className="h-3 w-3" />
        {t('canvas.mergeToWorkflow')}
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
        onClick={() => runAction(onMergeNodesToGroup)}
      >
        <Group className="h-3 w-3" />
        {t('canvas.mergeToGroup')}
      </button>
      <div className="-mx-1 my-1 h-px bg-border" />
      <button
        type="button"
        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-destructive hover:bg-destructive/10"
        onClick={() => runAction(onBatchDeleteNodes)}
      >
        <Trash2 className="h-3 w-3" />
        {t('canvas.batchDelete')}
      </button>
    </div>
  );
}
