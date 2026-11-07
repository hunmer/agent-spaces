import { Router } from 'express';
import {
  listOutputStyles,
  createOutputStyle,
  updateOutputStyle,
  deleteOutputStyle,
  applyOutputStyleToAgents,
  listOutputStyleAgentCandidates,
} from '../services/output-style.js';
import type { Request, Response } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(listOutputStyles());
});

router.get('/agents', (_req: Request, res: Response) => {
  res.json(listOutputStyleAgentCandidates());
});

router.post('/', (req: Request, res: Response) => {
  const { name, content, storeId, description } = req.body as { name?: string; content?: string; storeId?: string; description?: string };
  if (!name || !content) {
    res.status(400).json({ error: 'name and content required' });
    return;
  }
  res.json(createOutputStyle(name, content, storeId, description));
});

router.put('/:id', (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
  const data = req.body as { name?: string; description?: string; content?: string };
  const tmpl = updateOutputStyle(id, data);
  if (!tmpl) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(tmpl);
});

router.delete('/:id', (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
  const ok = deleteOutputStyle(id);
  if (!ok) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ success: true });
});

router.post('/:id/apply', (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
  const { agentIds } = req.body as { agentIds?: string[] };
  if (!agentIds?.length) {
    res.status(400).json({ error: 'agentIds required' });
    return;
  }
  const applied = applyOutputStyleToAgents(id, agentIds);
  res.json({ applied });
});

export default router;
