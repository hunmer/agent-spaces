'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { WorkflowTemplate } from '@agent-spaces/shared';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Filter, ArrowUpDown, Clock } from 'lucide-react';
import { toPinyinSearchKey } from '@/lib/utils';

export type WorkflowSortField = 'createdAt' | 'updatedAt' | 'lastRunAt' | 'lastOpenedAt';
export type WorkflowSortOrder = 'asc' | 'desc';
export type WorkflowScheduleFilter = 'all' | 'scheduled' | 'unscheduled';
export type WorkflowTypeFilter = 'normal' | 'workspace';

export interface UseWorkflowFiltersOptions {
  workflows?: WorkflowTemplate[];
  initialSortField?: WorkflowSortField;
  initialSortOrder?: WorkflowSortOrder;
  initialTypeFilter?: WorkflowTypeFilter;
}

export interface WorkflowFiltersState {
  search: string;
  setSearch: (v: string) => void;
  selectedTags: string[];
  setSelectedTags: (v: string[]) => void;
  scheduleFilter: WorkflowScheduleFilter;
  setScheduleFilter: (v: WorkflowScheduleFilter) => void;
  typeFilter: WorkflowTypeFilter;
  setTypeFilter: (v: WorkflowTypeFilter) => void;
  sortField: WorkflowSortField;
  setSortField: (v: WorkflowSortField) => void;
  sortOrder: WorkflowSortOrder;
  setSortOrder: (v: WorkflowSortOrder) => void;
  allTags: string[];
  filtered: WorkflowTemplate[];
}

/**
 * 工作流列表的搜索/过滤/排序状态与计算逻辑。
 * 供 WorkflowsPage 与 WorkflowListDialog 复用，保证两侧筛选行为一致。
 */
export function useWorkflowFilters({
  workflows = [],
  initialSortField = 'createdAt',
  initialSortOrder = 'desc',
  initialTypeFilter = 'normal',
}: UseWorkflowFiltersOptions = {}): WorkflowFiltersState {
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [scheduleFilter, setScheduleFilter] = useState<WorkflowScheduleFilter>('all');
  const [typeFilter, setTypeFilter] = useState<WorkflowTypeFilter>(initialTypeFilter);
  const [sortField, setSortField] = useState<WorkflowSortField>(initialSortField);
  const [sortOrder, setSortOrder] = useState<WorkflowSortOrder>(initialSortOrder);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    workflows.forEach(wf => wf.tags?.forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [workflows]);

  const filtered = useMemo(() => {
    return workflows.filter(wf => {
      const q = search.toLowerCase();
      const matchesSearch = !search
        || wf.name.toLowerCase().includes(q)
        || wf.description?.toLowerCase().includes(q)
        || toPinyinSearchKey(wf.name).includes(q)
        || toPinyinSearchKey(wf.description ?? '').includes(q);
      const matchesTags = selectedTags.length === 0 || selectedTags.some(tag => wf.tags?.includes(tag));
      const hasEnabledCronTrigger = wf.triggers?.some(trigger => trigger.type === 'cron' && trigger.enabled) || false;
      const matchesSchedule =
        scheduleFilter === 'all'
        || (scheduleFilter === 'scheduled' && hasEnabledCronTrigger)
        || (scheduleFilter === 'unscheduled' && !hasEnabledCronTrigger);
      // 类型过滤：未声明 type 视为 normal
      const matchesType = (wf.type ?? 'normal') === typeFilter;
      return matchesSearch && matchesTags && matchesSchedule && matchesType;
    }).sort((a, b) => {
      // lastRunAt is undefined for workflows that have never run — treat as 0 (oldest).
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      return sortOrder === 'asc' ? av - bv : bv - av;
    });
  }, [workflows, search, selectedTags, scheduleFilter, typeFilter, sortField, sortOrder]);

  return {
    search, setSearch,
    selectedTags, setSelectedTags,
    scheduleFilter, setScheduleFilter,
    typeFilter, setTypeFilter,
    sortField, setSortField,
    sortOrder, setSortOrder,
    allTags, filtered,
  };
}

const triggerClass =
  'inline-flex items-center justify-center gap-1.5 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 rounded-md px-3 text-sm font-medium cursor-pointer';

const itemClass = (active: boolean) =>
  `flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted text-left cursor-pointer ${active ? 'font-medium' : ''}`;

/**
 * 受控 Popover 包装：点击选项后自动收起。
 * options 渲染区域用 children 传入，调用方在 onClick 里触发 onSelect 即可关闭。
 */
