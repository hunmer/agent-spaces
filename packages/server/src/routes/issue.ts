import { Router } from 'express';
import type { Request, Response } from 'express';
import type { AgentSessionStatus } from '@agent-spaces/shared';
import * as issueService from '../services/issue.js';
import * as issueCommentService from '../services/issue-comment.js';
import * as channelService from '../services/channel.js';
import { broadcastToWorkspace } from '../ws/connection-manager.js';
import { stopChannelRuns } from '../ws/agent-runner.js';

import * as agentService from '../services/agent.js';
import * as taskService from '../services/task.js';
import { retryIssue } from '../services/issue-retry.js';
import { hasActiveIssueAutomation, runIssueAutomation, startIssueWorkflowExecution } from '../agents/issue-agent-runner.js';
import * as workflowService from '../services/workflow.js';
import { scheduleIssueTitleGeneration } from '../services/generated-title.js';
import { getWorkflowExecutionManager } from '../services/builtin-tools/workflow-exec-tools.js';

const router = Router({ mergeParams: true });

function getRecordBodyValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

router.get('/', (req: Request<{ id: string }>, res: Response) => {
  const status = req.query.status as string | undefined;
  const issues = issueService.list(req.params.id, status as any);
  res.json(issues);
});

router.post('/', (req: Request<{ id: string }>, res: Response) => {
  const { title, description, members, workflowId } = req.body;
  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  const trimmedDescription = typeof description === 'string' ? description.trim() : '';
  if (!trimmedTitle && !trimmedDescription) {
    res.status(400).json({ error: 'title or description is required' });
    return;
  }
  const issue = issueService.create(req.params.id, {
    title: trimmedTitle,
    description: trimmedDescription,
    members: mergeWorkflowMembers(members, workflowId),
    workflowId,
  });
  const channel = issue.channelId ? channelService.getChannel(req.params.id, issue.channelId) : null;
  if (channel) broadcastToWorkspace(req.params.id, 'channel.updated', channel);
  broadcastToWorkspace(req.params.id, 'issue.created', issue);
  res.status(201).json(issue);

  if (!trimmedTitle) {
    scheduleIssueTitleGeneration({
      workspaceId: req.params.id,
      issueId: issue.id,
      requirement: trimmedDescription,
      description: trimmedDescription,
      broadcast: (event, data) => broadcastToWorkspace(req.params.id, event, data),
    });
  }
});

router.get('/:issueId', (req: Request<{ id: string; issueId: string }>, res: Response) => {
  const issue = issueService.getById(req.params.id, req.params.issueId);
  if (!issue) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }
  res.json(issue);
});

router.put('/:issueId', (req: Request<{ id: string; issueId: string }>, res: Response) => {
  const issue = issueService.getById(req.params.id, req.params.issueId);
  if (!issue) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }
  const previousStatus = issue.status;
  const { title, description, status, members, workflowId } = req.body;
  if (title) issue.title = title;
  if (description !== undefined) issue.description = description;
  if (workflowId !== undefined) issue.workflowId = workflowId || undefined;
  if (members !== undefined) {
    issue.members = normalizeIssueMembers(req.params.id, mergeWorkflowMembers(members, issue.workflowId));
  } else if (workflowId !== undefined) {
    issue.members = normalizeIssueMembers(req.params.id, mergeWorkflowMembers(issue.members, issue.workflowId));
  }
  if ((members !== undefined || workflowId !== undefined) && issue.channelId) {
    const updatedChannel = channelService.updateChannel(req.params.id, issue.channelId, { members: issue.members });
    if (updatedChannel) broadcastToWorkspace(req.params.id, 'channel.updated', updatedChannel);
  }
  if (status) {
    issue.status = status;
  }
  const saved = issueService.save(req.params.id, issue);
  broadcastToWorkspace(req.params.id, 'issue.updated', saved);
  if (status && status !== previousStatus) {
    // 状态变更时停止该议题关联频道中所有运行中的 agent
    if (issue.channelId) {
      stopChannelRuns(req.params.id, issue.channelId);
    }
    broadcastToWorkspace(req.params.id, 'issue.status_changed', { issueId: req.params.issueId, from: previousStatus, to: status });

    // Issue 归档/取消归档时，同步关联的 Channel
    if (issue.channelId && (status === 'archived' || previousStatus === 'archived')) {
      const archived = status === 'archived';
      const updatedChannel = channelService.updateChannel(req.params.id, issue.channelId, { archived });
      if (updatedChannel) broadcastToWorkspace(req.params.id, 'channel.updated', updatedChannel);
    }
  }
  res.json(saved);
});

