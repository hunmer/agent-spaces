'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { AgentIcon } from '@/components/common/agent-icon';
import { X } from 'lucide-react';

export interface MemberCandidate {
  id: string;
  label: string;
  description?: string;
  /** 排序权重，值越小越靠前 */
  sortIndex?: number;
}

interface MemberPickerProps {
  candidates: MemberCandidate[];
  selected: string[];
  onToggle: (id: string) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  label?: string;
  /** 过滤候选成员，默认排除 scheduler/bot */
  filter?: (candidate: MemberCandidate) => boolean;
}

const DEFAULT_FILTER = (c: MemberCandidate) =>
  !['scheduler', 'bot'].includes(c.description || '')
  && !['agent-generator', 'commit-agent', 'title-generator'].includes(c.id);

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function MemberPicker({
  candidates,
  selected,
  onToggle,
  searchPlaceholder,
  emptyText,
  label,
  filter,
}: MemberPickerProps) {
  const [query, setQuery] = useState('');
  const uniqueSelected = [...new Set(selected)];

  const eligible = uniqueById(candidates)
    .filter(filter ?? DEFAULT_FILTER)
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
  const filtered = eligible.filter((c) =>
    `${c.label} ${c.description || ''}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-2 min-h-0 flex-1">
      {label && <label className="text-sm font-medium">{label}</label>}
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder}
      />
      <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground py-2 text-center">{emptyText || 'No items found'}</p>
        )}
        {filtered.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => onToggle(candidate.id)}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-muted text-left text-sm transition-colors"
          >
            <AgentIcon
              agentId={candidate.id !== 'user' ? candidate.id : undefined}
              name={candidate.label}
              className="size-5 rounded-full"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{candidate.label}</span>
              {candidate.description && (
                <span className="block truncate text-xs text-muted-foreground">{candidate.description}</span>
              )}
            </span>
            <Checkbox
              checked={uniqueSelected.includes(candidate.id)}
              onCheckedChange={() => onToggle(candidate.id)}
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
            />
          </button>
        ))}
      </div>
      {uniqueSelected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2 border-t shrink-0">
          {uniqueSelected.map((id) => {
            const candidate = candidates.find((c) => c.id === id);
            const displayLabel = candidate?.label || id;
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs max-w-[160px] min-w-0">
                {id === 'user' ? (
                  <span className="truncate">{displayLabel}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 min-w-0">
                    <AgentIcon agentId={id} name={displayLabel} className="size-3.5 rounded-full shrink-0" />
                    <span className="truncate">{displayLabel}</span>
                  </span>
                )}
                <button type="button" onClick={() => onToggle(id)} className="hover:text-destructive shrink-0 cursor-pointer">
                  <X className="size-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
