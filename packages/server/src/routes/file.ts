import { Router, type Request, type Response } from 'express';
import * as fileService from '../services/file.js';

const router = Router({ mergeParams: true });

router.get('/tree', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const path = (req.query.path as string) || '';
  const tree = await fileService.readTree(ws, path);
  res.json(tree);
});

router.get('/content', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const path = req.query.path as string;
  if (!path) { res.status(400).json({ error: 'path is required' }); return; }

  const result = await fileService.readFileContent(ws, path);
  if (!result) { res.status(404).json({ error: 'File not found' }); return; }
  res.json(result);
});

router.put('/content', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const { path, content } = req.body;
  if (!path || content === undefined) { res.status(400).json({ error: 'path and content are required' }); return; }

  const ok = await fileService.writeFileContent(ws, path, content);
  if (!ok) { res.status(500).json({ error: 'Failed to write file' }); return; }
  res.json({ ok: true });
});

export default router;
