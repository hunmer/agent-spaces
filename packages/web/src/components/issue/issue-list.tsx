'use client';

import { useEffect, useState } from 'react';
import { useIssueStore } from '@/stores/issue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Plus, CircleDot, Pencil, Trash2 } from 'lucide-react';
import { EditIssueDialog } from './edit-issue-dialog';
import type { Issue, IssueStatus } from '@agent-spaces/shared';

const STATUS_LABEL: Record<IssueStatus, string> = {
  draft: 'Draft',
  planned: 'Planned',
  in_progress: 'In Progress',
  review_pending: 'Review',
  changes_requested: 'Changes',
  approved: 'Approved',
  completed: 'Completed',
  archived: 'Archived',
  error: 'Error',
};

const STATUS_COLOR: Record<IssueStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  planned: 'outline',
  in_progress: 'default',
  review_pending: 'outline',
  changes_requested: 'destructive',
  approved: 'default',
  completed: 'secondary',
  archived: 'outline',
  error: 'destructive',
};

const GROUP_ORDER: IssueStatus[] = [
  'in_progress', 'review_pending', 'changes_requested',
  'draft', 'planned', 'approved', 'completed', 'error', 'archived',
];

interface IssueListProps {
  workspaceId: string;
}

export function IssueList({ workspaceId }: IssueListProps) {
  const { issues, activeIssueId, loading, loadIssues, createIssue, updateIssue, deleteIssue, setActiveIssue } = useIssueStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);

  useEffect(() => {
    loadIssues(workspaceId);
  }, [workspaceId, loadIssues]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    await createIssue(workspaceId, title.trim(), desc.trim());
    setTitle('');
    setDesc('');
    setOpen(false);
  };

  const grouped = GROUP_ORDER
    .map((status) => ({
      status,
      items: issues.filter((i) => i.status === status),
    }))
    .filter((g) => g.items.length > 0);

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-2 border-b">
        <span className="text-sm font-medium">Issues</span>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button variant="ghost" size="icon" className="h-6 w-6" />}>
              <Plus className="h-4 w-4" />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Issue</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <Textarea
                placeholder="Description (optional)"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={3}
              />
              <Button onClick={handleCreate} disabled={!title.trim()}>
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1">
        {grouped.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">No issues yet</div>
        )}
        {grouped.map((group) => (
          <div key={group.status}>
            <div className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase">
              {STATUS_LABEL[group.status]} ({group.items.length})
            </div>
            {group.items.map((issue) => (
              <ContextMenu key={issue.id}>
                <ContextMenuTrigger
                  onClick={() => setActiveIssue(issue.id)}
                  className={`w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors flex items-start gap-2 ${
                    activeIssueId === issue.id ? 'bg-accent' : ''
                  }`}
                >
                  <CircleDot className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{issue.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {issue.tasks.length} task{issue.tasks.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <Badge variant={STATUS_COLOR[issue.status]} className="text-[10px] shrink-0">
                    {STATUS_LABEL[issue.status]}
                  </Badge>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => setEditingIssue(issue)}>
                    <Pencil className="size-4 mr-2" />
                    Edit
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem variant="destructive" onClick={() => deleteIssue(workspaceId, issue.id)}>
                    <Trash2 className="size-4 mr-2" />
                    Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        ))}
      </ScrollArea>

      {editingIssue && (
        <EditIssueDialog
          issue={editingIssue}
          open={!!editingIssue}
          onOpenChange={(open) => { if (!open) setEditingIssue(null); }}
          onSave={async (data) => {
            await updateIssue(workspaceId, editingIssue.id, data);
            setEditingIssue(null);
          }}
        />
      )}
    </div>
  );
}
