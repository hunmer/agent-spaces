import { Router } from 'express';
import { existsSync } from 'node:fs';
import * as svc from '../services/chat.js';
import * as fileService from '../services/file.js';
import * as chatStore from '../storage/chat-store.js';

const router = Router();

// --- Migration guard ---
let migrated = false;
function ensureMigrated() {
  if (migrated) return;
  migrated = true;
  try { svc.migrateToWorkspaces(); } catch { /* ignore */ }
}

// --- Workspace CRUD ---

router.get('/workspaces', (_req, res) => {
  ensureMigrated();
  try {
    res.json(svc.listWorkspaces());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/workspaces', (req, res) => {
  ensureMigrated();
  const { name, agentIds } = req.body as { name?: string; agentIds?: string[] };
  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  try {
    const ws = svc.createWorkspace({ name: name.trim(), agentIds });
    res.status(201).json(ws);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/workspaces/:wsId', (req, res) => {
  const { wsId } = req.params;
  const { name, agentIds } = req.body as { name?: string; agentIds?: string[] };
  try {
    const ws = svc.updateWorkspace(wsId, { name: name?.trim(), agentIds });
    if (!ws) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json(ws);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/workspaces/:wsId', (req, res) => {
  const { wsId } = req.params;
  try {
    const deleted = svc.deleteWorkspace(wsId);
    if (!deleted) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/chat/workspaces/:wsId/tree - read current chat workspace storage tree
router.get('/workspaces/:wsId/tree', async (req, res) => {
  const { wsId } = req.params;
  if (!wsId) {
    res.status(400).json({ error: 'wsId is required' });
    return;
  }
  try {
    const workspace = svc.getChatWorkspaceRoot(wsId);
    if (!workspace) {
      res.status(404).json({ error: 'Chat workspace not found' });
      return;
    }
    const relPath = typeof req.query.path === 'string' ? req.query.path : '';
    const depth = req.query.depth ? Number(req.query.depth) : Infinity;
    res.json(await fileService.readTree(workspace, relPath, depth));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/workspaces/:wsId/upload', async (req, res) => {
  const { wsId } = req.params;
  try {
    const workspace = svc.getChatWorkspaceRoot(wsId);
    if (!workspace) {
      res.status(404).json({ error: 'Chat workspace not found' });
      return;
    }
    const paths = await uploadFilesToWorkspace(workspace, req.body);
    res.json({ ok: true, paths });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/chat/workspaces/:wsId/state
router.get('/workspaces/:wsId/state', (req, res) => {
  const { wsId } = req.params;
  ensureMigrated();
  try {
    res.json(chatStore.getWorkspaceState(wsId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/chat/workspaces/:wsId/state
router.put('/workspaces/:wsId/state', (req, res) => {
  const { wsId } = req.params;
  ensureMigrated();
  try {
    chatStore.saveWorkspaceState(wsId, req.body);
    res.json(req.body);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Session CRUD ---

router.get('/workspaces/:wsId/sessions', (req, res) => {
  const { wsId } = req.params;
  try {
    res.json(svc.listSessions(wsId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/workspaces/:wsId/sessions', (req, res) => {
  const { wsId } = req.params;
  const { agentId } = req.body as { agentId?: string };
  if (!agentId) {
    res.status(400).json({ error: 'agentId is required' });
    return;
  }
  try {
    const session = svc.createSession(wsId, agentId);
    if (!session) {
      res.status(404).json({ error: 'Workspace or agent not found' });
      return;
    }
    res.status(201).json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/workspaces/:wsId/sessions/:sessionId', (req, res) => {
  const { wsId, sessionId } = req.params;
  const {
    title,
    archived,
    editorDirectoryTabs,
    activeEditorDirectoryTabId,
  } = req.body as {
    title?: string;
    archived?: boolean;
    editorDirectoryTabs?: Array<{ id: string; path: string }>;
    activeEditorDirectoryTabId?: string;
  };
  try {
    const session = svc.updateSession(wsId, sessionId, {
      title,
      archived,
      editorDirectoryTabs,
      activeEditorDirectoryTabId,
    });
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/workspaces/:wsId/sessions/:sessionId', (req, res) => {
  const { wsId, sessionId } = req.params;
  try {
    const deleted = svc.deleteSession(wsId, sessionId);
    if (!deleted) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Session Messages ---

router.get('/sessions/:sessionId/messages', (req, res) => {
  const { sessionId } = req.params;
  const wsId = req.query.workspaceId as string;
  if (!wsId) {
    res.status(400).json({ error: 'workspaceId query param is required' });
    return;
  }
  try {
    res.json(svc.listSessionMessages(wsId, sessionId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/sessions/:sessionId/messages', (req, res) => {
  const { sessionId } = req.params;
  const wsId = req.query.workspaceId as string;
  if (!wsId) {
    res.status(400).json({ error: 'workspaceId query param is required' });
    return;
  }
  try {
    svc.clearSessionMessages(wsId, sessionId);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/chat/agents — list all chat agents
router.get('/agents', (_req, res) => {
  ensureMigrated();
  try {
    res.json(svc.listAgents());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/chat/agents — create agent (requires name, providerId, model)
router.post('/agents', (req, res) => {
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const providerId = stringValue(body.providerId)
    || svc.resolveProviderIdFromChatAgentInput(body);
  const model = stringValue(body.model) || stringValue(body.modelId);
  if (!name || !providerId || !model) {
    res.status(400).json({ error: 'name, providerId, and model are required' });
    return;
  }
  try {
    const agent = svc.createAgent({ ...body, providerId } as Parameters<typeof svc.createAgent>[0]);
    res.status(201).json(agent);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/chat/agents/:id — update agent
router.put('/agents/:id', (req, res) => {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }
  try {
    const patch = normalizeChatAgentPatch(req.body);
    const agent = svc.updateAgent(id, patch);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(agent);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

function normalizeChatAgentPatch(body: unknown): Partial<Parameters<typeof svc.updateAgent>[1]> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const patch = { ...(body as Record<string, unknown>) } as Partial<Parameters<typeof svc.updateAgent>[1]> & {
    apiBase?: string;
  };
  if (!patch.baseURL && patch.apiBase) {
    patch.baseURL = patch.apiBase;
  }
  delete patch.apiBase;
  return patch;
}

// DELETE /api/chat/agents/:id — delete agent + its messages
router.delete('/agents/:id', (req, res) => {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }
  try {
    const deleted = svc.deleteAgent(id);
    if (!deleted) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/chat/agents/:id/messages — list messages (?limit=50&before=msgId)
router.get('/agents/:id/messages', (req, res) => {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }
  try {
    const agent = svc.findAgent(id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const before = req.query.before as string | undefined;
    res.json(svc.listMessages(id, limit, before));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/chat/agents/:id/messages — clear messages
router.delete('/agents/:id/messages', (req, res) => {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }
  try {
    svc.clearMessages(id);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/chat/agents/:id/workspace/tree - read chat agent working directory
router.get('/agents/:id/workspace/tree', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }
  try {
    const workspace = svc.getAgentWorkspace(id);
    if (!workspace) {
      res.status(404).json({ error: 'Agent workspace not found' });
      return;
    }
    const relPath = typeof req.query.path === 'string' ? req.query.path : '';
    const depth = req.query.depth ? Number(req.query.depth) : Infinity;
    res.json(await fileService.readTree(workspace, relPath, depth));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/agents/:id/workspace/upload', async (req, res) => {
  const { id } = req.params;
  try {
    const workspace = svc.getAgentWorkspace(id);
    if (!workspace) {
      res.status(404).json({ error: 'Agent workspace not found' });
      return;
    }
    const paths = await uploadFilesToWorkspace(workspace, req.body);
    res.json({ ok: true, paths });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/chat/agents/:id/workspace/content - read chat agent file content
router.get('/agents/:id/workspace/content', async (req, res) => {
  const { id } = req.params;
  const path = typeof req.query.path === 'string' ? req.query.path : '';
  if (!id || !path) {
    res.status(400).json({ error: 'id and path are required' });
    return;
  }
  try {
    const workspace = svc.getAgentWorkspace(id);
    if (!workspace) {
      res.status(404).json({ error: 'Agent workspace not found' });
      return;
    }
    const result = await fileService.readFileContent(workspace, path);
    if (!result) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function uploadFilesToWorkspace(workspace: NonNullable<ReturnType<typeof svc.getAgentWorkspace>>, body: any) {
  const { targetDir, files } = body || {};
  if (!Array.isArray(files) || files.length === 0) throw new Error('files are required');
  const uploadWorkspace = typeof targetDir === 'string' && existsSync(targetDir)
    ? { ...workspace, boundDirs: [targetDir] }
    : workspace;
  const uploadDir = uploadWorkspace === workspace ? targetDir : '';

  const results: string[] = [];
  for (const file of files) {
    if (!file?.name || !file?.content) continue;
    const relPath = uploadDir ? `${uploadDir}/${file.name}` : file.name;
    const ok = await fileService.writeFileBinary(uploadWorkspace, relPath, Buffer.from(file.content, 'base64'));
    if (ok) results.push(relPath);
  }
  return results;
}

export default router;
