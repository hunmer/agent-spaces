'use client';

import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Archive, ArrowUpDown, Check, CheckSquare, ChevronRight, MoreHorizontal, Search, Square, Trash2, X } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { SkeletonGroup } from '@/components/ui/skeleton';
import { type GroupMode, getTimeGroup, TIME_GROUP_ORDER, TIME_LABEL_KEYS } from './list-utils';

export type { GroupMode };

export interface ItemGroup<T> {
  key: string;
  label: string;
  items: T[];
}

export interface ItemCtx {
  isActive: boolean;
  multiSelect: boolean;
  selected: boolean;
  toggleSelect: () => void;
}

export interface ItemListPanelProps<T> {
  title: string;

  // Data
  items: T[];
  archivedItems: T[];
  getItemId: (item: T) => string;
  getItemDate: (item: T) => string;
  activeId?: string;
  loading?: boolean;

  // Sort
  sortFields: { value: string; label: string }[];
  defaultSortField: string;
  defaultSortOrder?: 'asc' | 'desc';
  sortCompare: (a: T, b: T, field: string) => number;

  // Group
  defaultGroupMode?: GroupMode;
  getStatusGroups?: (sortedItems: T[]) => ItemGroup<T>[];

  // Render
  renderItem: (item: T, ctx: ItemCtx) => ReactNode;
  renderArchivedItem: (item: T) => ReactNode;
  renderSkeleton: (i: number) => ReactNode;
  skeletonCount?: number;
  emptyState: ReactNode;

  // Search
  searchable?: boolean;
  searchPlaceholder?: string;
  getSearchText?: (item: T) => string;

  // Archived
  archivedLabel: string;
  clearArchivedTitle: string;
  clearArchivedConfirm: string;
  onClearArchived: () => void;

  // Multi-select
  enableMultiSelect?: boolean;
  multiSelectLabel?: string;
  batchActions?: (selectedIds: Set<string>, exitMultiSelect: () => void) => ReactNode;

  // Translations (common namespace)
  tc: (key: string) => string;

  // Extra
  headerButtons?: ReactNode;
  dialogs?: ReactNode;
}

