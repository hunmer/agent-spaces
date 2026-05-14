import { Router } from 'express';
import type { Request, Response } from 'express';
import * as nc from '../services/notification-center.js';

type Params = { id: string; notificationId?: string };

const router = Router({ mergeParams: true });

router.get('/', (req: Request<Params>, res: Response) => {
  const workspaceId = req.params.id;
  res.json(nc.listNotifications(workspaceId));
});

router.put('/:notificationId/read', (req: Request<Params>, res: Response) => {
  const workspaceId = req.params.id;
  const notificationId = req.params.notificationId!;
  const n = nc.markRead(workspaceId, notificationId);
  if (!n) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(n);
});

router.put('/read-all', (req: Request<Params>, res: Response) => {
  const workspaceId = req.params.id;
  const notifications = nc.listNotifications(workspaceId);
  for (const n of notifications) nc.markRead(workspaceId, n.id);
  res.json({ ok: true });
});

router.delete('/', (req: Request<Params>, res: Response) => {
  const workspaceId = req.params.id;
  nc.clearAll(workspaceId);
  res.json({ ok: true });
});

export default router;
