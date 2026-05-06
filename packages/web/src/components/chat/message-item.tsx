'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Message } from '@agent-spaces/shared';
import { Copy, Pencil, Trash2, Check, Clock } from 'lucide-react';
import { AgentIcon } from '@/components/common/agent-icon';
import { useAgentStore } from '@/stores/agent';
import { MemberInfoDialog } from './member-info-dialog';
import { MessageContextUsage, MessageParts } from './message-parts';

interface MessageItemProps {
  message: Message;
  workspaceId: string;
  onEdit?: (message: Message) => void;
  onDelete?: (message: Message) => void;
}

export function MessageItem({ message, workspaceId, onEdit, onDelete }: MessageItemProps) {
  const tc = useTranslations('common');
  const isUser = message.senderId === 'user';
  const agents = useAgentStore((s) => s.agents);
  const agent = !isUser ? agents.find((a) => a.id === message.senderId) : undefined;

  const senderName = isUser ? tc('you') : (agent?.name || message.senderId);
  const userAvatarUrl = typeof window !== 'undefined' ? localStorage.getItem('userAvatarUrl') : null;
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const [copied, setCopied] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);

  const isStreaming = message.status === 'streaming' || message.status === 'pending' || message.status === 'waiting_for_user';
  const [elapsed, setElapsed] = useState(() =>
    message.metadata?.duration ?? 0
  );

  useEffect(() => {
    if (!isStreaming && message.metadata?.duration != null) {
      setElapsed(message.metadata.duration);
      return;
    }
    if (!isStreaming) return;
    const start = new Date(message.createdAt).getTime();
    setElapsed(Date.now() - start);
    const timer = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(timer);
  }, [message.metadata?.duration, message.createdAt, isStreaming]);

  const showDuration = !isUser && (isStreaming || message.status === 'completed' || message.status === 'error') && elapsed > 0;

  const handleCopy = useCallback(async () => {
    const text = isHTML(message.content) ? message.content.replace(/<[^>]*>/g, '') : message.content;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  return (
    <div className={`group flex gap-2 px-3 py-1.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <AgentIcon
        agentId={isUser ? undefined : message.senderId}
        name={senderName}
        avatarUrl={isUser ? userAvatarUrl || undefined : undefined}
        onClick={() => setMemberDialogOpen(true)}
        className="size-7 rounded-full"
      />
      <div className={`flex flex-col min-w-0 w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-foreground">
            {senderName}
          </span>
          {message.senderRole && (
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
              {message.senderRole}
            </span>
          )}
          {message.metadata?.model && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {message.metadata.model}
            </span>
          )}
          <MessageContextUsage message={message} />
          <span className="text-[10px] text-muted-foreground">{time}</span>
        </div>
        <div className={`text-sm rounded-lg px-3 py-2 ${isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
          <MessageParts message={message} isUser={isUser} workspaceId={workspaceId} />
          {showDuration && (
            <div className="flex items-center justify-end gap-1 mt-1 pt-1 border-t border-border/30">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">
                {formatDuration(elapsed)}
                {isStreaming && <span className="animate-pulse ml-0.5">...</span>}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 h-6 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="复制"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          {isUser && (
            <button
              onClick={() => onEdit?.(message)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="编辑"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => onDelete?.(message)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
            title="删除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <MemberInfoDialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen} memberName={message.senderId} channelId={message.channelId} workspaceId={workspaceId} />
    </div>
  );
}

function isHTML(str: string): boolean {
  return /<[a-z][\s\S]*>/i.test(str);
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m < 60) return `${m}m ${sec}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
