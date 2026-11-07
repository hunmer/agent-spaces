import { Router, type Request, type Response } from 'express';
import { gitStatus, gitDiff, gitLog, gitCommit, gitDiscard, gitDiscardAll, gitBranches, gitCheckout, gitInit, gitGenerateCommitMsg, gitPush, gitPull, gitFetch, gitGetRemotes, gitAddRemote, gitCheckoutDetached, gitCherryPick, gitCreateBranch, gitDeleteBranch, gitCreateTag, gitCommitDiff, gitGetRemoteUrl, gitMergeBase, gitGetConfig, gitSetConfig, gitStage, gitUnstage, gitResolveFile, gitReset } from '../adapters/git.js';
import { logGitOperation, getGitOperations } from '../services/git-operation-log.js';

const router = Router({ mergeParams: true });

type GitHandler = (req: Request<{ id: string }>, res: Response) => Promise<void>;

function withLog(operation: string, inputFn: (req: Request<{ id: string }>) => Record<string, unknown>, handler: GitHandler): GitHandler {
  return async (req, res) => {
    const input = inputFn(req);
    const start = Date.now();
    try {
      await handler(req, res);
      const ok = res.statusCode < 400;
      logGitOperation(req.params.id, operation, input, ok ? { ok: true } : { statusCode: res.statusCode }, ok ? undefined : 'request validation failed', Date.now() - start);
    } catch (err: any) {
      logGitOperation(req.params.id, operation, input, undefined, err.message, Date.now() - start);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  };
}

router.get('/status', withLog('status', () => ({}), async (req, res) => {
  const result = await gitStatus(req.params.id);
  res.json(result);
}));

router.get('/diff', withLog('diff', (req) => ({ path: req.query.path }), async (req, res) => {
  const filePath = req.query.path as string | undefined;
  const result = await gitDiff(req.params.id, filePath);
  res.json(result);
}));

router.get('/log', withLog('log', (req) => ({ maxCount: req.query.maxCount }), async (req, res) => {
  const maxCount = parseInt(req.query.maxCount as string) || 50;
  const result = await gitLog(req.params.id, maxCount);
  res.json(result);
}));

router.post('/commit', withLog('commit', (req) => ({ message: (req as any).body?.message }), async (req, res) => {
  const { message } = req.body;
  if (!message) { res.status(400).json({ error: 'message is required' }); return; }
  const result = await gitCommit(req.params.id, message);
  res.json(result);
}));

router.post('/discard', withLog('discard', (req) => ({ path: (req as any).body?.path }), async (req, res) => {
  const { path } = req.body;
  if (!path) { res.status(400).json({ error: 'path is required' }); return; }
  await gitDiscard(req.params.id, path);
  res.json({ ok: true });
}));

router.post('/discard-all', withLog('discard-all', () => ({}), async (req, res) => {
  await gitDiscardAll(req.params.id);
  res.json({ ok: true });
}));

router.post('/stage', withLog('stage', (req) => ({ path: (req as any).body?.path }), async (req, res) => {
  const { path } = req.body;
  if (!path) { res.status(400).json({ error: 'path is required' }); return; }
  await gitStage(req.params.id, path);
  res.json({ ok: true });
}));

router.post('/unstage', withLog('unstage', (req) => ({ path: (req as any).body?.path }), async (req, res) => {
  const { path } = req.body;
  if (!path) { res.status(400).json({ error: 'path is required' }); return; }
  await gitUnstage(req.params.id, path);
  res.json({ ok: true });
}));

router.post('/resolve-file', withLog('resolve-file', (req) => ({ path: (req as any).body?.path }), async (req, res) => {
  const { path, content, stage } = req.body;
  if (!path || typeof content !== 'string') { res.status(400).json({ error: 'path and content are required' }); return; }
  await gitResolveFile(req.params.id, path, content, stage !== false);
  res.json({ ok: true });
}));

router.get('/branches', withLog('branches', () => ({}), async (req, res) => {
  const result = await gitBranches(req.params.id);
  res.json(result);
}));

router.post('/checkout', withLog('checkout', (req) => ({ branch: (req as any).body?.branch }), async (req, res) => {
  const { branch } = req.body;
  if (!branch) { res.status(400).json({ error: 'branch is required' }); return; }
  await gitCheckout(req.params.id, branch);
  res.json({ ok: true });
}));

router.post('/init', withLog('init', () => ({}), async (req, res) => {
  await gitInit(req.params.id);
  res.json({ ok: true });
}));

router.post('/generate-commit-message', withLog('generate-commit-message', () => ({}), async (req, res) => {
  const message = await gitGenerateCommitMsg(req.params.id);
  res.json({ message });
}));

router.post('/fetch', withLog('fetch', () => ({}), async (req, res) => {
  await gitFetch(req.params.id);
  res.json({ ok: true });
}));

router.post('/push', withLog('push', () => ({}), async (req, res) => {
  await gitPush(req.params.id);
  res.json({ ok: true });
}));

router.post('/pull', withLog('pull', () => ({}), async (req, res) => {
  await gitPull(req.params.id);
  res.json({ ok: true });
}));

router.get('/remotes', withLog('remotes', () => ({}), async (req, res) => {
  const remotes = await gitGetRemotes(req.params.id);
  res.json(remotes);
}));

router.post('/remotes', withLog('add-remote', (req) => ({ name: (req as any).body?.name, url: (req as any).body?.url }), async (req, res) => {
  const { name, url } = req.body;
  if (!name || !url) { res.status(400).json({ error: 'name and url are required' }); return; }
  await gitAddRemote(req.params.id, name, url);
  res.json({ ok: true });
}));

router.post('/checkout-detached', withLog('checkout-detached', (req) => ({ commitHash: (req as any).body?.commitHash }), async (req, res) => {
  const { commitHash } = req.body;
  if (!commitHash) { res.status(400).json({ error: 'commitHash is required' }); return; }
  await gitCheckoutDetached(req.params.id, commitHash);
  res.json({ ok: true });
}));

router.post('/cherry-pick', withLog('cherry-pick', (req) => ({ commitHash: (req as any).body?.commitHash }), async (req, res) => {
  const { commitHash } = req.body;
  if (!commitHash) { res.status(400).json({ error: 'commitHash is required' }); return; }
  await gitCherryPick(req.params.id, commitHash);
  res.json({ ok: true });
}));

router.post('/create-branch', withLog('create-branch', (req) => ({ name: (req as any).body?.name, startPoint: (req as any).body?.startPoint }), async (req, res) => {
  const { name, startPoint } = req.body;
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  await gitCreateBranch(req.params.id, name, startPoint);
  res.json({ ok: true });
}));

router.post('/delete-branch', withLog('delete-branch', (req) => ({ name: (req as any).body?.name, force: (req as any).body?.force }), async (req, res) => {
  const { name, force } = req.body;
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  await gitDeleteBranch(req.params.id, name, force);
  res.json({ ok: true });
}));

router.post('/create-tag', withLog('create-tag', (req) => ({ name: (req as any).body?.name, commitHash: (req as any).body?.commitHash }), async (req, res) => {
  const { name, commitHash } = req.body;
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  await gitCreateTag(req.params.id, name, commitHash);
  res.json({ ok: true });
}));

router.get('/commit-diff', withLog('commit-diff', (req) => ({ hash: req.query.hash }), async (req, res) => {
  const hash = req.query.hash as string;
  if (!hash) { res.status(400).json({ error: 'hash is required' }); return; }
  const diffs = await gitCommitDiff(req.params.id, hash);
  res.json(diffs);
}));

router.get('/remote-url', withLog('remote-url', () => ({}), async (req, res) => {
  const url = await gitGetRemoteUrl(req.params.id);
  res.json({ url });
}));

router.get('/merge-base', withLog('merge-base', () => ({}), async (req, res) => {
  const hash = await gitMergeBase(req.params.id);
  res.json({ hash });
}));

router.get('/config', withLog('config.get', () => ({}), async (req, res) => {
  const config = await gitGetConfig('local', req.params.id);
  res.json(config);
}));

router.post('/config', withLog('config.set', (req) => ({ name: (req as any).body?.name, email: (req as any).body?.email, proxy: (req as any).body?.proxy }), async (req, res) => {
  const { name, email, proxy } = req.body;
  await gitSetConfig('local', { name, email, proxy }, req.params.id);
  res.json({ ok: true });
}));

router.get('/operations', (req: Request<{ id: string }>, res: Response) => {
  res.json(getGitOperations(req.params.id));
});

router.post('/reset', withLog('reset', (req) => ({ commitHash: (req as any).body?.commitHash, mode: (req as any).body?.mode }), async (req, res) => {
  const { commitHash, mode } = req.body;
  if (!commitHash) { res.status(400).json({ error: 'commitHash is required' }); return; }
  await gitReset(req.params.id, commitHash, mode || 'mixed');
  res.json({ ok: true });
}));

export default router;
