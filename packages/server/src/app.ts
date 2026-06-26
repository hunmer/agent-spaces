#!/usr/bin/env node
import { config as loadDotenv } from 'dotenv';
loadDotenv();

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname, resolve, basename, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import workspaceRouter from './routes/workspace.js';
import fileRouter from './routes/file.js';
import channelRouter from './routes/channel.js';
import issueRouter from './routes/issue.js';
import workflowRouter, { setWorkflowTriggerService } from './routes/workflow.js';
import pluginRouter from './routes/plugin.js';
import agentRouter from './routes/agent.js';
import taskRouter from './routes/task.js';
import gitRouter from './routes/git.js';
import llmRouter from './routes/llm.js';
import authRouter from './routes/auth.js';
import folderRouter from './routes/folder.js';
import commandRouter from './routes/command.js';
import codeFavoritesRouter from './routes/code-favorites.js';
import hooksRouter from './routes/hooks.js';
import skillRouter from './routes/skill.js';
import promptTemplateRouter from './routes/prompt-template.js';
import outputStyleRouter from './routes/output-style.js';
import mcpRouter from './routes/mcp.js';
import npmSettingsRouter from './routes/npm-settings.js';
import subscriptionRouter from './routes/subscription.js';
import agentSseRouter from './routes/agent-sse.js';
import searchRouter from './routes/search.js';
import notificationRouter from './routes/notification.js';
import knowledgeBaseRouter from './routes/knowledge-base.js';
import { worktreeRouter } from './routes/worktree.js';
import speechRecognitionRouter, { handleSpeechStream } from './routes/speech-recognition.js';
import agentCommandsRouter from './routes/agent-commands.js';
import robotAccountRouter from './routes/robot-account.js';
import versionRouter from './routes/version.js';
import importRouter from './routes/import.js';
import dataRouter from './routes/data.js';
import chatRouter from './routes/chat.js';
import chatRunRouter from './routes/chat-run.js';
import miniAppRouter from './routes/mini-apps.js';
import sqliteRouter from './routes/sqlite.js';
import { getUserSettings, setUserAvatarUrl, removeUserAvatarUrl } from './storage/user-settings-store.js';
import { getDataDir } from './storage/json-store.js';
import { authMiddleware, verifyToken } from './middleware/auth.js';
import { handleConnection } from './ws/handler.js';
import { handleTypeScriptLspConnection } from './ws/typescript-lsp.js';
import { broadcastToAll } from './ws/connection-manager.js';
import { startScheduler, stopScheduler } from './agents/scheduler-agent.js';
import { recoverRunningWorkOnStartup } from './services/issue-retry.js';
import { startPersistedNotificationServices } from './services/notification-hub/index.js';
import { InteractionManager } from './services/interaction-manager.js';
import { ClientNodeManager } from './services/client-node-manager.js';
import { ExecutionManager } from './services/execution-manager.js';
import { WorkflowTriggerService } from './services/workflow-trigger-service.js';
import { registerExecutionChannels } from './ws/execution-channels.js';
import { broadcastToWorkspace } from './ws/connection-manager.js';
import { createWorkflowHookRouter } from './routes/workflow-hook.js';
import { setWorkflowExecutionManager } from './services/builtin-tools/index.js';
import { ensureBuiltInAgentTemplates } from './services/agent.js';
import { rebuildIndex as rebuildMiniAppIndex } from './storage/mini-app-store.js';
import { ensureAgentsConfigs } from './services/mini-app-services.js';
import { registerAllMiniAppTools } from './services/mini-app-agent.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3100', 10);

const resolveRuntimeDir = (name: string) => {
  const currentDir = join(__dirname, name);
  if (existsSync(currentDir)) return currentDir;
  return join(__dirname, '..', name);
};

const app = express();
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '50mb' }));
app.use('/api/agent-sse', agentSseRouter);

// Inspector track endpoint (no auth - called by dom-inspector-hook from external apps)
app.post('/api/inspector/track', (req, res) => {
  const { path, name, line, column, timestamp } = req.body as {
    path?: string;
    name?: string;
    line?: number;
    column?: number;
    timestamp?: number;
  };
  if (!path || line == null) {
    res.status(400).json({ error: 'path and line are required' });
    return;
  }
  broadcastToAll('inspector.jump', { path, name, line, column: column ?? 1, timestamp });
  res.json({ ok: true });
});

app.use('/api', authMiddleware);

// Serve static files from public/
const publicDir = resolveRuntimeDir('public');
app.use('/public', express.static(publicDir));
app.use('/static', express.static(publicDir));
app.use('/static', express.static(join(getDataDir(), 'public')));