router.post('/:issueId/start', (req: Request<{ id: string; issueId: string }>, res: Response) => {
  const workspaceId = req.params.id;
  const { issueId } = req.params;
  const input = getRecordBodyValue(req.body?.input);
  const env = getRecordBodyValue(req.body?.env);
  const before = issueService.getById(workspaceId, issueId);
  if (!before) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }
  if (!before.workflowId) {
    res.status(400).json({ error: 'No workflow configured for this issue' });
    return;
  }
  const issue = issueService.save(workspaceId, {
    ...before,
    status: 'in_progress',
    workflowExecutionStatus: 'running',
    lastError: undefined,
  });
  if (!issue) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }
  broadcastToWorkspace(workspaceId, 'issue.status_changed', { issueId, from: before?.status ?? 'draft', to: 'in_progress' });
  broadcastToWorkspace(workspaceId, 'issue.updated', issue);
  res.json(issue);

  // trigger issue automation
  const ctx = {
    workspaceId,
    broadcast: (event: string, data: unknown) => broadcastToWorkspace(workspaceId, event, data),
    getSession: (sessionId: string) => agentService.getById(workspaceId, sessionId),
    updateSessionStatus: (sessionId: string, status: AgentSessionStatus, extra?: Record<string, unknown>) =>
      agentService.updateStatus(workspaceId, sessionId, status, extra),
  };
  startIssueWorkflowExecution(workspaceId, issueId, ctx, input, env).catch((err) => {
    console.error(`[issue-start] automation error for issue ${issueId}:`, err);
  });
});

router.post('/:issueId/pause', (req: Request<{ id: string; issueId: string }>, res: Response) => {
  const workspaceId = req.params.id;
  const { issueId } = req.params;
  const issue = issueService.getById(workspaceId, issueId);
  if (!issue) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }

  const manager = getWorkflowExecutionManager();
  if (!manager) {
    res.status(500).json({ error: 'workflow execution manager is not initialized' });
    return;
  }
  if (!issue.workflowExecutionId) {
    res.status(400).json({ error: 'workflow execution is not running' });
    return;
  }

  manager.pause(issue.workflowExecutionId);
  res.json(issueService.getById(workspaceId, issueId) ?? issue);
});

router.post('/:issueId/resume', async (req: Request<{ id: string; issueId: string }>, res: Response) => {
  const workspaceId = req.params.id;
  const { issueId } = req.params;
  const issue = issueService.getById(workspaceId, issueId);
  if (!issue) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }

  const ctx = {
    workspaceId,
    broadcast: (event: string, data: unknown) => broadcastToWorkspace(workspaceId, event, data),
    getSession: (sessionId: string) => agentService.getById(workspaceId, sessionId),
    updateSessionStatus: (sessionId: string, status: AgentSessionStatus, extra?: Record<string, unknown>) =>
      agentService.updateStatus(workspaceId, sessionId, status, extra),
  };

  const manager = getWorkflowExecutionManager();
  if (!manager) {
    res.status(500).json({ error: 'workflow execution manager is not initialized' });
    return;
  }

  if (issue.workflowExecutionId && issue.workflowExecutionStatus === 'paused') {
    await manager.resume(issue.workflowExecutionId);
    const updated = issueService.save(workspaceId, {
      ...issue,
      status: 'in_progress',
      workflowExecutionStatus: 'running',
      lastError: undefined,
      retryPaused: false,
    });
    broadcastToWorkspace(workspaceId, 'issue.status_changed', { issueId, from: issue.status, to: 'in_progress' });
    broadcastToWorkspace(workspaceId, 'issue.updated', updated);
    res.json(updated);
    return;
  }

  const updated = issueService.prepareRetry(workspaceId, issueId, { manual: true });
  if (!updated) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }
  broadcastToWorkspace(workspaceId, 'issue.updated', updated);
  res.json(updated);
  startIssueWorkflowExecution(workspaceId, issueId, ctx).catch((err) => {
    console.error(`[issue-resume] workflow error for issue ${issueId}:`, err);
  });
});

router.post('/:issueId/interrupt', (req: Request<{ id: string; issueId: string }>, res: Response) => {
  const workspaceId = req.params.id;
  const { issueId } = req.params;
  const before = issueService.getById(workspaceId, issueId);
  if (!before) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }

  const reason = 'Interrupted by user';
  const manager = getWorkflowExecutionManager();
  if (manager && before.workflowExecutionId) {
    try {
      manager.stop(before.workflowExecutionId);
    } catch {
      // best effort
    }
  }
  if (before.channelId) stopChannelRuns(workspaceId, before.channelId);

  const issue = issueService.markStopped(workspaceId, issueId);
  if (!issue) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }
  broadcastToWorkspace(workspaceId, 'issue.status_changed', { issueId, from: before.status, to: 'stopped' });
  broadcastToWorkspace(workspaceId, 'issue.updated', issue);
  res.json(issue);
});

