import { Router } from 'express';
import type { Request, Response } from 'express';
import * as store from '../storage/hook-store.js';

const router = Router({ mergeParams: true });

router.get('/', (req: Request<{ id: string }>, res: Response) => {
  try {
    res.json(store.listHooks(req.params.id));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:name', (req: Request<{ id: string; name: string }>, res: Response) => {
  try {
    const hook = store.getHook(req.params.id, req.params.name);
    if (!hook) { res.status(404).json({ error: 'Hook not found' }); return; }
    res.json(hook);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', (req: Request<{ id: string }>, res: Response) => {
  try {
    const config = req.body;
    if (!config.name) { res.status(400).json({ error: 'name required' }); return; }
    store.saveHook(req.params.id, config);
    res.status(201).json(config);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:name', (req: Request<{ id: string; name: string }>, res: Response) => {
  try {
    const config = req.body;
    config.name = req.params.name;
    store.saveHook(req.params.id, config);
    res.json(config);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:name', (req: Request<{ id: string; name: string }>, res: Response) => {
  try {
    store.deleteHook(req.params.id, req.params.name);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/upload', (req: Request<{ id: string }>, res: Response) => {
  try {
    const { content } = req.body;
    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'content (string) required' });
      return;
    }
    const config = store.uploadHook(req.params.id, content);
    res.status(201).json(config);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:name/apply', (req: Request<{ id: string; name: string }>, res: Response) => {
  try {
    const { targetWorkspaceId } = req.body;
    if (!targetWorkspaceId) {
      res.status(400).json({ error: 'targetWorkspaceId required' });
      return;
    }
    store.applyToWorkspace(req.params.id, req.params.name, targetWorkspaceId);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
