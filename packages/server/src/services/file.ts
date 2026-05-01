import { readdir, stat, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import type { FileNode } from '@agent-spaces/shared';
import type { Workspace } from '@agent-spaces/shared';
import { getWorkspace } from '../storage/workspace-store.js';

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.next', '.DS_Store']);

export function resolvePath(workspace: Workspace, relPath: string): string | null {
  const abs = join(workspace.boundDirs[0], relPath);
  if (!abs.startsWith(workspace.boundDirs[0])) return null;
  return abs;
}

export async function readTree(workspace: Workspace, relPath = ''): Promise<FileNode[]> {
  const dirPath = resolvePath(workspace, relPath);
  if (!dirPath) return [];

  const entries = await readdir(dirPath, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = join(dirPath, entry.name);
    const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;
    const s = await stat(fullPath);

    if (entry.isDirectory()) {
      const children = await readTree(workspace, entryRelPath);
      nodes.push({
        name: entry.name,
        path: entryRelPath,
        type: 'directory',
        children,
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

export { getWorkspace };
