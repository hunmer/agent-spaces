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
import agentRouter from './routes/agent.js';
import taskRouter from './routes/task.js';
import gitRouter from './routes/git.js';
import llmRouter from './routes/llm.js';
import authRouter from './routes/auth.js';
import folderRouter from './routes/folder.js';
import { authMiddleware, verifyToken } from './middleware/auth.js';
import { handleConnection } from './ws/handler.js';
import { startScheduler, stopScheduler } from './agents/scheduler-agent.js';
import { recoverRunningWorkOnStartup } from './services/issue-retry.js';
import { startPersistedNotificationServices } from './services/notification-hub/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3100', 10);
const IS_PROD = process.env.NODE_ENV === 'production';

const resolveRuntimeDir = (name: string) => {
  const currentDir = join(__dirname, name);
  if (existsSync(currentDir)) return currentDir;
  return join(__dirname, '..', name);
};

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/api', authMiddleware);

// Serve static files from public/
const publicDir = resolveRuntimeDir('public');
app.use('/public', express.static(publicDir));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

app.use('/api/workspaces', workspaceRouter);
app.use('/api/workspaces/:id/files', fileRouter);
app.use('/api/workspaces/:id/channels', channelRouter);
app.use('/api/workspaces/:id/issues', issueRouter);
app.use('/api/workspaces/:id/agents', agentRouter);
app.use('/api/workspaces/:id/tasks', taskRouter);
app.use('/api/workspaces/:id/git', gitRouter);
app.use('/api/agents', agentRouter);
app.use('/api', llmRouter);
app.use('/api/folder', folderRouter);

// Serve static web frontend in production (after API routes, before catch-all)
if (IS_PROD) {
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
}

const server = createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

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
