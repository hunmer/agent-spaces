'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useChannelStore } from '@/stores/channel';
import type { ChannelMessageAgentOverride, MiniAppMessageContext } from '@/stores/channel';
import { useAgentStore } from '@/stores/agent';
import { getWS } from '@/lib/ws';
import { MessageItem } from './message-item';
import { ChatInput, type ChatInputHandle } from './chat-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Status, StatusIndicator, StatusLabel } from '@/components/ui/status-badge';
import { ArrowLeft, HelpCircleIcon, Info, SendIcon, Trash2, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ChannelInfoPanel } from './channel-info-panel';
import { MessageNavigator } from './message-navigator';
import { AvatarGroup as CollapsibleAvatarGroup } from '@/components/ui/avatar-group';
import { AgentIcon } from '@/components/common/agent-icon';
import { AgentEditor } from '@/components/sidebar/agent-editor';
import { normalizeAgent } from '@/components/sidebar/agent-shared';
import { sdk } from '@/lib/sdk';

import { useIssueStore } from '@/stores/issue';
import { useMobilePanelStore } from '@/stores/mobile-panel';
import type { AgentConfig, Channel, Message } from '@agent-spaces/shared';
import type { MentionedAgent } from './chat-input-utils';

const channelTypeStatus: Record<Channel['type'], { status: 'online' | 'offline' | 'maintenance' | 'degraded' }> = {
  general: { status: 'online' },
  issue: { status: 'degraded' },
  agent: { status: 'maintenance' },
  'mini-apps': { status: 'online' },
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
  const [configAgentId, setConfigAgentId] = useState<string | null>(null);
  const agents = useAgentStore((s) => s.agents);
  const t = useTranslations('chat');

  return (
    <>
      <CollapsibleAvatarGroup
        className="ml-1"
        size="sm"
        avatarUrls={visible.map((agentId) => {
          const agent = agents.find((a) => a.id === agentId);
          return {
            imageUrl: '',
            name: agent?.name || agentId,
            avatarNode: (
              <AgentIcon
                agentId={agentId}
                name={agent?.name || agentId}
                avatarUrl={agent?.avatarUrl}
                icon={agent?.icon}
                apiBase={agent?.apiBase}
                modelId={agent?.modelId}
                providerId={agent?.providerId}
                modelProvider={agent?.modelProvider}
                className="size-5 rounded-full border object-cover"
                rounded="rounded-full"
              />
            ),
          };
        })}
      />
      {configAgentId && (() => {
        const agent = agents.find((a) => a.id === configAgentId);
        if (!agent) return null;
        return (
          <Dialog open={Boolean(configAgentId)} onOpenChange={(open) => { if (!open) setConfigAgentId(null); }}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
              <DialogHeader className="border-b px-5 py-3">
                <DialogTitle>{t('messageItem.configureAgent')}</DialogTitle>
                <DialogDescription />
              </DialogHeader>
              <AgentEditor
                agent={normalizeAgent(agent)}
                onSaved={() => setConfigAgentId(null)}
                onBack={() => setConfigAgentId(null)}
                showFooter
              />
            </DialogContent>
          </Dialog>
        );
      })()}
    </>
  );
}

interface ChatPanelProps {
  workspaceId: string;
  channelId?: string;
  miniAppContext?: MiniAppMessageContext;
  onAgentActivated?: (agent: MentionedAgent) => void;
}

