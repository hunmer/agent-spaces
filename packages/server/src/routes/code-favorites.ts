import { Router } from 'express';
import type { Request, Response } from 'express';
import * as svc from '../services/code-favorites.js';

const router = Router({ mergeParams: true });

router.get('/', (req: Request<{ id: string }>, res: Response) => {
  const workspaceId = req.params.id;
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId required' }); return; }
  try {
    res.json(svc.listFavorites(workspaceId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', (req: Request<{ id: string }>, res: Response) => {
  const workspaceId = req.params.id;
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId required' }); return; }
  try {
    const fav = svc.addFavorite(workspaceId, req.body);
    res.status(201).json(fav);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:favId', (req: Request<{ id: string; favId: string }>, res: Response) => {
  const { id: workspaceId, favId } = req.params;
  if (!workspaceId || !favId) { res.status(400).json({ error: 'workspaceId and favId required' }); return; }
  try {
    svc.removeFavorite(workspaceId, favId);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/', (req: Request<{ id: string }>, res: Response) => {
  const workspaceId = req.params.id;
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId required' }); return; }
  try {
    svc.clearFavorites(workspaceId);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
