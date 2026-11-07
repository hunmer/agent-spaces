import { Router } from 'express';
import type { Request, Response } from 'express';
import { listAllNotifications } from '../services/notification-center.js';

const router = Router();

// 聚合所有 workspace 的通知，用于主页 / 无选中 workspace 场景
router.get('/', (_req: Request, res: Response) => {
  res.json(listAllNotifications());
});

export default router;
