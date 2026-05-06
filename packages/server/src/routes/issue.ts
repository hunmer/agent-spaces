import { Router } from 'express';
import type { Request, Response } from 'express';
import type { AgentSessionStatus } from '@agent-spaces/shared';
import * as issueService from '../services/issue.js';
import * as issueCommentService from '../services/issue-comment.js';
import * as channelService from '../services/channel.js';
import { broadcastToWorkspace } from '../ws/handler.js';
import { getWorkspace } from '../storage/workspace-store.js';
import * as agentService from '../services/agent.js';
import { retryIssue } from '../services/issue-retry.js';
import { hasActiveIssueAutomation, runIssueAutomation, shouldForcePlannerFromMentions } from '../agents/issue-agent-runner.js';

const router = Router({ mergeParams: true });

router.get('/', (req: Request<{ id: string }>, res: Response) => {
  const status = req.query.status as string | undefined;
  const issues = issueService.list(req.params.id, status as any);
  res.json(issues);
});

router.post('/', (req: Request<{ id: string }>, res: Response) => {
  const { title, description, members } = req.body;
  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  const issue = issueService.create(req.params.id, { title, description: description || '', members });
  const channel = issue.channelId ? channelService.getChannel(req.params.id, issue.channelId) : null;
  if (channel) broadcastToWorkspace(req.params.id, 'channel.updated', channel);
  broadcastToWorkspace(req.params.id, 'issue.created', issue);
  res.status(201).json(issue);
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
  const { title, description, status, members } = req.body;
  if (title) issue.title = title;
  if (description !== undefined) issue.description = description;
  if (members) {
    issue.members = normalizeIssueMembers(req.params.id, members);
    if (issue.channelId) {
      const updatedChannel = channelService.updateChannel(req.params.id, issue.channelId, { members: ['user', ...issue.members] });
      if (updatedChannel) broadcastToWorkspace(req.params.id, 'channel.updated', updatedChannel);
    }
  }
  if (status) {
    const updated = issueService.updateStatus(req.params.id, req.params.issueId, status, { title: issue.title, description: issue.description });
    broadcastToWorkspace(req.params.id, 'issue.updated', updated);
    res.json(updated);
    return;
  }
  const saved = issueService.save(req.params.id, issue);
  broadcastToWorkspace(req.params.id, 'issue.updated', saved);
  res.json(saved);
});

router.post('/:issueId/start', (req: Request<{ id: string; issueId: string }>, res: Response) => {
  const workspaceId = req.params.id;
  const { issueId } = req.params;
  const before = issueService.getById(workspaceId, issueId);
  const issue = issueService.updateStatus(workspaceId, issueId, 'planned');
  if (!issue) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }
  broadcastToWorkspace(workspaceId, 'issue.status_changed', { issueId, from: before?.status ?? 'draft', to: 'planned' });
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
  runIssueAutomation(workspaceId, issueId, ctx).catch((err) => {
    console.error(`[issue-start] automation error for issue ${issueId}:`, err);
  });
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

  const result = await retryIssue(workspaceId, issueId, ctx, { manual: true });
  if (!result.issue) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }
  res.json(result.issue);
});

router.delete('/:issueId', (req: Request<{ id: string; issueId: string }>, res: Response) => {
  const ok = issueService.remove(req.params.id, req.params.issueId);
  if (!ok) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }
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
    runIssueAutomation(workspaceId, issueId, ctx, {
      forcePlanner: shouldForcePlannerFromMentions(workspaceId, mentions),
    }).catch((err) => {
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
  res.json(comment);
});

router.delete('/:issueId/comments/:commentId', (req: Request<{ id: string; issueId: string; commentId: string }>, res: Response) => {
  const ok = issueCommentService.deleteIssueComment(req.params.id, req.params.issueId, req.params.commentId);
  if (!ok) {
    res.status(404).json({ error: 'comment not found' });
    return;
  }
  res.status(204).send();
});

export default router;

function normalizeIssueMembers(workspaceId: string, members: string[]): string[] {
  const agentIds = new Set((getWorkspace(workspaceId)?.agents || []).map((agent) => agent.id));
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const member of members) {
    if (!agentIds.has(member) || seen.has(member)) continue;
    seen.add(member);
    normalized.push(member);
  }

  return normalized;
}
