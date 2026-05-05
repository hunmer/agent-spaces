import { Router } from 'express';
import { exec } from 'child_process';
import * as wsService from '../services/workspace.js';
import * as agentService from '../services/agent.js';
import { readWorkspacePrompt, writeWorkspacePrompt } from '../services/workspace-prompt.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(wsService.getAll());
});

router.post('/', (req, res) => {
  const { name, boundDirs } = req.body;
  if (!name || !boundDirs?.length) {
    res.status(400).json({ error: 'name and boundDirs are required' });
    return;
  }
  const ws = wsService.create({ name, boundDirs });
  res.status(201).json(ws);
});

router.get('/:id', (req, res) => {
  const ws = wsService.getById(req.params.id);
  if (!ws) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  res.json(ws);
});

router.get('/:id/prompt', (req, res) => {
  const ws = wsService.getById(req.params.id);
  if (!ws) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  res.json({ prompt: readWorkspacePrompt(req.params.id) });
});

router.put('/:id/prompt', (req, res) => {
  const { prompt } = req.body as { prompt?: unknown };
  if (typeof prompt !== 'string') {
    res.status(400).json({ error: 'prompt must be a string' });
    return;
  }

  const saved = writeWorkspacePrompt(req.params.id, prompt);
  if (saved === null) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  res.json({ prompt: saved });
});

router.get('/:id/agent-templates', (req, res) => {
  const ws = wsService.getById(req.params.id);
  if (!ws) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  const workspaceAgentIds = new Set((ws.agents || []).map((agent) => agent.id));
  res.json(agentService.listTemplates().filter((agent) => !workspaceAgentIds.has(agent.id)));
});

router.post('/:id/agents/from-templates', (req, res) => {
  const { agentIds } = req.body as { agentIds?: string[] };
  if (!Array.isArray(agentIds) || agentIds.length === 0) {
    res.status(400).json({ error: 'agentIds are required' });
    return;
  }

  const added = agentService.addTemplatesToWorkspace(req.params.id, agentIds);
  if (!added) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  res.status(201).json(added);
});

router.put('/:id', (req, res) => {
  const ws = wsService.update(req.params.id, req.body);
  if (!ws) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  res.json(ws);
});

router.delete('/:id', (req, res) => {
  if (!wsService.remove(req.params.id)) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  res.status(204).end();
});

router.post('/:id/reveal', (req, res) => {
  const ws = wsService.getById(req.params.id);
  if (!ws) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  const dir = ws.boundDirs?.[0];
  if (!dir) {
    res.status(400).json({ error: 'Workspace has no bound directory' });
    return;
  }

  console.log('[reveal:workspace] workspace:', ws.id, 'dir:', dir);

  const cmd = process.platform === 'darwin'
    ? `open "${dir}"`
    : process.platform === 'win32'
      ? `explorer "${dir}"`
      : `xdg-open "${dir}"`;

  console.log('[reveal:workspace] platform:', process.platform, 'cmd:', cmd);

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error('[reveal:workspace] failed:', err.message, 'stderr:', stderr);
      res.status(500).json({ error: 'Failed to reveal directory', detail: err.message });
      return;
    }
    if (stdout) console.log('[reveal:workspace] stdout:', stdout);
    if (stderr) console.log('[reveal:workspace] stderr:', stderr);
    res.json({ success: true, path: dir });
  });
});

export default router;
