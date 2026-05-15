'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { useCommandPalette } from '@/stores/command-palette';
import { matchProvider, searchProviders, type SearchResult } from '@/stores/search-commands';
import { useTranslations } from 'next-intl';

export function CommandPalette() {
  const t = useTranslations('commandPalette');
  const { open, setOpen, toggle, commands } = useCommandPalette();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggle]);

  // Reset search when closing
  useEffect(() => {
    if (!open) {
      setQuery('');
      const input = document.querySelector('[cmdk-input]') as HTMLInputElement | null;
      if (input) input.value = '';
    }
  }, [open]);

  const match = useMemo(() => matchProvider(query), [query]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    const m = matchProvider(query);
    if (!m) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const result = m.provider.search(m.keyword);
    if (result instanceof Promise) {
      setSearchLoading(true);
      let stale = false;
      result.then((r) => { if (!stale) setSearchResults(r); })
        .finally(() => { if (!stale) setSearchLoading(false); });
      return () => { stale = true; };
    } else {
      setSearchResults(result);
      setSearchLoading(false);
    }
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof commands>();
    for (const cmd of commands) {
      const list = map.get(cmd.group) ?? [];
      list.push(cmd);
      map.set(cmd.group, list);
    }
    return map;
  }, [commands]);

  const prefixHints = useMemo(() => {
    return searchProviders.map((p) => ({
      id: `hint:${p.prefix}`,
      label: p.prefix,
      description: [...p.aliases].join(', '),
      icon: p.icon,
    }));
  }, []);

  const showSearch = !!match;

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title={t('title')} description={t('description')}>
      <Command shouldFilter={!match}>
        <CommandInput
          placeholder={t('placeholder')}
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>{t('empty')}</CommandEmpty>

          {showSearch && (
            <CommandGroup heading={match.provider.label}>
              {searchLoading ? (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">...</div>
              ) : searchResults.length === 0 ? (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                  {t('noResults')}
                </div>
              ) : (
                searchResults.slice(0, 10).map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.label}
                    onSelect={() => {
                      setOpen(false);
                      item.action();
                    }}
                  >
                    {item.icon && <item.icon className="size-4 shrink-0" />}
                    <span className="truncate min-w-0">{item.label}</span>
                    {item.description && (
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground truncate max-w-[200px]">
                        {item.description}
                      </span>
                    )}
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          )}

          {!match && (
            <>
              <CommandGroup heading="Search">
                {prefixHints.map((hint) => (
                  <CommandItem key={hint.id} value={hint.label} className="data-selected:bg-transparent! [&>svg:last-child]:hidden!" onSelect={() => setQuery(hint.label + ' ')}>
                    {hint.icon && <hint.icon className="size-4 shrink-0" />}
                    <span className="truncate min-w-0">{hint.label}</span>
                    {hint.description && (
                      <span className="ml-auto text-xs text-muted-foreground text-right shrink-0">
                        {hint.description}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              {[...grouped.entries()].map(([group, items]) => (
                <CommandGroup key={group} heading={group}>
                  {items.map((cmd) => (
                    <CommandItem
                      key={cmd.id}
                      value={cmd.label}
                      onSelect={() => {
                        setOpen(false);
                        cmd.action();
                      }}
                    >
                      {cmd.icon && <cmd.icon className="size-4 shrink-0" />}
                      <span className="truncate min-w-0">{cmd.label}</span>
                      {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
