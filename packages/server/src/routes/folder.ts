import { Router, type Request, type Response } from 'express';
import { readdir, stat, mkdir, access, readFile } from 'node:fs/promises';
import { join, resolve, sep, extname } from 'node:path';
import { homedir } from 'node:os';
import { constants } from 'node:fs';

const router = Router();

interface DirEntry {
  name: string;
  path: string;
}

router.get('/browse', async (req: Request, res: Response) => {
  const raw = (req.query.path as string) || '';
  const includeFiles = req.query.files === '1';
  const fileFilter = (req.query.fileFilter as string) || '';
  const rawPath = raw === '~' || raw === '' ? homedir() : raw.replace(/^~[/\\]/, homedir() + sep);
  const dirPath = resolve(rawPath);

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const directories: DirEntry[] = [];
    const files: DirEntry[] = [];

    for (const entry of entries) {
      // Skip hidden entries
      if (entry.name.startsWith('.')) continue;
      try {
        const fullPath = join(dirPath, entry.name);
        await stat(fullPath);
        if (entry.isDirectory()) {
          directories.push({ name: entry.name, path: fullPath });
        } else if (includeFiles && entry.isFile()) {
          if (!fileFilter || entry.name.endsWith(fileFilter)) {
            files.push({ name: entry.name, path: fullPath });
          }
        }
      } catch {
        // Skip inaccessible entries
      }
    }

    // Compute parent path
    const parentPath = resolve(dirPath, '..');
    const isRoot = parentPath === dirPath;

    directories.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    res.json({
      path: dirPath,
      parent: isRoot ? null : parentPath,
      separator: sep,
      home: homedir(),
      directories,
      files,
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

export default router;
