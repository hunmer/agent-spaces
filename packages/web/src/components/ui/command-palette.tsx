'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Command as CommandIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const { useState, useEffect, useRef, useMemo } = React;

// ─── Types ───────────────────────────────────────────────────────────

export interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

export interface PaletteGroup {
  key: string;
  label: string;
  items: PaletteItem[];
}

export interface SearchResult {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  action: () => void;
}

export interface SearchProviderHint {
  prefix: string;
  description?: string;
  icon?: React.ReactNode;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: PaletteGroup[];
  query?: string;
  onQueryChange?: (query: string) => void;
  searchResults?: SearchResult[];
  searchLoading?: boolean;
  searchProviderLabel?: string;
  searchProviderHints?: SearchProviderHint[];
  showSearch?: boolean;
  placeholder?: string;
  emptyText?: string;
  noResultsText?: string;
  className?: string;
}

// ─── Item Row ────────────────────────────────────────────────────────

function ItemRow({
  item,
  selected,
  onSelect,
  itemRef,
  showDescription,
}: {
  item: PaletteItem | SearchResult;
  selected: boolean;
  onSelect: () => void;
  itemRef?: (el: HTMLDivElement | null) => void;
  showDescription?: boolean;
}) {
  return (
    <div
      ref={itemRef}
      className={cn(
        'mx-2 flex cursor-pointer items-center justify-between rounded-md px-2 py-2 transition-colors',
        selected
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-muted/50'
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
            selected
              ? 'border-accent-foreground/30 bg-accent/50'
              : 'border-border bg-muted/50'
          )}
        >
          {item.icon}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="truncate text-xs font-medium">{item.label}</span>
          {showDescription && item.description && (
            <span className="truncate text-xs text-muted-foreground">
              {item.description}
            </span>
          )}
        </div>
      </div>
      {'shortcut' in item && item.shortcut && (
        <kbd className="shrink-0 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground">
          {item.shortcut}
        </kbd>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────

export function CommandPalette({
  open,
  onOpenChange,
  groups,
  query: controlledQuery,
  onQueryChange,
  searchResults = [],
  searchLoading = false,
  searchProviderLabel,
  searchProviderHints = [],
  showSearch = false,
  placeholder = 'Type a command or search...',
  emptyText = 'No results found.',
  noResultsText = 'No search results',
  className,
}: CommandPaletteProps) {
  const ref = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLDivElement | null)[]>([]);
  const [internalQuery, setInternalQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Support controlled and uncontrolled query
  const query = controlledQuery ?? internalQuery;
  const setQuery = onQueryChange ?? setInternalQuery;

  // Build flat item list for keyboard navigation
  const allItems = useMemo(() => {
    if (showSearch) {
      return searchResults.map((r) => ({ ...r, _groupKey: 'search' }));
    }
    const items: (PaletteItem & { _groupKey: string })[] = [];
    for (const group of groups) {
      for (const item of group.items) {
        items.push({ ...item, _groupKey: group.key });
      }
    }
    return items;
  }, [showSearch, searchResults, groups]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onOpenChange]);

  // Reset on open/close
  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  // Clamp selection when items change
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(allItems.length - 1, 0)));
  }, [allItems]);

  // Scroll selected into view
  useEffect(() => {
    if (open && selectedIndex >= 0 && itemsRef.current[selectedIndex]) {
      itemsRef.current[selectedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex, open]);

  // Keyboard
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, allItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && selectedIndex >= 0 && allItems[selectedIndex]) {
        e.preventDefault();
        allItems[selectedIndex].action();
        onOpenChange(false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, selectedIndex, allItems, onOpenChange]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/20 backdrop-blur-xs"
            onClick={() => onOpenChange(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Panel */}
          <motion.div
            ref={ref}
            className={cn(
              'relative w-full max-w-2xl overflow-hidden rounded-xl border bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-md',
              className
            )}
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ type: 'spring', damping: 30, stiffness: 400, duration: 0.2 }}
          >
            {/* Search Input */}
            <div className="flex items-center border-b px-4">
              <div className="flex w-full items-center">
                {showSearch ? (
                  <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <CommandIcon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <input
                  className="h-11 w-full border-0 bg-transparent text-sm placeholder:text-muted-foreground/60 focus:outline-none"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={placeholder}
                  autoFocus
                />
              </div>
            </div>

            {/* Results */}
            <div className="max-h-[60vh] overflow-auto py-2">
              {showSearch ? (
                /* ── Search mode ── */
                <div className="px-2 py-1">
                  <div className="flex items-center gap-2 px-2 text-xs">
                    <span className="font-medium">{searchProviderLabel ?? 'Search'}</span>
                  </div>
                  {searchLoading ? (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">...</div>
                  ) : searchResults.length === 0 ? (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      {noResultsText}
                    </div>
                  ) : (
                    searchResults.slice(0, 10).map((item, idx) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        selected={selectedIndex === idx}
                        onSelect={() => {
                          item.action();
                          onOpenChange(false);
                        }}
                        itemRef={(el) => { itemsRef.current[idx] = el; }}
                      />
                    ))
                  )}
                </div>
              ) : (
                /* ── Command mode ── */
                <>
                  {/* Search provider hints (when no query) */}
                  {query === '' && searchProviderHints.length > 0 && (
                    <div className="px-2 py-1">
                      <div className="flex items-center gap-2 px-2 text-sm">
                        <span className="font-medium">Search</span>
                      </div>
                      {searchProviderHints.map((hint, idx) => (
                        <div
                          key={hint.prefix}
                          className={cn(
                            'mx-2 flex cursor-pointer items-center justify-between rounded-md px-2 py-2 transition-colors',
                            selectedIndex === idx
                              ? 'bg-accent text-accent-foreground'
                              : 'hover:bg-muted/50'
                          )}
                          ref={(el) => { itemsRef.current[idx] = el; }}
                          onClick={() => setQuery(hint.prefix + ' ')}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                                selectedIndex === idx
                                  ? 'border-accent-foreground/30 bg-accent/50'
                                  : 'border-border bg-muted/50'
                              )}
                            >
                              {hint.icon}
                            </div>
                            <span className="text-xs font-medium">{hint.prefix}</span>
                          </div>
                          {hint.description && (
                            <span className="text-xs text-muted-foreground">{hint.description}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Command groups */}
                  {groups.map((group) => {
                    if (group.items.length === 0) return null;
                    return (
                      <div key={group.key} className="px-2 py-1">
                        <div className="flex items-center gap-2 px-2 text-xs">
                          <span className="font-medium">{group.label}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {group.items.length} items
                          </span>
                        </div>
                        {group.items.map((item) => {
                          const flatIdx = allItems.findIndex((i) => i.id === item.id);
                          return (
                            <ItemRow
                              key={item.id}
                              item={item}
                              selected={selectedIndex === flatIdx}
                              onSelect={() => {
                                item.action();
                                onOpenChange(false);
                              }}
                              itemRef={(el) => { itemsRef.current[flatIdx] = el; }}
                              showDescription
                            />
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Empty state */}
                  {groups.every((g) => g.items.length === 0) && (
                    <div className="mx-2 my-8 flex flex-col items-center justify-center text-center">
                      <Search className="mb-2 h-5 w-5 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">{emptyText}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t px-4 py-2">
              <div className="flex items-center gap-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-md">
                  <CommandIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
                </div>
                <span className="text-xs text-muted-foreground/60">+</span>
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-muted/50">
                  <span className="text-xs font-medium">K</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
                <span>Navigate</span>
                <kbd className="rounded border border-border bg-muted/50 px-1 py-0.5 text-xs">↑↓</kbd>
                <span className="mx-1">|</span>
                <span>Select</span>
                <kbd className="rounded border border-border bg-muted/50 px-1 py-0.5 text-xs">↵</kbd>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
