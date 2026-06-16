import { Router } from 'express';
import { existsSync, statSync, rmSync, cpSync, readdirSync, createReadStream } from 'node:fs';
import { mkdir, readFile, rename as fsRename, rm, writeFile, cp } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import multer from 'multer';
import { getDataDir } from '../storage/json-store.js';
import * as agentStore from '../storage/agent-store.js';
import * as databaseStore from '../storage/database-store.js';
import * as kanbanStore from '../storage/kanban-store.js';
import type { FileNode } from '@agent-spaces/shared';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'video/ogg', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.aac': 'audio/aac',
  '.m4a': 'audio/mp4', '.opus': 'audio/opus',
};

function resolveDataPath(relPath = ''): string | null {
  if (isAbsolute(relPath)) return null;
  const base = resolve(getDataDir());
  const abs = resolve(base, relPath);
  const rel = relative(base, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  return abs;
}

async function readDataTree(relPath = '', depth = Infinity): Promise<FileNode[]> {
  const dirPath = resolveDataPath(relPath);
  if (!dirPath) return [];

  try {
    var entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: FileNode[] = [];
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;
    const s = statSync(fullPath);

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: entryRelPath,
        type: 'directory',
        children: depth > 1 ? await readDataTree(entryRelPath, depth - 1) : undefined,
      });
    } else {
      nodes.push({
        name: entry.name,
        path: entryRelPath,
        type: 'file',
        size: s.size,
        modifiedAt: s.mtime.toISOString(),
      });
    }
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

const CATEGORIES: Record<string, { path: string; label: string; group: string }> = {
  'auth':               { path: 'auth.json',               label: 'Authentication',        group: 'config' },
  'user-settings':      { path: 'user-settings.json',      label: 'User Settings',         group: 'config' },
  'npm-settings':       { path: 'npm-settings.json',       label: 'NPM Settings',          group: 'config' },
  'robot-accounts':     { path: 'robot-accounts.json',     label: 'Robot Accounts',        group: 'config' },
  'speech-recognition': { path: 'speech-recognition.json', label: 'Speech Recognition',    group: 'config' },
  'llm':                { path: 'llm',                     label: 'LLM Models & Providers', group: 'ai' },
  'agents':             { path: 'agents',                  label: 'Agent Usage',           group: 'content' },
  'database':           { path: 'database',                label: 'Document Database',     group: 'content' },
  'kanban':             { path: 'kanban',                  label: 'Kanban Boards',         group: 'content' },
  'output-styles':      { path: 'output-styles',           label: 'Output Styles',         group: 'customization' },
  'prompt-templates':   { path: 'prompt-templates',        label: 'Prompt Templates',      group: 'customization' },
  'subscriptions':      { path: 'subscriptions',           label: 'Subscriptions',         group: 'billing' },
  'skills':             { path: 'skills',                  label: 'Skills',                group: 'customization' },
  'mcps':               { path: 'mcps',                    label: 'MCP Servers',           group: 'customization' },
  'agent-templates':    { path: 'agent-templates',         label: 'Agent Templates',       group: 'customization' },
  'workflows':          { path: 'workflows',               label: 'Workflows',             group: 'content' },
};

router.get('/files/tree', async (req, res) => {
  const path = (req.query.path as string) || '';
  const depth = parseInt(req.query.depth as string) || undefined;
  const tree = await readDataTree(path, depth);
  res.json(tree);
});

