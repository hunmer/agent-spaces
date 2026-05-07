'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchSelect } from '@/components/ui/search-select';
import { X } from 'lucide-react';
import { AgentIcon } from '@/components/common/agent-icon';
import { getMemberDisplayName } from '@/lib/agent-members';

import type { AgentConfig, Channel } from '@agent-spaces/shared';

interface ChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  channel?: Channel | null;
  agents?: AgentConfig[];
  onSubmit: (data: { name: string; type: Channel['type']; members: string[] }) => void;
}

export function ChannelDialog({ open, onOpenChange, channel, agents = [], onSubmit }: ChannelDialogProps) {
  const t = useTranslations('chat');
  const tc = useTranslations('common');
  const channelTypeOptions = [
    { value: 'general', label: t('channel.general') },
    { value: 'issue', label: t('channel.issue') },
    { value: 'agent', label: t('channel.agent') },
  ];
  const [name, setName] = useState('');
  const [type, setType] = useState<Channel['type']>('general');
  const [members, setMembers] = useState<string[]>([]);
  const [memberQuery, setMemberQuery] = useState('');

  useEffect(() => {
    if (!open) return;

    queueMicrotask(() => {
      if (channel) {
        setName(channel.name);
        setType(channel.type);
        setMembers([...channel.members]);
      } else {
        setName('');
        setType('general');
        setMembers(['user']);
      }
      setMemberQuery('');
    });
  }, [open, channel]);

  const toggleMember = (id: string) => {
    setMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const filtered = agents.filter((a) =>
    `${a.name || ''} ${a.role || ''}`.toLowerCase().includes(memberQuery.toLowerCase()),
  );

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), type, members });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{channel ? t('channel.edit') : t('channel.create')}</DialogTitle>
          <DialogDescription>
            {channel ? t('channel.edit') : t('channel.create')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">{tc('name')}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('channel.namePlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('channel.type')}</label>
            <SearchSelect
              value={type}
              onChange={(v) => setType(v as Channel['type'])}
              options={channelTypeOptions}
              allowCustom={false}
              placeholder={t('channel.selectType')}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('channel.members')}</label>
            <Input
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder={t('channel.addMember')}
            />
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground py-2 text-center">{t('channel.noAgents') || 'No agents found'}</p>
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
                      tc('user')
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
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{tc('cancel')}</Button>
            <Button onClick={handleSubmit} disabled={!name.trim()}>
              {channel ? tc('save') : tc('create')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
