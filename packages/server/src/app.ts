import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import workspaceRouter from './routes/workspace.js';
import fileRouter from './routes/file.js';

const PORT = parseInt(process.env.PORT || '3100', 10);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/workspaces', workspaceRouter);
app.use('/api/workspaces/:id/files', fileRouter);

const server = createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', `http://localhost:${PORT}`);
  const workspaceId = url.searchParams.get('workspaceId');

  if (!workspaceId) {
    ws.close(4001, 'workspaceId required');
    return;
  }

  ws.send(JSON.stringify({
    event: 'connected',
    workspaceId,
    timestamp: new Date().toISOString(),
    data: { workspaceId },
  }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      // TODO: route by msg.event to handlers
      console.log(`[WS] ${workspaceId}:`, msg.event);
    } catch {
      console.error('[WS] invalid message');
    }
  });
});

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] websocket on ws://localhost:${PORT}/ws?workspaceId=...`);
});
