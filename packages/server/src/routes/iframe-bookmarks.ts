import { Router } from 'express';
import type { Request, Response } from 'express';
import * as store from '../storage/iframe-bookmarks-store.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(store.listBookmarks());
});

router.post('/', (req: Request, res: Response) => {
  const { title, url, size } = req.body;
  if (!title || !url) {
    res.status(400).json({ error: 'title and url are required' });
    return;
  }
  res.status(201).json(store.addBookmark({ title, url, size }));
});

router.delete('/:id', (req: Request<{ id: string }>, res: Response) => {
  const ok = store.removeBookmark(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'bookmark not found' });
    return;
  }
  res.json({ ok: true });
});

export default router;
