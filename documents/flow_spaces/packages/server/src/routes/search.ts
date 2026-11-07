import { Router, type Request, type Response } from 'express';
import * as searchService from '../services/search.js';
import * as fileService from '../services/file.js';

const router = Router({ mergeParams: true });

router.get('/code', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const q = req.query.q as string;
  if (!q) { res.status(400).json({ error: 'q is required' }); return; }

  const results = await searchService.searchCode(ws, {
    query: q,
    regex: req.query.regex === 'true',
    caseSensitive: req.query.caseSensitive === 'true',
    filePattern: req.query.filePattern as string || undefined,
    maxResults: parseInt(req.query.maxResults as string) || 200,
  });

  res.json({ results, total: results.length });
});

router.get('/files', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const q = req.query.q as string;
  if (!q) { res.status(400).json({ error: 'q is required' }); return; }

  const results = await searchService.searchFiles(ws, q);
  res.json({ results, total: results.length });
});

export default router;
