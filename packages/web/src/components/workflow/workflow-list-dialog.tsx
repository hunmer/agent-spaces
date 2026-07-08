'use client';

import { useMemo, useState } from 'react';
import type { WorkflowTemplate } from '@agent-spaces/shared';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus } from 'lucide-react';

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
}: WorkflowListDialogProps) {
  const [query, setQuery] = useState('');

  const sorted = useMemo(
    () => [...workflows].sort((a, b) =>
      new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
    ),
    [workflows],
  );

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return sorted;
    return sorted.filter((workflow) =>
      `${workflow.name || ''}\n${workflow.description || ''}\n${workflow.id}`.toLowerCase().includes(keyword));
  }, [query, sorted]);

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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>工作流</DialogTitle>
        </DialogHeader>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索工作流"
          className="h-8 text-sm"
        />
        <div className="max-h-[400px] space-y-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">暂无工作流</div>
          ) : null}
          {filtered.map((workflow) => (
            <div
              key={workflow.id}
              role="button"
              tabIndex={0}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
              onClick={() => {
                if (selectable) {
                  toggleWorkflow(workflow.id);
                  return;
                }
                onSelect(workflow);
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
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
                    onCheckedChange={() => toggleWorkflow(workflow.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="truncate font-medium">{workflow.name || '未命名'}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {workflow.nodes?.length || 0} 个节点
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground">{workflow.id.slice(0, 8)}</div>
            </div>
          ))}
        </div>
        <DialogFooter>
          {showCreate ? (
            <Button onClick={onCreate}>
              <Plus className="mr-1 h-4 w-4" /> 新建工作流
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
