'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { IssueComment, OutputField, Workflow } from '@agent-spaces/shared';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  MessageSquare, X, MoreHorizontal, Users, Calendar, Paperclip, Plus,
  ArrowRight, Pencil, Info, MessagesSquare, Play, StepForward, Ban,
  RotateCcw, ArrowLeft, GitBranch,
} from 'lucide-react';
import { useIssueStore } from '@/stores/issue';
import { useMobilePanelStore } from '@/stores/mobile-panel';
import { useAgentStore } from '@/stores/agent';
import { useChannelStore } from '@/stores/channel';
import { EditIssueDialog } from '@/components/issue/edit-issue-dialog';
import { ChatComposerInput } from '@/components/chat/chat-composer-input';
import { normalizeChannelMembersToAgentIds, getMemberDisplayName } from '@/lib/agent-members';
import { sdk } from '@/lib/sdk';
import { getWS } from '@/lib/ws';
import { workflowApi } from '@/lib/workflow-api';
import { IssueDetailTasksPanel } from './issue-detail-tasks-panel';
import { ExecutionInputDialog } from '@/components/workflow/workflow-execution-input-dialog';
import { IssueDetailComments } from './issue-detail-comments';
import { IssueDetailInfoPanel } from './issue-detail-info-panel';
import { CommentNavigator } from './comment-navigator';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Switch } from '@/components/ui/switch';
import { AgentIcon } from '@/components/common/agent-icon';
import { ISSUE_STATUS_COLOR } from './issue-status-colors';

/* ------------------------------------------------------------------ */
/*  Animation variants (from project-detail-view)                      */
/* ------------------------------------------------------------------ */

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring' as const, stiffness: 100 },
  },
};

/* ------------------------------------------------------------------ */
/*  IssueDetail                                                        */
/* ------------------------------------------------------------------ */

interface IssueDetailProps {
  workspaceId: string;
}