export function ChatPanel({ workspaceId, channelId, miniAppContext, onAgentActivated }: ChatPanelProps) {
  const t = useTranslations('chat');
  const tc = useTranslations('common');
  const { activeChannelId, channels, messages, loadMessages, loadChannelState, sendMessage, addMessage, updateMessage, stopProcessingMessages, deleteMessage, clearMessages, upsertChannel } = useChannelStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [deletingMsg, setDeletingMsg] = useState<Message | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; label: string } | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [channelActive, setChannelActive] = useState(false);
  const chatInputRef = useRef<ChatInputHandle>(null);

  const agents = useAgentStore((s) => s.agents);
  const ensureAgents = useAgentStore((s) => s.ensure);

  const currentChannelId = channelId ?? activeChannelId;
  const isExternalChannelId = channelId && !channels.some((c) => c.id === channelId);
  const channel = useMemo(
    () => channels.find((c) => c.id === currentChannelId) ?? {
      id: currentChannelId!,
      name: currentChannelId!,
      type: (isExternalChannelId ? 'mini-apps' : 'agent') as Channel['type'],
      members: [],
      issueId: undefined,
      workspaceId: '',
      createdAt: '',
    } as Channel,
    [channels, currentChannelId, isExternalChannelId],
  );
  const msgs = useMemo(
    () => currentChannelId ? (messages[currentChannelId] || []) : [],
    [currentChannelId, messages],
  );
  const lastMessageStatus = msgs[msgs.length - 1]?.status;
  const pendingQuestion = useMemo(() => findPendingQuestion(msgs), [msgs]);

  const mentionAgents = useMemo(() => {
    const enabledById = new Map(
      agents
        .filter((agent) => agent.enabled !== false)
        .map((agent) => [agent.id, agent]),
    );

    return [...new Set(channel.members)]
      .map((member) => enabledById.get(member))
      .filter((agent): agent is AgentConfig => Boolean(agent));
  }, [agents, channel]);

  useEffect(() => {
    if (currentChannelId) {
      setChannelActive(false);
      setMessagesLoading(true);
      loadMessages(workspaceId, currentChannelId).finally(() => setMessagesLoading(false));
    }
    ensureAgents();
  }, [currentChannelId, workspaceId, loadMessages, ensureAgents]);

  useEffect(() => {
    const ws = getWS(workspaceId);
    const unsub = ws.on('channel.message', (data: unknown) => {
      const msg = data as { channelId: string; id: string };
      if (msg.channelId === currentChannelId) {
        addMessage(msg.channelId, data as Message);
      }
    });
    const unsubUpdate = ws.on('channel.message.updated', (data: unknown) => {
      const msg = data as { channelId: string; id: string };
      if (msg.channelId === currentChannelId) {
        updateMessage(msg.channelId, data as Message);
      }
    });
    const unsubDelete = ws.on('channel.message.deleted', (data: unknown) => {
      const msg = data as { channelId: string; messageId: string };
      if (msg.channelId === currentChannelId) {
        deleteMessage(msg.channelId, msg.messageId);
      }
    });
    const unsubCleared = ws.on('channel.messages.cleared', (data: unknown) => {
      const msg = data as { channelId: string };
      if (msg.channelId === currentChannelId) {
        useChannelStore.setState((s) => ({
          messages: { ...s.messages, [currentChannelId]: [] },
        }));
      }
    });
    const unsubChannelUpdated = ws.on('channel.updated', (data: unknown) => {
      const ch = data as { id: string };
      if (ch.id === currentChannelId) {
        upsertChannel(data as Partial<Channel> & Pick<Channel, 'id'>);
      }
    });
    return () => {
      unsub();
      unsubUpdate();
      unsubDelete();
      unsubCleared();
      unsubChannelUpdated();
    };
  }, [workspaceId, currentChannelId, addMessage, updateMessage, deleteMessage, upsertChannel]);

  useEffect(() => {
    const container = bottomRef.current?.parentElement;
    if (container) container.scrollTop = 0;
  }, [msgs.length]);

  // Poll channel state and then refresh messages. This is intentionally driven
  // by the HTTP state endpoint so waiting-for-user state does not depend only
  // on potentially missed WebSocket updates.
  useEffect(() => {
    if (!currentChannelId || !workspaceId) return;
    const needsPolling = Boolean(lastMessageStatus && ['pending', 'streaming', 'waiting_for_user'].includes(lastMessageStatus)) || channelActive;
    if (!needsPolling) return;

    let cancelled = false;
    const poll = async () => {
      const state = await loadChannelState(workspaceId, currentChannelId);
      if (cancelled || !state) return;
      setChannelActive(state.active);
      await loadMessages(workspaceId, currentChannelId);
    };
    const interval = setInterval(poll, 3000);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentChannelId, workspaceId, channelActive, lastMessageStatus, loadMessages, loadChannelState]);

  const handleSend = useCallback((
    content: string,
    mentions: string[],
    attachments?: Message['attachments'],
    replyToMessageId?: string,
    contextLength?: number,
    modelOverride?: ChannelMessageAgentOverride,
  ) => {
    if (!currentChannelId) return;
    sendMessage(workspaceId, currentChannelId, content, mentions, attachments, replyToMessageId, contextLength, modelOverride, miniAppContext);
  }, [workspaceId, currentChannelId, sendMessage, miniAppContext]);

  const isProcessing = channelActive || (msgs.length > 0
    && ['pending', 'streaming', 'waiting_for_user'].includes(msgs[msgs.length - 1].status ?? ''));

  const handleStop = useCallback(() => {
    if (!currentChannelId) return;
    stopProcessingMessages(currentChannelId);
    const ws = getWS(workspaceId);
    ws.send('channel.stop', { channelId: currentChannelId });
  }, [workspaceId, currentChannelId, stopProcessingMessages]);

  const handleEditMessage = useCallback((msg: Message) => {
    chatInputRef.current?.setContent(msg.content, mentionAgents);
  }, [mentionAgents]);

  const handleDeleteMessage = useCallback((msg: Message) => {
    setDeletingMsg(msg);
  }, []);

  const handleReplyMessage = useCallback((msg: Message) => {
    const targetAgent = msg.senderId === 'user' ? undefined : agents.find((agent) => agent.id === msg.senderId);
    setReplyTo({ id: msg.id, label: msg.senderId === 'user' ? tc('you') : (targetAgent?.name || msg.senderId) });
    chatInputRef.current?.focus?.();
  }, [agents, tc]);

  const confirmDelete = useCallback(async () => {
    if (!deletingMsg) return;
    await sdk.channel.deleteMessage(workspaceId, deletingMsg.channelId, deletingMsg.id);
    setDeletingMsg(null);
  }, [workspaceId, deletingMsg]);

  const typeConf = (() => {
    const base = channelTypeStatus[channel.type];
    if (msgs.length === 0) return { label: t('status.idle'), status: 'degraded' as const };
    const last = msgs[msgs.length - 1];
    const s = last.status;
    if (s === 'waiting_for_user') return { label: t('status.waitingForUser'), status: 'degraded' as const };
    if (s === 'streaming' || s === 'pending') return { label: t('status.running'), status: 'maintenance' as const };
    if (s === 'completed') return { label: t('status.success'), status: 'online' as const };
    if (s === 'error') {
      const lastN = msgs.slice(-3);
      const allError = lastN.length >= 3 && lastN.every(m => m.status === 'error');
      return allError
        ? { label: t('status.error'), status: 'offline' as const }
        : { label: t('status.running'), status: 'degraded' as const };
    }
    return { label: t(`channelType.${channel.type}`), status: base.status };
  })();

  return (
    <div className="flex h-full">
      {/* 左侧：聊天区域 */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b">
          <Button
            variant="ghost"
            size="icon"
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
              size="icon"
              onClick={() => useIssueStore.getState().setActiveIssue(channel.issueId!)}
              title={t('viewRelatedIssue')}
            >
              <ExternalLink className="size-4" />
            </Button>
          )}
          {msgs.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setClearConfirmOpen(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setInfoOpen(true)}
          >
            <Info className="size-4" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 min-h-0 relative">
          <div className="h-full overflow-y-auto overflow-x-hidden py-2">
            {messagesLoading && msgs.length === 0 ? (
              <div className="space-y-4 px-4">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="size-6 rounded-full shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-3 w-12" />
                      </div>
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {!messagesLoading && msgs.map((msg) => (
              <div key={msg.id} id={`msg-${msg.id}`}>
                <MessageItem message={msg} workspaceId={workspaceId} onEdit={handleEditMessage} onDelete={handleDeleteMessage} onReply={handleReplyMessage} />
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
        <ChatInput ref={chatInputRef} channelName={channel.name} channelId={channel.id} workspaceId={workspaceId} channel={channel} agents={mentionAgents} messages={msgs} onSend={handleSend} isProcessing={isProcessing} onStop={handleStop} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onAgentActivated={onAgentActivated} />
      </div>

      {/* 右侧：信息面板 - Drawer */}
      <Sheet open={infoOpen} onOpenChange={setInfoOpen}>
        <SheetContent side="right" className="w-80 p-0 gap-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{channel.name}</SheetTitle>
            <SheetDescription>Channel info panel</SheetDescription>
          </SheetHeader>
          <ChannelInfoPanel
            workspaceId={workspaceId}
            channel={channel}
            agents={agents}
            allChannels={channels}
            onDeleted={() => setInfoOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* 删除确认 Dialog */}
      <Dialog open={!!deletingMsg} onOpenChange={(open) => { if (!open) setDeletingMsg(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteMessage.title')}</DialogTitle>
            <DialogDescription>{t('deleteMessage.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{tc('cancel')}</DialogClose>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 className="size-3.5" />{tc('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 清空频道消息确认 Dialog */}
      <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('clearMessages.title')}</DialogTitle>
            <DialogDescription>{t('clearMessages.description', { channel: channel?.name })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{tc('cancel')}</DialogClose>
            <Button variant="destructive" onClick={async () => {
              if (channel) await clearMessages(workspaceId, channel.id);
              setClearConfirmOpen(false);
            }}>
              <Trash2 className="size-3.5" />{t('clearMessages.confirm')}
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
  const t = useTranslations('chat');
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
                placeholder={t('pendingQuestion.placeholder')}
              />
              <Button type="submit" size="icon" disabled={!draft.trim() || submitting}>
                <SendIcon className="size-3.5" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
