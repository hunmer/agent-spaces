import { Router, type Request, type Response } from 'express';
import { readdir, stat, mkdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';

const router = Router();

interface DirEntry {
  name: string;
  path: string;
}

router.get('/browse', async (req: Request, res: Response) => {
  const raw = (req.query.path as string) || '';
  const rawPath = raw === '~' || raw === '' ? homedir() : raw.replace(/^~[/\\]/, homedir() + sep);
  const dirPath = resolve(rawPath);

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const directories: DirEntry[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Skip hidden directories
      if (entry.name.startsWith('.')) continue;
      try {
        const fullPath = join(dirPath, entry.name);
        await stat(fullPath);
        directories.push({ name: entry.name, path: fullPath });
      } catch {
        // Skip inaccessible directories
      }
    }

    // Compute parent path
    const parentPath = resolve(dirPath, '..');
    const isRoot = parentPath === dirPath;

    directories.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    res.json({
      path: dirPath,
      parent: isRoot ? null : parentPath,
      separator: sep,
      home: homedir(),
      directories,
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

export default router;
