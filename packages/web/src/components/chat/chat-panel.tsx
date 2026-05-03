'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useChannelStore } from '@/stores/channel';
import { getWS } from '@/lib/ws';
import { MessageItem } from './message-item';
import { ChatInput, type ChatInputHandle } from './chat-input';
import { Button } from '@/components/ui/button';
import { Status, StatusIndicator, StatusLabel } from '@/components/ui/status-badge';
import { PanelRightOpen, PanelRightClose, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { ChannelInfoPanel } from './channel-info-panel';
import { findAgentById } from '@/lib/agent-members';

import type { AgentConfig, Channel, Message } from '@agent-spaces/shared';

const channelTypeStatus: Record<Channel['type'], { label: string; status: 'online' | 'offline' | 'maintenance' | 'degraded' }> = {
  general: { label: 'General', status: 'online' },
  issue: { label: 'Issue', status: 'degraded' },
  agent: { label: 'Agent', status: 'maintenance' },
};

interface ChatPanelProps {
  workspaceId: string;
}

export function ChatPanel({ workspaceId }: ChatPanelProps) {
  const { activeChannelId, channels, messages, loadMessages, sendMessage, addMessage, updateMessage, stopProcessingMessages, deleteMessage, clearMessages } = useChannelStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [deletingMsg, setDeletingMsg] = useState<Message | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const chatInputRef = useRef<ChatInputHandle>(null);

  const channel = channels.find((c) => c.id === activeChannelId);
  const msgs = activeChannelId ? (messages[activeChannelId] || []) : [];

  const mentionAgents = useMemo(() => {
    const enabledAgents = agents.filter((agent) => agent.enabled !== false);
    if (!channel) return [];

    const seen = new Set<string>();
    return channel.members
      .filter((member) => member !== 'user')
      .map((member) => findAgentById(enabledAgents, member))
      .filter((agent): agent is AgentConfig => {
        if (!agent || seen.has(agent.id)) return false;
        seen.add(agent.id);
        return true;
      });
  }, [channel, agents]);

  useEffect(() => {
    if (activeChannelId) loadMessages(workspaceId, activeChannelId);
  }, [activeChannelId, workspaceId, loadMessages]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/workspaces/${workspaceId}/agents/presets`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<AgentConfig[]>;
      })
      .then(setAgents)
      .catch((err) => {
        if (err.name !== 'AbortError') setAgents([]);
      });

    return () => controller.abort();
  }, [workspaceId]);

  useEffect(() => {
    const ws = getWS(workspaceId);
    const unsub = ws.on('channel.message', (data: unknown) => {
      const msg = data as { channelId: string; id: string };
      if (msg.channelId === activeChannelId) {
        addMessage(msg.channelId, data as Message);
      }
    });
    const unsubUpdate = ws.on('channel.message.updated', (data: unknown) => {
      const msg = data as { channelId: string; id: string };
      if (msg.channelId === activeChannelId) {
        updateMessage(msg.channelId, data as Message);
      }
    });
    const unsubDelete = ws.on('channel.message.deleted', (data: unknown) => {
      const msg = data as { channelId: string; messageId: string };
      if (msg.channelId === activeChannelId) {
        deleteMessage(msg.channelId, msg.messageId);
      }
    });
    const unsubCleared = ws.on('channel.messages.cleared', (data: unknown) => {
      const msg = data as { channelId: string };
      if (msg.channelId === activeChannelId) {
        useChannelStore.setState((s) => ({
          messages: { ...s.messages, [activeChannelId]: [] },
        }));
      }
    });
    return () => {
      unsub();
      unsubUpdate();
      unsubDelete();
      unsubCleared();
    };
  }, [workspaceId, activeChannelId, addMessage, updateMessage, deleteMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length]);

  const handleSend = useCallback((content: string, mentions: string[], attachments?: Message['attachments']) => {
    if (!activeChannelId) return;
    sendMessage(workspaceId, activeChannelId, content, mentions, attachments);
  }, [workspaceId, activeChannelId, sendMessage]);

  const isProcessing = msgs.length > 0
    && ['pending', 'streaming'].includes(msgs[msgs.length - 1].status ?? '');

  const handleStop = useCallback(() => {
    if (!activeChannelId) return;
    stopProcessingMessages(activeChannelId);
    const ws = getWS(workspaceId);
    ws.send('channel.stop', { channelId: activeChannelId });
  }, [workspaceId, activeChannelId, stopProcessingMessages]);

  const handleEditMessage = useCallback((msg: Message) => {
    const plainText = /<[a-z][\s\S]*>/i.test(msg.content) ? msg.content.replace(/<[^>]*>/g, '') : msg.content;
    chatInputRef.current?.setContent(plainText);
  }, []);

  const handleDeleteMessage = useCallback((msg: Message) => {
    setDeletingMsg(msg);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deletingMsg) return;
    await fetch(`/api/workspaces/${workspaceId}/channels/${deletingMsg.channelId}/messages/${deletingMsg.id}`, {
      method: 'DELETE',
    });
    setDeletingMsg(null);
  }, [workspaceId, deletingMsg]);

  if (!channel) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a channel to start chatting
      </div>
    );
  }

  const typeConf = (() => {
    const base = channelTypeStatus[channel.type];
    if (msgs.length === 0) return { label: '空闲中', status: 'degraded' as const };
    const last = msgs[msgs.length - 1];
    const s = last.status;
    if (s === 'streaming' || s === 'pending') return { label: '运行中', status: 'maintenance' as const };
    if (s === 'completed') return { label: '成功', status: 'online' as const };
    if (s === 'error') return { label: '失败', status: 'offline' as const };
    return base;
  })();

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
            onClick={() => setClearConfirmOpen(true)}
            disabled={msgs.length === 0}
          >
            <Trash2 className="size-4" />
          </Button>
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
            <MessageItem key={msg.id} message={msg} workspaceId={workspaceId} onEdit={handleEditMessage} onDelete={handleDeleteMessage} />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <ChatInput ref={chatInputRef} channelName={channel.name} channelId={channel.id} workspaceId={workspaceId} channel={channel} agents={mentionAgents} onSend={handleSend} isProcessing={isProcessing} onStop={handleStop} />
      </div>

      {/* 右侧：信息面板 */}
      {infoOpen && (
        <ChannelInfoPanel
          workspaceId={workspaceId}
          channel={channel}
          agents={agents}
          allChannels={channels}
        />
      )}

      {/* 删除确认 Dialog */}
      <Dialog open={!!deletingMsg} onOpenChange={(open) => { if (!open) setDeletingMsg(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除消息</DialogTitle>
            <DialogDescription>确认删除这条消息？此操作不可撤销。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 className="size-3.5" />删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 清空频道消息确认 Dialog */}
      <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>清空频道消息</DialogTitle>
            <DialogDescription>确认清空 #{channel?.name} 的所有消息？此操作不可撤销。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button variant="destructive" onClick={async () => {
              if (channel) await clearMessages(workspaceId, channel.id);
              setClearConfirmOpen(false);
            }}>
              <Trash2 className="size-3.5" />清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
