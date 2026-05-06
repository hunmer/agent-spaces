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
import { getMemberDisplayName } from '@/lib/agent-members';

import type { AgentConfig, Channel } from '@agent-spaces/shared';

// channelTypeOptions moved to component for i18n

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
  const [memberInput, setMemberInput] = useState('');

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
      setMemberInput('');
    });
  }, [open, channel]);

  const addMember = () => {
    const m = memberInput.trim();
    if (m && !members.includes(m)) {
      setMembers([...members, m]);
      setMemberInput('');
    }
  };

  const removeMember = (m: string) => {
    setMembers(members.filter((x) => x !== m));
  };

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
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
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
            <div className="flex gap-1.5">
              <Input
                value={memberInput}
                onChange={(e) => setMemberInput(e.target.value)}
                placeholder={t('channel.addMember')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addMember(); }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={addMember}>
                {tc('add')}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <span key={m} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                  {getMemberDisplayName(agents, m)}
                  <button type="button" onClick={() => removeMember(m)} className="hover:text-destructive">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
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
