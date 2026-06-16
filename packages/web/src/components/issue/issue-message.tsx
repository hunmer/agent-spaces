'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, ChevronRight, Copy, ExternalLink, MessageCircle, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AgentIcon } from '@/components/common/agent-icon';
import { ChatComposerInput } from '@/components/chat/chat-composer-input';
import { MemberHoverCard } from '@/components/chat/member-hover-card';
import { useAgentStore } from '@/stores/agent';
import { useChannelStore } from '@/stores/channel';
import { useUserAvatar } from '@/hooks/use-user-avatar';
import type { Attachment as MessageAttachment, IssueComment, MessageReply } from '@agent-spaces/shared';
import { copyToClipboard } from '@/lib/utils';

interface IssueMessageProps {
  comment: IssueComment;
  expanded: boolean;
  workspaceId: string;
  replies?: MessageReply[];
  replying?: boolean;
  onDelete: (commentId: string) => void;
  onUpdate: (workspaceId: string, commentId: string, content: string) => void;
  onExpandedChange?: (commentId: string, expanded: boolean) => void;
  onReplyStart?: (commentId: string) => void;
  onReplyCancel?: () => void;
  onReplySubmit?: (commentId: string, content: string, mentions: string[], attachments: MessageAttachment[], contextLength: number) => void;
}

