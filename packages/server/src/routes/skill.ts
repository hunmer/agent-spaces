import { Router } from 'express';
import { exec } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { listSkills, importSkill, importSkillsBatch, importSkillFromStore, toggleFavorite, updateSkillContent, deleteSkill, checkSkillSync, syncSkills, importSkillsFromGit, listSkillFiles, readSkillFile, writeSkillFile } from '../services/skill.js';
import { getDataDir } from '../storage/json-store.js';
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
  const { filename, content, group } = req.body as { filename?: string; content?: string; group?: string };
  if (!filename || !content) {
    res.status(400).json({ error: 'filename and content required' });
    return;
  }
  const skill = importSkill(filename, content, group);
  res.json(skill);
});

router.post('/import-batch', (req: Request, res: Response) => {
  const { items } = req.body as { items?: Array<{ name: string; content: string; group?: string; files?: Array<{ path: string; content: string }> }> };
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'items required' });
    return;
  }
  const skills = importSkillsBatch(items);
  res.json(skills);
});

router.post('/import-store', (req: Request, res: Response) => {
  const { path, group } = req.body as { path?: string; group?: string };
  if (!path) {
    res.status(400).json({ error: 'path required' });
    return;
  }
  const skill = importSkillFromStore(path, group || '');
  if (!skill) {
    res.status(404).json({ error: 'Store skill not found' });
    return;
  }
  res.json(skill);
});

router.post('/import-git', (req: Request, res: Response) => {
  const { url } = req.body as { url?: string };
  if (!url) {
    res.status(400).json({ error: 'url required' });
    return;
  }
  try {
    const skills = importSkillsFromGit(url);
    res.json(skills);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Git clone failed' });
  }
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

router.get('/:name/files', (req: Request, res: Response) => {
  const name = typeof req.params.name === 'string' ? req.params.name : req.params.name[0];
  const files = listSkillFiles(name);
  res.json(files);
});

router.get('/:name/files/{*filePath}', (req: Request, res: Response) => {
  const name = typeof req.params.name === 'string' ? req.params.name : req.params.name[0];
  const filePath = Array.isArray(req.params.filePath) ? req.params.filePath.join('/') : req.params.filePath as string;
  if (!filePath) {
    res.status(400).json({ error: 'file path required' });
    return;
  }
  const content = readSkillFile(name, filePath);
  if (content === null) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  res.json({ content });
});

router.put('/:name/files/{*filePath}', (req: Request, res: Response) => {
  const name = typeof req.params.name === 'string' ? req.params.name : req.params.name[0];
  const filePath = Array.isArray(req.params.filePath) ? req.params.filePath.join('/') : req.params.filePath as string;
  const { content } = req.body as { content?: string };
  if (!filePath || content === undefined) {
    res.status(400).json({ error: 'file path and content required' });
    return;
  }
  const ok = writeSkillFile(name, filePath, content);
  if (!ok) {
    res.status(400).json({ error: 'Failed to write file' });
    return;
  }
  res.json({ success: true });
});

router.post('/:name/reveal', (req: Request, res: Response) => {
  const name = typeof req.params.name === 'string' ? req.params.name : req.params.name[0];
  const skillDir = join(getDataDir(), 'skills', name);
  if (!existsSync(skillDir)) {
    res.status(404).json({ error: 'Skill folder not found' });
    return;
  }
  const cmd = process.platform === 'darwin'
    ? `open "${skillDir}"`
    : process.platform === 'win32'
      ? `explorer "${skillDir}"`
      : `xdg-open "${skillDir}"`;
  exec(cmd, (err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to reveal', detail: err.message });
      return;
    }
    res.json({ ok: true, path: skillDir });
  });
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
