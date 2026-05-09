import { Router } from 'express';
import { listMcps, importMcps, updateMcpConfig, deleteMcp, toggleFavorite } from '../services/mcp.js';
import type { Request, Response } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(listMcps());
});

router.post('/import', (req: Request, res: Response) => {
  const { jsonText } = req.body as { jsonText?: string };
  if (!jsonText) {
    res.status(400).json({ error: 'jsonText required' });
    return;
  }
  try {
    const mcps = importMcps(jsonText);
    res.json(mcps);
  } catch (e) {
    res.status(400).json({ error: 'Invalid JSON: ' + (e as Error).message });
  }
});

router.put('/:name', (req: Request, res: Response) => {
  const name = typeof req.params.name === 'string' ? req.params.name : req.params.name[0];
  const { config } = req.body as { config?: Record<string, unknown> };
  if (!config) {
    res.status(400).json({ error: 'config required' });
    return;
  }
  const ok = updateMcpConfig(name, config);
  if (!ok) {
    res.status(404).json({ error: 'MCP server not found' });
    return;
  }
  res.json({ success: true });
});

router.post('/:name/favorite', (req: Request, res: Response) => {
  const name = typeof req.params.name === 'string' ? req.params.name : req.params.name[0];
  const favorited = toggleFavorite(name);
  res.json({ favorited });
});

router.delete('/:name', (req: Request, res: Response) => {
  const name = typeof req.params.name === 'string' ? req.params.name : req.params.name[0];
  const ok = deleteMcp(name);
  if (!ok) {
    res.status(404).json({ error: 'MCP server not found' });
    return;
  }
  res.json({ success: true });
});

export default router;
