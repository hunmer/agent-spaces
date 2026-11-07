import { Router } from 'express';
import type { Request, Response } from 'express';
import { installSkillsPackageFromUrl, installSkillsPackage, uninstallSkillsPackage } from '../services/skills-package.js';

const router = Router();

/**
 * POST /api/skills-packages/install
 * body: { zipUrl: string }  // 商店 zip 的完整 URL（前端已拼好 base）
 *   或 { zipBase64: string } // 直接传 zip 内容（base64）
 *
 * 返回 { agent, skills, created }
 */
router.post('/install', async (req: Request, res: Response) => {
  const { zipUrl, zipBase64 } = req.body as { zipUrl?: string; zipBase64?: string };

  try {
    let result;
    if (zipBase64) {
      const buf = Buffer.from(zipBase64, 'base64');
      result = await installSkillsPackage(buf);
    } else if (zipUrl) {
      result = await installSkillsPackageFromUrl(zipUrl);
    } else {
      res.status(400).json({ error: 'zipUrl or zipBase64 is required' });
      return;
    }
    res.status(201).json(result);
  } catch (err) {
    console.error('[skills-packages] install failed', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'install failed' });
  }
});

/**
 * DELETE /api/skills-packages/:slug
 * 按 templateId === slug 定位并删除对应 agent 模板（含私有 skills）。
 */
router.delete('/:slug', (req: Request, res: Response) => {
  const slug = typeof req.params.slug === 'string' ? req.params.slug : req.params.slug[0];
  if (!slug) {
    res.status(400).json({ error: 'slug is required' });
    return;
  }
  const deleted = uninstallSkillsPackage(slug);
  if (!deleted) {
    res.status(404).json({ error: 'package not installed' });
    return;
  }
  res.status(204).end();
});

export default router;
