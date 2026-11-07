'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ImportItem } from './types';

interface ImportPreviewPanelProps {
  items: ImportItem[];
  onItemsChange: (items: ImportItem[]) => void;
  onConfirm: (items: ImportItem[]) => void;
  onCancel: () => void;
  defaultGroup?: string;
}

export function ImportPreviewPanel({
  items,
  onItemsChange,
  onConfirm,
  onCancel,
  defaultGroup,
}: ImportPreviewPanelProps) {
  const t = useTranslations('import');
  const [globalGroup, setGlobalGroup] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const updateItem = (id: string, patch: Partial<ImportItem>) => {
    onItemsChange(items.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelected = (id: string) => {
    updateItem(id, { selected: !items.find((i) => i.id === id)!.selected });
  };

  const selectAll = () => {
    onItemsChange(items.map((item) => ({ ...item, selected: true })));
  };

  const deselectAll = () => {
    onItemsChange(items.map((item) => ({ ...item, selected: false })));
  };

  const selectedCount = items.filter((i) => i.selected).length;

  const handleConfirm = () => {
    const selected = items.filter((i) => i.selected).map((item) => ({
      ...item,
      group: item.group || globalGroup,
    }));
    if (selected.length === 0) return;
    onConfirm(selected);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 pt-2">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-sm font-medium">{t('importPreviewTitle')}</span>
        <div className="flex-1" />
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={selectAll}>
            {t('importPreviewSelectAll')}
          </Button>
          <Button variant="ghost" size="sm" onClick={deselectAll}>
            {t('importPreviewDeselectAll')}
          </Button>
        </div>
        <Input
          value={globalGroup}
          onChange={(e) => setGlobalGroup(e.target.value)}
          placeholder={defaultGroup || t('importPreviewGroupPlaceholder')}
          className="h-7 text-sm w-32"
        />
      </div>

      {items.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
          {t('importPreviewEmpty')}
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-2 pr-2">
            {items.map((item) => {
              const isExpanded = expandedIds.has(item.id);
              return (
                <div key={item.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => toggleSelected(item.id)}
                      className="mt-0.5 size-3.5 accent-primary shrink-0"
                    />
                    <Input
                      value={item.name}
                      onChange={(e) => updateItem(item.id, { name: e.target.value })}
                      placeholder={t('importPreviewNamePlaceholder')}
                      className="h-7 text-sm flex-1"
                    />
                    <Input
                      value={item.group}
                      onChange={(e) => updateItem(item.id, { group: e.target.value })}
                      placeholder={t('importPreviewGroupPlaceholder')}
                      className="h-7 text-sm w-32"
                    />
                    <button
                      type="button"
                      onClick={() => toggleExpanded(item.id)}
                      className="p-1 rounded hover:bg-accent shrink-0 cursor-pointer"
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-3.5 text-muted-foreground" />
                      )}
                    </button>
                  </div>

                  <Collapsible open={isExpanded}>
                    <CollapsibleContent>
                      <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-48 whitespace-pre-wrap">
                        {item.content.slice(0, 2000)}
                        {item.content.length > 2000 ? '\n...' : ''}
                      </pre>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 mt-2 border-t">
        <Button variant="outline" size="sm" onClick={onCancel}>
          {t('importPreviewCancel')}
        </Button>
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={selectedCount === 0}
        >
          {t('importPreviewConfirm', { selected: selectedCount, total: items.length })}
        </Button>
      </div>
    </div>
  );
}
