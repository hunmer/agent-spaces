'use client';

import { useState, useRef, useEffect } from 'react';
import { User, Pencil, Copy, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AgentIcon } from '@/components/common/agent-icon';
import { useAgentStore } from '@/stores/agent';
import type { Message } from '@agent-spaces/shared';

interface IssueMessageProps {
  message: Message;
  workspaceId: string;
  onDelete: (channelId: string, messageId: string) => void;
  onUpdate: (workspaceId: string, channelId: string, messageId: string, content: string) => void;
}

export function IssueMessage({ message, workspaceId, onDelete, onUpdate }: IssueMessageProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isUser = message.senderId === 'user';
  const agents = useAgentStore((s) => s.agents);
  const ensure = useAgentStore((s) => s.ensure);
  const agent = !isUser ? agents.find((a) => a.id === message.senderId) : undefined;

  useEffect(() => {
    if (!isUser && workspaceId) ensure(workspaceId);
  }, [isUser, workspaceId, ensure]);

  const senderName = isUser ? 'You' : (agent?.name || message.senderId);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.setSelectionRange(draft.length, draft.length);
    }
  }, [editing, draft.length]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === message.content) {
      setEditing(false);
      setDraft(message.content);
      return;
    }
    onUpdate(workspaceId, message.channelId, message.id, trimmed);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setEditing(false);
      setDraft(message.content);
    }
  };

  return (
    <div className="py-3 border-b last:border-b-0 group">
      <div className="flex items-start gap-2.5">
        <AgentIcon
          agentId={isUser ? undefined : message.senderId}
          name={senderName}
          className="size-7 rounded-full"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium">{senderName}</span>
            {message.senderRole && (
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                {message.senderRole}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">
              {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
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
            <div className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </div>
          )}
        </div>
        {/* Action buttons */}
        {!editing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditing(true); setDraft(message.content); }}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => onDelete(message.channelId, message.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