// Serve template store resources from packages/templates/
const agentsDir = resolveRuntimeDir('../templates');
app.use('/agents-store', express.static(agentsDir));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), platform: process.platform });
});

app.use('/api/auth', authRouter);

app.post('/api/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'file is required' });
    return;
  }

  const uploadsDir = join(publicDir, 'uploads');
  if (!existsSync(uploadsDir)) await mkdir(uploadsDir, { recursive: true });

  const originalName = normalizeUploadFileName(file.originalname);
  const ext = extname(originalName);
  const safeBaseName = basename(originalName, ext).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') || 'file';
  const name = `${safeBaseName}-${randomUUID()}${ext}`;
  const path = join(uploadsDir, name);
  await writeFile(path, file.buffer);

  const url = `/static/uploads/${name}`;
  const protocol = req.headers['x-forwarded-proto']?.toString().split(',')[0] || req.protocol;
  const host = req.get('host');
  const httpPath = host ? `${protocol}://${host}${url}` : url;
  res.json({
    name: originalName,
    storedName: name,
    path,
    size: file.size,
    type: file.mimetype,
    url,
    httpPath,
  });
});

function normalizeUploadFileName(name: string): string {
  if (!/[\u0080-\u009f]/.test(name)) return name;

  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  if (!decoded || decoded.includes('\uFFFD') || /[\u0000-\u001f]/.test(decoded)) return name;
  return decoded;
}

// Avatar upload
app.post('/api/upload/avatar', async (req, res) => {
  const { dataUrl } = req.body as { dataUrl?: string };
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
  const extByMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  const ext = extByMime[mime.toLowerCase()];
  if (!ext) {
    res.status(400).json({ error: 'Unsupported avatar image type' });
    return;
  }
  const name = `${randomUUID()}.${ext}`;
  const avatarsDir = join(publicDir, 'avatars');
  if (!existsSync(avatarsDir)) mkdirSync(avatarsDir, { recursive: true });
  await writeFile(join(avatarsDir, name), Buffer.from(base64, 'base64'));
  res.json({ url: `/static/avatars/${name}` });
});

// Font upload
const FONT_EXTS = new Set(['.ttf', '.otf', '.woff', '.woff2']);
const fontsDir = join(publicDir, 'fonts');
if (!existsSync(fontsDir)) mkdirSync(fontsDir, { recursive: true });

app.get('/api/fonts', (_req, res) => {
  if (!existsSync(fontsDir)) { res.json([]); return; }
  const fonts = readdirSync(fontsDir).filter(f => FONT_EXTS.has(extname(f).toLowerCase()));
  res.json(fonts.map(f => ({ name: f, url: `/static/fonts/${f}` })));
});

app.post('/api/fonts/upload', async (req, res) => {
  const { name, content } = req.body as { name?: string; content?: string };
  if (!name || !content) { res.status(400).json({ error: 'name and content are required' }); return; }
  const ext = extname(name).toLowerCase();
  if (!FONT_EXTS.has(ext)) { res.status(400).json({ error: 'Unsupported font format' }); return; }
  const safeName = basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  await writeFile(join(fontsDir, safeName), Buffer.from(content, 'base64'));
  res.json({ name: safeName, url: `/static/fonts/${safeName}` });
});