export function IssueDetail({ workspaceId }: IssueDetailProps) {
  const { issues, activeIssueId, startIssue, resumeIssue, continueIssue, interruptIssue, updateIssue, deleteIssue } = useIssueStore();
  const agents = useAgentStore((s) => s.agents);
  const ensureAgents = useAgentStore((s) => s.ensure);
  const [infoOpen, setInfoOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [expandedCommentIds, setExpandedCommentIds] = useState<Set<string>>(() => new Set());
  const [composerOpen, setComposerOpen] = useState(false);
  const [startInputOpen, setStartInputOpen] = useState(false);
  const [startWorkflow, setStartWorkflow] = useState<Workflow | null>(null);
  const commentsViewportRef = useRef<HTMLDivElement | null>(null);
  const commentRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const t = useTranslations('issue');

  const issue = issues.find((i) => i.id === activeIssueId);

  const loadComments = useCallback(async (targetIssueId: string) => {
    setCommentsLoading(true);
    try {
      const nextComments = await sdk.issue.listComments(workspaceId, targetIssueId);
      setComments(nextComments);
    } finally {
      setCommentsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (issue) {
      void Promise.resolve().then(() => loadComments(issue.id));
    }
  }, [issue, workspaceId, loadComments]);

  useEffect(() => {
    ensureAgents();
  }, [ensureAgents]);

  useEffect(() => {
    let active = true;
    setStartWorkflow(null);
    if (!issue?.workflowId) return () => { active = false; };
    workflowApi.get(issue.workflowId)
      .then((workflow) => {
        if (active) setStartWorkflow(workflow);
      })
      .catch(() => {
        if (active) setStartWorkflow(null);
      });
    return () => {
      active = false;
    };
  }, [issue?.workflowId]);

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

  const handleSendComment = useCallback(async (content: string, mentions: string[]) => {
    if (!issue) return;
    const text = content.trim();
    if (!text) return;
    try {
      const comment = await sdk.issue.addComment(workspaceId, issue.id, text, mentions);
      setComments((current) => [...current, comment]);
      setTimeout(() => {
        commentsViewportRef.current?.scrollTo({
          top: commentsViewportRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 50);
    } catch { /* ignore */ }
  }, [issue, workspaceId]);

  const handleAddMembers = async (newMembers: string[]) => {
    if (!issue) return;
    const updated = await sdk.issue.update(workspaceId, issue.id, {
      members: normalizeChannelMembersToAgentIds(enabledAgents, [...members, ...newMembers]),
    });
    useIssueStore.getState().upsertIssue(updated);
  };

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!issue) return;
    await sdk.issue.deleteComment(workspaceId, issue.id, commentId);
    setComments((current) => current.filter((comment) => comment.id !== commentId));
  }, [issue, workspaceId]);

  const handleCommentExpandedChange = useCallback((commentId: string, expanded: boolean) => {
    setExpandedCommentIds((current) => {
      const next = new Set(current);
      if (expanded) next.add(commentId);
      else next.delete(commentId);
      return next;
    });
  }, []);

  const handleUpdateComment = useCallback(async (wsId: string, commentId: string, content: string) => {
    if (!issue) return;
    try {
      const updated = await sdk.issue.updateComment(wsId, issue.id, commentId, content);
      setComments((current) => current.map((comment) => (comment.id === updated.id ? updated : comment)));
    } catch { /* ignore */ }
  }, [issue]);

  const scrollToComment = useCallback((index: number) => {
    const comment = comments[index];
    if (!comment) return;
    commentRefs.current.get(comment.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [comments]);

  const members = Array.from(new Set(issue?.members ?? []));
  const normalizedIssue = issue ? { ...issue, members } : undefined;
  const enabledAgents = (() => {
    const seen = new Set<string>();
    return agents.filter((agent) => {
      if (agent.enabled === false || seen.has(agent.id)) return false;
      seen.add(agent.id);
      return true;
    });
  })();

  if (!issue || !normalizedIssue) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        {t('detail.selectIssue')}
      </div>
    );
  }

  const canStart = issue.status === 'draft' || issue.status === 'planned';
  const canContinue = Boolean(issue.workflowId) && issue.status !== 'completed' && issue.status !== 'archived';
  const canInterrupt = issue.status === 'planned' || issue.status === 'in_progress';

  const statusDotColor = issue.status === 'completed' ? 'bg-green-500'
    : issue.status === 'in_progress' ? 'bg-blue-500'
    : issue.status === 'error' ? 'bg-red-500'
    : 'bg-yellow-500';

  const startNode = startWorkflow?.nodes.find((node) => node.type === 'start') ?? null;
  const startInputFields = (Array.isArray(startNode?.data?.inputFields) ? startNode.data.inputFields : []) as OutputField[];
  const workflowVariableFields = (Array.isArray(startWorkflow?.variables) ? startWorkflow.variables : []) as OutputField[];
  const startNodeLabel = startNode?.label || t('detail.start');

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 h-full relative">
        {/* Header Section — fixed at top, outside scroll */}
        <CardHeader className="shrink-0 p-4 bg-muted/30 space-y-0 rounded-none">
              <motion.div variants={itemVariants} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden shrink-0"
                    onClick={() => useMobilePanelStore.getState().setActivePanel('issue-list')}
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                  <h1 className="text-xl font-bold tracking-tight truncate">{issue.title}</h1>
                  <Badge variant={ISSUE_STATUS_COLOR[issue.status]} className="font-semibold">
                    <span className={`mr-2 h-2 w-2 rounded-full animate-pulse ${statusDotColor}`} />
                    {t(`status.${issue.status}`)}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch
                      size="sm"
                      checked={issue.continuousRun !== false}
                      onCheckedChange={(checked) => updateIssue(workspaceId, issue.id, { continuousRun: checked })}
                    />
                    <span>{t('detail.continuousRun')}</span>
                  </div>
                  {canStart && (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setStartInputOpen(true)}>
                      <Play className="h-3 w-3 mr-1" />
                      {t('detail.start')}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={!canContinue} onClick={() => continueIssue(workspaceId, issue.id)}>
                    <StepForward className="h-3 w-3 mr-1" />
                    {t('detail.continue')}
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-xs text-destructive hover:text-destructive" disabled={!canInterrupt} onClick={() => interruptIssue(workspaceId, issue.id)}>
                    <Ban className="h-3 w-3 mr-1" />
                    {t('detail.interrupt')}
                  </Button>
                  {issue.status === 'error' && (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => resumeIssue(workspaceId, issue.id)}>
                      <RotateCcw className="h-3 w-3 mr-1" />
                      {t('detail.resumeFailed')}
                    </Button>
                  )}
                  {issue.retryPaused && issue.status === 'error' && (
                    <span className="text-[11px] text-muted-foreground">
                      {t('detail.retryPaused', { failed: issue.retryCount, total: issue.maxRetries })}
                    </span>
                  )}
                  <span className="mx-1 h-4 w-px bg-border" />
                  <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title={t('detail.openChatChannel') as string}
                    onClick={() => { if (issue.channelId) useChannelStore.getState().ensureAndActivateChannel(workspaceId, issue.channelId); }}
                  >
                    <MessagesSquare className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setInfoOpen(true)}>
                    <Info className="size-4" />
                  </Button>
                </div>
              </motion.div>
            </CardHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full overflow-y-auto xl:hidden">
        <Card className="border-0 shadow-none rounded-none flex flex-col p-0">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            className="flex min-h-full flex-col xl:h-full xl:grid xl:grid-cols-[minmax(0,1fr)_360px] xl:items-stretch"
          >

            {/* Scrollable meta + commands + tasks + attachments */}
            <div className="shrink-0 space-y-5 p-6 pb-2 xl:min-h-full xl:min-w-0">
              {/* Meta Info Grid — project-detail-view style */}
              <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                {members.length > 0 && (
                  <div className="flex items-start gap-3">
                    <Users className="h-5 w-5 mt-0.5 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">{t('detail.memberCount', { count: members.length })}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {members.slice(0, 4).map((member) => (
                          <div key={member} className="flex items-center gap-1">
                            <AgentIcon
                              agentId={member !== 'user' ? member : undefined}
                              name={getMemberDisplayName(enabledAgents, member)}
                              className="size-6 rounded-full"
                            />
                            <span className="font-medium text-xs">{getMemberDisplayName(enabledAgents, member)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">{t('detail.created')}</p>
                    <p className="font-medium text-xs mt-1 flex items-center gap-2">
                      {new Date(issue.createdAt).toLocaleDateString()}
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      {new Date(issue.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {issue.branch && (
                  <div className="flex items-start gap-3">
                    <GitBranch className="h-5 w-5 mt-0.5 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">Branch</p>
                      <p className="font-mono text-xs mt-1">{issue.branch}</p>
                    </div>
                  </div>
                )}
                {issue.description && (
                  <div className="flex items-start gap-3 col-span-1 md:col-span-2">
                    <MoreHorizontal className="h-5 w-5 mt-0.5 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">{t('detail.description')}</p>
                      <p className="mt-1 text-foreground/80 whitespace-pre-wrap max-h-40 overflow-y-auto">{issue.description}</p>
                    </div>
                  </div>
                )}
              </motion.div>

              <motion.div variants={itemVariants}>
                <IssueDetailTasksPanel
                  issue={normalizedIssue}
                  workspaceId={workspaceId}
                  t={t}
                />
              </motion.div>

              {/* Attachments Placeholder — project-detail-view style */}
              <motion.div variants={itemVariants} className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Paperclip className="h-5 w-5 text-muted-foreground" />
                    Attachments
                    <Badge variant="secondary">0</Badge>
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="flex items-center justify-center p-3 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/40 transition-colors">
                    <Plus className="h-6 w-6 text-muted-foreground" />
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Comments — natural height, page-level scroll */}
            <motion.div variants={itemVariants} className="flex flex-col xl:min-h-full xl:min-w-0 xl:border-l xl:pb-6">
              {commentsLoading && comments.length === 0 ? (
                <div className="flex flex-col border-t xl:border-t-0">
                  <div className="px-4 pt-2 xl:px-5 xl:pt-6">
                    <Skeleton className="h-4 w-20 mb-3" />
                  </div>
                  <div className="space-y-4 px-4 xl:px-5">
                    {Array.from({ length: 3 }, (_, i) => (
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
                </div>
              ) : (
                <IssueDetailComments
                  issue={normalizedIssue}
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
              )}
            </motion.div>

          </motion.div>
        </Card>
        </div>
        <div className="hidden h-full xl:block">
          <ResizablePanelGroup orientation="horizontal" className="h-full">
            <ResizablePanel id="issue-detail-main" defaultSize="72%" minSize="40%" className="min-w-0 overflow-hidden">
              <div className="h-full overflow-y-auto">
                <Card className="border-0 shadow-none rounded-none flex flex-col p-0">
                  <motion.div initial="hidden" animate="visible" variants={containerVariants} className="flex min-h-full flex-col">
                    <div className="space-y-5 p-6 pb-6">
                      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                        {members.length > 0 && (
                          <div className="flex items-start gap-3">
                            <Users className="h-5 w-5 mt-0.5 text-muted-foreground" />
                            <div>
                              <p className="text-muted-foreground">{t('detail.memberCount', { count: members.length })}</p>
                              <div className="mt-1 flex items-center gap-2">
                                {members.slice(0, 4).map((member) => (
                                  <div key={member} className="flex items-center gap-1">
                                    <AgentIcon
                                      agentId={member !== 'user' ? member : undefined}
                                      name={getMemberDisplayName(enabledAgents, member)}
                                      className="size-6 rounded-full"
                                    />
                                    <span className="font-medium text-xs">{getMemberDisplayName(enabledAgents, member)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="flex items-start gap-3">
                          <Calendar className="h-5 w-5 mt-0.5 text-muted-foreground" />
                          <div>
                            <p className="text-muted-foreground">{t('detail.created')}</p>
                            <p className="mt-1 flex items-center gap-2 text-xs font-medium">
                              {new Date(issue.createdAt).toLocaleDateString()}
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              {new Date(issue.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        {issue.branch && (
                          <div className="flex items-start gap-3">
                            <GitBranch className="h-5 w-5 mt-0.5 text-muted-foreground" />
                            <div>
                              <p className="text-muted-foreground">Branch</p>
                              <p className="mt-1 font-mono text-xs">{issue.branch}</p>
                            </div>
                          </div>
                        )}
                        {issue.description && (
                          <div className="col-span-1 flex items-start gap-3 md:col-span-2">
                            <MoreHorizontal className="h-5 w-5 mt-0.5 text-muted-foreground" />
                            <div>
                              <p className="text-muted-foreground">{t('detail.description')}</p>
                              <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-foreground/80">{issue.description}</p>
                            </div>
                          </div>
                        )}
                      </motion.div>

                      <motion.div variants={itemVariants}>
                        <IssueDetailTasksPanel
                          issue={normalizedIssue}
                          workspaceId={workspaceId}
                          t={t}
                        />
                      </motion.div>

                      <motion.div variants={itemVariants} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="flex items-center gap-2 font-semibold">
                            <Paperclip className="h-5 w-5 text-muted-foreground" />
                            Attachments
                            <Badge variant="secondary">0</Badge>
                          </h3>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          <div className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed p-3 transition-colors hover:bg-muted/40">
                            <Plus className="h-6 w-6 text-muted-foreground" />
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  </motion.div>
                </Card>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel id="issue-detail-comments" defaultSize="28%" minSize="20%" maxSize="50%" className="min-w-0 overflow-hidden">
              <div className="h-full border-l">
                {commentsLoading && comments.length === 0 ? (
                  <div className="flex h-full flex-col">
                    <div className="px-5 pt-6">
                      <Skeleton className="mb-3 h-4 w-20" />
                    </div>
                    <div className="space-y-4 px-5">
                      {Array.from({ length: 3 }, (_, i) => (
                        <div key={i} className="flex gap-3">
                          <Skeleton className="mt-0.5 size-6 shrink-0 rounded-full" />
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
                  </div>
                ) : (
                  <IssueDetailComments
                    issue={normalizedIssue}
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
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
        </div>

        {/* Floating composer — UNCHANGED */}
        {!composerOpen ? (
          <button
            onClick={() => setComposerOpen(true)}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all z-10 cursor-pointer"
          >
            <MessageSquare className="size-4" />
            <span className="text-sm font-medium">{t('detail.comment')}</span>
          </button>
        ) : (
          <div className="absolute bottom-4 left-4 right-4 z-10 animate-in slide-in-from-bottom-2 duration-200">
            <div className="relative">
              <button
                onClick={() => setComposerOpen(false)}
                className="absolute -top-2 -right-2 z-20 size-6 rounded-full bg-muted border shadow-sm flex items-center justify-center hover:bg-muted/80 transition-colors cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
              <ChatComposerInput
                workspaceId={workspaceId}
                agents={enabledAgents}
                placeholder={t('detail.commentPlaceholder')}
                onSubmit={(content, mentions) => handleSendComment(content, mentions)}
                enableAutoMode={false}
                enableContextControl={false}
                enableAgentResources={false}
              />
            </div>
          </div>
        )}

        {/* Fixed comment navigator */}
        {comments.length > 0 && (
          <CommentNavigator comments={comments} onNavigate={scrollToComment} />
        )}
      </div>

      <IssueDetailInfoPanel
        issue={normalizedIssue}
        workspaceId={workspaceId}
        open={infoOpen}
        onOpenChange={setInfoOpen}
        issueTasks={[]}
        members={members}
        enabledAgents={enabledAgents}
        onAddMembers={handleAddMembers}
        onDeleteIssue={() => { deleteIssue(workspaceId, issue.id); useMobilePanelStore.getState().setActivePanel('issue-list'); }}
        t={t}
      />

      {issue && (
        <EditIssueDialog
          issue={normalizedIssue}
          open={editOpen}
          onOpenChange={setEditOpen}
          agents={enabledAgents}
          onSave={async (data) => {
            await updateIssue(workspaceId, issue.id, data);
          }}
        />
      )}

      {issue.workflowId && (
        <ExecutionInputDialog
          open={startInputOpen}
          fields={startInputFields}
          variableFields={workflowVariableFields}
          startNodeLabel={startNodeLabel}
          workflowId={issue.workflowId}
          onOpenChange={setStartInputOpen}
          onSubmit={(values, env) => startIssue(workspaceId, issue.id, values, env)}
        />
      )}

    </div>
  );
}
