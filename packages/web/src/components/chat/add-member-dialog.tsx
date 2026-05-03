'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { UserPlus, Check, X } from 'lucide-react';
import { AgentIcon } from '@/components/common/agent-icon';

export interface AddMemberCandidate {
  id: string;
  label: string;
  description?: string;
}

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: AddMemberCandidate[];
  onAdd: (members: string[]) => void;
}

export function AddMemberDialog({ open, onOpenChange, candidates, onAdd }: AddMemberDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const filtered = candidates.filter((candidate) =>
    `${candidate.label} ${candidate.description || ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    onAdd([...selected]);
    onOpenChange(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setSelected(new Set());
      setQuery('');
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>添加成员</DialogTitle>
          <DialogDescription>选择要添加到频道的成员</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索成员..."
          />
          <div className="max-h-52 overflow-y-auto space-y-0.5">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">无可用成员</p>
            )}
            {filtered.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => toggle(candidate.id)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-muted text-left text-sm transition-colors"
              >
                <div className="flex items-center gap-2">
                  <AgentIcon
                    agentId={candidate.id !== 'user' ? candidate.id : undefined}
                    name={candidate.label}
                    className="size-6 rounded-full"
                  />
                  <div className={`flex items-center justify-center size-4 rounded border ${selected.has(candidate.id) ? 'bg-primary border-primary text-primary-foreground' : 'border-input'}`}>
                    {selected.has(candidate.id) && <Check className="size-2.5" />}
                  </div>
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{candidate.label}</span>
                  {candidate.description && (
                    <span className="block truncate text-xs text-muted-foreground">{candidate.description}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
          {selected.size > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {[...selected].map((id) => {
                const candidate = candidates.find((item) => item.id === id);
                return (
                <span key={id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                  {candidate?.label || id}
                  <button type="button" onClick={() => toggle(id)}>
                    <X className="size-3 hover:text-destructive" />
                  </button>
                </span>
              );})}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => handleClose(false)}>取消</Button>
            <Button onClick={handleConfirm} disabled={selected.size === 0}>
              <UserPlus className="size-3.5 mr-1" />添加 ({selected.size})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
