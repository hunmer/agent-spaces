'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useIssueStore } from '@/stores/issue';
import { useChannelStore } from '@/stores/channel';
import { useTaskStore } from '@/stores/task';
import { useAgentStore } from '@/stores/agent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AvatarGroup } from '@/components/ui/avatar';
import { AgentIcon } from '@/components/common/agent-icon';
import { ArrowLeft, Play, RotateCcw, XCircle, User, Clock, GitBranch, PanelRightOpen, PanelRightClose, Info, Users, UserPlus, Plus, Pencil, Trash2, MessageSquare, MessagesSquare, X } from 'lucide-react';
import { AddMemberDialog } from '@/components/chat/add-member-dialog';
import { IssueMessage } from '@/components/issue/issue-message';
import { EditIssueDialog } from '@/components/issue/edit-issue-dialog';
import { CommentNavigator } from '@/components/issue/comment-navigator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import { ComposerShell } from '@/components/composer/composer-shell';
import { createSuggestionRenderer } from '@/components/composer/create-suggestion-renderer';
import { createSlashExtension } from '@/components/composer/create-slash-extension';
import { getAgentDisplayName, getMemberDisplayName, normalizeChannelMembersToAgentIds } from '@/lib/agent-members';
import type { IssueComment, IssueStatus, Task, TaskStatus } from '@agent-spaces/shared';
import { getWS } from '@/lib/ws';
import { useMobilePanelStore } from '@/stores/mobile-panel';
import type { JSONContent } from '@tiptap/react';

const ISSUE_STATUS_COLOR: Record<IssueStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  planned: 'outline',
  in_progress: 'default',
  review_pending: 'outline',
  changes_requested: 'destructive',
  approved: 'default',
  completed: 'secondary',
  archived: 'outline',
  error: 'destructive',
};

const TASK_STATUS_COLOR: Record<TaskStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  running: 'default',
  reviewing: 'outline',
  waiting_review: 'outline',
  retrying: 'outline',
  done: 'secondary',
  failed: 'destructive',
  cancelled: 'outline',
};

/* ------------------------------------------------------------------ */
/*  TaskRow                                                            */
/* ------------------------------------------------------------------ */

