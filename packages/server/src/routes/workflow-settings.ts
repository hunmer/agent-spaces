import { Router } from 'express';
import type { Request, Response } from 'express';
import { getWorkflowSettings, saveWorkflowSettings, type WorkflowSettings } from '../storage/workflow-settings-store.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(getWorkflowSettings());
});

router.put('/', (req: Request<unknown, unknown, Partial<WorkflowSettings>>, res: Response) => {
  res.json(saveWorkflowSettings(req.body || {}));
});

export default router;
