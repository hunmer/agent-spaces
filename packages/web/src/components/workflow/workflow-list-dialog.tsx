'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  /** 选择模式：single 单选（点行高亮，确定提交一个）/ multiple 多选。默认 single。 */
  mode?: 'single' | 'multiple';
  /** 弹窗打开时的初始选中快照（非受控：每次 open 由 false→true 时重置）。 */
  defaultSelectedIds?: string[];
  /** 点「确定」回调，回传选中的工作流对象数组。回调后弹窗自动关闭。 */
  onConfirm?: (selected: WorkflowTemplate[]) => void;
  onCreate: () => void;
  onClose: () => void;
  showCreate?: boolean;
  onConfigure?: (workflow: WorkflowTemplate) => void;
  /**
   * “当前工作流”集合：传入后类型过滤会多出“当前工作流”选项，且默认选中它，
   * 只展示该集合中的工作流（如 mini-app 已配置的工作流）。
   * 不传则与主列表页行为一致，只保留 normal/workspace。
   */
  currentWorkflowIds?: Set<string>;
  /**
   * 是否开启行勾选（checkbox + 点击选中 + 底部确认按钮）。
   * 默认 true。仅作展示/配置入口（无 onConfirm）的场景可传 false 隐藏勾选。
   */
  selectable?: boolean;
}

export function WorkflowListDialog({
  open,
  workflows,
  mode = 'single',
  defaultSelectedIds = [],
  onConfirm,
  onCreate,
  onClose,
  showCreate = true,
  onConfigure,
  currentWorkflowIds,
  selectable = true,
}: WorkflowListDialogProps) {
  const t = useTranslations('workflows');
  // 弹窗不复用主列表页持久化的过滤状态（wf-filter:*），否则用户在 WorkflowsPage
  // 设置的类型/标签/搜索过滤会把弹窗里的工作流全部过滤掉，表现为列表为空。
  // 只要调用方传入了 currentWorkflowIds（哪怕空集合），就把“当前工作流”作为
  // 常驻类型项并默认选中；空集合时该视图为空，切 normal/workspace 仍可看全部。
  const hasCurrent = currentWorkflowIds !== undefined;
  const filters = useWorkflowFilters({
    workflows,
    persist: false,
    initialTypeFilter: hasCurrent ? 'current' : 'normal',
    currentWorkflowIds,
  });

  // 临时选中态（非受控）。每次弹窗打开重置为 defaultSelectedIds 快照，
  // 避免上次残留；取消/关闭不会污染调用方状态。
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultSelectedIds);
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setSelectedIds(defaultSelectedIds);
    }
    prevOpenRef.current = open;
  }, [open, defaultSelectedIds]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleWorkflow = (workflowId: string) => {
    if (mode === 'single') {
      // 单选：点新项替换旧的（再次点同一项不取消，保证总有选中）
      setSelectedIds(prev => prev.includes(workflowId) ? prev : [workflowId]);
    } else {
      // 多选：增删
      setSelectedIds(prev =>
        prev.includes(workflowId)
          ? prev.filter(id => id !== workflowId)
          : [...prev, workflowId],
      );
    }
  };

  const handleConfirm = () => {
    if (!onConfirm) { onClose(); return; }
    const selected = selectedIds
      .map(id => workflows.find(wf => wf.id === id))
      .filter((wf): wf is WorkflowTemplate => Boolean(wf));
    onConfirm(selected);
    onClose();
  };

  const canConfirm = mode === 'single' ? selectedIds.length > 0 : true;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('page.title')}</DialogTitle>
        </DialogHeader>
        <WorkflowFilterToolbar
          state={filters}
          className="gap-1.5"
          showCurrentFilter={hasCurrent}
        />
        <div className="max-h-[400px] space-y-1 overflow-y-auto">
          {filters.filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t('page.empty')}</div>
          ) : null}
          {filters.filtered.map((workflow) => {
            const checked = selectable && selectedSet.has(workflow.id);
            const onRowActivate = selectable ? () => toggleWorkflow(workflow.id) : undefined;
            return (
              <div
                key={workflow.id}
                role={selectable ? 'button' : undefined}
                tabIndex={selectable ? 0 : undefined}
                aria-pressed={selectable ? checked : undefined}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${selectable ? 'cursor-pointer hover:bg-accent' : ''} ${checked ? 'bg-accent' : ''}`}
                onClick={onRowActivate}
                onKeyDown={(e) => {
                  if (!onRowActivate) return;
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  onRowActivate();
                }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {selectable && (
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleWorkflow(workflow.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
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
            );
          })}
        </div>
        <DialogFooter>
          <div className="flex w-full items-center justify-between gap-2">
            {mode === 'multiple' && selectedIds.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {t('page.selectedCount', { count: selectedIds.length })}
              </span>
            ) : <span />}
            <div className="flex items-center gap-2">
              {showCreate ? (
                <Button variant="outline" onClick={onCreate}>
                  <Plus className="mr-1 h-4 w-4" /> {t('page.create')}
                </Button>
              ) : null}
              {onConfirm ? (
                <Button onClick={handleConfirm} disabled={!canConfirm}>
                  {t('page.confirm')}
                </Button>
              ) : null}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

