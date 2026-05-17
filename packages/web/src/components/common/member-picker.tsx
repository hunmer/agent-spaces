'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { AgentIcon } from '@/components/common/agent-icon';
import { X } from 'lucide-react';

export interface MemberCandidate {
  id: string;
  label: string;
  description?: string;
}

interface MemberPickerProps {
  candidates: MemberCandidate[];
  selected: string[];
  onToggle: (id: string) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  label?: string;
  /** 过滤候选成员，默认排除 scheduler/task_creator/bot */
  filter?: (candidate: MemberCandidate) => boolean;
}

const DEFAULT_FILTER = (c: MemberCandidate) =>
  !['scheduler', 'task_creator', 'bot'].includes(c.description || '') && c.id !== 'agent-generator';

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

  const eligible = candidates.filter(filter ?? DEFAULT_FILTER);
  const filtered = eligible.filter((c) =>
    `${c.label} ${c.description || ''}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium">{label}</label>}
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder}
      />
      <div className="max-h-40 overflow-y-auto space-y-0.5">
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
            <div
              className={`flex items-center justify-center size-4 rounded border shrink-0 ${
                selected.includes(candidate.id)
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-input'
              }`}
            />
          </button>
        ))}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => {
            const candidate = candidates.find((c) => c.id === id);
            const displayLabel = candidate?.label || id;
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                {id === 'user' ? (
                  displayLabel
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <AgentIcon agentId={id} name={displayLabel} className="size-3.5 rounded-full" />
                    {displayLabel}
                  </span>
                )}
                <button type="button" onClick={() => onToggle(id)} className="hover:text-destructive">
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
