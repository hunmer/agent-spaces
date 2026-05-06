'use client';

import { useState, useRef, useEffect } from 'react';
import { Pencil, Copy, Trash2, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AgentIcon } from '@/components/common/agent-icon';
import { useAgentStore } from '@/stores/agent';
import { useChannelStore } from '@/stores/channel';
import type { IssueComment } from '@agent-spaces/shared';

interface IssueMessageProps {
  comment: IssueComment;
  expanded: boolean;
  workspaceId: string;
  onDelete: (commentId: string) => void;
  onUpdate: (workspaceId: string, commentId: string, content: string) => void;
  onExpandedChange?: (commentId: string, expanded: boolean) => void;
}

export function IssueMessage({ comment, expanded, workspaceId, onDelete, onUpdate, onExpandedChange }: IssueMessageProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
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

  const senderName = isUser ? 'You' : (agent?.name || comment.senderId);
  const userAvatarUrl = typeof window !== 'undefined' ? localStorage.getItem('userAvatarUrl') : null;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.setSelectionRange(draft.length, draft.length);
    }
  }, [editing, draft.length]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(comment.content);
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

  return (
    <div className="py-3 border-b last:border-b-0 group">
      <div className="flex items-start gap-2.5">
        <AgentIcon
          agentId={isUser ? undefined : comment.senderId}
          name={senderName}
          avatarUrl={isUser ? userAvatarUrl || undefined : undefined}
          className="size-7 rounded-full"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-medium">{senderName}</span>
            {comment.metadata?.model && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {comment.metadata.model}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">
              {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            {comment.senderRole && (
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                {comment.senderRole}
              </span>
            )}
            {phase && (
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                {phase.replace('_', ' ')}
              </span>
            )}
            {taskId && (
              <span className="text-[10px] font-mono text-muted-foreground">
                task {taskId.slice(0, 8)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {linkedChannelId && linkedMessageId ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 gap-1 px-1.5 text-[10px] text-muted-foreground"
                onClick={handleOpenMessage}
              >
                <ExternalLink className="size-3" />
                Open message
              </Button>
            ) : null}
          </div>
          {editing ? (
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              className="w-full text-sm bg-muted/50 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary min-h-[60px]"
            />
          ) : (
            <div className="relative">
              <div
                ref={contentRef}
                className={`text-sm whitespace-pre-wrap break-words ${!expanded ? 'max-h-[300px] overflow-hidden' : ''}`}
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
                    展开更多
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
                  收起
                </Button>
              )}
            </div>
          )}
        </div>
        {/* Action buttons */}
        {!editing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
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
      </div>
    </div>
  );
}
