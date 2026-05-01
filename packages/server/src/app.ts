import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import workspaceRouter from './routes/workspace.js';
import fileRouter from './routes/file.js';
import channelRouter from './routes/channel.js';
import issueRouter from './routes/issue.js';
import agentRouter from './routes/agent.js';
import { handleConnection } from './ws/handler.js';
import { startScheduler, stopScheduler } from './agents/scheduler-agent.js';

const PORT = parseInt(process.env.PORT || '3100', 10);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/workspaces', workspaceRouter);
app.use('/api/workspaces/:id/files', fileRouter);
app.use('/api/workspaces/:id/channels', channelRouter);
app.use('/api/workspaces/:id/issues', issueRouter);
app.use('/api/workspaces/:id/agents', agentRouter);

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

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] websocket on ws://localhost:${PORT}/ws?workspaceId=...`);
});

// Start scheduler for all workspaces (lazy: started on first WS connection)
export { startScheduler, stopScheduler };
