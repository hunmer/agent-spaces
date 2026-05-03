'use client';

import { useCallback, useState } from 'react';
import type { Message } from '@agent-spaces/shared';
import { Copy, Pencil, Trash2, Check } from 'lucide-react';
import { MemberInfoDialog } from './member-info-dialog';
import { MessageParts } from './message-parts';

interface MessageItemProps {
  message: Message;
  workspaceId: string;
  onEdit?: (message: Message) => void;
  onDelete?: (message: Message) => void;
}

function getInitial(name: string) {
  return name.charAt(0).toUpperCase();
}

function Avatar({ senderId, onClick }: { senderId: string; onClick?: () => void }) {
  const isUser = senderId === 'user';
  const initial = isUser ? 'U' : getInitial(senderId);

  return (
    <div
      onClick={onClick}
      className={`flex-shrink-0 flex items-center justify-center h-7 w-7 rounded-full text-xs font-semibold select-none cursor-pointer hover:opacity-80 transition-opacity ${
        isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      }`}
    >
      {initial}
    </div>
  );
}

export function MessageItem({ message, workspaceId, onEdit, onDelete }: MessageItemProps) {
  const isUser = message.senderId === 'user';
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const [copied, setCopied] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = isHTML(message.content) ? message.content.replace(/<[^>]*>/g, '') : message.content;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  return (
    <div className={`group flex gap-2 px-3 py-1.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <Avatar senderId={message.senderId} onClick={() => setMemberDialogOpen(true)} />
      <div className={`flex flex-col min-w-0 max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-foreground">
            {isUser ? 'You' : message.senderId}
          </span>
          {message.senderRole && (
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
              {message.senderRole}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">{time}</span>
        </div>
        <div className={`text-sm rounded-lg px-3 py-2 ${isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
          <MessageParts message={message} isUser={isUser} workspaceId={workspaceId} />
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