export function ItemListPanel<T>({
  title,
  items,
  archivedItems,
  getItemId,
  getItemDate,
  activeId,
  loading = false,
  sortFields,
  defaultSortField,
  defaultSortOrder = 'desc',
  sortCompare,
  defaultGroupMode = 'none',
  getStatusGroups,
  renderItem,
  renderArchivedItem,
  renderSkeleton,
  skeletonCount = 5,
  emptyState,
  searchable = false,
  searchPlaceholder,
  getSearchText,
  archivedLabel,
  clearArchivedTitle,
  clearArchivedConfirm,
  onClearArchived,
  enableMultiSelect = false,
  multiSelectLabel = 'Multi select',
  batchActions,
  tc,
  headerButtons,
  dialogs,
}: ItemListPanelProps<T>) {
  const [sortField, setSortField] = useState(defaultSortField);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(defaultSortOrder);
  const [groupMode, setGroupMode] = useState<GroupMode>(defaultGroupMode);
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [clearArchiveOpen, setClearArchiveOpen] = useState(false);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const filteredItems = useMemo(() => {
    if (!searchable || !search.trim() || !getSearchText) return items;
    const kw = search.trim().toLowerCase();
    return items.filter(item => getSearchText(item).toLowerCase().includes(kw));
  }, [items, searchable, search, getSearchText]);

  const filteredArchived = useMemo(() => {
    if (!searchable || !search.trim() || !getSearchText) return archivedItems;
    const kw = search.trim().toLowerCase();
    return archivedItems.filter(item => getSearchText(item).toLowerCase().includes(kw));
  }, [archivedItems, searchable, search, getSearchText]);

  const sortedItems = useMemo(() => {
    const sorted = [...filteredItems];
    sorted.sort((a, b) => {
      const cmp = sortCompare(a, b, sortField);
      return sortOrder === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [filteredItems, sortField, sortOrder, sortCompare]);

  const timeGroups = useMemo(() => {
    const groups: Record<string, T[]> = {};
    for (const item of sortedItems) {
      const key = getTimeGroup(getItemDate(item));
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return TIME_GROUP_ORDER
      .filter(k => groups[k]?.length)
      .map(k => ({ key: k, label: tc(TIME_LABEL_KEYS[k]!), items: groups[k]! }));
  }, [sortedItems, getItemDate, tc]);

  const statusGroups = useMemo(
    () => getStatusGroups?.(sortedItems) ?? [],
    [sortedItems, getStatusGroups],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const exitMultiSelect = useCallback(() => {
    setMultiSelect(false);
    setSelectedIds(new Set());
  }, []);

  const currentGroups = groupMode === 'time' ? timeGroups : groupMode === 'status' ? statusGroups : null;

  const itemCtx = useCallback((item: T): ItemCtx => ({
    isActive: activeId === getItemId(item),
    multiSelect,
    selected: selectedIds.has(getItemId(item)),
    toggleSelect: () => toggleSelect(getItemId(item)),
  }), [activeId, getItemId, multiSelect, selectedIds, toggleSelect]);

  const renderGroup = (group: ItemGroup<T>) => (
    <Collapsible key={group.key} open={groupOpen[group.key] !== false} onOpenChange={(open) => setGroupOpen(prev => ({ ...prev, [group.key]: open }))}>
      <CollapsibleTrigger className="flex items-center gap-1 w-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
        <ChevronRight className={cn('size-3 transition-transform', groupOpen[group.key] !== false && 'rotate-90')} />
        {group.label} ({group.items.length})
      </CollapsibleTrigger>
      <CollapsibleContent>
        {group.items.map(item => renderItem(item, itemCtx(item)))}
      </CollapsibleContent>
    </Collapsible>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1.5 border-b text-xs font-medium text-muted-foreground">
        <span>{title}</span>
        <div className="flex items-center gap-0.5">
          {multiSelect && selectedIds.size > 0 && batchActions?.(selectedIds, exitMultiSelect)}
          {enableMultiSelect && (
            <button onClick={() => { if (multiSelect) exitMultiSelect(); else setMultiSelect(true); }} className={cn('p-0.5 hover:bg-accent rounded cursor-pointer', multiSelect && 'bg-accent')} title={multiSelectLabel}>
              <CheckSquare className="size-3.5" />
            </button>
          )}
          {headerButtons}
          <DropdownMenu>
            <DropdownMenuTrigger className="p-0.5 hover:bg-accent rounded">
              <ArrowUpDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              {sortFields.map(({ value, label }) => (
                <DropdownMenuItem key={value} onClick={() => {
                  if (sortField === value) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                  else { setSortField(value); setSortOrder('desc'); }
                }}>
                  {sortField === value && <Check className="size-3.5" />}
                  {label}
                  {sortField === value && <span className="ml-auto text-[10px] text-muted-foreground">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger className="p-0.5 hover:bg-accent rounded">
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onClick={() => setGroupMode('none')}>
                {groupMode === 'none' && <Check className="size-3.5" />}
                {tc('groupNone')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setGroupMode('time')}>
                {groupMode === 'time' && <Check className="size-3.5" />}
                {tc('groupByTime')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setGroupMode('status')}>
                {groupMode === 'status' && <Check className="size-3.5" />}
                {tc('groupByStatus')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={archivedItems.length === 0} onClick={() => setClearArchiveOpen(true)}>
                <Trash2 className="size-3.5" />
                {clearArchivedTitle}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {searchable && (
        <div className="px-2 py-1.5 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={searchPlaceholder ?? tc('search')}
              className="w-full pl-7 pr-7 py-1 text-xs rounded bg-background border border-input focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-accent rounded cursor-pointer"
              >
                <X className="size-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && (
          <div className="p-2 space-y-1">
            <SkeletonGroup count={skeletonCount}>
              {(i: number) => renderSkeleton(i)}
            </SkeletonGroup>
          </div>
        )}
        {!loading && filteredItems.length === 0 && filteredArchived.length === 0 && emptyState}
        {!loading && groupMode === 'none' && sortedItems.map(item => renderItem(item, itemCtx(item)))}
        {!loading && currentGroups?.map(renderGroup)}

        {!loading && filteredArchived.length > 0 && (
          <Collapsible open={archivedOpen} onOpenChange={setArchivedOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 w-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
              <ChevronRight className={cn('size-3 transition-transform', archivedOpen && 'rotate-90')} />
              <Archive className="size-3" />
              {archivedLabel} ({filteredArchived.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              {filteredArchived.map(item => renderArchivedItem(item))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      <AlertDialog open={clearArchiveOpen} onOpenChange={setClearArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{clearArchivedTitle}</AlertDialogTitle>
            <AlertDialogDescription>{clearArchivedConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={onClearArchived}>{tc('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {dialogs}
    </div>
  );
}
