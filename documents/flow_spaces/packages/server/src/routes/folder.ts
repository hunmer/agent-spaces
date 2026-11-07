import { Router, type Request, type Response } from 'express';
import { readdir, stat, mkdir, access, readFile } from 'node:fs/promises';
import { join, resolve, sep, extname, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { constants } from 'node:fs';
import { exec } from 'node:child_process';
import { getDataDir } from '../storage/json-store.js';

const router = Router();

interface DirEntry {
  name: string;
  path: string;
}

/** 枚举可用盘符/根路径。Windows 下探测 A-Z:，其它平台返回 ['/']。 */
async function listDrives(): Promise<string[]> {
  if (process.platform !== 'win32') return ['/'];
  const drives: string[] = [];
  for (let code = 65; code <= 90; code++) { // A-Z
    const letter = String.fromCharCode(code);
    const root = `${letter}:\\`;
    try {
      await stat(root);
      drives.push(root);
    } catch {
      // 盘符不存在
    }
  }
  return drives;
}

router.get('/browse', async (req: Request, res: Response) => {
  const raw = (req.query.path as string) || '';
  const includeFiles = req.query.files === '1';
  const fileFilter = (req.query.fileFilter as string) || '';
  const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit as string, 10) || 200));
  const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);
  const rawPath = raw === '~' || raw === '' ? homedir() : raw.replace(/^~[/\\]/, homedir() + sep);
  const dirPath = resolve(rawPath);

  try {
    const [entries, drives] = await Promise.all([
      readdir(dirPath, { withFileTypes: true }),
      listDrives(),
    ]);
    const directories: DirEntry[] = [];
    const files: DirEntry[] = [];

    for (const entry of entries) {
      // Skip hidden entries
      if (entry.name.startsWith('.')) continue;
      let isDir = false;
      let isFile = false;
      try {
        isDir = entry.isDirectory();
        isFile = entry.isFile();
      } catch {
        // Dirent 调用失败（如权限不足），跳过
        continue;
      }
      const fullPath = join(dirPath, entry.name);
      if (isDir) {
        directories.push({ name: entry.name, path: fullPath });
      } else if (includeFiles && isFile) {
        if (!fileFilter || entry.name.endsWith(fileFilter)) {
          files.push({ name: entry.name, path: fullPath });
        }
      }
    }

    // Compute parent path
    const parentPath = resolve(dirPath, '..');
    const isRoot = parentPath === dirPath;

    directories.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    // 文件分页（目录全量返回）
    const filesTotal = files.length;
    const pagedFiles = files.slice(offset, offset + limit);

    res.json({
      path: dirPath,
      parent: isRoot ? null : parentPath,
      separator: sep,
      home: homedir(),
      drives,
      directories,
      files: pagedFiles,
      filesTotal,
      limit,
      offset,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Cannot read directory' });
  }
});

router.post('/create', async (req: Request, res: Response) => {
  const { path: rawPath } = req.body as { path?: string };
  if (!rawPath) {
    res.status(400).json({ error: 'path is required' });
    return;
  }

  const dirPath = resolve(rawPath.replace(/^~[/\\]/, homedir() + sep));

  try {
    await mkdir(dirPath, { recursive: true });
    res.json({ path: dirPath });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create directory' });
  }
});

router.get('/check-permissions', async (req: Request, res: Response) => {
  const raw = req.query.path as string;
  if (!raw) {
    res.status(400).json({ error: 'path is required' });
    return;
  }

  const rawPath = raw === '~' ? homedir() : raw.replace(/^~[/\\]/, homedir() + sep);
  const dirPath = resolve(rawPath);

  const result = { path: dirPath, exists: false, readable: false, writable: false, error: '' as string };

  try {
    await stat(dirPath);
    result.exists = true;
  } catch {
    result.error = 'Directory does not exist';
    res.json(result);
    return;
  }

  try {
    await access(dirPath, constants.R_OK);
    result.readable = true;
  } catch {
    // not readable
  }

  try {
    await access(dirPath, constants.W_OK);
    result.writable = true;
  } catch {
    // not writable
  }

  if (!result.readable && !result.writable) {
    result.error = 'No read or write permission';
  } else if (!result.writable) {
    result.error = 'Read-only directory';
  }

  res.json(result);
});

router.get('/read-file', async (req: Request, res: Response) => {
  const raw = req.query.path as string;
  if (!raw) {
    res.status(400).json({ error: 'path is required' });
    return;
  }

  const filePath = resolve(raw.replace(/^~[/\\]/, homedir() + sep));
  const ext = extname(filePath).toLowerCase();

  // Only allow reading text-based config files
  const allowedExts = ['.json', '.yaml', '.yml', '.toml', '.txt', '.md', '.env', '.js', '.ts', '.mjs', '.cjs'];
  if (!allowedExts.includes(ext)) {
    res.status(400).json({ error: 'File type not allowed' });
    return;
  }

  try {
    const content = await readFile(filePath, 'utf-8');
    if (ext === '.json') {
      res.json(JSON.parse(content));
    } else {
      res.json({ content });
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Cannot read file' });
  }
});

router.post('/reveal', (req: Request, res: Response) => {
  const raw = (req.query.path as string) || '';
  if (!raw) {
    res.status(400).json({ error: 'path is required' });
    return;
  }
  // 绝对路径或 ~ 开头：按原逻辑解析；否则视为数据目录（getDataDir）下的相对子路径
  const dir = raw.startsWith('~') || isAbsolute(raw)
    ? resolve(raw.replace(/^~[/\\]/, homedir() + sep))
    : resolve(join(getDataDir(), raw));

  const cmd = process.platform === 'darwin'
    ? `open "${dir}"`
    : process.platform === 'win32'
      ? `explorer "${dir}"`
      : `xdg-open "${dir}"`;

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      res.status(500).json({ error: 'Failed to reveal directory', detail: err.message });
      return;
    }
    res.json({ success: true, path: dir });
  });
});

export default router;
