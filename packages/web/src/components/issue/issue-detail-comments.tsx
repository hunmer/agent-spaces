'use client';

import { User } from 'lucide-react';
import { IssueMessage } from '@/components/issue/issue-message';
import { CommentNavigator } from '@/components/issue/comment-navigator';
import type { IssueComment } from '@agent-spaces/shared';
import type { Issue } from '@agent-spaces/shared';

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
  return (
    <div className="flex-1 min-h-0 flex flex-col border-t">
      <div className="shrink-0 px-4 pt-2">
        <h3 className="text-sm font-medium mb-3">{t('detail.comments', { count: comments.length })}</h3>
      </div>
      {issue.description && (
        <div className="shrink-0 px-4 pb-3 border-b">
          <div className="flex items-start gap-2.5">
            <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground shrink-0">
              <User className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium">{t('detail.author')}</span>
                <span className="text-[10px] text-muted-foreground">
                  {t('detail.commented')} {new Date(issue.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="text-sm bg-muted/50 rounded-lg px-3 py-2 whitespace-pre-wrap">
                {issue.description}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        {comments.length > 0 ? (
          <>
            <div ref={commentsViewportRef} className="h-full overflow-y-auto">
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
                  className="px-4"
                >
                  <IssueMessage
                    comment={comment}
                    expanded={expandedCommentIds.has(comment.id)}
                    workspaceId={workspaceId}
                    onDelete={onDeleteComment}
                    onUpdate={onUpdateComment}
                    onExpandedChange={onExpandedChange}
                  />
                </div>
              ))}
              <div className="h-20 pointer-events-none" />
            </div>
            <CommentNavigator comments={comments} onNavigate={scrollToComment} />
          </>
        ) : null}
      </div>
    </div>
  );
}
