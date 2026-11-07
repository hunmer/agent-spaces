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
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { MemberPicker } from '@/components/common/member-picker';
import { getMemberDisplayName } from '@/lib/agent-members';
import { TeamSelector } from '@/components/teams/team-selector';

import type { AgentConfig, Channel } from '@agent-spaces/shared';

interface ChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  channel?: Channel | null;
  agents?: AgentConfig[];
  defaultInitialMessage?: string;
  defaultMembers?: string[];
  onSubmit: (data: { name: string; type: Channel['type']; members: string[]; teamIds: string[]; initialMessage?: string }) => void;
}

export function ChannelDialog({ open, onOpenChange, channel, agents = [], onSubmit, defaultInitialMessage, defaultMembers }: ChannelDialogProps) {
  const t = useTranslations('chat');
  const tc = useTranslations('common');
  const [name, setName] = useState('');
  const [type, setType] = useState<Channel['type']>('general');
  const [members, setMembers] = useState<string[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [initialMessage, setInitialMessage] = useState('');
  const [dialogKey, setDialogKey] = useState(0);

  const candidates = agents
    .filter((a) => a.enabled !== false)
    .map((a, i) => ({ id: a.id, label: getMemberDisplayName(agents, a.id), sortIndex: i }));

  const singleMember = members.length === 1 ? members[0] : null;

  useEffect(() => {
    if (!open) return;

    queueMicrotask(() => {
      if (channel) {
        setName(channel.name);
        setType(channel.type);
        setMembers([...channel.members]);
        setTeamIds([...(channel.teamIds ?? [])]);
        setInitialMessage('');
      } else {
        setName('');
        setType('general');
        setMembers(defaultMembers ?? []);
        setTeamIds([]);
        setInitialMessage(defaultInitialMessage ?? '');
      }
      setDialogKey((k) => k + 1);
    });
  }, [open, channel, defaultInitialMessage, defaultMembers]);

  const toggleMember = (id: string) => {
    setMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const handleSubmit = () => {
    onSubmit({
      name: name.trim(),
      type,
      members,
      teamIds,
      initialMessage: singleMember && initialMessage.trim() ? initialMessage.trim() : undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-4 py-4 shrink-0">
          <DialogTitle>{channel ? t('channel.edit') : t('channel.create')}</DialogTitle>
          <DialogDescription>
            {channel ? t('channel.edit') : t('channel.create')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
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
          <MemberPicker
            key={dialogKey}
            candidates={candidates}
            selected={members}
            onToggle={toggleMember}
            label={t('channel.members')}
            searchPlaceholder={t('channel.addMember')}
            emptyText={t('channel.noAgents') || 'No agents found'}
          />
          <TeamSelector
            value={teamIds}
            multiple
            onChange={(value) => setTeamIds(value as string[])}
            label={t('channel.teams')}
            emptyText={t('channel.noTeams')}
          />
          {singleMember && !channel && (
            <div className="space-y-2">
              <label className="text-sm font-medium pb-1 block">{t('channel.initialMessage')}</label>
              <Textarea
                value={initialMessage}
                onChange={(e) => setInitialMessage(e.target.value)}
                placeholder={t('channel.initialMessagePlaceholder')}
                rows={3}
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{tc('cancel')}</Button>
            <Button onClick={handleSubmit}>
              {channel ? tc('save') : tc('create')}
            </Button>
          </div>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
