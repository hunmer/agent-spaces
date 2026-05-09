import { Router } from 'express';
import { listSkills, importSkill, toggleFavorite, updateSkillContent, deleteSkill, checkSkillSync, syncSkills } from '../services/skill.js';
import type { Request, Response } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(listSkills());
});

router.get('/sync-check', (_req: Request, res: Response) => {
  res.json(checkSkillSync());
});

router.post('/sync', (req: Request, res: Response) => {
  const { items } = req.body as { items?: Array<{ agentId: string; skillName: string }> };
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'items required' });
    return;
  }
  const synced = syncSkills(items);
  res.json({ synced });
});

router.post('/import', (req: Request, res: Response) => {
  const { filename, content } = req.body as { filename?: string; content?: string };
  if (!filename || !content) {
    res.status(400).json({ error: 'filename and content required' });
    return;
  }
  const skill = importSkill(filename, content);
  res.json(skill);
});

router.post('/:name/favorite', (req: Request, res: Response) => {
  const name = typeof req.params.name === 'string' ? req.params.name : req.params.name[0];
  const favorited = toggleFavorite(name);
  res.json({ favorited });
});

router.put('/:name', (req: Request, res: Response) => {
  const name = typeof req.params.name === 'string' ? req.params.name : req.params.name[0];
  const { content } = req.body as { content?: string };
  if (content === undefined) {
    res.status(400).json({ error: 'content required' });
    return;
  }
  const ok = updateSkillContent(name, content);
  if (!ok) {
    res.status(404).json({ error: 'Skill not found' });
    return;
  }
  res.json({ success: true });
});

router.delete('/:name', (req: Request, res: Response) => {
  const name = typeof req.params.name === 'string' ? req.params.name : req.params.name[0];
  const ok = deleteSkill(name);
  if (!ok) {
    res.status(404).json({ error: 'Skill not found' });
    return;
  }
  res.json({ success: true });
});

export default router;
