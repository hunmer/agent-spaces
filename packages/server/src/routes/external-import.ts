import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  importExternalItems,
  scanExternalImports,
  type ExternalImportKind,
  type ExternalImportMode,
  type ExternalImportRequestItem,
} from '../services/external-import.js';

const router = Router();

const KINDS = new Set(['skills', 'commands', 'mcps', 'output-styles', 'agents']);
const MODES = new Set(['copy', 'symlink']);

router.get('/scan', (req: Request, res: Response) => {
  const rawKinds = typeof req.query.kinds === 'string' ? req.query.kinds.split(',') : [];
  const kinds = rawKinds.filter((kind) => KINDS.has(kind)) as ExternalImportKind[];
  res.json(scanExternalImports(kinds));
});

router.post('/import', (req: Request, res: Response) => {
  const body = req.body as {
    kind?: ExternalImportKind;
    mode?: ExternalImportMode;
    items?: ExternalImportRequestItem[];
  };
  if (!body.kind || !KINDS.has(body.kind)) {
    res.status(400).json({ error: 'valid kind required' });
    return;
  }
  if (!body.mode || !MODES.has(body.mode)) {
    res.status(400).json({ error: 'valid mode required' });
    return;
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    res.status(400).json({ error: 'items required' });
    return;
  }
  res.json(importExternalItems(body.kind, body.mode, body.items));
});

export default router;
