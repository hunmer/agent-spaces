'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

type Item = {
  id: string;
  label?: string;
  name?: string;
  title?: string;
  description?: string;
  email?: string;
  [key: string]: unknown;
};

export type SuggestionListRef = {
  onKeyDown: ({ event }: { event: KeyboardEvent }) => boolean;
};

export type SuggestionListProps = {
  items: Item[];
  command: (item: Item) => void;
};

function getTitle(item: Item) {
  return item.label ?? item.name ?? item.title ?? item.id;
}

function getDesc(item: Item) {
  return item.description ?? item.email ?? '';
}

export const SuggestionList = forwardRef<SuggestionListRef, SuggestionListProps>(
  function SuggestionList({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);
    const t = useTranslations('composer');

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useEffect(() => {
      listRef.current
        ?.querySelector('[data-selected="true"]')
        ?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    const selectItem = useCallback((index: number) => {
      const item = items[index];
      if (item) command(item);
    }, [items, command]);

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (!items.length) return false;

          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelectedIndex(
              (prev) => (prev + items.length - 1) % items.length,
            );
            return true;
          }

          if (event.key === 'ArrowDown' || event.key === 'Tab') {
            event.preventDefault();
            setSelectedIndex((prev) => (prev + 1) % items.length);
            return true;
          }

          if (event.key === 'Enter') {
            event.preventDefault();
            selectItem(selectedIndex);
            return true;
          }

          return false;
        },
      }),
      [items, selectedIndex, selectItem],
    );

    if (!items.length) {
      return (
        <div className="suggestion-menu">
          <div className="suggestion-empty">{t('noMatch')}</div>
        </div>
      );
    }

    return (
      <div className="suggestion-menu">
        <div className="suggestion-header">{t('selectOption')}</div>
        <div className="suggestion-list" ref={listRef}>
          {items.map((item, index) => {
            const selected = index === selectedIndex;
            return (
              <div
                key={item.id}
                className="suggestion-item"
                data-selected={selected ? 'true' : 'false'}
                onMouseEnter={() => setSelectedIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  command(item);
                }}
              >
                <div className="suggestion-title">{getTitle(item)}</div>
                {getDesc(item) ? (
                  <div className="suggestion-desc">{getDesc(item)}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);
