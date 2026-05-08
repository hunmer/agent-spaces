'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useIssueStore } from '@/stores/issue';
import { useTaskStore } from '@/stores/task';
import { useAgentStore } from '@/stores/agent';
import { EditIssueDialog } from '@/components/issue/edit-issue-dialog';
import { ComposerShell } from '@/components/composer/composer-shell';
import { createSuggestionRenderer } from '@/components/composer/create-suggestion-renderer';
import { createSlashExtension } from '@/components/composer/create-slash-extension';
import { normalizeChannelMembersToAgentIds } from '@/lib/agent-members';
import { getWS } from '@/lib/ws';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import { IssueDetailHeader } from './issue-detail-header';
import { IssueDetailTasksPanel } from './issue-detail-tasks-panel';
import { IssueDetailComments } from './issue-detail-comments';
import { IssueDetailInfoPanel } from './issue-detail-info-panel';
import { collectMentionIds } from './collect-mention-ids';
import { MessageSquare, X } from 'lucide-react';
import type { IssueComment } from '@agent-spaces/shared';

/* ------------------------------------------------------------------ */
/*  IssueDetail                                                        */
/* ------------------------------------------------------------------ */

interface IssueDetailProps {
  workspaceId: string;
}

export function IssueDetail({ workspaceId }: IssueDetailProps) {
  const { issues, activeIssueId, startIssue, resumeIssue, updateIssue, deleteIssue } = useIssueStore();
  const { tasks, loadTasks, retryTask, cancelTask, createTask, updateTask, deleteTask, reorderTasks } = useTaskStore();
  const agents = useAgentStore((s) => s.agents);
  const ensureAgents = useAgentStore((s) => s.ensure);
  const [infoOpen, setInfoOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [expandedCommentIds, setExpandedCommentIds] = useState<Set<string>>(() => new Set());
  const [composerOpen, setComposerOpen] = useState(false);
  const commentsViewportRef = useRef<HTMLDivElement | null>(null);
  const commentRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const t = useTranslations('issue');
  const tTask = useTranslations('task');
  const tc = useTranslations('common');

  const issue = issues.find((i) => i.id === activeIssueId);

  const loadComments = useCallback(async (targetIssueId: string) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/issues/${targetIssueId}/comments`);
    if (!res.ok) return;
    const nextComments: IssueComment[] = await res.json();
    setComments(nextComments);
  }, [workspaceId]);

  useEffect(() => {
    if (issue) {
      loadTasks(workspaceId, issue.id);
      void Promise.resolve().then(() => loadComments(issue.id));
    }
  }, [issue, workspaceId, loadTasks, loadComments]);

  useEffect(() => {
    ensureAgents();
  }, [ensureAgents]);

  useEffect(() => {
    if (!issue) return;
    const ws = getWS(workspaceId);
    const issueId = issue.id;
    const unsubIssueUpdated = ws.on('issue.updated', (data: unknown) => {
      const updatedIssue = data as { id?: string };
      if (updatedIssue.id === issueId) loadComments(issueId);
    });
    return () => { unsubIssueUpdated(); };
  }, [issue, workspaceId, loadComments]);

  const mentionExtension = useMemo(
    () =>
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: {
          char: '@',
          items: ({ query }: { query: string }) => {
            const keyword = query.toLowerCase();
            return agents
              .filter((agent) =>
                agent.enabled !== false &&
                `${agent.name} ${agent.role} ${agent.description || ''}`.toLowerCase().includes(keyword)
              )
              .slice(0, 6)
              .map((agent) => ({
                id: agent.id,
                label: agent.name || agent.role,
                description: `${agent.role}${agent.description ? ` · ${agent.description}` : ''}`,
              }));
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          command: ({ editor, range, props }: any) => {
            editor.chain().focus().insertContentAt(range, [{ type: 'mention', attrs: props }]).run();
          },
          render: () => createSuggestionRenderer(),
        },
      }),
    [agents]
  );

  const slashExtension = useMemo(() => createSlashExtension(), []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: t('detail.commentPlaceholder') }),
      mentionExtension,
      slashExtension,
    ],
    editorProps: {
      attributes: { class: 'tiptap tiptap-chat' },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          const hasPopup = document.querySelector('.suggestion-menu');
          if (hasPopup) return false;
          event.preventDefault();
          handleSendComment();
          return true;
        }
        return false;
      },
    },
    content: '',
  });

  const handleSendComment = useCallback(() => {
    if (!editor || !issue) return;
    const text = editor.getText().trim();
    if (!text) return;
    const mentions = collectMentionIds(editor.getJSON());
    void fetch(`/api/workspaces/${workspaceId}/issues/${issue.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, mentions }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const comment: IssueComment = await res.json();
        setComments((current) => [...current, comment]);
        editor.commands.clearContent();
        setTimeout(() => {
          commentsViewportRef.current?.scrollTo({
            top: commentsViewportRef.current.scrollHeight,
            behavior: 'smooth',
          });
        }, 50);
      });
  }, [editor, issue, workspaceId]);

  const canSubmit = !!editor?.getText().trim();

  const handleAddMembers = async (newMembers: string[]) => {
    if (!issue) return;
    const res = await fetch(`/api/workspaces/${workspaceId}/issues/${issue.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        members: normalizeChannelMembersToAgentIds(enabledAgents, [...members, ...newMembers]),
      }),
    });
    const updated = await res.json();
    useIssueStore.getState().upsertIssue(updated);
  };

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!issue) return;
    await fetch(`/api/workspaces/${workspaceId}/issues/${issue.id}/comments/${commentId}`, { method: 'DELETE' });
    setComments((current) => current.filter((comment) => comment.id !== commentId));
  }, [issue, workspaceId]);

  const handleCommentExpandedChange = useCallback((commentId: string, expanded: boolean) => {
    setExpandedCommentIds((current) => {
      const next = new Set(current);
      if (expanded) {
        next.add(commentId);
      } else {
        next.delete(commentId);
      }
      return next;
    });
  }, []);

  const handleUpdateComment = useCallback(async (wsId: string, commentId: string, content: string) => {
    if (!issue) return;
    const res = await fetch(`/api/workspaces/${wsId}/issues/${issue.id}/comments/${commentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) return;
    const updated: IssueComment = await res.json();
    setComments((current) => current.map((comment) => (comment.id === updated.id ? updated : comment)));
  }, [issue]);

  const scrollToComment = useCallback((index: number) => {
    const comment = comments[index];
    if (!comment) return;
    commentRefs.current.get(comment.id)?.scrollIntoView({
      block: 'start',
      behavior: 'smooth',
    });
  }, [comments]);

  if (!issue) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        {t('detail.selectIssue')}
      </div>
    );
  }

  const issueTasks = useMemo(() => {
    const filtered = tasks.filter((t) => t.issueId === issue.id);
    const orderMap = new Map((issue.tasks ?? []).map((id, idx) => [id, idx]));
    return filtered.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
  }, [tasks, issue.id, issue.tasks]);
  const members = issue.members ?? [];
  const enabledAgents = agents.filter((agent) => agent.enabled !== false);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
        <IssueDetailHeader
          issue={issue}
          workspaceId={workspaceId}
          t={t}
          setEditOpen={setEditOpen}
          setInfoOpen={setInfoOpen}
          startIssue={startIssue}
          resumeIssue={resumeIssue}
          members={members}
          enabledAgents={enabledAgents}
        />

        <IssueDetailTasksPanel
          issue={issue}
          workspaceId={workspaceId}
          issueTasks={issueTasks}
          t={t}
          tTask={tTask}
          tc={tc}
          retryTask={retryTask}
          cancelTask={cancelTask}
          reorderTasks={reorderTasks}
          createTask={createTask}
          updateTask={updateTask}
          deleteTask={deleteTask}
        />

        <IssueDetailComments
          issue={issue}
          workspaceId={workspaceId}
          comments={comments}
          expandedCommentIds={expandedCommentIds}
          commentsViewportRef={commentsViewportRef}
          commentRefs={commentRefs}
          onDeleteComment={handleDeleteComment}
          onUpdateComment={handleUpdateComment}
          onExpandedChange={handleCommentExpandedChange}
          scrollToComment={scrollToComment}
          t={t}
        />

        {/* Floating composer */}
        {!composerOpen ? (
          <button
            onClick={() => setComposerOpen(true)}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all z-10"
          >
            <MessageSquare className="size-4" />
            <span className="text-sm font-medium">{t('detail.comment')}</span>
          </button>
        ) : (
          <div className="absolute bottom-4 left-4 right-4 z-10 animate-in slide-in-from-bottom-2 duration-200">
            <div className="relative">
              <button
                onClick={() => setComposerOpen(false)}
                className="absolute -top-2 -right-2 z-20 size-6 rounded-full bg-muted border shadow-sm flex items-center justify-center hover:bg-muted/80 transition-colors"
              >
                <X className="size-3.5" />
              </button>
              <ComposerShell
                editor={editor}
                canSubmit={canSubmit}
                onSubmit={handleSendComment}
              />
            </div>
          </div>
        )}
      </div>

      <IssueDetailInfoPanel
        issue={issue}
        workspaceId={workspaceId}
        open={infoOpen}
        onOpenChange={setInfoOpen}
        issueTasks={issueTasks}
        members={members}
        enabledAgents={enabledAgents}
        onAddMembers={handleAddMembers}
        onDeleteIssue={() => { deleteIssue(workspaceId, issue.id); }}
        t={t}
      />

      {issue && (
        <EditIssueDialog
          issue={issue}
          open={editOpen}
          onOpenChange={setEditOpen}
          agents={enabledAgents}
          onSave={async (data) => {
            await updateIssue(workspaceId, issue.id, data);
          }}
        />
      )}
    </div>
  );
}
