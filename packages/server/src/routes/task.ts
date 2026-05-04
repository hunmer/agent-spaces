import { Router } from 'express';
import type { Request, Response } from 'express';
import * as taskService from '../services/task.js';
import * as issueService from '../services/issue.js';

const router = Router({ mergeParams: true });

router.post('/', (req: Request<{ id: string }>, res: Response) => {
  const { issueId, title, description, sandboxDirs } = req.body;
  if (!issueId || !title) {
    res.status(400).json({ error: 'issueId and title are required' });
    return;
  }

  const issue = issueService.getById(req.params.id, issueId);
  if (!issue) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }
  if (issue.status !== 'draft' && issue.status !== 'planned') {
    res.status(409).json({ error: 'tasks can only be added to draft or planned issues' });
    return;
  }

  const task = taskService.create(req.params.id, issueId, {
    title,
    description: description || '',
    sandboxDirs,
  });

  issueService.addTask(req.params.id, issueId, task.id);

  res.status(201).json(task);
});

router.get('/', (req: Request<{ id: string }>, res: Response) => {
  const issueId = req.query.issueId as string | undefined;
  const tasks = taskService.list(req.params.id, issueId);
  res.json(tasks);
});

router.get('/:taskId', (req: Request<{ id: string; taskId: string }>, res: Response) => {
  const task = taskService.getById(req.params.id, req.params.taskId);
  if (!task) {
    res.status(404).json({ error: 'task not found' });
    return;
  }
  res.json(task);
});

router.put('/:taskId', (req: Request<{ id: string; taskId: string }>, res: Response) => {
  const { title, description } = req.body;
  if (!title && description === undefined) {
    res.status(400).json({ error: 'title or description is required' });
    return;
  }

  const task = taskService.update(req.params.id, req.params.taskId, { title, description });
  if (!task) {
    res.status(404).json({ error: 'task not found or not editable (must be pending)' });
    return;
  }
  res.json(task);
});

router.delete('/:taskId', (req: Request<{ id: string; taskId: string }>, res: Response) => {
  const task = taskService.getById(req.params.id, req.params.taskId);
  if (!task) {
    res.status(404).json({ error: 'task not found' });
    return;
  }
  if (task.status !== 'pending') {
    res.status(409).json({ error: 'only pending tasks can be deleted' });
    return;
  }

  taskService.remove(req.params.id, req.params.taskId);
  res.status(204).send();
});

router.post('/:taskId/retry', (req: Request<{ id: string; taskId: string }>, res: Response) => {
  const task = taskService.retry(req.params.id, req.params.taskId);
  if (!task) {
    res.status(404).json({ error: 'task not found' });
    return;
  }
  res.json(task);
});

router.post('/:taskId/cancel', (req: Request<{ id: string; taskId: string }>, res: Response) => {
  const task = taskService.cancel(req.params.id, req.params.taskId);
  if (!task) {
    res.status(404).json({ error: 'task not found' });
    return;
  }
  res.json(task);
});

export default router;
