'use client';

import { useState, forwardRef, useImperativeHandle } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AvatarGroup } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AgentIcon } from '@/components/common/agent-icon';
import { ArrowLeft, RotateCcw, Clock, GitBranch, Info, Pencil, MessagesSquare, Plus, Check, Play, Pause, Square } from 'lucide-react';
import { useMobilePanelStore } from '@/stores/mobile-panel';
import { useChannelStore } from '@/stores/channel';
import { getMemberDisplayName } from '@/lib/agent-members';
import { cn } from '@/lib/utils';
import { ISSUE_STATUS_COLOR } from './issue-status-colors';
import type { AgentConfig, Issue, Task } from '@agent-spaces/shared';

export interface IssueDetailHeaderRef {
  openEditDialog: (task: Task) => void;
}

interface IssueDetailHeaderProps {
  issue: Issue;
  workspaceId: string;
  t: (key: string, params?: Record<string, string | number | Date>) => string;
  tc: (key: string) => string;
  setEditOpen: (open: boolean) => void;
  setInfoOpen: (open: boolean) => void;
  startIssue: (wsId: string, issueId: string) => void;
  pauseIssue: (wsId: string, issueId: string) => void;
  resumeIssue: (wsId: string, issueId: string) => void;
  interruptIssue: (wsId: string, issueId: string) => void;
  members: string[];
  enabledAgents: AgentConfig[];
  issueTasks: Task[];
  updateIssue: (wsId: string, issueId: string, data: Partial<Issue>) => Promise<void>;
  createTask: (wsId: string, issueId: string, title: string, desc: string, agentConfigId: string) => Promise<Task>;
  updateTask: (wsId: string, taskId: string, data: Partial<Task>) => Promise<void>;
}

export const IssueDetailHeader = forwardRef<IssueDetailHeaderRef, IssueDetailHeaderProps>(function IssueDetailHeader({
  issue,
  workspaceId,
  t,
  tc,
  setEditOpen,
  setInfoOpen,
  startIssue,
  pauseIssue,
  resumeIssue,
  interruptIssue,
  members,
  enabledAgents: agents,
  issueTasks,
  updateIssue,
  createTask,
  updateTask,
}, ref) {
  const tw = useTranslations('workflows');
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');

  const activeTaskStatuses = new Set(['running', 'reviewing', 'retrying', 'waiting_review']);
  const hasActiveTask = issueTasks.some((task) => activeTaskStatuses.has(task.status));
  const canStart = issue.status === 'draft' || issue.status === 'planned' || issue.status === 'stopped';
  const isWorkflowRunning = issue.workflowExecutionStatus === 'running';
  const isWorkflowPaused = issue.workflowExecutionStatus === 'paused';
  const canPause = isWorkflowRunning;
  const canStop = isWorkflowRunning || isWorkflowPaused || hasActiveTask;

  const handleOpenTaskDialog = () => {
    setEditingTask(null);
    setNewTaskTitle('');
    setNewTaskDesc('');
    setSelectedAgentId('');
    setTaskDialogOpen(true);
  };

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim() || !selectedAgentId) return;
    if (editingTask) {
      await updateTask(workspaceId, editingTask.id, {
        title: newTaskTitle.trim(),
        description: newTaskDesc.trim(),
        agentConfigId: selectedAgentId,
      });
    } else {
      await createTask(workspaceId, issue.id, newTaskTitle.trim(), newTaskDesc.trim(), selectedAgentId);
    }
    setNewTaskTitle('');
    setNewTaskDesc('');
    setSelectedAgentId('');
    setEditingTask(null);
    setTaskDialogOpen(false);
  };

  useImperativeHandle(ref, () => ({
    openEditDialog: (task: Task) => {
      setEditingTask(task);
      setNewTaskTitle(task.title);
      setNewTaskDesc(task.description);
      setSelectedAgentId(task.agentConfigId ?? '');
      setTaskDialogOpen(true);
    },
  }));

  return (
    <div className="shrink-0 p-4 pb-3 border-b">
      <div className="flex items-center gap-2 mb-1">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden shrink-0"
          onClick={() => useMobilePanelStore.getState().setActivePanel('issue-list')}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="text-lg font-semibold truncate shrink min-w-0">{issue.title}</h2>
        <Badge variant={ISSUE_STATUS_COLOR[issue.status]}>
          {t(`status.${issue.status}`)}
        </Badge>
        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={t('detail.openChatChannel') as string}
            onClick={() => { if (issue?.channelId) useChannelStore.getState().ensureAndActivateChannel(workspaceId, issue.channelId); }}
          >
            <MessagesSquare className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setInfoOpen(true)}>
            <Info className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        {members.length > 0 && (
          <span className="flex items-center gap-1">
            <AvatarGroup>
              {members.slice(0, 4).map((member) => (
                <AgentIcon
                  key={member}
                  agentId={member !== 'user' ? member : undefined}
                  name={getMemberDisplayName(agents, member)}
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
        <p className="text-sm text-muted-foreground mt-2 max-h-40 overflow-y-auto">{issue.description}</p>
      )}
      <div className="mt-2 flex items-center gap-2">
        {canStart && (
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => startIssue(workspaceId, issue.id)}>
            <Play className="h-3 w-3 mr-1" />
            {t('detail.start')}
          </Button>
        )}
        {isWorkflowPaused && (
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => resumeIssue(workspaceId, issue.id)}>
            <Play className="h-3 w-3 mr-1" />
            {tw('execution.resume')}
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={!canPause} onClick={() => pauseIssue(workspaceId, issue.id)}>
          <Pause className="h-3 w-3 mr-1" />
          {tw('execution.pause')}
        </Button>
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs text-destructive hover:text-destructive" disabled={!canStop} onClick={() => interruptIssue(workspaceId, issue.id)}>
          <Square className="h-3 w-3 mr-1" />
          {tw('execution.stop')}
        </Button>
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
                placeholder={t('detail.taskTitlePlaceholder') as string}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              />
              <Textarea
                placeholder={t('detail.taskDescriptionPlaceholder') as string}
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
                rows={3}
              />
              {agents.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Agent</label>
                  <div className="flex flex-wrap gap-1">
                    {agents.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => setSelectedAgentId(agent.id)}
                        className={cn(
                          'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors border',
                          selectedAgentId === agent.id ? 'border-primary bg-primary/10 text-primary' : 'border-transparent hover:bg-muted',
                        )}
                      >
                        <AgentIcon agentId={agent.id} name={agent.name} avatarUrl={agent.avatarUrl} apiBase={agent.apiBase} className="size-4 rounded-full" />
                        <span className="truncate max-w-[80px]">{agent.name}</span>
                        {selectedAgentId === agent.id && <Check className="size-3 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Button onClick={handleCreateTask} disabled={!newTaskTitle.trim() || !selectedAgentId} size="sm">
                {editingTask ? tc('save') : t('detail.addTask')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {issue.status === 'error' && issue.workflowExecutionStatus !== 'paused' && (
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
  );
});
