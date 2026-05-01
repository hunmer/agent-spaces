import { Router } from 'express';
import type { Request, Response } from 'express';
import * as agentService from '../services/agent.js';

const router = Router({ mergeParams: true });

router.get('/', (req: Request<{ id: string }>, res: Response) => {
  const sessions = agentService.list(req.params.id);
  res.json(sessions);
});

router.post('/start', (req: Request<{ id: string }>, res: Response) => {
  const { role, issueId } = req.body as { role: string; issueId?: string };
  if (!role) {
    res.status(400).json({ error: 'role is required' });
    return;
  }
  const validRoles = ['scheduler', 'planner', 'executor', 'reviewer'];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: `invalid role: ${role}` });
    return;
  }
  const session = agentService.create(req.params.id, role as any);
  res.status(201).json(session);
});

router.post('/:agentId/stop', (req: Request<{ id: string; agentId: string }>, res: Response) => {
  const session = agentService.complete(req.params.id, req.params.agentId);
  if (!session) {
    res.status(404).json({ error: 'agent session not found' });
    return;
  }
  res.json(session);
});

router.get('/:agentId', (req: Request<{ id: string; agentId: string }>, res: Response) => {
  const session = agentService.getById(req.params.id, req.params.agentId);
  if (!session) {
    res.status(404).json({ error: 'agent session not found' });
    return;
  }
  res.json(session);
});

export default router;
