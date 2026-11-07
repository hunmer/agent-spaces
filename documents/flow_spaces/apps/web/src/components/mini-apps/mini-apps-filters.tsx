'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { MiniAppProject } from '@agent-spaces/sdk';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Filter, ArrowUpDown } from 'lucide-react';
import { toPinyinSearchKey } from '@/lib/utils';
import { usePersistentState } from '@/hooks/use-persistent-state';

export type MiniAppTypeFilter = 'all' | 'react' | 'html';
export type MiniAppSortField = 'createdAt' | 'updatedAt';
export type MiniAppSortOrder = 'asc' | 'desc';

export interface UseMiniAppFiltersOptions {
  projects?: MiniAppProject[];
  initialTypeFilter?: MiniAppTypeFilter;
  initialSortField?: MiniAppSortField;
  initialSortOrder?: MiniAppSortOrder;
  /** 传入 localStorage 命名空间前缀以持久化过滤条件；不传则不持久化（如选择弹窗）。 */
  persistKey?: string;
}

export interface MiniAppFiltersState {
  search: string;
  setSearch: (v: string) => void;
  selectedTags: string[];
  setSelectedTags: (v: string[]) => void;
  typeFilter: MiniAppTypeFilter;
  setTypeFilter: (v: MiniAppTypeFilter) => void;
  sortField: MiniAppSortField;
  setSortField: (v: MiniAppSortField) => void;
  sortOrder: MiniAppSortOrder;
  setSortOrder: (v: MiniAppSortOrder) => void;
  allTags: string[];
  filtered: MiniAppProject[];
}

/**
 * Mini App 列表的搜索/过滤/排序状态与计算逻辑。
 * 供 MiniAppListPage 与 MiniAppListDialog 复用，保证两侧筛选行为一致。
 */
export function useMiniAppFilters({
  projects = [],
  initialTypeFilter = 'all',
  initialSortField = 'updatedAt',
  initialSortOrder = 'desc',
  persistKey,
}: UseMiniAppFiltersOptions = {}): MiniAppFiltersState {
  const pk = (sub: string) => (persistKey ? `${persistKey}:${sub}` : undefined);
  const [search, setSearch] = usePersistentState(pk('search'), '');
  const [selectedTags, setSelectedTags] = usePersistentState<string[]>(pk('tags'), []);
  const [typeFilter, setTypeFilter] = usePersistentState<MiniAppTypeFilter>(pk('type'), initialTypeFilter);
  const [sortField, setSortField] = usePersistentState<MiniAppSortField>(pk('sortField'), initialSortField);
  const [sortOrder, setSortOrder] = usePersistentState<MiniAppSortOrder>(pk('sortOrder'), initialSortOrder);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    projects.forEach(p => p.tags?.forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [projects]);

  const filtered = useMemo(() => {
    return projects.filter(p => {
      const q = search.toLowerCase();
      const matchesSearch = !search
        || p.name.toLowerCase().includes(q)
        || p.description?.toLowerCase().includes(q)
        || p.tags?.some(t => t.toLowerCase().includes(q))
        || toPinyinSearchKey(p.name).includes(q)
        || toPinyinSearchKey(p.description ?? '').includes(q);
      const matchesType = typeFilter === 'all' || p.type === typeFilter;
      const matchesTags = selectedTags.length === 0 || selectedTags.some(tag => p.tags?.includes(tag));
      return matchesSearch && matchesType && matchesTags;
    }).sort((a, b) => {
      const av = a[sortField] ?? '';
      const bv = b[sortField] ?? '';
      return sortOrder === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [projects, search, typeFilter, selectedTags, sortField, sortOrder]);

  return {
    search, setSearch,
    selectedTags, setSelectedTags,
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
      <PopoverTrigger className={triggerClass}>
        {trigger}
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

export interface MiniAppFilterToolbarProps {
  state: MiniAppFiltersState;
  className?: string;
  /** 是否显示类型过滤（react/html/all）。默认 true。 */
  showTypeFilter?: boolean;
  /** 是否显示标签过滤。默认 true（无标签时自动隐藏）。 */
  showTagsFilter?: boolean;
}

/**
 * Mini App 搜索/过滤/排序工具栏。MiniAppListPage 与 MiniAppListDialog 共用。
 */
export function MiniAppFilterToolbar({
  state,
  className,
  showTypeFilter = true,
  showTagsFilter = true,
}: MiniAppFilterToolbarProps) {
  const t = useTranslations('mini-apps');
  const {
    search, setSearch,
    selectedTags, setSelectedTags,
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
              {typeFilter === 'all' ? t('filters.typeAll') : typeFilter === 'react' ? t('filters.typeReact') : t('filters.typeHtml')}
            </>
          }
        >
          <div className="flex flex-col gap-1">
            {([
              ['all', t('filters.typeAll')],
              ['react', t('filters.typeReact')],
              ['html', t('filters.typeHtml')],
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
      <FilterPopover
        trigger={
          <>
            <ArrowUpDown className="h-3.5 w-3.5" />
            {t(`filters.${sortField}`)}
            <span className="text-muted-foreground text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
          </>
        }
        contentClassName="w-48 p-2"
      >
        <div className="flex flex-col gap-1">
          {([
            ['updatedAt', t('filters.updatedAt')],
            ['createdAt', t('filters.createdAt')],
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
            {t('filters.asc')}
          </button>
          <button
            className={itemClass(sortOrder === 'desc')}
            onClick={() => setSortOrder('desc')}
          >
            {sortOrder === 'desc' && <span className="text-primary">✓</span>}
            {t('filters.desc')}
          </button>
        </div>
      </FilterPopover>
      {showTagsFilter && allTags.length > 0 ? (
        <FilterPopover
          contentClassName="w-48 p-2"
          trigger={
            <>
              <Filter className="h-3.5 w-3.5" />
              {t('filters.tags')}
              {selectedTags.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">{selectedTags.length}</Badge>
              )}
            </>
          }
        >
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
              {t('filters.clear')}
            </button>
          )}
        </FilterPopover>
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
