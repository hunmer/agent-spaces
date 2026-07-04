'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Folder, FileText, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StoreTabPanelProps<T> {
  items: T[];
  loading: boolean;
  getGroup: (item: T) => string;
  getId: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  allFilterText: string;
  searchPlaceholder: string;
  emptyText: string;
  loadingText: string;
  /** 自定义列表网格容器的 className，默认单列 */
  gridClassName?: string;
}

export function StoreTabPanel<T>({
  items,
  loading,
  getGroup,
  renderItem,
  allFilterText,
  searchPlaceholder,
  emptyText,
  loadingText,
  gridClassName,
}: StoreTabPanelProps<T>) {
  const [groupFilter, setGroupFilter] = useState('');
  const [search, setSearch] = useState('');

  const groups = Array.from(new Set(items.map(getGroup).filter(Boolean)));

  const filtered = items.filter((item) => {
    if (groupFilter && getGroup(item) !== groupFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const group = getGroup(item).toLowerCase();
      if (!group.includes(q) && !matchItem(item, q)) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-1 min-h-0 gap-4 px-2 pt-2">
      {groups.length > 0 && (
        <ScrollArea className="hidden md:block w-44 shrink-0">
          <div className="flex flex-col gap-1 pr-2">
            <Button
              variant={!groupFilter ? 'secondary' : 'ghost'}
              size="sm"
              className="w-full justify-start"
              onClick={() => setGroupFilter('')}
            >
              <FileText className="size-3.5 mr-1.5" />
              {allFilterText}
            </Button>
            {groups.map((group) => (
              <Button
                key={group}
                variant={groupFilter === group ? 'secondary' : 'ghost'}
                size="sm"
                className="w-full justify-start"
                onClick={() => setGroupFilter(groupFilter === group ? '' : group)}
              >
                <Folder className="size-3.5 mr-1.5" />
                <span className="truncate">{group}</span>
              </Button>
            ))}
          </div>
        </ScrollArea>
      )}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="relative mb-3">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8"
          />
        </div>
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              {loadingText}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              {emptyText}
            </div>
          ) : (
            <div className={cn("grid grid-cols-1 gap-3 pr-2", gridClassName)}>
              {filtered.map((item, i) => (
                <div key={i}>
                  {renderItem(item)}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

function matchItem<T>(item: T, q: string): boolean {
  return Object.entries(item as Record<string, unknown>).some(([, v]) =>
    typeof v === 'string' && v.toLowerCase().includes(q),
  );
}
