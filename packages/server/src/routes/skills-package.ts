import { Router } from 'express';
import type { Request, Response } from 'express';
import { installSkillsPackageFromUrl, installSkillsPackage } from '../services/skills-package.js';

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

export default router;
