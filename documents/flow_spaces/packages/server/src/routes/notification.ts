import { Router } from 'express';
import type { Request, Response } from 'express';
import * as nc from '../services/notification-center.js';

type Params = { id: string; notificationId?: string };

const router = Router({ mergeParams: true });

router.get('/', (req: Request<Params>, res: Response) => {
  const workspaceId = req.params.id;
  res.json(nc.listNotifications(workspaceId));
});

router.post('/', (req: Request<Params>, res: Response) => {
  const workspaceId = req.params.id;
  const { type, title, description, data } = req.body;
  if (!type || !title) {
    res.status(400).json({ error: 'type and title are required' });
    return;
  }
  const notification = nc.createNotification(workspaceId, type, title, description, data ?? {});
  res.status(201).json(notification);
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
  nc.markAllRead(workspaceId);
  res.json({ ok: true });
});

router.delete('/', (req: Request<Params>, res: Response) => {
  const workspaceId = req.params.id;
  nc.clearAll(workspaceId);
  res.json({ ok: true });
});

router.delete('/:notificationId', (req: Request<Params, { id: string; notificationId: string }>, res: Response) => {
  const workspaceId = req.params.id;
  const notificationId = req.params.notificationId!;
  const removed = nc.removeNotification(workspaceId, notificationId);
  if (!removed) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ ok: true });
});

export default router;
