import { Router, type Request, type Response } from 'express';
import { exec } from 'child_process';
import { resolve, join, extname } from 'path';
import { existsSync, createReadStream, statSync } from 'node:fs';
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

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'video/ogg', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.aac': 'audio/aac',
  '.m4a': 'audio/mp4', '.opus': 'audio/opus',
};

router.get('/content', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const path = req.query.path as string;
  if (!path) { res.status(400).json({ error: 'path is required' }); return; }

  const raw = req.query.raw === 'true';
  if (raw) {
    const abs = fileService.resolvePath(ws, path);
    if (!abs || !existsSync(abs)) { res.status(404).json({ error: 'File not found' }); return; }
    const ext = extname(path).toLowerCase();
    const mime = MIME_MAP[ext] || 'application/octet-stream';
    const stat = statSync(abs);
    const fileSize = stat.size;

    // Handle Range requests for video/audio seeking
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', chunkSize);
      res.setHeader('Content-Type', mime);
      createReadStream(abs, { start, end }).pipe(res);
      return;
    }

    res.setHeader('Content-Type', mime);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', fileSize);
    createReadStream(abs).pipe(res);
    return;
  }

  const result = await fileService.readFileContent(ws, path);
  if (!result) {
    // .gitignore 等忽略配置文件不存在时返回空内容，由前端写入时自动创建
    if (path === '.gitignore' || /\.(gitignore|dockerignore|eslintignore|npmignore|prettierignore)$/.test(path)) {
      res.json({ content: '' });
      return;
    }
    res.status(404).json({ error: 'File not found' });
    return;
  }
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

router.get('/download', async (req: Request<{ id: string }>, res: Response) => {
  const ws = fileService.getWorkspace(req.params.id);
  if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

  const path = req.query.path as string;
  if (!path) { res.status(400).json({ error: 'path is required' }); return; }

  const abs = fileService.resolvePath(ws, path);
  if (!abs || !existsSync(abs)) { res.status(404).json({ error: 'File not found' }); return; }

  const stat = statSync(abs);
  if (stat.isDirectory()) { res.status(400).json({ error: 'Cannot download a directory' }); return; }

  const ext = extname(path).toLowerCase();
  const mime = MIME_MAP[ext] || 'application/octet-stream';
  const fileName = path.split('/').pop() || 'download';

  // Handle Range requests for large files
  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = end - start + 1;

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', chunkSize);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    createReadStream(abs, { start, end }).pipe(res);
    return;
  }

  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
  res.setHeader('Accept-Ranges', 'bytes');
  createReadStream(abs).pipe(res);
});

export default router;
