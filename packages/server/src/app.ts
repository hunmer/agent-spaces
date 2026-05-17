#!/usr/bin/env node
import { config as loadDotenv } from 'dotenv';
loadDotenv();

import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import workspaceRouter from './routes/workspace.js';
import fileRouter from './routes/file.js';
import channelRouter from './routes/channel.js';
import issueRouter from './routes/issue.js';
import workflowRouter from './routes/workflow.js';
import agentRouter from './routes/agent.js';
import taskRouter from './routes/task.js';
import gitRouter from './routes/git.js';
import llmRouter from './routes/llm.js';
import authRouter from './routes/auth.js';
import folderRouter from './routes/folder.js';
import commandRouter from './routes/command.js';
import skillRouter from './routes/skill.js';
import mcpRouter from './routes/mcp.js';
import subscriptionRouter from './routes/subscription.js';
import agentSseRouter from './routes/agent-sse.js';
import searchRouter from './routes/search.js';
import notificationRouter from './routes/notification.js';
import speechRecognitionRouter, { handleSpeechStream } from './routes/speech-recognition.js';
import { getUserSettings, setUserAvatarUrl, removeUserAvatarUrl } from './storage/user-settings-store.js';
import { authMiddleware, verifyToken } from './middleware/auth.js';
import { handleConnection } from './ws/handler.js';
import { startScheduler, stopScheduler } from './agents/scheduler-agent.js';
import { recoverRunningWorkOnStartup } from './services/issue-retry.js';
import { startPersistedNotificationServices } from './services/notification-hub/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3100', 10);

const resolveRuntimeDir = (name: string) => {
  const currentDir = join(__dirname, name);
  if (existsSync(currentDir)) return currentDir;
  return join(__dirname, '..', name);
};

const app = express();
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '50mb' }));
app.use('/api/agent-sse', agentSseRouter);
app.use('/api', authMiddleware);

// Serve static files from public/
const publicDir = resolveRuntimeDir('public');
app.use('/public', express.static(publicDir));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), platform: process.platform });
});

app.use('/api/auth', authRouter);

// Avatar upload
app.post('/api/upload/avatar', async (req, res) => {
  const { dataUrl, filename } = req.body as { dataUrl?: string; filename?: string };
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    res.status(400).json({ error: 'Invalid dataUrl' });
    return;
  }
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    res.status(400).json({ error: 'Invalid base64 data' });
    return;
  }
  const [, mime, base64] = match;
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const name = filename ? `${id}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}` : `${id}.${ext}`;
  const avatarsDir = join(publicDir, 'avatars');
  if (!existsSync(avatarsDir)) mkdirSync(avatarsDir, { recursive: true });
  await writeFile(join(avatarsDir, name), Buffer.from(base64, 'base64'));
  res.json({ url: `/static/avatars/${name}` });
});

// User settings
app.get('/api/user/settings', (_req, res) => {
  const settings = getUserSettings();
  res.json({ avatarUrl: settings.avatarUrl ?? null });
});

app.put('/api/user/settings', (req, res) => {
  const { avatarUrl } = req.body as { avatarUrl?: string };
  if (avatarUrl === null || avatarUrl === undefined) {
    removeUserAvatarUrl();
  } else if (typeof avatarUrl === 'string') {
    setUserAvatarUrl(avatarUrl);
  }
  res.json({ ok: true });
});

app.use('/api/workspaces', workspaceRouter);
app.use('/api/workspaces/:id/files', fileRouter);
app.use('/api/workspaces/:id/channels', channelRouter);
app.use('/api/workspaces/:id/issues', issueRouter);
app.use('/api/workflows', workflowRouter);
app.use('/api/workspaces/:id/commands', commandRouter);
app.use('/api/workspaces/:id/agents', agentRouter);
app.use('/api/workspaces/:id/tasks', taskRouter);
app.use('/api/workspaces/:id/git', gitRouter);

// Global git config (no workspace context needed)
import { gitGetConfig as _gitGetConfig, gitSetConfig as _gitSetConfig } from './adapters/git.js';
app.get('/api/git-config', async (_req, res) => {
  try {
    const config = await _gitGetConfig('global');
    res.json(config);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
app.post('/api/git-config', async (req, res) => {
  try {
    const { name, email, proxy } = req.body;
    await _gitSetConfig('global', { name, email, proxy });
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
app.use('/api/workspaces/:id/search', searchRouter);
app.use('/api/workspaces/:id/notifications', notificationRouter);
app.use('/api/agents', agentRouter);
app.use('/api', llmRouter);
app.use('/api/folder', folderRouter);
app.use('/api/skills', skillRouter);
app.use('/api/mcps', mcpRouter);
app.use('/api/subscriptions', subscriptionRouter);
app.use('/api/speech-recognition', speechRecognitionRouter);

// Serve static web frontend in production (after API routes, before catch-all)
const webDir = resolveRuntimeDir('web');
if (existsSync(webDir)) {
  // /static/* -> public/* (avatar URLs etc.)
  app.use('/static', express.static(publicDir));
  // web static assets (_next, monaco, etc.)
  app.use(express.static(webDir));

  // SPA fallback: serve correct HTML for each route
  const indexHtml = join(webDir, 'index.html');
  const workspaceHtml = join(webDir, 'workspace', '_.html');

  // /workspace/* -> workspace SPA page
  if (existsSync(workspaceHtml)) {
    app.get('/workspace/:id', (_req, res) => {
      res.sendFile(workspaceHtml);
    });
  }

  // Everything else -> root index.html
  app.use((_req, res) => {
    res.sendFile(indexHtml);
  });

  console.log(`[server] serving web frontend from ${webDir}`);
} else {
  console.warn('[server] web frontend not found at', webDir, '- run \`pnpm build\` first');
}

const server = createServer(app);

const wss = new WebSocketServer({ noServer: true });

// Speech recognition WebSocket on /ws/speech
const speechWss = new WebSocketServer({ noServer: true });
speechWss.on('connection', (ws, req) => {
  const token = new URL(req.url || '', `http://localhost:${PORT}`).searchParams.get('token');
  if (!verifyToken(token)) {
    ws.close(4003, 'Unauthorized');
    return;
  }
  const configId = new URL(req.url || '', `http://localhost:${PORT}`).searchParams.get('configId') || undefined;
  handleSpeechStream(ws, configId);
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', `http://localhost:${PORT}`);
  const workspaceId = url.searchParams.get('workspaceId');

  if (!workspaceId) {
    ws.close(4001, 'workspaceId required');
    return;
  }

  const token = url.searchParams.get('token');
  if (!verifyToken(token)) {
    ws.close(4003, 'Unauthorized');
    return;
  }

  handleConnection(ws, workspaceId);
});

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url || '/', `http://localhost:${PORT}`);

  if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
    return;
  }

  if (pathname === '/ws/speech') {
    speechWss.handleUpgrade(req, socket, head, (ws) => {
      speechWss.emit('connection', ws, req);
    });
    return;
  }

  socket.destroy();
});

const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT}`);
  console.log(`[server] websocket on ws://${HOST}:${PORT}/ws?workspaceId=...`);
  recoverRunningWorkOnStartup();
  startPersistedNotificationServices().catch((err) => {
    console.error('[notification] failed to restore persisted services:', err);
  });
});

// Start scheduler for all workspaces (lazy: started on first WS connection)
export { startScheduler, stopScheduler };
