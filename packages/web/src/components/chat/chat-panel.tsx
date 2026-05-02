'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useChannelStore } from '@/stores/channel';
import { getWS } from '@/lib/ws';
import { MessageItem } from './message-item';
import { ChatInput } from './chat-input';
import { Button } from '@/components/ui/button';
import { Status, StatusIndicator, StatusLabel } from '@/components/ui/status-badge';
import { PanelRightOpen, PanelRightClose, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ChannelInfoPanel } from './channel-info-panel';

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
  const { activeChannelId, channels, messages, loadMessages, sendMessage, addMessage, updateMessage, deleteMessage } = useChannelStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deletingMsg, setDeletingMsg] = useState<Message | null>(null);

  const channel = channels.find((c) => c.id === activeChannelId);
  const msgs = activeChannelId ? (messages[activeChannelId] || []) : [];

  const mentionAgents = useMemo(() => {
    const enabledAgents = agents.filter((agent) => agent.enabled !== false);
    if (!channel) return enabledAgents;

    const memberNames = new Set(channel.members.filter((member) => member !== 'user'));
    if (memberNames.size === 0) return enabledAgents;

    const channelAgents = enabledAgents.filter((agent) =>
      memberNames.has(agent.id) || memberNames.has(agent.name || agent.role) || memberNames.has(agent.role),
    );

    return channelAgents.length > 0 ? channelAgents : enabledAgents;
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
    return () => {
      unsub();
      unsubUpdate();
      unsubDelete();
    };
  }, [workspaceId, activeChannelId, addMessage, updateMessage, deleteMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length]);

  const handleSend = useCallback((content: string, mentions: string[]) => {
    if (!activeChannelId) return;
    sendMessage(workspaceId, activeChannelId, content, mentions);
  }, [workspaceId, activeChannelId, sendMessage]);

  const handleEditMessage = useCallback((msg: Message) => {
    setEditContent(msg.content);
    setEditingMsg(msg);
  }, []);

  const submitEdit = useCallback(async () => {
    if (!editingMsg || !editContent.trim() || editContent === editingMsg.content) {
      setEditingMsg(null);
      return;
    }
    await fetch(`/api/workspaces/${workspaceId}/channels/${editingMsg.channelId}/messages/${editingMsg.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editContent }),
    });
    setEditingMsg(null);
  }, [workspaceId, editingMsg, editContent]);

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
            <MessageItem key={msg.id} message={msg} workspaceId={workspaceId} onEdit={handleEditMessage} onDelete={handleDeleteMessage} />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <ChatInput channelName={channel.name} agents={mentionAgents} onSend={handleSend} />
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

      {/* 编辑消息 Dialog */}
      <Dialog open={!!editingMsg} onOpenChange={(open) => { if (!open) setEditingMsg(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑消息</DialogTitle>
            <DialogDescription>修改消息内容后点击保存。</DialogDescription>
          </DialogHeader>
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={4}
            className="min-h-20"
          />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={submitEdit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
