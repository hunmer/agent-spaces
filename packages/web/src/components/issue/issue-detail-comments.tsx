'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { IssueMessage } from '@/components/issue/issue-message';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { MessageSquare } from 'lucide-react';
import { useChannelStore } from '@/stores/channel';
import { getWS } from '@/lib/ws';
import type { Attachment as MessageAttachment, IssueComment, Issue, Message } from '@agent-spaces/shared';

interface IssueDetailCommentsProps {
  issue: Issue;
  workspaceId: string;
  comments: IssueComment[];
  expandedCommentIds: Set<string>;
  commentsViewportRef: React.RefObject<HTMLDivElement | null>;
  commentRefs: React.RefObject<Map<string, HTMLDivElement>>;
  onDeleteComment: (commentId: string) => void;
  onUpdateComment: (wsId: string, commentId: string, content: string) => void;
  onExpandedChange: (commentId: string, expanded: boolean) => void;
  scrollToComment: (index: number) => void;
  t: (key: string, params?: Record<string, string | number | Date>) => string;
}

export function IssueDetailComments({
  issue,
  workspaceId,
  comments,
  expandedCommentIds,
  commentsViewportRef,
  commentRefs,
  onDeleteComment,
  onUpdateComment,
  onExpandedChange,
  scrollToComment,
  t,
}: IssueDetailCommentsProps) {
  const [replyingCommentId, setReplyingCommentId] = useState<string | null>(null);
  const messages = useChannelStore((s) => s.messages);
  const loadMessages = useChannelStore((s) => s.loadMessages);
  const sendMessage = useChannelStore((s) => s.sendMessage);
  const addMessage = useChannelStore((s) => s.addMessage);
  const updateMessage = useChannelStore((s) => s.updateMessage);
  const deleteMessage = useChannelStore((s) => s.deleteMessage);
  const channelId = issue.channelId;

  useEffect(() => {
    if (!channelId) return;
    void loadMessages(workspaceId, channelId);
  }, [workspaceId, channelId, loadMessages]);

  useEffect(() => {
    if (!channelId) return;
    const ws = getWS(workspaceId);
    const handleMessage = (data: unknown) => {
      const message = data as Message;
      if (message.channelId === channelId) addMessage(channelId, message);
    };
    const handleUpdated = (data: unknown) => {
      const message = data as Message;
      if (message.channelId === channelId) updateMessage(channelId, message);
    };
    const handleDeleted = (data: unknown) => {
      const message = data as { channelId: string; messageId: string };
      if (message.channelId === channelId) deleteMessage(channelId, message.messageId);
    };

    const unsubMessage = ws.on('channel.message', handleMessage);
    const unsubUpdated = ws.on('channel.message.updated', handleUpdated);
    const unsubDeleted = ws.on('channel.message.deleted', handleDeleted);
    return () => {
      unsubMessage();
      unsubUpdated();
      unsubDeleted();
    };
  }, [workspaceId, channelId, addMessage, updateMessage, deleteMessage]);

  const messageById = useMemo(() => {
    if (!channelId) return new Map<string, Message>();
    const channelMessages = messages[channelId];
    return new Map((Array.isArray(channelMessages) ? channelMessages : []).map((message) => [message.id, message]));
  }, [messages, channelId]);

  const handleReplySubmit = useCallback((commentId: string, content: string, mentions: string[], attachments: MessageAttachment[], contextLength: number) => {
    const comment = comments.find((item) => item.id === commentId);
    const replyToMessageId = comment?.metadata?.messageId;
    if (!channelId || !replyToMessageId) return;
    sendMessage(workspaceId, channelId, content, mentions, attachments, replyToMessageId, contextLength);
    setReplyingCommentId(null);
  }, [comments, workspaceId, channelId, sendMessage]);

  return (
    <div className="flex flex-col border-t xl:h-full xl:border-t-0">
      <div className="px-4 pt-2 xl:px-5 xl:pt-6">
        <h3 className="text-sm font-medium mb-3">{t('detail.comments', { count: comments.length })}</h3>
      </div>
      {comments.length > 0 ? (
        <div ref={commentsViewportRef} className="relative xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
          {comments.map((comment) => (
            <div
              key={comment.id}
              ref={(node) => {
                if (node) {
                  commentRefs.current.set(comment.id, node);
                } else {
                  commentRefs.current.delete(comment.id);
                }
              }}
            >
              <IssueMessage
                comment={comment}
                expanded={expandedCommentIds.has(comment.id)}
                workspaceId={workspaceId}
                replies={messageById.get(comment.metadata?.messageId ?? '')?.replies ?? []}
                replying={replyingCommentId === comment.id}
                onDelete={onDeleteComment}
                onUpdate={onUpdateComment}
                onExpandedChange={onExpandedChange}
                onReplyStart={setReplyingCommentId}
                onReplyCancel={() => setReplyingCommentId(null)}
                onReplySubmit={handleReplySubmit}
              />
            </div>
          ))}
          <div className="h-20 pointer-events-none" />
        </div>
      ) : (
        <div ref={commentsViewportRef} className="relative xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
          <Empty className="border-0 py-6">
            <EmptyDescription className="flex flex-col items-center gap-2 text-muted-foreground">
              <MessageSquare className="size-5 opacity-40" />
              <span>{t('detail.noComments')}</span>
            </EmptyDescription>
          </Empty>
        </div>
      )}
    </div>
  );
}
