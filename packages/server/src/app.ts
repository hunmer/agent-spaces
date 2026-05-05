import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import workspaceRouter from './routes/workspace.js';
import fileRouter from './routes/file.js';
import channelRouter from './routes/channel.js';
import issueRouter from './routes/issue.js';
import agentRouter from './routes/agent.js';
import taskRouter from './routes/task.js';
import gitRouter from './routes/git.js';
import llmRouter from './routes/llm.js';
import { handleConnection } from './ws/handler.js';
import { startScheduler, stopScheduler } from './agents/scheduler-agent.js';
import { recoverRunningWorkOnStartup } from './services/issue-retry.js';
import { startPersistedNotificationServices } from './services/notification-hub/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3100', 10);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static files from public/
app.use('/public', express.static(join(__dirname, '..', 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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
  const avatarsDir = join(__dirname, '..', 'public', 'avatars');
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

const server = createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', `http://localhost:${PORT}`);
  const workspaceId = url.searchParams.get('workspaceId');

  if (!workspaceId) {
    ws.close(4001, 'workspaceId required');
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
