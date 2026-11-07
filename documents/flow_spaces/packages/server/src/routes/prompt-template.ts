import { Router } from 'express';
import {
  listPromptTemplates,
  createPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  applyPromptToAgents,
  listAgentCandidates,
} from '../services/prompt-template.js';
import type { Request, Response } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(listPromptTemplates());
});

router.post('/', (req: Request, res: Response) => {
  const { name, content, storeId } = req.body as { name?: string; content?: string; storeId?: string };
  if (!name || !content) {
    res.status(400).json({ error: 'name and content required' });
    return;
  }
  res.json(createPromptTemplate(name, content, storeId));
});

router.put('/:id', (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
  const data = req.body as { name?: string; content?: string };
  const tmpl = updatePromptTemplate(id, data);
  if (!tmpl) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json(tmpl);
});

router.delete('/:id', (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
  const ok = deletePromptTemplate(id);
  if (!ok) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json({ success: true });
});

router.post('/:id/apply', (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
  const { agentIds } = req.body as { agentIds?: string[] };
  if (!Array.isArray(agentIds) || agentIds.length === 0) {
    res.status(400).json({ error: 'agentIds required' });
    return;
  }
  const applied = applyPromptToAgents(id, agentIds);
  res.json({ applied });
});

router.get('/agents', (_req: Request, res: Response) => {
  res.json(listAgentCandidates());
});

export default router;
