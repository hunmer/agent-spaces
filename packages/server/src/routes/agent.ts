import { Router } from 'express';
import type { Request, Response } from 'express';
import type { AgentConfig } from '@agent-spaces/shared';
import * as agentService from '../services/agent.js';
import { generateAgentDesign } from '../agents/agent-designer.js';

const router = Router({ mergeParams: true });

router.get('/usage/dashboard', (req: Request, res: Response) => {
  const days = Number(req.query.days ?? 30);
  res.json(agentService.usageDashboard(Number.isFinite(days) ? days : 30));
});

router.get('/presets', (req: Request<{ id: string }>, res: Response) => {
  res.json(agentService.listTemplates());
});

router.get('/presets/:presetId', (req: Request<{ id: string; presetId: string }>, res: Response) => {
  const preset = agentService.readAgentTemplate(req.params.presetId);
  if (!preset) {
    res.status(404).json({ error: 'agent preset not found' });
    return;
  }
  res.json(preset);
});

router.post('/presets', (req: Request<{ id: string }>, res: Response) => {
  const body = req.body as Omit<Partial<AgentConfig>, 'id'>;
  const preset = agentService.createPreset(req.params.id, body);
  res.status(201).json(preset);
});

router.post('/presets/generate', async (req: Request<{ id: string }>, res: Response) => {
  const { prompt } = req.body as { prompt?: string };
  if (!prompt?.trim()) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }

  try {
    res.json(await generateAgentDesign(prompt));
  } catch (err) {
    console.error('[agent-designer] generate failed', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'agent generation failed' });
  }
});

router.post('/presets/test-connection', async (req: Request<{ id: string }>, res: Response) => {
  const workspaceId = req.params.id;
  const data = req.body as Partial<AgentConfig>;
  if (workspaceId) {
    const result = await agentService.testConnection(workspaceId, data);
    if (!result) {
      res.status(404).json({ error: 'workspace not found' });
      return;
    }
    res.status(result.success ? 200 : 400).json(result);
    return;
  }
  // Global: test connection without workspace context
  const { apiBase, apiKey, modelId, modelProvider } = data;
  const result = await agentService.testConnection('', { apiBase, apiKey, modelId, modelProvider });
  if (!result) {
    res.status(400).json({ error: 'connection test failed' });
    return;
  }
  res.status(result.success ? 200 : 400).json(result);
});

router.put('/presets/:presetId', (req: Request<{ id: string; presetId: string }>, res: Response) => {
  const data = req.body as Partial<AgentConfig>;
  const preset = agentService.updatePreset(req.params.id, req.params.presetId, data);
  if (!preset) {
    res.status(404).json({ error: 'agent preset not found' });
    return;
  }
  res.json(preset);
});

router.delete('/presets/:presetId', (req: Request<{ id: string; presetId: string }>, res: Response) => {
  const workspaceId = req.params.id;
  if (workspaceId) {
    const deleted = agentService.deletePreset(workspaceId, req.params.presetId);
    if (deleted === null) {
      res.status(404).json({ error: 'workspace not found' });
      return;
    }
    if (!deleted) {
      res.status(404).json({ error: 'agent preset not found' });
      return;
    }
    res.status(204).end();
    return;
  }
  const deleted = agentService.deleteGlobalPreset(req.params.presetId);
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
  if (!agentService.isValidRole(role)) {
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