app.delete('/api/fonts/:name', (req, res) => {
  const name = basename(req.params.name);
  const ext = extname(name).toLowerCase();
  if (!FONT_EXTS.has(ext)) { res.status(400).json({ error: 'Invalid font file' }); return; }
  const filePath = join(fontsDir, name);
  if (!existsSync(filePath)) { res.status(404).json({ error: 'Font not found' }); return; }
  import('node:fs').then(fs => fs.unlinkSync(filePath));
  res.json({ ok: true });
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
app.use('/api/mini-apps', miniAppRouter);
app.use('/api/sqlite', sqliteRouter);
app.use('/api/plugins', pluginRouter);

// Initialize workflow execution infrastructure
const interactionManager = new InteractionManager();
const clientNodeManager = new ClientNodeManager();
const executionManager = new ExecutionManager({
  interactionManager,
  clientNodeManager,
  emit: (channel, payload, workspaceId) => {
    // Only broadcast workflow execution events when the originating session
    // has an explicit WS workspace scope. Hook/SSE executions use eventSink instead.
    if (workspaceId) {
      broadcastToWorkspace(workspaceId, channel, payload);
    }
  },
});
const triggerService = new WorkflowTriggerService(PORT);
triggerService.setExecutionManager(executionManager);
setWorkflowTriggerService(triggerService);
setWorkflowExecutionManager(executionManager);

// Workflow webhook hook SSE endpoint (after auth middleware)
app.use('/api/workflows', createWorkflowHookRouter(triggerService, executionManager));

// Register WS execution channels
registerExecutionChannels(executionManager);
app.use('/api/workspaces/:id/commands', commandRouter);
app.use('/api/workspaces/:id/code-favorites', codeFavoritesRouter);
app.use('/api/workspaces/:id/hooks', hooksRouter);
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
app.use('/api/workspaces/:id/knowledge-bases', knowledgeBaseRouter);
app.use('/api/workspaces/:id/worktrees', worktreeRouter);
app.use('/api/workspaces/:id/notifications', notificationRouter);
app.use('/api/agents', agentRouter);
app.use('/api', llmRouter);
app.use('/api/folder', folderRouter);
app.use('/api/skills', skillRouter);
app.use('/api/prompt-templates', promptTemplateRouter);
app.use('/api/output-styles', outputStyleRouter);
app.use('/api/mcps', mcpRouter);
app.use('/api/npm-settings', npmSettingsRouter);
app.use('/api/subscriptions', subscriptionRouter);
app.use('/api/speech-recognition', speechRecognitionRouter);
app.use('/api/agent-commands', agentCommandsRouter);
app.use('/api/robot-accounts', robotAccountRouter);
app.use('/api/import', importRouter);
app.use('/api/data', dataRouter);
app.use('/api', versionRouter);
app.use('/api/chat', chatRouter);
app.use('/api/chat', chatRunRouter);

// Serve static web frontend in production (after API routes, before catch-all)
const webDir = resolveRuntimeDir('web');
if (existsSync(webDir)) {
  // /static/* -> public/* (avatar URLs etc.)
  app.use('/static', express.static(publicDir));
  // web static assets (_next, monaco, etc.)
  app.use(express.static(webDir));

  // SPA fallback: serve correct HTML for each route
  const indexHtml = join(webDir, 'index.html');
  const isInsideWebDir = (filePath: string) => {
    const rel = relative(webDir, filePath);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  };
  const tryWebFiles = (...rels: string[]) => {
    for (const rel of rels) {
      const filePath = resolve(webDir, rel.replace(/^\/+/, ''));
      if (isInsideWebDir(filePath) && existsSync(filePath) && statSync(filePath).isFile()) return filePath;
    }
    return null;
  };
  const resolveWebFallback = (pathname: string) => {
    let clean = pathname;
    try { clean = decodeURIComponent(pathname); } catch { /* keep raw pathname */ }
    clean = clean.replace(/\.html$/i, '').replace(/\/+$/, '');
    if (!clean) return indexHtml;

    const exact = tryWebFiles(clean, `${clean}/index.html`, `${clean}.html`);
    if (exact) return exact;

    const segs = clean.split('/').filter(Boolean);
    if (segs.length >= 2) {
      const dyn = [...segs.slice(0, -1), '_'].join('/');
      const fallback = tryWebFiles(`${dyn}.html`, `${dyn}/index.html`, dyn);
      if (fallback) return fallback;
    }

    return indexHtml;
  };

  // Everything else -> root index.html
  app.use((req, res) => {
    res.sendFile(resolveWebFallback(req.path));
  });

  console.log(`[server] serving web frontend from ${webDir}`);
} else {
  console.warn('[server] web frontend not found at', webDir, '- run \`pnpm build\` first');
}

const server = createServer(app);

const wss = new WebSocketServer({ noServer: true });
const typescriptLspWss = new WebSocketServer({ noServer: true });

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

typescriptLspWss.on('connection', (ws, req) => {
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

  handleTypeScriptLspConnection(ws, workspaceId);
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

  if (pathname === '/ws/lsp/typescript') {
    typescriptLspWss.handleUpgrade(req, socket, head, (ws) => {
      typescriptLspWss.emit('connection', ws, req);
    });
    return;
  }

  socket.destroy();
});

const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT}`);
  console.log(`[server] websocket on ws://${HOST}:${PORT}/ws?workspaceId=...`);
  ensureBuiltInAgentTemplates();
  rebuildMiniAppIndex();
  ensureAgentsConfigs();
  registerAllMiniAppTools();
  recoverRunningWorkOnStartup();
  triggerService.start().catch((err) => {
    console.error('[trigger] failed to start:', err);
  });
  startPersistedNotificationServices().catch((err) => {
    console.error('[notification] failed to restore persisted services:', err);
  });
});

// Start scheduler for all workspaces (lazy: started on first WS connection)
export { startScheduler, stopScheduler };
