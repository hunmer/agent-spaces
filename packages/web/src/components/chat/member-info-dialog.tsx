'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { MessageSquare, UserMinus } from 'lucide-react';
import { useChannelStore } from '@/stores/channel';
import { useAgentStore } from '@/stores/agent';
import { AgentIcon } from '@/components/common/agent-icon';
import { useUserAvatar } from '@/hooks/use-user-avatar';

interface MemberInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberName: string;
  displayName?: string;
  channelId: string;
  workspaceId: string;
  channels?: string[];
}

export function MemberInfoDialog({ open, onOpenChange, memberName, displayName, channelId, workspaceId, channels = [] }: MemberInfoDialogProps) {
  const [removing, setRemoving] = useState(false);
  const { channels: allChannels, updateChannel } = useChannelStore();
  const agents = useAgentStore((s) => s.agents);
  const agent = memberName !== 'user' ? agents.find((a) => a.id === memberName) : undefined;
  const resolvedName = displayName || agent?.name || memberName;
  const _userAvatar = useUserAvatar();
  const userAvatarUrl = memberName === 'user' ? _userAvatar : null;

  const channel = allChannels.find((c) => c.id === channelId);
  const isMember = channel?.members.includes(memberName);

  const handleRemove = async () => {
    if (!channel || !isMember) return;
    setRemoving(true);
    try {
      await updateChannel(workspaceId, channelId, {
        members: channel.members.filter((m) => m !== memberName),
      });
      onOpenChange(false);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>成员信息</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center gap-3 pt-2">
          <AgentIcon
            agentId={memberName !== 'user' ? memberName : undefined}
            name={resolvedName}
            avatarUrl={userAvatarUrl || undefined}
            className="size-12 rounded-full"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{resolvedName}</p>
            <p className="text-xs text-muted-foreground">{memberName === 'user' ? '成员' : (agent?.role || memberName)}</p>
          </div>
        </div>
        {channels.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-medium text-muted-foreground">所在频道</p>
            <div className="flex flex-wrap gap-1.5">
              {channels.map((ch) => (
                <span key={ch} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                  <MessageSquare className="size-3" />{ch}
                </span>
              ))}
            </div>
          </div>
        )}
        {isMember && memberName !== 'user' && (
          <button
            onClick={handleRemove}
            disabled={removing}
            className="flex items-center justify-center gap-2 w-full mt-2 px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
          >
            <UserMinus className="size-4" />
            {removing ? '移除中...' : '从频道移除'}
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
