import { Router } from 'express';
import {
  listAgentsWithCommands,
  listAllCommands,
  listCommands,
  getCommand,
  createCommand,
  updateCommand,
  deleteCommand,
  applyCommandToAgents,
} from '../services/agent-commands.js';
import type { Request, Response } from 'express';

const router = Router();

router.get('/agents', (_req: Request, res: Response) => {
  res.json(listAgentsWithCommands());
});

router.get('/all', (_req: Request, res: Response) => {
  res.json(listAllCommands());
});

router.get('/:agentId', (req: Request, res: Response) => {
  const agentId = typeof req.params.agentId === 'string' ? req.params.agentId : req.params.agentId[0];
  res.json(listCommands(agentId));
});

router.get('/:agentId/:name', (req: Request, res: Response) => {
  const agentId = typeof req.params.agentId === 'string' ? req.params.agentId : req.params.agentId[0];
  const name = typeof req.params.name === 'string' ? req.params.name : req.params.name[0];
  const group = req.query.group as string | undefined;
  const cmd = getCommand(agentId, name, group);
  if (!cmd) {
    res.status(404).json({ error: 'Command not found' });
    return;
  }
  res.json(cmd);
});

router.post('/:agentId', (req: Request, res: Response) => {
  const agentId = typeof req.params.agentId === 'string' ? req.params.agentId : req.params.agentId[0];
  const { name, content, group } = req.body as { name?: string; content?: string; group?: string };
  if (!name || !content) {
    res.status(400).json({ error: 'name and content required' });
    return;
  }
  res.json(createCommand(agentId, name, content, group));
});

router.put('/:agentId/:name', (req: Request, res: Response) => {
  const agentId = typeof req.params.agentId === 'string' ? req.params.agentId : req.params.agentId[0];
  const name = typeof req.params.name === 'string' ? req.params.name : req.params.name[0];
  const { content, group } = req.body as { content?: string; group?: string };
  if (!content) {
    res.status(400).json({ error: 'content required' });
    return;
  }
  const cmd = updateCommand(agentId, name, content, group);
  if (!cmd) {
    res.status(404).json({ error: 'Command not found' });
    return;
  }
  res.json(cmd);
});

router.delete('/:agentId/:name', (req: Request, res: Response) => {
  const agentId = typeof req.params.agentId === 'string' ? req.params.agentId : req.params.agentId[0];
  const name = typeof req.params.name === 'string' ? req.params.name : req.params.name[0];
  const group = req.query.group as string | undefined;
  const ok = deleteCommand(agentId, name, group);
  if (!ok) {
    res.status(404).json({ error: 'Command not found' });
    return;
  }
  res.json({ success: true });
});

router.post('/:agentId/:name/apply', (req: Request, res: Response) => {
  const agentId = typeof req.params.agentId === 'string' ? req.params.agentId : req.params.agentId[0];
  const name = typeof req.params.name === 'string' ? req.params.name : req.params.name[0];
  const { group, agentIds } = req.body as { group?: string; agentIds?: string[] };
  if (!Array.isArray(agentIds) || agentIds.length === 0) {
    res.status(400).json({ error: 'agentIds required' });
    return;
  }
  const applied = applyCommandToAgents(agentId, name, group || '', agentIds);
  res.json({ applied });
});

export default router;
