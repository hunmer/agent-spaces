import { Router } from 'express';
import type { Request, Response } from 'express';
import { getNpmSettings, saveNpmSettings, type NpmSettings } from '../storage/npm-settings-store.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(getNpmSettings());
});

router.put('/', (req: Request<unknown, unknown, Partial<NpmSettings>>, res: Response) => {
  res.json(saveNpmSettings(req.body || {}));
});

export default router;
