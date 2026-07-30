'use client';

import { useMemo } from 'react';
import type { WorkflowTemplate } from '@agent-spaces/shared';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  WorkflowFilterToolbar,
  useWorkflowFilters,
} from '@/components/workflows/workflow-filters';

interface WorkflowListDialogProps {
  open: boolean;
  workflows: WorkflowTemplate[];
  onSelect: (wf: WorkflowTemplate) => void;
  onCreate: () => void;
  onClose: () => void;
  selectable?: boolean;
  selectedWorkflowIds?: string[];
  onSelectedWorkflowIdsChange?: (workflowIds: string[]) => void;
  showCreate?: boolean;
  selectionDisabled?: boolean;
  onConfigure?: (workflow: WorkflowTemplate) => void;
}

export function WorkflowListDialog({
  open,
  workflows,
  onSelect,
  onCreate,
  onClose,
  selectable = false,
  selectedWorkflowIds = [],
  onSelectedWorkflowIdsChange,
  showCreate = true,
  selectionDisabled = false,
  onConfigure,
}: WorkflowListDialogProps) {
  const t = useTranslations('workflows');
  const filters = useWorkflowFilters({ workflows });

  const selectedSet = useMemo(() => new Set(selectedWorkflowIds), [selectedWorkflowIds]);

  const toggleWorkflow = (workflowId: string) => {
    if (!onSelectedWorkflowIdsChange) return;
    const next = new Set(selectedWorkflowIds);
    if (next.has(workflowId)) next.delete(workflowId);
    else next.add(workflowId);
    onSelectedWorkflowIdsChange(Array.from(next));
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('page.title')}</DialogTitle>
        </DialogHeader>
        <WorkflowFilterToolbar
          state={filters}
          className="gap-1.5"
        />
        <div className="max-h-[400px] space-y-1 overflow-y-auto">
          {filters.filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t('page.empty')}</div>
          ) : null}
          {filters.filtered.map((workflow) => (
            <div
              key={workflow.id}
              role="button"
              tabIndex={selectionDisabled ? -1 : 0}
              aria-disabled={selectionDisabled}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
              onClick={() => {
                if (selectionDisabled) return;
                if (selectable) {
                  toggleWorkflow(workflow.id);
                  return;
                }
                onSelect(workflow);
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                if (selectionDisabled) return;
                if (selectable) {
                  toggleWorkflow(workflow.id);
                  return;
                }
                onSelect(workflow);
              }}
            >
              <div className="flex min-w-0 items-center gap-2">
                {selectable ? (
                  <Checkbox
                    checked={selectedSet.has(workflow.id)}
                    disabled={selectionDisabled}
                    onCheckedChange={() => { if (!selectionDisabled) toggleWorkflow(workflow.id); }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="truncate font-medium">{workflow.name || t('editor.untitled')}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {t('card.nodes', { count: workflow.nodes?.length || 0 })}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <div className="text-[10px] text-muted-foreground">{workflow.id.slice(0, 8)}</div>
                {onConfigure ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={t('sidebar.editConfig')}
                    onClick={(event) => {
                      event.stopPropagation();
                      onConfigure(workflow);
                    }}
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          {showCreate ? (
            <Button onClick={onCreate}>
              <Plus className="mr-1 h-4 w-4" /> {t('page.create')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
