'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Hash, Bot, AlertCircle, Info, Users, Pencil, UserPlus, Trash2, Archive } from 'lucide-react';
import { ChannelDialog } from './channel-dialog';
import { MemberCard } from './member-card';
import { MemberInfoDialog } from './member-info-dialog';
import { AddMemberDialog } from './add-member-dialog';
import { useChannelStore } from '@/stores/channel';
import { useMobilePanelStore } from '@/stores/mobile-panel';
import { getAgentDisplayName, getMemberDisplayName, normalizeChannelMembersToAgentIds } from '@/lib/agent-members';

import type { AgentConfig, Channel } from '@agent-spaces/shared';

interface ChannelInfoPanelProps {
  workspaceId: string;
  channel: Channel;
  agents: AgentConfig[];
  allChannels: Channel[];
  onDeleted?: () => void;
}

export function ChannelInfoPanel({ workspaceId, channel, agents, allChannels, onDeleted }: ChannelInfoPanelProps) {
  const t = useTranslations('chat');
  const tc = useTranslations('common');
  const { updateChannel, deleteChannel } = useChannelStore();
  const [editOpen, setEditOpen] = useState(false);
  const [memberInfoOpen, setMemberInfoOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState('');
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const enabledAgents = agents.filter((agent) => agent.enabled !== false);
  const members = [...new Set(channel.members)];
  const candidateMembers = enabledAgents.map((agent) => ({
    id: agent.id,
    label: getAgentDisplayName(agent),
    description: agent.role,
  }));
  const memberChannels = (member: string) => allChannels.filter((c) => c.members.includes(member)).map((c) => c.name);

  const handleAddMembers = (newMembers: string[]) => {
    updateChannel(workspaceId, channel.id, {
      members: normalizeChannelMembersToAgentIds(enabledAgents, newMembers),
    });
  };

  const handleDelete = async () => {
    await deleteChannel(workspaceId, channel.id);
    setDeleteOpen(false);
    useMobilePanelStore.getState().setActivePanel('channel-list');
    onDeleted?.();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 h-12 border-b shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {channel.type === 'agent' ? <Bot className="size-4 text-muted-foreground shrink-0" /> :
           channel.type === 'issue' ? <AlertCircle className="size-4 text-muted-foreground shrink-0" /> :
           <Hash className="size-4 text-muted-foreground shrink-0" />}
          <span className="text-sm font-medium truncate">#{channel.name}</span>
        </div>
      </div>
      <Tabs defaultValue="info" className="flex flex-col flex-1 min-h-0">
        <TabsList className="w-full rounded-none border-b bg-transparent h-9 p-0 shrink-0">
          <TabsTrigger value="info" className="flex-1 gap-1.5 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
            <Info className="size-3.5" />{t('channel.info')}
          </TabsTrigger>
          <TabsTrigger value="members" className="flex-1 gap-1.5 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
            <Users className="size-3.5" />{t('channel.members')}
          </TabsTrigger>
        </TabsList>
        <ScrollArea className="flex-1 min-h-0">
          <TabsContent value="info" className="p-4 mt-0 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center size-10 rounded-lg bg-muted">
                {channel.type === 'agent' ? <Bot className="size-5 text-muted-foreground" /> :
                 channel.type === 'issue' ? <AlertCircle className="size-5 text-muted-foreground" /> :
                 <Hash className="size-5 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">#{channel.name}</p>
                <p className="text-xs text-muted-foreground">{t('channel.type')} {t(`channel.${channel.type}`)}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)}>
                <Pencil className="size-3.5" />
              </Button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">{t('channel.channelId')}</span>
                <span className="font-mono text-xs">{channel.id.slice(0, 8)}...</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">{t('channel.memberCount')}</span>
                <span>{members.length}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">{t('channel.createdAt')}</span>
                <span>{new Date(channel.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="members" className="p-4 mt-0 space-y-1">
            {members.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">{t('channel.noMembers')}</p>
            )}
            {members.map((member) => (
              <MemberCard
                key={member}
                name={getMemberDisplayName(enabledAgents, member)}
                agentId={member !== 'user' ? member : undefined}
                description={member !== 'user' ? member : undefined}
                onClick={() => { setSelectedMember(member); setMemberInfoOpen(true); }}
              />
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-xs text-muted-foreground"
              onClick={() => setAddMemberOpen(true)}
            >
              <UserPlus className="size-3.5 mr-1" />{t('channel.addMember')}
            </Button>
          </TabsContent>
        </ScrollArea>
      </Tabs>

      {/* 底部操作按钮 */}
      <div className="shrink-0 p-3 border-t space-y-1">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          onClick={() => updateChannel(workspaceId, channel.id, { archived: !channel.archived })}
        >
          <Archive className="size-3.5 mr-1" />{channel.archived ? t('channel.unarchive') : t('channel.archive')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="size-3.5 mr-1" />{t('channel.delete')}
        </Button>
      </div>

      <ChannelDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        workspaceId={workspaceId}
        channel={channel}
        agents={agents}
        onSubmit={(data) => updateChannel(workspaceId, channel.id, {
          ...data,
          members: normalizeChannelMembersToAgentIds(enabledAgents, data.members),
        })}
      />

      <MemberInfoDialog
        open={memberInfoOpen}
        onOpenChange={setMemberInfoOpen}
        memberName={selectedMember}
        displayName={getMemberDisplayName(enabledAgents, selectedMember)}
        channelId={channel.id}
        workspaceId={workspaceId}
        channels={memberChannels(selectedMember)}
      />

      <AddMemberDialog
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        candidates={candidateMembers}
        defaultSelected={members}
        onAdd={handleAddMembers}
      />

      {/* 删除频道确认 Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('channel.delete')}</DialogTitle>
            <DialogDescription>
              {t('channel.deleteConfirm', { name: channel.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{tc('cancel')}</DialogClose>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="size-3.5" />{tc('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
