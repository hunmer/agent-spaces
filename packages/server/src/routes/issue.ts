import { Router } from 'express';
import type { Request, Response } from 'express';
import * as issueService from '../services/issue.js';
import * as issueCommentService from '../services/issue-comment.js';
import { getWorkspace } from '../storage/workspace-store.js';

const router = Router({ mergeParams: true });

router.get('/', (req: Request<{ id: string }>, res: Response) => {
  const status = req.query.status as string | undefined;
  const issues = issueService.list(req.params.id, status as any);
  res.json(issues);
});

router.post('/', (req: Request<{ id: string }>, res: Response) => {
  const { title, description } = req.body;
  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  const issue = issueService.create(req.params.id, { title, description: description || '' });
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
  if (members) issue.members = normalizeIssueMembers(req.params.id, members);
  if (status) {
    const updated = issueService.updateStatus(req.params.id, req.params.issueId, status, { title: issue.title, description: issue.description });
    res.json(updated);
    return;
  }
  const saved = issueService.save(req.params.id, issue);
  res.json(saved);
});

router.post('/:issueId/start', (req: Request<{ id: string; issueId: string }>, res: Response) => {
  const issue = issueService.updateStatus(req.params.id, req.params.issueId, 'planned');
  if (!issue) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }
  res.json(issue);
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
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  if (!content) {
    res.status(400).json({ error: 'content is required' });
    return;
  }

  const comment = issueCommentService.createIssueComment(req.params.id, req.params.issueId, {
    senderId: 'user',
    content,
    source: 'user',
  });
  if (!comment) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }
  res.status(201).json(comment);
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