export function IssueMessage({
  comment,
  expanded,
  workspaceId,
  replies = [],
  replying = false,
  onDelete,
  onUpdate,
  onExpandedChange,
  onReplyStart,
  onReplyCancel,
  onReplySubmit,
}: IssueMessageProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [repliesExpanded, setRepliesExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isUser = comment.senderId === 'user';
  const agents = useAgentStore((s) => s.agents);
  const agent = !isUser ? agents.find((a) => a.id === comment.senderId) : undefined;
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const loadMessages = useChannelStore((s) => s.loadMessages);
  const linkedChannelId = comment.metadata?.channelId;
  const linkedMessageId = comment.metadata?.messageId;
  const phase = comment.metadata?.phase;
  const taskId = comment.metadata?.taskId;

  const t = useTranslations('issue');
  const tc = useTranslations('common');

  useEffect(() => {
    setDraft(comment.content);
    setEditing(false);
  }, [comment.id, comment.content]);

  useEffect(() => {
    const el = contentRef.current;
    if (el) {
      setOverflowing(el.scrollHeight > 300);
    }
  }, [comment.content, expanded]);

  const senderName = isUser ? tc('you') : (agent?.name || comment.senderId);
  const userAvatarUrl = useUserAvatar();

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.setSelectionRange(draft.length, draft.length);
    }
  }, [editing, draft.length]);

  const handleCopy = async () => {
    await copyToClipboard(comment.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleOpenMessage = async () => {
    if (!linkedChannelId || !linkedMessageId) return;
    setActiveChannel(linkedChannelId);
    await loadMessages(workspaceId, linkedChannelId);
    window.setTimeout(() => {
      document.getElementById(`msg-${linkedMessageId}`)?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      });
    }, 80);
  };

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === comment.content) {
      setEditing(false);
      setDraft(comment.content);
      return;
    }
    onUpdate(workspaceId, comment.id, trimmed);
    setEditing(false);
  };

  const handleReplySubmit = (content: string, mentions: string[], attachments: MessageAttachment[], contextLength: number) => {
    if (!content) return;
    onReplySubmit?.(comment.id, content, mentions, attachments, contextLength);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setEditing(false);
      setDraft(comment.content);
    }
  };

  const replyable = Boolean(onReplySubmit && linkedMessageId);
  const visibleMetadata = [
    { key: 'sender-role', label: comment.senderRole },
    { key: 'model', label: comment.metadata?.model },
    { key: 'phase', label: phase?.replace('_', ' ') },
    { key: 'task', label: taskId ? t('message.task', { taskId: taskId.slice(0, 8) }) : undefined },
  ].filter((item): item is { key: string; label: string } => Boolean(item.label));

  return (
    <div className="group relative rounded-lg border bg-card p-3 m-2">
      {!editing && (
        <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditing(true); setDraft(comment.content); }}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => onDelete(comment.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
      <div className="flex gap-3 items-start">
        {!isUser ? (
          <MemberHoverCard agentId={comment.senderId} displayName={senderName} side="right" align="start">
            <AgentIcon
              agentId={comment.senderId}
              name={senderName}
              className="size-7 rounded-full"
            />
          </MemberHoverCard>
        ) : (
          <AgentIcon
            name={senderName}
            avatarUrl={userAvatarUrl || undefined}
            className="size-7 rounded-full"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm font-medium">{senderName}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {visibleMetadata.map((item) => (
              <Badge key={item.key} variant="secondary" className="h-4 px-1.5 text-[10px]">
                {item.label}
              </Badge>
            ))}
          </div>
          {editing ? (
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              className="mt-2 w-full min-h-[70px] resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          ) : (
            <div className="relative">
              <div
                ref={contentRef}
                className={`mt-1 text-sm leading-relaxed whitespace-pre-wrap break-words ${!expanded ? 'max-h-[300px] overflow-hidden' : ''}`}
              >
                {comment.content}
              </div>
              {overflowing && !expanded && (
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent flex items-end justify-center pb-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      onExpandedChange?.(comment.id, true);
                    }}
                  >
                    {t('message.expandMore')}
                  </Button>
                </div>
              )}
              {expanded && overflowing && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 mt-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    onExpandedChange?.(comment.id, false);
                  }}
                >
                  {t('message.collapse')}
                </Button>
              )}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {replyable ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs"
                onClick={() => onReplyStart?.(comment.id)}
              >
                <MessageCircle className="size-3" />
                回复
              </Button>
            ) : null}
            {replies.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs"
                onClick={() => setRepliesExpanded((current) => !current)}
              >
                {repliesExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                {repliesExpanded ? '隐藏' : '显示'} {replies.length} 条回复
              </Button>
            ) : null}
            {linkedChannelId && linkedMessageId ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs text-muted-foreground"
                onClick={handleOpenMessage}
              >
                <ExternalLink className="size-3" />
                {t('message.openMessage')}
              </Button>
            ) : null}
          </div>
          {replying ? (
            <div className="relative pl-8 pt-3">
              <div className="absolute left-4 top-0 h-full w-px bg-border" />
              <ChatComposerInput
                workspaceId={workspaceId}
                agents={agents.filter((item) => item.enabled !== false)}
                placeholder="回复此消息"
                onSubmit={handleReplySubmit}
                replyLabel={senderName}
                onCancelReply={onReplyCancel}
                initialMentionAgentId={!isUser ? comment.senderId : undefined}
                enableAutoMode={false}
                enableAgentResources={false}
                disableMentionSuggestions={Boolean(!isUser)}
              />
            </div>
          ) : null}
          {repliesExpanded && replies.length > 0 ? (
            <div className="space-y-0">
              {replies.map((reply) => (
                <IssueReply key={reply.id} reply={reply} level={1} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function IssueReply({ reply, level }: { reply: MessageReply; level: number }) {
  const tc = useTranslations('common');
  const agents = useAgentStore((s) => s.agents);
  const userAvatarUrl = useUserAvatar();
  const isUser = reply.senderId === 'user';
  const agent = !isUser ? agents.find((item) => item.id === reply.senderId) : undefined;
  const senderName = isUser ? tc('you') : (agent?.name || reply.senderRole || reply.senderId);

  return (
    <div className="relative pl-8 pt-3">
      <div className="absolute left-4 top-0 h-full w-px bg-border" />
      <div className="flex gap-3">
        {!isUser ? (
          <MemberHoverCard agentId={reply.senderId} displayName={senderName} side="right" align="start">
            <AgentIcon
              agentId={reply.senderId}
              name={senderName}
              className="size-7 rounded-full"
            />
          </MemberHoverCard>
        ) : (
          <AgentIcon
            name={senderName}
            avatarUrl={userAvatarUrl || undefined}
            className="size-7 rounded-full"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-medium">{senderName}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(reply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">L{level}</Badge>
            {reply.senderRole ? (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{reply.senderRole}</Badge>
            ) : null}
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
            {stripHtml(reply.content)}
          </p>
        </div>
      </div>
    </div>
  );
}

function stripHtml(content: string): string {
  return /<[a-z][\s\S]*>/i.test(content) ? content.replace(/<[^>]*>/g, '') : content;
}