function TaskRow({
  task,
  workspaceId,
  onRetry,
  onCancel,
  onEdit,
  onDelete,
  tTask,
}: {
  task: Task;
  workspaceId: string;
  onRetry: (wsId: string, taskId: string) => void;
  onCancel: (wsId: string, taskId: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (wsId: string, taskId: string) => void;
  tTask: (key: string) => string;
}) {
  const isPending = task.status === 'pending';

  return (
    <div className="flex items-center gap-2 p-2 rounded-md border text-sm group">
      <Badge variant={TASK_STATUS_COLOR[task.status]} className="text-[10px] shrink-0">
        {tTask(`status.${task.status}`)}
      </Badge>
      <span className="flex-1 truncate">{task.title}</span>
      {/* Edit button – pending tasks only */}
      {isPending && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onEdit(task)}
        >
          <Pencil className="h-3 w-3" />
        </Button>
      )}
      {/* Delete button – pending, cancelled, or done */}
      {(isPending || task.status === 'cancelled' || task.status === 'done') && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onDelete(workspaceId, task.id)}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
      {/* Retry – failed tasks */}
      {task.status === 'failed' && (
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRetry(workspaceId, task.id)}>
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
      {/* Cancel – active tasks */}
      {(isPending || task.status === 'running' || task.status === 'reviewing' || task.status === 'retrying') && (
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onCancel(workspaceId, task.id)}>
          <XCircle className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  IssueDetail                                                        */
/* ------------------------------------------------------------------ */

interface IssueDetailProps {
  workspaceId: string;
}

export function IssueDetail({ workspaceId }: IssueDetailProps) {
  const { issues, activeIssueId, startIssue, resumeIssue, updateIssue, deleteIssue } = useIssueStore();
  const { tasks, loadTasks, retryTask, cancelTask, createTask, updateTask, deleteTask } = useTaskStore();
  const agents = useAgentStore((s) => s.agents);
  const ensureAgents = useAgentStore((s) => s.ensure);
  const [infoOpen, setInfoOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
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
    ensureAgents(workspaceId);
  }, [workspaceId, ensureAgents]);

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
        members: normalizeChannelMembersToAgentIds(enabledAgents, [...members, ...newMembers]).filter((member) => member !== 'user'),
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

  const handleCreateTask = async () => {
    if (!issue) return;
    if (!newTaskTitle.trim()) return;
    if (editingTask) {
      await updateTask(workspaceId, editingTask.id, { title: newTaskTitle.trim(), description: newTaskDesc.trim() });
    } else {
      await createTask(workspaceId, issue.id, newTaskTitle.trim(), newTaskDesc.trim());
    }
    setNewTaskTitle('');
    setNewTaskDesc('');
    setEditingTask(null);
    setTaskDialogOpen(false);
  };

  const handleOpenTaskDialog = () => {
    setEditingTask(null);
    setNewTaskTitle('');
    setNewTaskDesc('');
    setTaskDialogOpen(true);
  };

  const handleOpenEditDialog = (task: Task) => {
    setEditingTask(task);
    setNewTaskTitle(task.title);
    setNewTaskDesc(task.description);
    setTaskDialogOpen(true);
  };

  const handleDeleteTask = async (wsId: string, taskId: string) => {
    await deleteTask(wsId, taskId);
  };

  if (!issue) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        {t('detail.selectIssue')}
      </div>
    );
  }

  const issueTasks = tasks.filter((t) => t.issueId === issue.id);
  const members = issue.members ?? [];
  const enabledAgents = agents.filter((agent) => agent.enabled !== false);
  const memberIds = new Set(members);
  const candidateMembers = enabledAgents
    .filter((agent) => !memberIds.has(agent.id))
    .map((agent) => ({
      id: agent.id,
      label: getAgentDisplayName(agent),
      description: agent.role,
    }));

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
        {/* Header */}
        <div className="shrink-0 p-4 pb-3 border-b">
          <div className="flex items-center gap-2 mb-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden shrink-0"
              onClick={() => useMobilePanelStore.getState().setActivePanel('issue-list')}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <h2 className="text-lg font-semibold truncate shrink min-w-0">{issue.title}</h2>
            <Badge variant={ISSUE_STATUS_COLOR[issue.status]}>
              {t(`status.${issue.status}`)}
            </Badge>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title={t('detail.openChatChannel')}
              onClick={() => { if (issue?.channelId) useChannelStore.getState().setActiveChannel(issue.channelId); }}
            >
              <MessagesSquare className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setInfoOpen(!infoOpen)}
            >
              {infoOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
            </Button>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {/* Members avatars */}
            {members.length > 0 && (
              <span className="flex items-center gap-1">
                <AvatarGroup>
                  {members.slice(0, 4).map((member) => (
                    <AgentIcon
                      key={member}
                      agentId={member !== 'user' ? member : undefined}
                      name={getMemberDisplayName(enabledAgents, member)}
                      className="size-6 rounded-full"
                    />
                  ))}
                </AvatarGroup>
                <span>{t('detail.memberCount', { count: members.length })}</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {t('detail.created')} {new Date(issue.createdAt).toLocaleDateString()}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {t('detail.updated')} {new Date(issue.updatedAt).toLocaleDateString()}
            </span>
            {issue.branch && (
              <span className="flex items-center gap-1">
                <GitBranch className="h-3 w-3" />
                {issue.branch}
              </span>
            )}
            {issue.prUrl && (
              <span>{t('detail.pr')} {issue.prUrl}</span>
            )}
          </div>
          {issue.description && (
            <p className="text-sm text-muted-foreground mt-2">{issue.description}</p>
          )}
          {issue.status === 'draft' && (
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={() => startIssue(workspaceId, issue.id)}>
                <Play className="h-3 w-3 mr-1" />
                {t('detail.start')}
              </Button>
            </div>
          )}
          {issue.status === 'error' && (
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => resumeIssue(workspaceId, issue.id)}>
                <RotateCcw className="h-3 w-3 mr-1" />
                {t('detail.resumeFailed')}
              </Button>
              {issue.retryPaused && (
                <span className="text-[11px] text-muted-foreground">
                  {t('detail.retryPaused', { failed: issue.retryCount, total: issue.maxRetries })}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Tasks */}
        <div className="shrink-0 p-4 pb-2 max-h-[180px] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">
              {t('detail.tasks', { count: issueTasks.length })}
            </h3>
            <Dialog open={taskDialogOpen} onOpenChange={(open) => { setTaskDialogOpen(open); if (!open) setEditingTask(null); }}>
                <DialogTrigger render={<Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleOpenTaskDialog} />}>
                  <Plus className="h-4 w-4" />
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingTask ? t('detail.editTask') : t('detail.addTask')}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <Input
                      placeholder={t('detail.taskTitlePlaceholder')}
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                    />
                    <Textarea
                      placeholder={t('detail.taskDescriptionPlaceholder')}
                      value={newTaskDesc}
                      onChange={(e) => setNewTaskDesc(e.target.value)}
                      rows={3}
                    />
                    <Button onClick={handleCreateTask} disabled={!newTaskTitle.trim()} size="sm">
                      {editingTask ? tc('save') : t('detail.addTask')}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
          </div>
          {issueTasks.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t('detail.noTasks')}</div>
          ) : (
            <div className="space-y-1">
              {issueTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  workspaceId={workspaceId}
                  onRetry={retryTask}
                  onCancel={cancelTask}
                  onEdit={handleOpenEditDialog}
                  onDelete={handleDeleteTask}
                  tTask={tTask}
                />
              ))}
            </div>
          )}
        </div>

        {/* Comments */}
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
                        onDelete={handleDeleteComment}
                        onUpdate={handleUpdateComment}
                        onExpandedChange={handleCommentExpandedChange}
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

      {/* Info panel */}
      {infoOpen && (
        <div className="w-72 border-l flex flex-col h-full">
          <Tabs defaultValue="info" className="flex flex-col flex-1 min-h-0">
            <TabsList className="w-full rounded-none border-b bg-transparent h-9 p-0 shrink-0">
              <TabsTrigger value="info" className="flex-1 gap-1.5 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                <Info className="size-3.5" />{t('detail.tabInfo')}
              </TabsTrigger>
              <TabsTrigger value="members" className="flex-1 gap-1.5 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                <Users className="size-3.5" />{t('detail.tabMembers')}
              </TabsTrigger>
            </TabsList>
            <ScrollArea className="min-h-0 flex-1">
              <TabsContent value="info" className="p-4 mt-0 space-y-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">{t('detail.infoStatus')}</span>
                    <Badge variant={ISSUE_STATUS_COLOR[issue.status]} className="text-[10px]">
                      {t(`status.${issue.status}`)}
                    </Badge>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">{t('detail.infoIssueId')}</span>
                    <span className="font-mono text-xs">{issue.id.slice(0, 8)}...</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">{t('detail.infoTaskCount')}</span>
                    <span>{issueTasks.length}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">{t('detail.infoMemberCount')}</span>
                    <span>{members.length}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">{t('detail.infoCreatedAt')}</span>
                    <span>{new Date(issue.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">{t('detail.infoUpdatedAt')}</span>
                    <span>{new Date(issue.updatedAt).toLocaleDateString()}</span>
                  </div>
                  {issue.branch && (
                    <div className="flex justify-between py-1 border-b">
                      <span className="text-muted-foreground">{t('detail.infoBranch')}</span>
                      <span className="font-mono text-xs flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />{issue.branch}
                      </span>
                    </div>
                  )}
                  {issue.prUrl && (
                    <div className="flex justify-between py-1 border-b">
                      <span className="text-muted-foreground">{t('detail.infoPr')}</span>
                      <span className="text-xs truncate max-w-[140px]">{issue.prUrl}</span>
                    </div>
                  )}
                </div>
                {issue.description && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">{t('detail.infoDescription')}</span>
                    <p className="text-sm bg-muted/50 rounded-lg px-3 py-2 whitespace-pre-wrap">
                      {issue.description}
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="members" className="p-4 mt-0 space-y-1">
                {members.map((member) => (
                  <div key={member} className="flex items-center gap-2 py-1.5">
                    <AgentIcon
                      agentId={member !== 'user' ? member : undefined}
                      name={getMemberDisplayName(enabledAgents, member)}
                      className="size-6 rounded-full"
                    />
                    <div className="min-w-0">
                      <p className="text-sm truncate">{getMemberDisplayName(enabledAgents, member)}</p>
                      <p className="text-xs text-muted-foreground truncate">{member}</p>
                    </div>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 text-xs text-muted-foreground"
                  onClick={() => setAddMemberOpen(true)}
                >
                  <UserPlus className="size-3.5 mr-1" />{t('detail.addMember')}
                </Button>
              </TabsContent>
            </ScrollArea>
          </Tabs>
          <div className="shrink-0 p-3 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:text-destructive"
              onClick={() => { deleteIssue(workspaceId, issue.id); }}
            >
              <Trash2 className="size-3.5 mr-1.5" />{t('detail.deleteIssue')}
            </Button>
          </div>
        </div>
      )}

      <AddMemberDialog
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        candidates={candidateMembers}
        onAdd={handleAddMembers}
      />

      {issue && (
        <EditIssueDialog
          issue={issue}
          open={editOpen}
          onOpenChange={setEditOpen}
          agents={enabledAgents}
          workspaceId={workspaceId}
          onSave={async (data) => {
            await updateIssue(workspaceId, issue.id, data);
          }}
        />
      )}
    </div>
  );
}

function collectMentionIds(node: JSONContent): string[] {
  const ids = new Set<string>();
  const walk = (current: JSONContent) => {
    if (!current) return;
    if (current.type === 'mention' && typeof current.attrs?.id === 'string') {
      ids.add(current.attrs.id);
    }
    if (Array.isArray(current.content)) {
      for (const child of current.content) walk(child);
    }
  };
  walk(node);
  return [...ids];
}
