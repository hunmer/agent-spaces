import { Router, type Request, type Response } from 'express';
import { exec } from 'child_process';
import { resolve, join } from 'path';
import { existsSync } from 'node:fs';
import * as fileService from '../services/file.js';
import * as wsService from '../services/workspace.js';
import { getDataDir } from '../storage/json-store.js';

const EDITOR_STATE_PATH = '.agentspace/editor-state.json';

const router = Router({ mergeParams: true });

router.get('/tree', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const path = (req.query.path as string) || '';
  const depth = parseInt(req.query.depth as string) || undefined;
  const tree = await fileService.readTree(ws, path, depth);
  res.json(tree);
});

router.get('/content', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const path = req.query.path as string;
  if (!path) { res.status(400).json({ error: 'path is required' }); return; }

  const result = await fileService.readFileContent(ws, path);
  if (!result) { res.status(404).json({ error: 'File not found' }); return; }
  res.json(result);
});

router.get('/exists', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const path = req.query.path as string;
  if (!path) { res.status(400).json({ error: 'path is required' }); return; }

  res.json({ exists: fileService.fileExists(ws, path) });
});

router.put('/content', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const { path, content } = req.body;
  if (!path || content === undefined) { res.status(400).json({ error: 'path and content are required' }); return; }

  const ok = await fileService.writeFileContent(ws, path, content);
  if (!ok) { res.status(500).json({ error: 'Failed to write file' }); return; }
  res.json({ ok: true });
});

router.delete('/', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const path = req.query.path as string;
  if (!path) { res.status(400).json({ error: 'path is required' }); return; }

  const ok = await fileService.deletePath(ws, path);
  if (!ok) { res.status(500).json({ error: 'Failed to delete' }); return; }
  res.json({ ok: true });
});

router.get('/editor-state', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const result = await fileService.readFileContent(ws, EDITOR_STATE_PATH);
  if (!result) { res.json({ openFilePaths: [], activeFilePath: null }); return; }
  try {
    const state = JSON.parse(result.content);
    res.json(state);
  } catch {
    res.json({ openFilePaths: [], activeFilePath: null });
  }
});

router.put('/editor-state', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const { openFilePaths, activeFilePath, pinnedPaths } = req.body;
  if (!Array.isArray(openFilePaths)) { res.status(400).json({ error: 'openFilePaths is required' }); return; }

  const ok = await fileService.writeFileContent(ws, EDITOR_STATE_PATH, JSON.stringify({ openFilePaths, activeFilePath, pinnedPaths: pinnedPaths ?? [] }, null, 2));
  if (!ok) { res.status(500).json({ error: 'Failed to save editor state' }); return; }
  res.json({ ok: true });
});

router.post('/reveal', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const relPath = req.query.path as string;
  const channelId = req.query.channelId as string;

  let fullPath: string;
  if (channelId) {
    fullPath = resolve(join(getDataDir(), 'workspaces', ws.id, 'channels', channelId));
  } else if (relPath) {
    fullPath = resolve(ws.boundDirs[0], relPath);
  } else {
    fullPath = resolve(ws.boundDirs[0]);
  }

  console.log('[reveal] workspace:', ws.id, 'channelId:', channelId ?? '(none)', 'relPath:', relPath ?? '(none)', '=> fullPath:', fullPath);

  const cmd = process.platform === 'darwin'
    ? `open "${fullPath}"`
    : process.platform === 'win32'
      ? `explorer "${fullPath}"`
      : `xdg-open "${fullPath}"`;

  console.log('[reveal] platform:', process.platform, 'cmd:', cmd);

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error('[reveal] failed:', err.message, 'stderr:', stderr);
      res.status(500).json({ error: 'Failed to reveal', detail: err.message });
      return;
    }
    if (stdout) console.log('[reveal] stdout:', stdout);
    if (stderr) console.log('[reveal] stderr:', stderr);
    res.json({ ok: true, path: fullPath });
  });
});

router.post('/rename', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const { oldPath, newPath } = req.body;
  if (!oldPath || !newPath) { res.status(400).json({ error: 'oldPath and newPath are required' }); return; }

  const ok = await fileService.renamePath(ws, oldPath, newPath);
  if (!ok) { res.status(500).json({ error: 'Failed to rename' }); return; }
  res.json({ ok: true });
});

router.post('/copy', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const { srcPath, destPath } = req.body;
  if (!srcPath || !destPath) { res.status(400).json({ error: 'srcPath and destPath are required' }); return; }

  const ok = await fileService.copyPath(ws, srcPath, destPath);
  if (!ok) { res.status(500).json({ error: 'Failed to copy' }); return; }
  res.json({ ok: true });
});

router.post('/import-url', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const { url, targetDir } = req.body;
  if (!url) { res.status(400).json({ error: 'url is required' }); return; }

  const result = await fileService.importFromUrl(ws, url, targetDir || '');
  if (!result) { res.status(500).json({ error: 'Failed to import from URL' }); return; }
  res.json({ ok: true, path: result });
});

router.post('/import-path', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const { absPath, targetDir } = req.body;
  if (!absPath) { res.status(400).json({ error: 'absPath is required' }); return; }

  const result = await fileService.importFromAbsPath(ws, absPath, targetDir || '');
  if (!result) { res.status(500).json({ error: 'Failed to import file' }); return; }
  res.json({ ok: true, path: result });
});

router.post('/upload', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const { targetDir, files } = req.body;
  if (!Array.isArray(files) || files.length === 0) { res.status(400).json({ error: 'files are required' }); return; }

  const results: string[] = [];
  for (const f of files) {
    if (!f.name || !f.content) continue;
    const buffer = Buffer.from(f.content, 'base64');
    const relPath = targetDir ? `${targetDir}/${f.name}` : f.name;
    const ok = await fileService.writeFileBinary(ws, relPath, buffer);
    if (ok) results.push(relPath);
  }

  res.json({ ok: true, paths: results });
});

export default router;
