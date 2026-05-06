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
import { Textarea } from '@/components/ui/textarea';
import { X } from 'lucide-react';
import { AgentIcon } from '@/components/common/agent-icon';
import { getMemberDisplayName } from '@/lib/agent-members';

import type { AgentConfig } from '@agent-spaces/shared';

interface CreateIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents?: AgentConfig[];
  onSubmit: (data: { title: string; description: string; members: string[] }) => void;
}

export function CreateIssueDialog({ open, onOpenChange, agents = [], onSubmit }: CreateIssueDialogProps) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [members, setMembers] = useState<string[]>(['user']);
  const [memberQuery, setMemberQuery] = useState('');

  const handleClose = (val: boolean) => {
    if (!val) {
      setTitle('');
      setDesc('');
      setMembers(['user']);
      setMemberQuery('');
    }
    onOpenChange(val);
  };

  const toggleMember = (id: string) => {
    setMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), description: desc.trim(), members });
    handleClose(false);
  };

  const filtered = agents.filter((a) =>
    `${a.name || ''} ${a.role || ''}`.toLowerCase().includes(memberQuery.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>创建议题</DialogTitle>
          <DialogDescription>创建一个新的议题并指定成员</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <Input
            placeholder="标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <Textarea
            placeholder="描述（可选）"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
          />

          <div className="space-y-2">
            <label className="text-sm font-medium">成员</label>
            <Input
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder="搜索 Agent..."
            />
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground py-2 text-center">无可用 Agent</p>
              )}
              {filtered.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => toggleMember(agent.id)}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-muted text-left text-sm transition-colors"
                >
                  <AgentIcon
                    agentId={agent.id}
                    name={getMemberDisplayName(agents, agent.id)}
                    className="size-5 rounded-full"
                  />
                  <span className="flex-1 truncate">{getMemberDisplayName(agents, agent.id)}</span>
                  <div
                    className={`flex items-center justify-center size-4 rounded border ${
                      members.includes(agent.id)
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-input'
                    }`}
                  />
                </button>
              ))}
            </div>
            {members.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => (
                  <span key={m} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                    {m === 'user' ? (
                      'User'
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <AgentIcon agentId={m} name={getMemberDisplayName(agents, m)} className="size-3.5 rounded-full" />
                        {getMemberDisplayName(agents, m)}
                      </span>
                    )}
                    <button type="button" onClick={() => toggleMember(m)} className="hover:text-destructive">
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => handleClose(false)}>取消</Button>
            <Button onClick={handleSubmit} disabled={!title.trim()}>
              创建
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
