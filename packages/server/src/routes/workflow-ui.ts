import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { existsSync, mkdirSync, writeFileSync, rmSync, createReadStream } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { randomUUID } from 'crypto';
import { exec } from 'node:child_process';
import * as svc from '../services/workflow-ui.js';
import { invokeService } from '../services/workflow-ui-services.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

// CRUD
router.get('/', (_req: Request, res: Response) => {
  try { res.json(svc.listProjects()); }
  catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { name, description, type, tags } = req.body;
    if (!name || !type) { res.status(400).json({ error: 'name and type are required' }); return; }
    if (type !== 'react' && type !== 'html') { res.status(400).json({ error: 'type must be "react" or "html"' }); return; }
    res.json(svc.createProject({ name, description, type, tags }));
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.get('/:id', (req: Request<{ id: string }>, res: Response) => {
  try { res.json(svc.getProject(req.params.id)); }
  catch (error: any) { res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message }); }
});

router.put('/:id', (req: Request<{ id: string }>, res: Response) => {
  try { res.json(svc.updateProject(req.params.id, req.body)); }
  catch (error: any) { res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message }); }
});

router.delete('/:id', (req: Request<{ id: string }>, res: Response) => {
  try { svc.deleteProject(req.params.id); res.json({ ok: true }); }
  catch (error: any) { res.status(500).json({ error: error.message }); }
});

// Files
router.get('/:id/files', (req: Request<{ id: string }>, res: Response) => {
  try { res.json(svc.getFileTree(req.params.id)); }
  catch (error: any) { res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message }); }
});

// Flat file list with mtime — lets clients diff and only fetch changed files.
router.get('/:id/files/manifest', (req: Request<{ id: string }>, res: Response) => {
  try { res.json(svc.getFileManifest(req.params.id)); }
  catch (error: any) { res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message }); }
});

router.get('/:id/files/content', (req: Request<{ id: string }, any, any, { path?: string }>, res: Response) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) { res.status(400).json({ error: 'path query parameter is required' }); return; }
    res.json({ content: svc.readFile(req.params.id, filePath) });
  } catch (error: any) { res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message }); }
});

