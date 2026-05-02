'use client';

import { useEffect, useState } from 'react';
import { useChannelStore } from '@/stores/channel';
import { Hash, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChannelDialog } from './channel-dialog';

import type { Channel } from '@agent-spaces/shared';

interface ChannelListProps {
  workspaceId: string;
}

export function ChannelList({ workspaceId }: ChannelListProps) {
  const { channels, activeChannelId, loadChannels, createChannel, setActiveChannel } = useChannelStore();
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    loadChannels(workspaceId);
  }, [workspaceId, loadChannels]);

  const handleSubmit = async (data: { name: string; type: Channel['type']; members: string[] }) => {
    await createChannel(workspaceId, data.name, data.type);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Channels</span>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {channels.map((ch) => (
          <button
            key={ch.id}
            onClick={() => setActiveChannel(ch.id)}
            className={cn(
              'flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left',
              activeChannelId === ch.id && 'bg-accent text-accent-foreground',
            )}
          >
            <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{ch.name}</span>
          </button>
        ))}
      </div>

      <ChannelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaceId={workspaceId}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
