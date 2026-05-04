'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Issue, IssueStatus } from '@agent-spaces/shared';

const STATUS_OPTIONS: { value: IssueStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review_pending', label: 'Review Pending' },
  { value: 'changes_requested', label: 'Changes Requested' },
  { value: 'approved', label: 'Approved' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

interface EditIssueDialogProps {
  issue: Issue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { title: string; description: string; status: IssueStatus }) => Promise<void>;
}

export function EditIssueDialog({ issue, open, onOpenChange, onSave }: EditIssueDialogProps) {
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description);
  const [status, setStatus] = useState<IssueStatus>(issue.status);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(issue.title);
      setDescription(issue.description);
      setStatus(issue.status);
    }
  }, [open, issue]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), description: description.trim(), status });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Issue</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !saving && handleSave()}
          />
          <Textarea
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as IssueStatus)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!title.trim() || saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
