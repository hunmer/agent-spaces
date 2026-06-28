import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  getCatalog,
  refreshCatalog,
  getCatalogMeta,
  refreshProviderIcons,
} from '../storage/model-catalog-store.js';

const router = Router();

// 读取本地 catalog（首次不存在则自动下载保存）
router.get('/', async (_req: Request, res: Response) => {
  try {
    res.json(await getCatalog());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load catalog' });
  }
});

// 元信息（更新时间 / 数量）
router.get('/meta', async (_req: Request, res: Response) => {
  try {
    res.json(await getCatalogMeta());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load catalog meta' });
  }
});

// 强制刷新 catalog（重新请求 models.dev）
router.post('/refresh', async (_req: Request, res: Response) => {
  try {
    await refreshCatalog();
    res.json(await getCatalogMeta());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to refresh catalog' });
  }
});

// 一键更新所有 provider 图标到 public/provider-icons/
router.post('/refresh-icons', async (_req: Request, res: Response) => {
  try {
    res.json(await refreshProviderIcons());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to refresh provider icons' });
  }
});

export default router;
