import { Router } from 'express';
import * as wsService from '../services/workspace.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(wsService.getAll());
});

router.post('/', (req, res) => {
  const { name, boundDirs } = req.body;
  if (!name || !boundDirs?.length) {
    res.status(400).json({ error: 'name and boundDirs are required' });
    return;
  }
  const ws = wsService.create({ name, boundDirs });
  res.status(201).json(ws);
});

router.get('/:id', (req, res) => {
  const ws = wsService.getById(req.params.id);
  if (!ws) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  res.json(ws);
});

router.put('/:id', (req, res) => {
  const ws = wsService.update(req.params.id, req.body);
  if (!ws) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  res.json(ws);
});

router.delete('/:id', (req, res) => {
  if (!wsService.remove(req.params.id)) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  res.status(204).end();
});

export default router;
