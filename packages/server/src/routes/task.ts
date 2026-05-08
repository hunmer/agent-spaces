import { Router } from 'express';
import type { Request, Response } from 'express';
import * as taskService from '../services/task.js';
import * as issueService from '../services/issue.js';
import * as agentService from '../services/agent.js';
import { broadcastToWorkspace } from '../ws/handler.js';
import { scheduleRunnableIssueTasks } from '../agents/issue-task-controller.js';
import type { AgentSessionStatus } from '@agent-spaces/shared';

const router = Router({ mergeParams: true });

router.post('/', (req: Request<{ id: string }>, res: Response) => {
  const { issueId, title, description, agentConfigId, dependsOnTaskIds, sandboxDirs } = req.body;
  if (!issueId || !title) {
    res.status(400).json({ error: 'issueId and title are required' });
    return;
  }

  const issue = issueService.getById(req.params.id, issueId);
  if (!issue) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }

  const task = taskService.create(req.params.id, issueId, {
    title,
    description: description || '',
    agentConfigId,
    dependsOnTaskIds,
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

router.put('/reorder', (req: Request<{ id: string }>, res: Response) => {
  const { issueId, taskIds } = req.body as { issueId?: string; taskIds?: string[] };
  if (!issueId || !Array.isArray(taskIds)) {
    res.status(400).json({ error: 'issueId and taskIds are required' });
    return;
  }

  const issue = issueService.getById(req.params.id, issueId);
  if (!issue) {
    res.status(404).json({ error: 'issue not found' });
    return;
  }

  issueService.replaceTasks(req.params.id, issueId, taskIds);
  const updated = issueService.getById(req.params.id, issueId);
  res.json(updated);
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
  const { title, description, agentConfigId, dependsOnTaskIds, sandboxDirs } = req.body;
  if (!title && description === undefined && agentConfigId === undefined && dependsOnTaskIds === undefined && sandboxDirs === undefined) {
    res.status(400).json({ error: 'title, description, agentConfigId, dependsOnTaskIds, or sandboxDirs is required' });
    return;
  }

  const task = taskService.update(req.params.id, req.params.taskId, { title, description, agentConfigId, dependsOnTaskIds, sandboxDirs });
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
  if (task.status === 'running' || task.status === 'reviewing') {
    res.status(409).json({ error: 'active tasks cannot be deleted' });
    return;
  }

  taskService.remove(req.params.id, req.params.taskId);
  res.status(204).send();
});

router.post('/:taskId/retry', (req: Request<{ id: string; taskId: string }>, res: Response) => {
  const workspaceId = req.params.id;
  const original = taskService.getById(workspaceId, req.params.taskId);
  if (!original) {
    res.status(404).json({ error: 'task not found' });
    return;
  }

  const task = taskService.resetForRetry(workspaceId, req.params.taskId, { resetRetryCount: true });
  if (!task) {
    res.status(404).json({ error: 'task not found' });
    return;
  }
  broadcastToWorkspace(workspaceId, 'task.status_changed', { taskId: task.id, from: original.status, to: task.status });
  broadcastToWorkspace(workspaceId, 'task.updated', task);

  const issue = issueService.getById(workspaceId, task.issueId);
  if (issue?.status === 'error') {
    const updatedIssue = issueService.prepareRetry(workspaceId, issue.id, { manual: true });
    if (updatedIssue) {
      broadcastToWorkspace(workspaceId, 'issue.status_changed', { issueId: issue.id, from: issue.status, to: updatedIssue.status });
      broadcastToWorkspace(workspaceId, 'issue.updated', updatedIssue);
    }
  }

  res.json(task);

  const ctx = {
    workspaceId,
    broadcast: (event: string, data: unknown) => broadcastToWorkspace(workspaceId, event, data),
    getSession: (sessionId: string) => agentService.getById(workspaceId, sessionId),
    updateSessionStatus: (sessionId: string, status: AgentSessionStatus, extra?: Record<string, unknown>) =>
      agentService.updateStatus(workspaceId, sessionId, status, extra),
  };
  scheduleRunnableIssueTasks(workspaceId, task.issueId, ctx).catch((err) => {
    console.error(`[task-retry] scheduling error for task ${task.id}:`, err);
  });
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