router.get('/files/content', async (req, res) => {
  const path = req.query.path as string;
  if (!path) { res.status(400).json({ error: 'path is required' }); return; }

  const abs = resolveDataPath(path);
  if (!abs || !existsSync(abs)) { res.status(404).json({ error: 'File not found' }); return; }

  const raw = req.query.raw === 'true';
  if (raw) {
    const stat = statSync(abs);
    if (stat.isDirectory()) { res.status(400).json({ error: 'Cannot read a directory' }); return; }
    const ext = extname(path).toLowerCase();
    res.setHeader('Content-Type', MIME_MAP[ext] || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    createReadStream(abs).pipe(res);
    return;
  }

  try {
    const content = await readFile(abs, 'utf-8');
    res.json({ content, encoding: 'utf-8' });
  } catch {
    res.status(500).json({ error: 'Failed to read file' });
  }
});

router.put('/files/content', async (req, res) => {
  const { path, content } = req.body as { path?: string; content?: string };
  if (!path || content === undefined) { res.status(400).json({ error: 'path and content are required' }); return; }

  const abs = resolveDataPath(path);
  if (!abs) { res.status(400).json({ error: 'Invalid path' }); return; }

  try {
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf-8');
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to write file' });
  }
});

router.delete('/files', async (req, res) => {
  const path = req.query.path as string;
  if (!path) { res.status(400).json({ error: 'path is required' }); return; }

  const abs = resolveDataPath(path);
  if (!abs) { res.status(400).json({ error: 'Invalid path' }); return; }

  try {
    await rm(abs, { recursive: true, force: true });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

router.post('/files/rename', async (req, res) => {
  const { oldPath, newPath } = req.body as { oldPath?: string; newPath?: string };
  if (!oldPath || !newPath) { res.status(400).json({ error: 'oldPath and newPath are required' }); return; }

  const oldAbs = resolveDataPath(oldPath);
  const newAbs = resolveDataPath(newPath);
  if (!oldAbs || !newAbs) { res.status(400).json({ error: 'Invalid path' }); return; }

  try {
    await mkdir(dirname(newAbs), { recursive: true });
    await fsRename(oldAbs, newAbs);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to rename' });
  }
});

router.post('/files/copy', async (req, res) => {
  const { srcPath, destPath } = req.body as { srcPath?: string; destPath?: string };
  if (!srcPath || !destPath) { res.status(400).json({ error: 'srcPath and destPath are required' }); return; }

  const srcAbs = resolveDataPath(srcPath);
  const destAbs = resolveDataPath(destPath);
  if (!srcAbs || !destAbs) { res.status(400).json({ error: 'Invalid path' }); return; }

  try {
    await mkdir(dirname(destAbs), { recursive: true });
    await cp(srcAbs, destAbs, { recursive: true });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to copy' });
  }
});

// GET /api/data/export — stream zip backup
router.get('/export', (_req, res) => {
  const dataDir = getDataDir();
  const timestamp = new Date().toISOString().slice(0, 10);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="agent-spaces-backup-${timestamp}.zip"`);

  const archive = archiver('zip', { zlib: { level: 6 } });

  archive.on('error', (err) => {
    console.error('[data-export] archive error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create archive' });
    } else {
      res.end();
    }
  });

  archive.pipe(res);

  for (const { path: relPath } of Object.values(CATEGORIES)) {
    const fullPath = join(dataDir, relPath);
    if (!existsSync(fullPath)) continue;
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      archive.directory(fullPath, relPath);
    } else {
      archive.file(fullPath, { name: relPath });
    }
  }

  archive.finalize();
});

// POST /api/data/import/preview — upload zip, extract, return categories
router.post('/import/preview', upload.single('file'), (req, res) => {
  if (!req.file?.buffer) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  try {
    const zip = new AdmZip(req.file.buffer);
    const sessionId = randomUUID();
    const tempDir = join(tmpdir(), `agent-spaces-import-${sessionId}`);
    zip.extractAllTo(tempDir, true);

    const found: Array<{
      key: string;
      label: string;
      group: string;
      size: number;
      type: 'file' | 'directory';
      details: string;
    }> = [];

    for (const [key, { path: relPath, label, group }] of Object.entries(CATEGORIES)) {
      const fullPath = join(tempDir, relPath);
      if (!existsSync(fullPath)) continue;

      const stat = statSync(fullPath);
      const isDir = stat.isDirectory();

      found.push({
        key,
        label,
        group,
        size: isDir ? getDirSize(fullPath) : stat.size,
        type: isDir ? 'directory' : 'file',
        details: isDir ? `${countFiles(fullPath)} files` : formatSize(stat.size),
      });
    }

    activeImportSessions.set(sessionId, { tempDir, expiresAt: Date.now() + 30 * 60 * 1000 });
    res.json({ sessionId, categories: found });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/data/import/execute — restore selected categories
router.post('/import/execute', (req, res) => {
  const { sessionId, categories: selectedCategories } = req.body as {
    sessionId?: string;
    categories?: string[];
  };

  if (!sessionId || !selectedCategories?.length) {
    res.status(400).json({ error: 'sessionId and categories are required' });
    return;
  }

  const session = activeImportSessions.get(sessionId);
  if (!session || Date.now() > session.expiresAt) {
    res.status(410).json({ error: 'Import session expired. Please upload again.' });
    return;
  }

  const dataDir = getDataDir();
  const results: Record<string, 'ok' | 'skipped' | 'error'> = {};

  for (const categoryKey of selectedCategories) {
    const category = CATEGORIES[categoryKey];
    if (!category) { results[categoryKey] = 'skipped'; continue; }

    try {
      const srcPath = join(session.tempDir, category.path);
      const destPath = join(dataDir, category.path);

      if (!existsSync(srcPath)) { results[categoryKey] = 'skipped'; continue; }

      // Close SQLite connections before overwriting
      if (categoryKey === 'agents') agentStore.closeDb();
      else if (categoryKey === 'database') databaseStore.closeDb();
      else if (categoryKey === 'kanban') kanbanStore.closeDb();

      if (statSync(srcPath).isDirectory()) {
        if (existsSync(destPath)) rmSync(destPath, { recursive: true, force: true });
        cpSync(srcPath, destPath, { recursive: true });
      } else {
        cpSync(srcPath, destPath);
      }

      results[categoryKey] = 'ok';
    } catch (e) {
      console.error(`[data-import] error importing ${categoryKey}:`, e);
      results[categoryKey] = 'error';
    }
  }

  // Cleanup
  rmSync(session.tempDir, { recursive: true, force: true });
  activeImportSessions.delete(sessionId);

  res.json({ results });
});

// --- In-memory import sessions with auto-cleanup ---
const activeImportSessions = new Map<string, { tempDir: string; expiresAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of activeImportSessions) {
    if (now > session.expiresAt) {
      rmSync(session.tempDir, { recursive: true, force: true });
      activeImportSessions.delete(id);
    }
  }
}, 10 * 60 * 1000).unref();

// --- Helpers ---
function listFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(join(dir, entry.name)));
    } else {
      results.push(join(dir, entry.name));
    }
  }
  return results;
}

function getDirSize(dir: string): number {
  return listFilesRecursive(dir).reduce((sum, f) => sum + statSync(f).size, 0);
}

function countFiles(dir: string): number {
  return listFilesRecursive(dir).length;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default router;