router.put('/:id/files/content', (req: Request<{ id: string }>, res: Response) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) { res.status(400).json({ error: 'path and content are required' }); return; }
    svc.writeFile(req.params.id, filePath, content);
    res.json({ ok: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// Delete a file or folder
router.delete('/:id/files', (req: Request<{ id: string }>, res: Response) => {
  try {
    const filePath = typeof req.body?.path === 'string' ? req.body.path : req.query.path as string;
    if (!filePath) { res.status(400).json({ error: 'path is required' }); return; }
    svc.deleteFile(req.params.id, filePath);
    res.json({ ok: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// Rename / move a file or folder
router.post('/:id/files/rename', (req: Request<{ id: string }>, res: Response) => {
  try {
    const { from, to } = req.body ?? {};
    if (!from || !to) { res.status(400).json({ error: 'from and to are required' }); return; }
    svc.renameFile(req.params.id, from, to);
    res.json({ ok: true });
  } catch (error: any) { res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message }); }
});

// Create an empty folder
router.post('/:id/files/folder', (req: Request<{ id: string }>, res: Response) => {
  try {
    const { path: dirPath } = req.body ?? {};
    if (!dirPath) { res.status(400).json({ error: 'path is required' }); return; }
    svc.createFolder(req.params.id, dirPath);
    res.json({ ok: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// Upload multiple files (binary) into project src, optionally under a folder.
// multipart/form-data: field "files" (repeated), optional field "folder".
router.post('/:id/files/upload', upload.array('files'), (req: Request<{ id: string }>, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) { res.status(400).json({ error: 'files is required' }); return; }

    const folder = typeof req.body.folder === 'string' ? req.body.folder.replace(/^\/+|\/+$/g, '') : '';

    // Multer decodes filenames as latin1; re-decode to utf-8 for non-ascii names.
    const decodeName = (name: string) => {
      if (!/[-]/.test(name)) return name;
      const decoded = Buffer.from(name, 'latin1').toString('utf8');
      return decoded && !decoded.includes('�') ? decoded : name;
    };

    const written: { path: string; size: number }[] = [];
    for (const file of files) {
      const safeName = basename(decodeName(file.originalname)).replace(/[<>:"\\|?*\x00-\x1F]/g, '_') || file.originalname;
      const relPath = folder ? `${folder}/${safeName}` : safeName;
      const size = svc.writeBinaryFile(req.params.id, relPath, file.buffer);
      written.push({ path: relPath, size });
    }
    res.json({ ok: true, files: written });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.get('/:id/configs/content', (req: Request<{ id: string }, any, any, { path?: string }>, res: Response) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) { res.status(400).json({ error: 'path query parameter is required' }); return; }
    res.json({ value: svc.readConfig(req.params.id, filePath) });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.put('/:id/configs/content', (req: Request<{ id: string }>, res: Response) => {
  try {
    const { path: filePath, value } = req.body;
    if (!filePath || value === undefined) { res.status(400).json({ error: 'path and value are required' }); return; }
    svc.writeConfig(req.params.id, filePath, value);
    res.json({ ok: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// Services RPC: invoke a project service handler defined in src/services/*.js.
// Body: { name, payload } -> { ok, result }. Handler runs server-side as the
// single writer of configs (ctx.writeConfig/updateConfig broadcast configChanged).
router.post('/:id/services/invoke', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { name, payload } = req.body ?? {};
    if (!name) { res.status(400).json({ error: 'name is required' }); return; }
    const result = await invokeService(req.params.id, name, payload);
    res.json({ ok: true, result });
  } catch (error: any) {
    res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
  }
});

router.put('/:id/data/content', (req: Request<{ id: string }>, res: Response) => {
  try {
    const { path: filePath, content, encoding } = req.body;
    if (!filePath || content === undefined) { res.status(400).json({ error: 'path and content are required' }); return; }
    const data = encoding === 'base64' ? Buffer.from(String(content), 'base64') : String(content);
    const size = svc.writeDataFile(req.params.id, filePath, data);
    res.json({ ok: true, path: `data/${filePath}`, size });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// DB (SQLite): execute a single statement. Body: { sql, params?, mode: 'all'|'get'|'run'|'exec' }
router.post('/:id/db/:dbName', (req: Request<{ id: string; dbName: string }>, res: Response) => {
  try {
    const { dbName } = req.params;
    const { sql, params, mode } = req.body ?? {};
    if (!sql || typeof sql !== 'string') { res.status(400).json({ error: 'sql is required' }); return; }
    if (!mode || !['all', 'get', 'run', 'exec'].includes(mode)) { res.status(400).json({ error: "mode must be one of all|get|run|exec" }); return; }
    const result = svc.executeDb(req.params.id, dbName, mode, sql, params);
    res.json({ ok: true, result });
  } catch (error: any) {
    res.status(400).json({ ok: false, error: { code: error?.code ?? 'SQLITE_ERROR', message: error?.message ?? String(error) } });
  }
});

// DB transaction: batch statements atomically. Body: { statements: [{ sql, params? }] }
router.post('/:id/db/:dbName/transaction', (req: Request<{ id: string; dbName: string }>, res: Response) => {
  try {
    const { dbName } = req.params;
    const { statements } = req.body ?? {};
    if (!Array.isArray(statements) || statements.length === 0) { res.status(400).json({ error: 'statements must be a non-empty array' }); return; }
    svc.executeDbTransaction(req.params.id, dbName, statements);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ ok: false, error: { code: error?.code ?? 'SQLITE_ERROR', message: error?.message ?? String(error) } });
  }
});

// Reveal project folder in OS file manager
router.post('/:id/reveal', (req: Request<{ id: string }>, res: Response) => {
  try {
    const project = svc.getProject(req.params.id);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
    const fullPath = resolve(svc.store.getProjectDir(req.params.id));
    const cmd = process.platform === 'darwin'
      ? `open "${fullPath}"`
      : process.platform === 'win32'
        ? `explorer "${fullPath}"`
        : `xdg-open "${fullPath}"`;
    exec(cmd, (err) => {
      if (err) { res.status(500).json({ error: 'Failed to reveal', detail: err.message }); return; }
      res.json({ ok: true, path: fullPath });
    });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// Avatar upload
router.post('/:id/avatar', (req: Request<{ id: string }>, res: Response) => {
  try {
    const { dataUrl } = req.body as { dataUrl?: string };
    if (!dataUrl || !dataUrl.startsWith('data:')) { res.status(400).json({ error: 'Invalid dataUrl' }); return; }
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) { res.status(400).json({ error: 'Invalid base64 data' }); return; }
    const [, mime, base64] = match;
    const extByMime: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
    const ext = extByMime[mime.toLowerCase()];
    if (!ext) { res.status(400).json({ error: 'Unsupported image type' }); return; }

    const project = svc.getProject(req.params.id);

    // Remove old avatar file
    if (project.avatarUrl) {
      const oldPath = join(svc.store.getProjectDir(project.id), project.avatarUrl);
      if (existsSync(oldPath)) rmSync(oldPath, { force: true });
    }

    const filename = `avatar.${ext}`;
    const dir = svc.store.getProjectDir(project.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), Buffer.from(base64, 'base64'));

    const updated = svc.updateProject(req.params.id, { avatarUrl: filename });
    res.json({ url: updated.avatarUrl });
  } catch (error: any) { res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message }); }
});

// Serve project avatar
router.get('/:id/avatar', (req: Request<{ id: string }>, res: Response) => {
  try {
    const project = svc.getProject(req.params.id);
    if (!project.avatarUrl) { res.status(404).json({ error: 'No avatar' }); return; }
    const filePath = join(svc.store.getProjectDir(project.id), project.avatarUrl);
    if (!existsSync(filePath)) { res.status(404).json({ error: 'Avatar file not found' }); return; }
    const ext = project.avatarUrl.split('.').pop()?.toLowerCase() ?? 'png';
    const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
    res.setHeader('Content-Type', mimeMap[ext] ?? 'image/png');
    res.setHeader('Cache-Control', 'no-cache');
    createReadStream(filePath).pipe(res);
  } catch (error: any) { res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message }); }
});

// ZIP Export
router.get('/:id/export', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const zip = await svc.exportZip(req.params.id);
    const project = svc.getProject(req.params.id);
    const name = (project?.name ?? 'project').replace(/[^\w\-.]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.zip"`);
    res.send(zip);
  } catch (error: any) { res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message }); }
});

// ZIP Import
router.post('/import', async (req: Request, res: Response) => {
  try {
    const { zip, name, type, description } = req.body;
    if (!zip) { res.status(400).json({ error: 'zip (base64) is required' }); return; }
    const buffer = Buffer.from(zip, 'base64');
    const project = await svc.importZip(buffer, { name, type, description });
    res.json(project);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

export default router;
