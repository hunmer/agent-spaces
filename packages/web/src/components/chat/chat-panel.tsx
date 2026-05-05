'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useChannelStore } from '@/stores/channel';
import { useAgentStore } from '@/stores/agent';
import { getWS } from '@/lib/ws';
import { MessageItem } from './message-item';
import { ChatInput, type ChatInputHandle } from './chat-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Status, StatusIndicator, StatusLabel } from '@/components/ui/status-badge';
import { ArrowLeft, HelpCircleIcon, PanelRightOpen, PanelRightClose, SendIcon, Trash2, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { ChannelInfoPanel } from './channel-info-panel';
import { MessageNavigator } from './message-navigator';
import { findAgentById } from '@/lib/agent-members';
import { AgentIcon } from '@/components/common/agent-icon';
import { AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar';

import { useIssueStore } from '@/stores/issue';
import { useMobilePanelStore } from '@/stores/mobile-panel';
import type { AgentConfig, Channel, Message } from '@agent-spaces/shared';

const channelTypeStatus: Record<Channel['type'], { label: string; status: 'online' | 'offline' | 'maintenance' | 'degraded' }> = {
  general: { label: 'General', status: 'online' },
  issue: { label: 'Issue', status: 'degraded' },
  agent: { label: 'Agent', status: 'maintenance' },
};

const MAX_VISIBLE = 4;

type PendingQuestion = {
  messageId: string;
  questionId: string;
  question: string;
  choices: string[];
};

function ChannelMemberAvatars({ members }: { members: string[] }) {
  const visible = members.filter((m) => m !== 'user').slice(0, MAX_VISIBLE);
  const remaining = members.length - visible.length - (members.includes('user') ? 1 : 0);

  return (
    <AvatarGroup className="ml-1 [&>[data-slot=avatar]]:size-5">
      {visible.map((agentId) => (
        <AgentIcon key={agentId} agentId={agentId} className="size-5 rounded-full" />
      ))}
      {remaining > 0 && <AvatarGroupCount className="!size-5 text-[10px]">+{remaining}</AvatarGroupCount>}
    </AvatarGroup>
  );
}

interface ChatPanelProps {
  workspaceId: string;
}

export function ChatPanel({ workspaceId }: ChatPanelProps) {
  const { activeChannelId, channels, messages, loadMessages, sendMessage, addMessage, updateMessage, stopProcessingMessages, deleteMessage, clearMessages } = useChannelStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [deletingMsg, setDeletingMsg] = useState<Message | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const chatInputRef = useRef<ChatInputHandle>(null);

  const agents = useAgentStore((s) => s.agents);
  const ensureAgents = useAgentStore((s) => s.ensure);

  const channel = channels.find((c) => c.id === activeChannelId);
  const msgs = useMemo(
    () => activeChannelId ? (messages[activeChannelId] || []) : [],
    [activeChannelId, messages],
  );
  const pendingQuestion = useMemo(() => findPendingQuestion(msgs), [msgs]);

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
    ensureAgents(workspaceId);
  }, [activeChannelId, workspaceId, loadMessages, ensureAgents]);

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
    const unsubChannelUpdated = ws.on('channel.updated', (data: unknown) => {
      const ch = data as { id: string };
      if (ch.id === activeChannelId) {
        useChannelStore.setState((s) => ({
          channels: s.channels.map((c) => (c.id === ch.id ? (data as typeof c) : c)),
        }));
      }
    });
    return () => {
      unsub();
      unsubUpdate();
      unsubDelete();
      unsubCleared();
      unsubChannelUpdated();
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
    && ['pending', 'streaming', 'waiting_for_user'].includes(msgs[msgs.length - 1].status ?? '');

  const handleStop = useCallback(() => {
    if (!activeChannelId) return;
    stopProcessingMessages(activeChannelId);
    const ws = getWS(workspaceId);
    ws.send('channel.stop', { channelId: activeChannelId });
  }, [workspaceId, activeChannelId, stopProcessingMessages]);

  const handleEditMessage = useCallback((msg: Message) => {
    chatInputRef.current?.setContent(msg.content, mentionAgents);
  }, [mentionAgents]);

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
    if (s === 'waiting_for_user') return { label: '等待用户确定', status: 'degraded' as const };
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
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden shrink-0"
            onClick={() => useMobilePanelStore.getState().setActivePanel('channel-list')}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <span className="text-sm font-semibold truncate shrink min-w-0"># {channel.name}</span>
          <Status status={typeConf.status}>
            <StatusIndicator />
            <StatusLabel>{typeConf.label}</StatusLabel>
          </Status>
          <ChannelMemberAvatars members={channel.members} />
          <div className="flex-1" />
          {channel.issueId && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => useIssueStore.getState().setActiveIssue(channel.issueId!)}
              title="查看关联议题"
            >
              <ExternalLink className="size-4" />
            </Button>
          )}
          {msgs.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setClearConfirmOpen(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setInfoOpen(!infoOpen)}
          >
            {infoOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 min-h-0 relative">
          <div className="h-full overflow-y-auto py-2">
            {msgs.map((msg) => (
              <div key={msg.id} id={`msg-${msg.id}`}>
                <MessageItem message={msg} workspaceId={workspaceId} onEdit={handleEditMessage} onDelete={handleDeleteMessage} />
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <MessageNavigator messages={msgs} />
        </div>

        {/* Input */}
        {pendingQuestion ? (
          <PendingQuestionPanel
            question={pendingQuestion}
            onAnswer={(answer) => {
              const ws = getWS(workspaceId);
              ws.send('channel.answer_question', {
                channelId: channel.id,
                messageId: pendingQuestion.messageId,
                questionId: pendingQuestion.questionId,
                answer,
              });
            }}
          />
        ) : null}
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

function findPendingQuestion(messages: Message[]): PendingQuestion | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.status !== 'waiting_for_user') continue;
    const part = message.parts?.find((item) => item.type === 'ask_user_question' && item.status !== 'answered');
    if (!part || part.type !== 'ask_user_question') continue;
    return {
      messageId: message.id,
      questionId: part.id,
      question: part.question,
      choices: part.choices ?? [],
    };
  }
  return null;
}

function PendingQuestionPanel({
  question,
  onAnswer,
}: {
  question: PendingQuestion;
  onAnswer: (answer: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = (answer: string) => {
    const trimmed = answer.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    onAnswer(trimmed);
    setDraft('');
  };

  return (
    <div className="border-t bg-background px-4 py-3">
      <div className="rounded-md border bg-muted/30 p-3">
        <div className="flex items-start gap-2">
          <HelpCircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="text-sm font-medium">{question.question}</div>
            {question.choices.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {question.choices.map((choice) => (
                  <Button
                    key={choice}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={submitting}
                    onClick={() => submit(choice)}
                    className="h-8"
                  >
                    {choice}
                  </Button>
                ))}
              </div>
            ) : null}
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                submit(draft);
              }}
            >
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={submitting}
                className="h-8 text-sm"
                placeholder="输入回答..."
              />
              <Button type="submit" size="icon-sm" disabled={!draft.trim() || submitting}>
                <SendIcon className="size-3.5" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
