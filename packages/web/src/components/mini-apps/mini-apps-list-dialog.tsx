'use client';

import { useMemo } from 'react';
import type { MiniAppProject } from '@agent-spaces/sdk';
import { useTranslations } from 'next-intl';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  MiniAppFilterToolbar,
  useMiniAppFilters,
} from './mini-apps-filters';

interface MiniAppListDialogProps {
  open: boolean;
  projects: MiniAppProject[];
  /** 多选模式（默认 true） */
  selectable?: boolean;
  /** 当前选中的项目 id 列表 */
  selectedIds?: string[];
  /** 选中项变化回调（多选模式实时回调） */
  onSelectedIdsChange?: (ids: string[]) => void;
  /** 确认回调：返回选中项（含全量数据） */
  onConfirm?: (selected: MiniAppProject[]) => void;
  /** 单选模式下点击项的回调 */
  onSelect?: (project: MiniAppProject) => void;
  onClose: () => void;
  /** 是否显示类型/标签过滤，默认 true */
  showTypeFilter?: boolean;
  showTagsFilter?: boolean;
  /** 确认按钮文案 key，默认 page.create */
  confirmLabelKey?: 'page.create' | 'filters.confirm';
  allowEmptySelection?: boolean;
}

export function MiniAppListDialog({
  open,
  projects,
  selectable = true,
  selectedIds = [],
  onSelectedIdsChange,
  onConfirm,
  onSelect,
  onClose,
  showTypeFilter = true,
  showTagsFilter = true,
  confirmLabelKey = 'page.create',
  allowEmptySelection = false,
}: MiniAppListDialogProps) {
  const t = useTranslations('mini-apps');
  const filters = useMiniAppFilters({ projects });

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggle = (id: string) => {
    if (!onSelectedIdsChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(Array.from(next));
  };

  const handleConfirm = () => {
    if (!onConfirm) return;
    const selected = projects.filter(p => selectedSet.has(p.id));
    onConfirm(selected);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('listDialog.title')}</DialogTitle>
        </DialogHeader>
        <MiniAppFilterToolbar
          state={filters}
          className="gap-1.5"
          showTypeFilter={showTypeFilter}
          showTagsFilter={showTagsFilter}
        />
        <div className="max-h-[400px] space-y-1 overflow-y-auto">
          {filters.filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {projects.length === 0 ? t('page.empty') : t('page.noMatch')}
            </div>
          ) : null}
          {filters.filtered.map((project) => {
            const checked = selectedSet.has(project.id);
            return (
              <div
                key={project.id}
                role="button"
                tabIndex={0}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent cursor-pointer"
                onClick={() => {
                  if (selectable) {
                    toggle(project.id);
                    return;
                  }
                  onSelect?.(project);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  if (selectable) {
                    toggle(project.id);
                    return;
                  }
                  onSelect?.(project);
                }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {selectable ? (
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(project.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : null}
                  <div className="min-w-0">
                    <div className="truncate font-medium">{project.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {project.description || '—'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {project.tags?.slice(0, 2).map(tag => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                  ))}
                  <Badge variant={project.type === 'react' ? 'default' : 'secondary'} className="text-[10px]">
                    {project.type === 'react' ? 'React' : 'HTML'}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter className="justify-between sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {selectable
              ? t('listDialog.selectedCount', { count: selectedIds.length })
              : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{t('listDialog.cancel')}</Button>
            {selectable ? (
              <Button onClick={handleConfirm} disabled={!allowEmptySelection && selectedIds.length === 0}>
                {t(confirmLabelKey)}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
