import { readdir, stat, readFile, writeFile, mkdir, rm, rename as fsRename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, dirname } from 'node:path';
import type { FileNode } from '@agent-spaces/shared';
import type { Workspace } from '@agent-spaces/shared';
import { getWorkspace } from '../storage/workspace-store.js';
import { createGitignoreFilter } from './gitignore.js';

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.next', '.DS_Store']);

export function resolvePath(workspace: Workspace, relPath: string): string | null {
  if (isAbsolute(relPath)) {
    return existsSync(relPath) ? relPath : null;
  }
  const base = resolve(workspace.boundDirs[0]);
  const abs = resolve(base, relPath);
  const rel = relative(base, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  return abs;
}

export async function readTree(workspace: Workspace, relPath = '', depth = Infinity): Promise<FileNode[]> {
  const dirPath = resolvePath(workspace, relPath);
  if (!dirPath) return [];

  const baseDir = resolve(workspace.boundDirs[0]);
  const ig = await createGitignoreFilter(baseDir);

  try {
    var entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = join(dirPath, entry.name);
    const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;

    const isIgnored = ig.isIgnored(entryRelPath, entry.name, entry.isDirectory());

    const s = await stat(fullPath);

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: entryRelPath,
        type: 'directory',
        ignored: isIgnored || undefined,
        children: depth > 1 ? await readTree(workspace, entryRelPath, depth - 1) : undefined,
      });
    } else {
      nodes.push({
        name: entry.name,
        path: entryRelPath,
        type: 'file',
        ignored: isIgnored || undefined,
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

export async function readFileContent(workspace: Workspace, relPath: string): Promise<{ content: string; encoding: string } | null> {
  const abs = resolvePath(workspace, relPath);
  if (!abs) return null;

  try {
    const content = await readFile(abs, 'utf-8');
    return { content, encoding: 'utf-8' };
  } catch {
    return null;
  }
}

export async function writeFileContent(workspace: Workspace, relPath: string, content: string): Promise<boolean> {
  const abs = resolvePath(workspace, relPath);
  if (!abs) return false;

  try {
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

export async function deletePath(workspace: Workspace, relPath: string): Promise<boolean> {
  const abs = resolvePath(workspace, relPath);
  if (!abs) return false;

  try {
    await rm(abs, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

export async function writeFileBinary(workspace: Workspace, relPath: string, buffer: Buffer): Promise<boolean> {
  const abs = resolvePath(workspace, relPath);
  if (!abs) return false;
  try {
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, buffer);
    return true;
  } catch {
    return false;
  }
}

export async function importFromUrl(workspace: Workspace, url: string, targetDir: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const urlPath = new URL(url).pathname;
    const filename = decodeURIComponent(urlPath.split('/').pop() || 'downloaded-file');
    const relPath = targetDir ? `${targetDir}/${filename}` : filename;
    const ok = await writeFileBinary(workspace, relPath, buffer);
    return ok ? relPath : null;
  } catch {
    return null;
  }
}

export async function importFromAbsPath(workspace: Workspace, absPath: string, targetDir: string): Promise<string | null> {
  try {
    const content = await readFile(absPath);
    const filename = absPath.split(/[/\\]/).pop() || 'imported-file';
    const relPath = targetDir ? `${targetDir}/${filename}` : filename;
    const ok = await writeFileBinary(workspace, relPath, content);
    return ok ? relPath : null;
  } catch {
    return null;
  }
}

export async function renamePath(workspace: Workspace, oldRelPath: string, newRelPath: string): Promise<boolean> {
  const oldAbs = resolvePath(workspace, oldRelPath);
  const newAbs = resolvePath(workspace, newRelPath);
  if (!oldAbs || !newAbs) return false;

  try {
    await mkdir(dirname(newAbs), { recursive: true });
    await fsRename(oldAbs, newAbs);
    return true;
  } catch {
    return false;
  }
}

export async function copyPath(workspace: Workspace, srcRelPath: string, destRelPath: string): Promise<boolean> {
  const srcAbs = resolvePath(workspace, srcRelPath);
  const destAbs = resolvePath(workspace, destRelPath);
  if (!srcAbs || !destAbs) return false;

  try {
    const { cp } = await import('node:fs/promises');
    await mkdir(dirname(destAbs), { recursive: true });
    await cp(srcAbs, destAbs, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export { getWorkspace };
