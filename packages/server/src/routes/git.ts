import { Router, type Request, type Response } from 'express';
import { gitStatus, gitDiff, gitLog, gitCommit, gitDiscard, gitDiscardAll, gitBranches, gitCheckout, gitInit, gitGenerateCommitMsg } from '../adapters/git.js';

const router = Router({ mergeParams: true });

router.get('/status', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const result = await gitStatus(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/diff', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const filePath = req.query.path as string | undefined;
    const result = await gitDiff(req.params.id, filePath);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/log', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const maxCount = parseInt(req.query.maxCount as string) || 50;
    const result = await gitLog(req.params.id, maxCount);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/commit', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { message } = req.body;
    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }
    const result = await gitCommit(req.params.id, message);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/discard', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { path } = req.body;
    if (!path) {
      res.status(400).json({ error: 'path is required' });
      return;
    }
    await gitDiscard(req.params.id, path);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/discard-all', async (req: Request<{ id: string }>, res: Response) => {
  try {
    await gitDiscardAll(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/branches', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const result = await gitBranches(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/checkout', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { branch } = req.body;
    if (!branch) {
      res.status(400).json({ error: 'branch is required' });
      return;
    }
    await gitCheckout(req.params.id, branch);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/init', async (req: Request<{ id: string }>, res: Response) => {
  try {
    await gitInit(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate-commit-message', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const message = await gitGenerateCommitMsg(req.params.id);
    res.json({ message });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
