import { Router } from 'express';
import type { Request, Response } from 'express';
import * as issueService from '../services/issue.js';

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
  const { title, description, status } = req.body;
  if (title) issue.title = title;
  if (description) issue.description = description;
  if (status) {
    const updated = issueService.updateStatus(req.params.id, req.params.issueId, status);
    res.json(updated);
    return;
  }
  res.json(issue);
});

router.post('/:issueId/start', (req: Request<{ id: string; issueId: string }>, res: Response) => {
  const issue = issueService.updateStatus(req.params.id, req.params.issueId, 'planned');
  if (!issue) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }
  res.json(issue);
});

export default router;
