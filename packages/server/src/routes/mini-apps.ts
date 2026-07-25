import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { existsSync, mkdirSync, writeFileSync, rmSync, createReadStream, statSync } from 'node:fs';
import { join, basename, resolve, extname } from 'node:path';
import { randomUUID } from 'crypto';
import { exec } from 'node:child_process';
import * as svc from '../services/mini-apps.js';
import { invokeService } from '../services/mini-app-services.js';
import { getProject, readAgentsConfig, readAgentConfig, upsertAgentConfig, listAgentChats, clearAgentChats, DuplicateNameError } from '../storage/mini-app-store.js';
import { getRegisteredMiniAppTools, runMiniAppAgent } from '../services/mini-app-agent.js';

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
  } catch (error: any) {
    if (error instanceof DuplicateNameError) { res.status(409).json({ error: 'name already exists' }); return; }
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', (req: Request<{ id: string }>, res: Response) => {
  try { res.json(svc.getProject(req.params.id)); }
  catch (error: any) { res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message }); }
});

router.get('/:id/tools', (req: Request<{ id: string }>, res: Response) => {
  try {
    if (!getProject(req.params.id)) { res.status(404).json({ error: 'Project not found' }); return; }
    res.json({ tools: Object.values(getRegisteredMiniAppTools(req.params.id)) });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.put('/:id', (req: Request<{ id: string }>, res: Response) => {
  try { res.json(svc.updateProject(req.params.id, req.body)); }
  catch (error: any) {
    if (error instanceof DuplicateNameError) { res.status(409).json({ error: 'name already exists' }); return; }
    res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
  }
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

// 生成缩略图（服务端 sharp）。源图来自 data 目录本地文件或远程 URL；结果写到 data 目录。
// Body: { source?, url?, target, width?, height?, quality?, fit? }
//   - source: 相对 data 目录的源图路径（优先于 url）
//   - url:    远程图片地址（当无 source 时下载后处理）
//   - target: 相对 data 目录的输出路径（如 thumbs/xxx.jpg）
//   - width/height: 缩略图尺寸，默认 width=320
//   - quality: JPEG 质量 1-100，默认 80
//   - fit: 'cover' | 'inside' | 'fill'，默认 'cover'
router.post('/:id/data/thumbnail', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { source, url, target, width, height, quality, fit } = req.body ?? {};
    if (!target || typeof target !== 'string') { res.status(400).json({ error: 'target is required' }); return; }

    // 取源图 Buffer：优先本地 data 文件，其次远程 URL
    let buf: Buffer | null = null;
    if (typeof source === 'string' && source.trim()) {
      buf = svc.readDataFile(req.params.id, source);
      if (!buf) { res.status(404).json({ error: `source not found: ${source}` }); return; }
    } else if (typeof url === 'string' && url.trim()) {
      const r = await fetch(url, { redirect: 'follow' });
      if (!r.ok) { res.status(502).json({ error: `download failed: ${r.status} ${r.statusText}` }); return; }
      buf = Buffer.from(await r.arrayBuffer());
    } else {
      res.status(400).json({ error: 'either source or url is required' }); return;
    }

    const sharp = (await import('sharp')).default;
    const w = Math.max(1, Math.min(2048, Number(width) || 320));
    const h = height ? Math.max(1, Math.min(2048, Number(height))) : undefined;
    const q = Math.max(1, Math.min(100, Number(quality) || 80));
    const fitMode = fit === 'inside' || fit === 'fill' ? fit : 'cover';

    const thumbBuf = await sharp(buf)
      .resize(w, h, { fit: fitMode as 'cover' | 'inside' | 'fill', withoutEnlargement: true })
      .jpeg({ quality: q, mozjpeg: false })
      .toBuffer();

    const size = svc.writeDataFile(req.params.id, target, thumbBuf);
    res.json({ ok: true, path: `data/${target}`, width: w, height: h, size });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// 读取 data 目录下的文件并以 HTTP 响应（供前端 <img>/<video> 直接引用本地产物）。
// Query: path（相对 data 目录）、download?
router.get('/:id/data/file', (req: Request<{ id: string }>, res: Response) => {
  try {
    const rawPath = req.query.path as string;
    if (!rawPath) { res.status(400).json({ error: 'path is required' }); return; }
    const abs = svc.resolveDataPath(req.params.id, rawPath); // safeProjectSubdirPath 已防穿越
    if (!existsSync(abs)) { res.status(404).json({ error: 'File not found' }); return; }
    const stat = statSync(abs);
    if (stat.isDirectory()) { res.status(400).json({ error: 'Cannot serve a directory' }); return; }
    const ext = extname(abs).toLowerCase();
    const mime = LOCAL_FILE_MIME[ext];
    if (!mime) { res.status(415).json({ error: `Unsupported file type: ${ext || '(none)'}` }); return; }

    if (req.query.download === 'true') {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(basename(abs))}"`);
    }
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', stat.size);
    createReadStream(abs).pipe(res);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// 读取 src 目录下的静态资源并以正确 MIME 流式返回。
// 供 mini-app 预览代码通过 <script src>/<link>/<img> 直接引用项目 src 下的 js/css/字体等产物。
// 与 data/file 不同：data/ 仅限媒体白名单，src/file 扩展到 js/css/字体等前端资源。
// Query: path（相对 src 目录）、download?
const SRC_FILE_MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  // Godot/wasm 游戏引擎 web 导出产物（如 Pixelorama）：pck=资源包，wasm=核心二进制，data=侧载资源
  '.pck': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
};

router.get('/:id/src/file', (req: Request<{ id: string }>, res: Response) => {
  try {
    const rawPath = req.query.path as string;
    if (!rawPath) { res.status(400).json({ error: 'path is required' }); return; }
    const abs = svc.resolveSrcPath(req.params.id, rawPath); // safeSrcPath 已防穿越
    if (!existsSync(abs)) { res.status(404).json({ error: 'File not found' }); return; }
    const stat = statSync(abs);
    if (stat.isDirectory()) { res.status(400).json({ error: 'Cannot serve a directory' }); return; }
    const ext = extname(abs).toLowerCase();
    const mime = SRC_FILE_MIME[ext];
    if (!mime) { res.status(415).json({ error: `Unsupported file type: ${ext || '(none)'}` }); return; }

    if (req.query.download === 'true') {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(basename(abs))}"`);
    }
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', stat.size);
    createReadStream(abs).pipe(res);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// src 目录静态资源（path 段形式）：GET /:id/src/file/<relPath...>
// 与 query 形式等价，但用 path 段以便与 new URL(rel, base) 拼接兼容——
// Excalidraw 用 window.EXCALIDRAW_ASSET_PATH + new URL("./fonts/x.woff2", base) 加载资源，
// query 形式 base 会在拼接时丢失 query string，path 段形式则正确。
router.get('/:id/src/file/*path', (req: Request<{ id: string; path: string | string[] }>, res: Response) => {
  try {
    // Express 5 的 *path 对多段通配返回数组，单段返回字符串，统一归一化。
    const raw = req.params.path;
    const relPath = Array.isArray(raw) ? raw.join('/') : (raw || '');
    if (!relPath) { res.status(400).json({ error: 'path is required' }); return; }
    const abs = svc.resolveSrcPath(req.params.id, relPath);
    if (!existsSync(abs)) { res.status(404).json({ error: 'File not found' }); return; }
    const stat = statSync(abs);
    if (stat.isDirectory()) { res.status(400).json({ error: 'Cannot serve a directory' }); return; }
    const ext = extname(abs).toLowerCase();
    const mime = SRC_FILE_MIME[ext];
    if (!mime) { res.status(415).json({ error: `Unsupported file type: ${ext || '(none)'}` }); return; }

    if (req.query.download === 'true') {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(basename(abs))}"`);
    }
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', stat.size);
    createReadStream(abs).pipe(res);
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

// Background upload
router.post('/:id/background', (req: Request<{ id: string }>, res: Response) => {
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

    // Remove old background file
    if (project.backgroundUrl) {
      const oldPath = join(svc.store.getProjectDir(project.id), project.backgroundUrl);
      if (existsSync(oldPath)) rmSync(oldPath, { force: true });
    }

    const filename = `background.${ext}`;
    const dir = svc.store.getProjectDir(project.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), Buffer.from(base64, 'base64'));

    const updated = svc.updateProject(req.params.id, { backgroundUrl: filename });
    res.json({ url: updated.backgroundUrl });
  } catch (error: any) { res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message }); }
});

// Serve project background
router.get('/:id/background', (req: Request<{ id: string }>, res: Response) => {
  try {
    const project = svc.getProject(req.params.id);
    if (!project.backgroundUrl) { res.status(404).json({ error: 'No background' }); return; }
    const filePath = join(svc.store.getProjectDir(project.id), project.backgroundUrl);
    if (!existsSync(filePath)) { res.status(404).json({ error: 'Background file not found' }); return; }
    const ext = project.backgroundUrl.split('.').pop()?.toLowerCase() ?? 'png';
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
    const { zip, name, type, description, id, storeUrl, storeChecksum } = req.body;
    if (!zip) { res.status(400).json({ error: 'zip (base64) is required' }); return; }
    const buffer = Buffer.from(zip, 'base64');
    const project = await svc.importZip(buffer, { name, type, description, id, storeUrl, storeChecksum });
    res.json(project);
  } catch (error: any) {
    if (error instanceof DuplicateNameError) { res.status(409).json({ error: 'name already exists' }); return; }
    res.status(500).json({ error: error.message });
  }
});

// ---- Agents (preview chat) ----

// GET /:id/agents — 脱敏返回 agents 清单 + enableAgents 开关
router.get('/:id/agents', (req: Request<{ id: string }>, res: Response) => {
  try {
    const project = getProject(req.params.id);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
    const configs = readAgentsConfig(req.params.id) ?? [];
    const agents = configs
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map((c) => ({
        id: String(c.id),
        name: String(c.name ?? c.id),
        avatar: typeof c.avatar === 'string' ? c.avatar : undefined,
        suggestions: Array.isArray(c.suggestions)
          ? c.suggestions.filter((s): s is string => typeof s === 'string')
          : [],
      }));
    res.json({ enableAgents: project.enableAgents === true, agents });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// GET /:id/agents/chat?sessionId=&agentId= — 历史
router.get('/:id/agents/chat', (req: Request<{ id: string }, any, any, { sessionId?: string; agentId?: string }>, res: Response) => {
  try {
    const { sessionId, agentId } = req.query;
    if (!sessionId) { res.status(400).json({ error: 'sessionId is required' }); return; }
    let messages = listAgentChats(req.params.id, sessionId);
    if (typeof agentId === 'string') messages = messages.filter((m) => m.agentId === agentId);
    res.json({ messages });
  } catch (error: any) {
    res.status(error.message === 'Invalid sessionId' ? 400 : 500).json({ error: error.message });
  }
});

// DELETE /:id/agents/chat?sessionId=&agentId= — 清空 session 历史（可选按 agentId 过滤）
router.delete('/:id/agents/chat', (req: Request<{ id: string }, any, any, { sessionId?: string; agentId?: string }>, res: Response) => {
  try {
    const { sessionId, agentId } = req.query;
    if (!sessionId) { res.status(400).json({ error: 'sessionId is required' }); return; }
    clearAgentChats(req.params.id, sessionId, typeof agentId === 'string' ? agentId : undefined);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(error.message === 'Invalid sessionId' ? 400 : 500).json({ error: error.message });
  }
});

// POST /:id/agents/:agentId/chat — SSE 流式
router.post('/:id/agents/:agentId/chat', (req: Request<{ id: string; agentId: string }>, res: Response) => {
  const { sessionId, message, route } = req.body ?? {};
  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({ error: 'sessionId is required' }); return;
  }
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'message is required' }); return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const ac = new AbortController();
  let completed = false;
  let closed = false;

  res.on('close', () => {
    closed = true;
    if (!completed && !res.writableEnded) ac.abort();
  });

  const write = (event: string, data: unknown) => {
    if (closed || res.writableEnded) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  runMiniAppAgent({
    projectId: req.params.id,
    agentId: req.params.agentId,
    sessionId,
    message,
    route,
    stopSignal: ac.signal,
    onEvent: (event) => {
      if (event.type === 'reasoning') write('reasoning', { text: event.text, status: event.status });
      else if (event.type === 'tool_use') write('tool_use', { id: event.id, name: event.name, input: event.input });
      else if (event.type === 'tool_result') write('tool_result', { toolUseId: event.toolUseId, result: event.result });
      else if (event.type === 'output') write('text', { line: event.line });
    },
  })
    .then(({ userMessage, agentMessage }) => {
      completed = true;
      write('message_saved', { userMessage, agentMessage });
      if (!closed && !res.writableEnded) {
        res.write('event: done\ndata: {}\n\n');
        res.end();
      }
    })
    .catch((error: any) => {
      completed = true;
      write('error', { message: error?.message ?? String(error) });
      if (!closed && !res.writableEnded) res.end();
    });
});

// GET /:id/agents/:agentId — 返回完整 agent config（含 apiKey，敏感字段，仅供编辑器加载）
router.get('/:id/agents/:agentId', (req: Request<{ id: string; agentId: string }>, res: Response) => {
  try {
    const project = getProject(req.params.id);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
    const entry = readAgentConfig(req.params.id, req.params.agentId);
    if (!entry) { res.status(404).json({ error: 'Agent not found' }); return; }
    res.json(entry);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// PUT /:id/agents/:agentId — 更新单条 agent config（整体替换）
router.put('/:id/agents/:agentId', (req: Request<{ id: string; agentId: string }>, res: Response) => {
  try {
    const project = getProject(req.params.id);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

    const body = req.body ?? {};
    const agentId = req.params.agentId;
    if (typeof body.id !== 'string' || body.id !== agentId) {
      res.status(400).json({ error: 'body.id must match :agentId' }); return;
    }
    if (typeof body.name !== 'string' || !body.name.trim()) {
      res.status(400).json({ error: 'name is required' }); return;
    }

    const entry: Record<string, unknown> = {
      id: body.id,
      name: String(body.name).trim(),
      avatar: typeof body.avatar === 'string' ? body.avatar : undefined,
      agentId: typeof body.agentId === 'string' ? body.agentId : undefined,
      runtimeKind: isMiniAppRuntimeKind(body.runtimeKind) ? body.runtimeKind : undefined,
      modelProvider: typeof body.modelProvider === 'string' ? body.modelProvider : undefined,
      providerId: typeof body.providerId === 'string' ? body.providerId : undefined,
      modelId: typeof body.modelId === 'string' ? body.modelId : undefined,
      systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt : undefined,
      temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
      maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : undefined,
      tools: body.tools && typeof body.tools === 'object' && !Array.isArray(body.tools) ? body.tools : undefined,
      suggestions: Array.isArray(body.suggestions)
        ? body.suggestions.filter((s: unknown): s is string => typeof s === 'string')
        : undefined,
    };
    for (const k of Object.keys(entry)) {
      if (entry[k] === undefined) delete entry[k];
    }

    const saved = upsertAgentConfig(req.params.id, agentId, entry);
    res.json(saved);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// 本地文件代理：mini-app 预览代码用 <img src> 访问任意本地绝对路径的图片/视频/音频。
// Eagle 等本地资源库场景：缩略图/原图位于资源库目录下，浏览器无法直接读 file://。
// 鉴权由 auth 中间件通过 query token 放行（见 middleware/auth.ts）。
function isMiniAppRuntimeKind(value: unknown): value is 'open-agent-sdk' | 'claude-code' | 'codex' | 'grok' | 'gemini-cli' | 'langchain' | 'hermes' | 'pi' {
  return value === 'open-agent-sdk'
    || value === 'claude-code'
    || value === 'codex'
    || value === 'grok'
    || value === 'gemini-cli'
    || value === 'langchain'
    || value === 'hermes'
    || value === 'pi';
}

const LOCAL_FILE_MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.aac': 'audio/aac',
};

router.get('/:id/local-file', (req: Request<{ id: string }>, res: Response) => {
  try {
    const rawPath = req.query.path as string;
    if (!rawPath) { res.status(400).json({ error: 'path is required' }); return; }

    // 统一为绝对路径；resolve 已会把相对路径锚到 cwd，这里显式拒绝相对路径以免误读项目内文件
    const abs = resolve(rawPath);
    if (abs !== resolve(rawPath) || !abs.match(/^[A-Za-z]:[\\/]|^\/|^\\\\/)) {
      res.status(400).json({ error: 'path must be absolute' }); return;
    }
    if (!existsSync(abs)) { res.status(404).json({ error: 'File not found' }); return; }

    const stat = statSync(abs);
    if (stat.isDirectory()) { res.status(400).json({ error: 'Cannot serve a directory' }); return; }

    const ext = extname(abs).toLowerCase();
    const mime = LOCAL_FILE_MIME[ext];
    if (!mime) { res.status(415).json({ error: `Unsupported file type: ${ext || '(none)'}` }); return; }

    const download = req.query.download === 'true';

    // Range 请求（视频/音频拖动）
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10) || 0;
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', chunkSize);
      res.setHeader('Content-Type', mime);
      createReadStream(abs, { start, end }).pipe(res);
      return;
    }

    res.setHeader('Content-Type', mime);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', stat.size);
    if (download) {
      const fileName = basename(abs);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    }
    createReadStream(abs).pipe(res);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// 外链图片代理：解决 <img> 跨域/防盗链/CORS 无法直接加载的问题。
// 后端用 fetch 拉取外链，把字节流 + Content-Type 透传给前端。仅允许 http(s)。
// 鉴权走 query token（见 middleware/auth.ts），因为 <img src> 不能带 Authorization header。
const PROXY_IMAGE_MIME_FALLBACK = 'image/png';
router.get('/:id/proxy-image', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const rawUrl = req.query.url as string;
    if (!rawUrl) { res.status(400).json({ error: 'url is required' }); return; }
    let target: URL;
    try { target = new URL(rawUrl); } catch { res.status(400).json({ error: 'invalid url' }); return; }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      res.status(400).json({ error: 'only http(s) allowed' }); return;
    }

    const resp = await fetch(target.href, {
      headers: { 'User-Agent': 'AgentSpaces-Proxy/1.0', 'Accept': 'image/*,*/*' },
      redirect: 'follow',
      // 不让外站通过 Set-Cookie 污染本站；代理也不携带本站凭据
    });
    if (!resp.ok) { res.status(resp.status).json({ error: `upstream ${resp.status}` }); return; }

    const ct = resp.headers.get('content-type') || PROXY_IMAGE_MIME_FALLBACK;
    const len = resp.headers.get('content-length');
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (len) res.setHeader('Content-Length', len);
    // 流式透传
    const buf = Buffer.from(await resp.arrayBuffer());
    res.send(buf);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

export default router;
