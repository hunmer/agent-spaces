'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useChannelStore } from '@/stores/channel';
import { getWS } from '@/lib/ws';
import { MessageItem } from './message-item';
import { ChatInput } from './chat-input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Status, StatusIndicator, StatusLabel } from '@/components/ui/status-badge';
import { PanelRightOpen, PanelRightClose, Hash, Bot, AlertCircle, Info, Users, Pencil } from 'lucide-react';
import { ChannelDialog } from './channel-dialog';

import type { Channel } from '@agent-spaces/shared';

const channelTypeStatus: Record<Channel['type'], { label: string; status: 'online' | 'offline' | 'maintenance' | 'degraded' }> = {
  general: { label: 'General', status: 'online' },
  issue: { label: 'Issue', status: 'degraded' },
  agent: { label: 'Agent', status: 'maintenance' },
};

interface ChatPanelProps {
  workspaceId: string;
}

export function ChatPanel({ workspaceId }: ChatPanelProps) {
  const { activeChannelId, channels, messages, loadMessages, sendMessage, addMessage, updateChannel } = useChannelStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const channel = channels.find((c) => c.id === activeChannelId);
  const msgs = activeChannelId ? (messages[activeChannelId] || []) : [];

  useEffect(() => {
    if (activeChannelId) loadMessages(workspaceId, activeChannelId);
  }, [activeChannelId, workspaceId, loadMessages]);

  useEffect(() => {
    const ws = getWS(workspaceId);
    const unsub = ws.on('channel.message', (data: unknown) => {
      const msg = data as { channelId: string; id: string };
      if (msg.channelId === activeChannelId) {
        addMessage(msg.channelId, data as any);
      }
    });
    return () => { unsub(); };
  }, [workspaceId, activeChannelId, addMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length]);

  const handleSend = useCallback((content: string) => {
    if (!activeChannelId) return;
    sendMessage(workspaceId, activeChannelId, content);
  }, [workspaceId, activeChannelId, sendMessage]);

  if (!channel) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a channel to start chatting
      </div>
    );
  }

  const typeConf = channelTypeStatus[channel.type];

  return (
    <div className="flex h-full">
      {/* 左侧：聊天区域 */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b">
          <span className="text-sm font-semibold"># {channel.name}</span>
          <Status status={typeConf.status}>
            <StatusIndicator />
            <StatusLabel>{typeConf.label}</StatusLabel>
          </Status>
          <span className="text-xs text-muted-foreground">{channel.members.length} members</span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setInfoOpen(!infoOpen)}
          >
            {infoOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-2">
          {msgs.map((msg) => (
            <MessageItem key={msg.id} message={msg} />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <ChatInput channelName={channel.name} onSend={handleSend} />
      </div>

      {/* 右侧：信息面板 */}
      {infoOpen && (
        <div className="w-72 border-l flex flex-col">
          <Tabs defaultValue="info" className="flex flex-col flex-1">
            <TabsList className="w-full rounded-none border-b bg-transparent h-9 p-0">
              <TabsTrigger value="info" className="flex-1 gap-1.5 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                <Info className="size-3.5" />频道信息
              </TabsTrigger>
              <TabsTrigger value="members" className="flex-1 gap-1.5 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                <Users className="size-3.5" />成员
              </TabsTrigger>
            </TabsList>
            <ScrollArea className="flex-1">
              <TabsContent value="info" className="p-4 mt-0 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center size-10 rounded-lg bg-muted">
                    {channel.type === 'agent' ? <Bot className="size-5 text-muted-foreground" /> :
                     channel.type === 'issue' ? <AlertCircle className="size-5 text-muted-foreground" /> :
                     <Hash className="size-5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">#{channel.name}</p>
                    <p className="text-xs text-muted-foreground">类型：{typeConf.label}</p>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditOpen(true)}>
                    <Pencil className="size-3.5" />
                  </Button>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">频道 ID</span>
                    <span className="font-mono text-xs">{channel.id.slice(0, 8)}...</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">成员数</span>
                    <span>{channel.members.length}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">创建时间</span>
                    <span>{new Date(channel.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="members" className="p-4 mt-0 space-y-1">
                {channel.members.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">暂无成员</p>
                )}
                {channel.members.map((member) => (
                  <div key={member} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted">
                    <div className="flex items-center justify-center size-7 rounded-full bg-muted text-xs font-medium">
                      {member[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="text-sm">{member}</span>
                  </div>
                ))}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      )}

      <ChannelDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        workspaceId={workspaceId}
        channel={channel}
        onSubmit={(data) => updateChannel(workspaceId, channel.id, data)}
      />
    </div>
  );
}
