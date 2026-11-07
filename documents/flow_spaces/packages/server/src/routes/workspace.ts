import { Router } from 'express';
import { join } from 'node:path';
import { exec } from 'child_process';
import * as wsService from '../services/workspace.js';
import { getDataDir } from '../storage/json-store.js';
import * as agentService from '../services/agent.js';
import { readWorkspacePrompt, writeWorkspacePrompt } from '../services/workspace-prompt.js';
import {
  getWeChatLoginQRCode,
  pollWeChatLoginStatus,
  sendTestNotification,
  startWorkspaceNotificationService,
  stopWorkspaceNotificationService,
} from '../services/notification-hub/index.js';
import { gitClone } from '../adapters/git.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(wsService.getAll());
});

router.post('/clone', async (req, res) => {
  const { url, targetDir } = req.body as { url?: string; targetDir?: string };
  if (!url || !targetDir) {
    res.status(400).json({ error: 'url and targetDir are required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendSSE = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const cloneDir = await gitClone(targetDir, url, (progress) => {
      sendSSE(progress);
    });
    sendSSE({ phase: 'done', progress: 100, cloneDir });
  } catch (err: any) {
    sendSSE({ phase: 'error', progress: 0, error: err.message });
  } finally {
    res.end();
  }
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

router.get('/:id/prompt', (req, res) => {
  const ws = wsService.getById(req.params.id);
  if (!ws) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  res.json({ prompt: readWorkspacePrompt(req.params.id) });
});

router.put('/:id/prompt', (req, res) => {
  const { prompt } = req.body as { prompt?: unknown };
  if (typeof prompt !== 'string') {
    res.status(400).json({ error: 'prompt must be a string' });
    return;
  }

  const saved = writeWorkspacePrompt(req.params.id, prompt);
  if (saved === null) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  res.json({ prompt: saved });
});

router.get('/:id/agent-templates', (_req, res) => {
  res.json(agentService.listTemplates());
});

router.put('/:id', (req, res) => {
  const ws = wsService.update(req.params.id, req.body);
  if (!ws) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  res.json(ws);
});

router.post('/:id/notifications/start', async (req, res) => {
  try {
    const result = await startWorkspaceNotificationService(req.params.id);
    if (!result.started) {
      res.status(400).json({ error: 'Notification service is not enabled or provider is unsupported', ...result });
      return;
    }
    res.json({ ...result, workspace: wsService.getById(req.params.id) });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Failed to start notification service',
    });
  }
});

router.post('/:id/notifications/stop', async (req, res) => {
  await stopWorkspaceNotificationService(req.params.id);
  const ws = wsService.getById(req.params.id);
  res.json({ stopped: true, workspace: ws });
});

router.post('/:id/notifications/test', async (req, res) => {
  try {
    const result = await sendTestNotification(req.params.id);
    if (!result.sent) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({
      sent: false,
      reason: err instanceof Error ? err.message : 'Failed to send test notification',
    });
  }
});

router.post('/:id/notifications/wechat/qr', async (req, res) => {
  try {
    const poll = req.query.poll === '1' || req.query.poll === 'true';
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const result = poll
      ? await pollWeChatLoginStatus(req.params.id)
      : await getWeChatLoginQRCode(req.params.id, refresh);
    res.json(result);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Failed to get WeChat QR code',
    });
  }
});

router.delete('/:id', (req, res) => {
  if (!wsService.remove(req.params.id)) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  res.status(204).end();
});

router.post('/:id/reveal', (req, res) => {
  const ws = wsService.getById(req.params.id);
  if (!ws) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }

  const target = req.query.target as string;
  let dir: string;
  if (target === 'data') {
    dir = join(getDataDir(), 'workspaces', ws.id);
  } else {
    dir = ws.boundDirs?.[0];
    if (!dir) {
      res.status(400).json({ error: 'Workspace has no bound directory' });
      return;
    }
  }

  console.log('[reveal:workspace] workspace:', ws.id, 'dir:', dir);

  const cmd = process.platform === 'darwin'
    ? `open "${dir}"`
    : process.platform === 'win32'
      ? `explorer "${dir}"`
      : `xdg-open "${dir}"`;

  console.log('[reveal:workspace] platform:', process.platform, 'cmd:', cmd);

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error('[reveal:workspace] failed:', err.message, 'stderr:', stderr);
      res.status(500).json({ error: 'Failed to reveal directory', detail: err.message });
      return;
    }
    if (stdout) console.log('[reveal:workspace] stdout:', stdout);
    if (stderr) console.log('[reveal:workspace] stderr:', stderr);
    res.json({ success: true, path: dir });
  });
});

export default router;
