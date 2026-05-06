import { Router } from 'express';
import type { Request, Response } from 'express';
import type { AgentConfig } from '@agent-spaces/shared';
import * as agentService from '../services/agent.js';

const router = Router({ mergeParams: true });

router.get('/usage/dashboard', (req: Request, res: Response) => {
  const days = Number(req.query.days ?? 30);
  res.json(agentService.usageDashboard(Number.isFinite(days) ? days : 30));
});

router.get('/presets', (req: Request<{ id: string }>, res: Response) => {
  const presets = agentService.listPresets(req.params.id);
  if (!presets) {
    res.status(404).json({ error: 'workspace not found' });
    return;
  }
  res.json(presets);
});

router.post('/presets', (req: Request<{ id: string }>, res: Response) => {
  const preset = agentService.createPreset(req.params.id, req.body as Omit<Partial<AgentConfig>, 'id'>);
  if (!preset) {
    res.status(404).json({ error: 'workspace not found' });
    return;
  }
  res.status(201).json(preset);
});

router.post('/presets/test-connection', async (req: Request<{ id: string }>, res: Response) => {
  const result = await agentService.testConnection(req.params.id, req.body as Partial<AgentConfig>);
  if (!result) {
    res.status(404).json({ error: 'workspace not found' });
    return;
  }
  res.status(result.success ? 200 : 400).json(result);
});

router.put('/presets/:presetId', (req: Request<{ id: string; presetId: string }>, res: Response) => {
  const preset = agentService.updatePreset(req.params.id, req.params.presetId, req.body as Partial<AgentConfig>);
  if (!preset) {
    res.status(404).json({ error: 'agent preset not found' });
    return;
  }
  res.json(preset);
});

router.delete('/presets/:presetId', (req: Request<{ id: string; presetId: string }>, res: Response) => {
  const deleted = agentService.deletePreset(req.params.id, req.params.presetId);
  if (deleted === null) {
    res.status(404).json({ error: 'workspace not found' });
    return;
  }
  if (!deleted) {
    res.status(404).json({ error: 'agent preset not found' });
    return;
  }
  res.status(204).end();
});

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
  const validRoles = ['scheduler', 'planner', 'executor', 'reviewer', 'custom', 'bot'];
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