function FilterPopover({
  trigger,
  children,
  contentClassName,
}: {
  trigger: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={triggerClass} onClick={() => setOpen(v => !v)}>
          {trigger}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={contentClassName ?? 'w-44 p-2'}
        onClick={() => setOpen(false)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

export interface WorkflowFilterToolbarProps {
  state: WorkflowFiltersState;
  className?: string;
  /** 是否显示类型过滤（normal/workspace）。默认 true。 */
  showTypeFilter?: boolean;
  /** 是否显示定时过滤。默认 true。 */
  showScheduleFilter?: boolean;
  /** 是否显示标签过滤。默认 true（无标签时自动隐藏）。 */
  showTagsFilter?: boolean;
}

/**
 * 工作流搜索/过滤/排序工具栏。WorkflowsPage 与 WorkflowListDialog 共用。
 */
export function WorkflowFilterToolbar({
  state,
  className,
  showTypeFilter = true,
  showScheduleFilter = true,
  showTagsFilter = true,
}: WorkflowFilterToolbarProps) {
  const t = useTranslations('workflows');
  const {
    search, setSearch,
    selectedTags, setSelectedTags,
    scheduleFilter, setScheduleFilter,
    typeFilter, setTypeFilter,
    sortField, setSortField,
    sortOrder, setSortOrder,
    allTags,
  } = state;

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className ?? ''}`}>
      {showTypeFilter ? (
        <FilterPopover
          trigger={
            <>
              <Filter className="h-3.5 w-3.5" />
              {typeFilter === 'workspace' ? t('page.typeWorkspace') : t('page.typeNormal')}
            </>
          }
        >
          <div className="flex flex-col gap-1">
            {([
              ['normal', t('page.typeNormal')],
              ['workspace', t('page.typeWorkspace')],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                className={itemClass(typeFilter === value)}
                onClick={() => setTypeFilter(value)}
              >
                {typeFilter === value && <span className="text-primary">✓</span>}
                {label}
              </button>
            ))}
          </div>
        </FilterPopover>
      ) : null}
      <div className="relative flex-1 min-w-[140px] max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder={t('page.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>
      <Popover>
        <PopoverTrigger className={triggerClass}>
          <ArrowUpDown className="h-3.5 w-3.5" />
          {t(`page.${sortField}`)}
          <span className="text-muted-foreground text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-48 p-2">
          <div className="flex flex-col gap-1">
            {([
              ['createdAt', t('page.createdAt')],
              ['updatedAt', t('page.updatedAt')],
              ['lastRunAt', t('page.lastRunAt')],
              ['lastOpenedAt', t('page.lastOpenedAt')],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                className={itemClass(sortField === value)}
                onClick={() => setSortField(value)}
              >
                {sortField === value && <span className="text-primary">✓</span>}
                {label}
              </button>
            ))}
            <div className="border-t my-1" />
            <button
              className={itemClass(sortOrder === 'asc')}
              onClick={() => setSortOrder('asc')}
            >
              {sortOrder === 'asc' && <span className="text-primary">✓</span>}
              {t('page.asc')}
            </button>
            <button
              className={itemClass(sortOrder === 'desc')}
              onClick={() => setSortOrder('desc')}
            >
              {sortOrder === 'desc' && <span className="text-primary">✓</span>}
              {t('page.desc')}
            </button>
          </div>
        </PopoverContent>
      </Popover>
      {showScheduleFilter ? (
        <Popover>
          <PopoverTrigger className={triggerClass}>
            <Clock className="h-3.5 w-3.5" />
            {scheduleFilter === 'scheduled' ? t('page.scheduleScheduled') : scheduleFilter === 'unscheduled' ? t('page.scheduleUnscheduled') : t('page.scheduleFilter')}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-44 p-2">
            <div className="flex flex-col gap-1">
              {([
                ['all', t('page.scheduleFilterAll')],
                ['scheduled', t('page.scheduleScheduled')],
                ['unscheduled', t('page.scheduleUnscheduled')],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  className={itemClass(scheduleFilter === value)}
                  onClick={() => setScheduleFilter(value)}
                >
                  {scheduleFilter === value && <span className="text-primary">✓</span>}
                  {label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
      {showTagsFilter && allTags.length > 0 ? (
        <Popover>
          <PopoverTrigger className={triggerClass}>
            <Filter className="h-3.5 w-3.5" />
            {t('page.tags')}
            {selectedTags.length > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">{selectedTags.length}</Badge>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-48 p-2">
            <div className="flex flex-col gap-1">
              {allTags.map(tag => {
                const selected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted text-left cursor-pointer"
                    onClick={() => setSelectedTags(selected ? selectedTags.filter(x => x !== tag) : [...selectedTags, tag])}
                  >
                    <span className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${selected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30'}`}>
                      {selected && <span className="text-[10px]">✓</span>}
                    </span>
                    {tag}
                  </button>
                );
              })}
            </div>
            {selectedTags.length > 0 && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground mt-1 pt-1 border-t cursor-pointer w-full text-left px-2 py-1"
                onClick={() => setSelectedTags([])}
              >
                {t('page.clearFilter')}
              </button>
            )}
          </PopoverContent>
        </Popover>
      ) : null}
      {selectedTags.length > 0 ? (
        <div className="flex gap-1 flex-wrap">
          {selectedTags.map(tag => (
            <Badge key={tag} variant="secondary" className="gap-1 text-xs cursor-pointer" onClick={() => setSelectedTags(selectedTags.filter(x => x !== tag))}>
              {tag}
              <span className="text-[10px]">✕</span>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