router.delete('/:issueId', (req: Request<{ id: string; issueId: string }>, res: Response) => {
  const { id, issueId } = req.params;
  const issue = issueService.getById(id, issueId);
  if (!issue) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }
  // 先停止该议题关联频道中所有运行中的 agent
  if (issue.channelId) {
    stopChannelRuns(id, issue.channelId);
  }
  issueService.remove(id, issueId);
  res.status(204).send();
});

router.get('/:issueId/comments', (req: Request<{ id: string; issueId: string }>, res: Response) => {
  const issue = issueService.getById(req.params.id, req.params.issueId);
  if (!issue) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }
  res.json(issueCommentService.listIssueComments(req.params.id, req.params.issueId));
});

router.post('/:issueId/comments', (req: Request<{ id: string; issueId: string }>, res: Response) => {
  const workspaceId = req.params.id;
  const { issueId } = req.params;
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  const mentions: string[] = Array.isArray(req.body.mentions)
    ? [...new Set<string>(req.body.mentions.filter((mention: unknown): mention is string => typeof mention === 'string' && Boolean(mention.trim())).map((mention: string) => mention.trim()))]
    : [];
  if (!content) {
    res.status(400).json({ error: 'content is required' });
    return;
  }

  const issue = issueService.getById(workspaceId, issueId);
  if (!issue) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }

  const comment = issueCommentService.createIssueComment(workspaceId, issueId, {
    senderId: 'user',
    content,
    source: 'user',
    metadata: mentions.length ? { mentions } : undefined,
  });
  if (!comment) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }

  broadcastToWorkspace(workspaceId, 'issue.comment.created', comment);

  if (issue.status !== 'draft') {
    const updatedIssue = issueService.updateStatus(workspaceId, issueId, 'draft');
    if (updatedIssue) {
      broadcastToWorkspace(workspaceId, 'issue.status_changed', { issueId, from: issue.status, to: updatedIssue.status });
      broadcastToWorkspace(workspaceId, 'issue.updated', updatedIssue);
    }
  }

  res.status(201).json(comment);

  if (!hasActiveIssueAutomation(workspaceId)) {
    const ctx = {
      workspaceId,
      broadcast: (event: string, data: unknown) => broadcastToWorkspace(workspaceId, event, data),
      getSession: (sessionId: string) => agentService.getById(workspaceId, sessionId),
      updateSessionStatus: (sessionId: string, status: AgentSessionStatus, extra?: Record<string, unknown>) =>
        agentService.updateStatus(workspaceId, sessionId, status, extra),
    };
    runIssueAutomation(workspaceId, issueId, ctx).catch((err) => {
      console.error(`[issue-comment] automation error for issue ${issueId}:`, err);
    });
  }
});

router.put('/:issueId/comments/:commentId', (req: Request<{ id: string; issueId: string; commentId: string }>, res: Response) => {
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  if (!content) {
    res.status(400).json({ error: 'content is required' });
    return;
  }

  const comment = issueCommentService.updateIssueComment(req.params.id, req.params.issueId, req.params.commentId, { content });
  if (!comment) {
    res.status(404).json({ error: 'comment not found' });
    return;
  }
  broadcastToWorkspace(req.params.id, 'issue.comment.updated', comment);
  res.json(comment);
});

router.delete('/:issueId/comments/:commentId', (req: Request<{ id: string; issueId: string; commentId: string }>, res: Response) => {
  const ok = issueCommentService.deleteIssueComment(req.params.id, req.params.issueId, req.params.commentId);
  if (!ok) {
    res.status(404).json({ error: 'comment not found' });
    return;
  }
  broadcastToWorkspace(req.params.id, 'issue.comment.deleted', {
    workspaceId: req.params.id,
    issueId: req.params.issueId,
    commentId: req.params.commentId,
  });
  res.status(204).send();
});

export default router;

function normalizeIssueMembers(workspaceId: string, members: string[]): string[] {
  const agentIds = new Set(agentService.listPresets(workspaceId).map((agent) => agent.id));
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const member of members) {
    if (!agentIds.has(member) || seen.has(member)) continue;
    seen.add(member);
    normalized.push(member);
  }

  return normalized;
}

function mergeWorkflowMembers(members: unknown, workflowId: unknown): string[] {
  const base = Array.isArray(members)
    ? members.filter((member): member is string => typeof member === 'string' && Boolean(member.trim())).map((member) => member.trim())
    : [];
  if (typeof workflowId !== 'string' || !workflowId.trim()) return base;
  const workflow = workflowService.getWorkflow(workflowId.trim());
  if (!workflow) return base;
  return Array.from(new Set([
    ...base,
    ...workflow.nodes.filter((n) => n.type === 'agent').map((node) => node.data.agentConfigId as string).filter(Boolean),
  ]));
}
