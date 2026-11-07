import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { minimatch } from 'minimatch';

export interface IgnoreFilter {
  isIgnored: (relPath: string, name: string, isDir: boolean) => boolean;
}

const cache = new Map<string, { mtime: number; filter: IgnoreFilter }>();

interface IgnorePattern {
  pattern: string;
  dirOnly: boolean;
  negated: boolean;
  hasSlash: boolean;
}

function normalizeRelPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function matchesDirPattern(pattern: string, relPath: string, hasSlash: boolean): boolean {
  if (!hasSlash) {
    return relPath.split('/').includes(pattern);
  }
  return relPath === pattern || relPath.startsWith(`${pattern}/`);
}

function matchesPattern(pattern: IgnorePattern, relPath: string, name: string, isDir: boolean): boolean {
  if (pattern.dirOnly) {
    return matchesDirPattern(pattern.pattern, relPath, pattern.hasSlash);
  }

  if (!pattern.hasSlash) {
    return minimatch(name, pattern.pattern, { dot: true, nocase: process.platform === 'win32' });
  }

  return minimatch(relPath, pattern.pattern, { dot: true, nocase: process.platform === 'win32' });
}

export async function createGitignoreFilter(rootDir: string): Promise<IgnoreFilter> {
  const gitignorePath = join(rootDir, '.gitignore');

  let mtime = 0;
  try {
    const { stat } = await import('node:fs/promises');
    mtime = (await stat(gitignorePath)).mtimeMs;
  } catch {
    // no .gitignore
  }

  const cached = cache.get(rootDir);
  if (cached && cached.mtime === mtime) return cached.filter;

  let patterns: IgnorePattern[] = [];
  try {
    const content = await readFile(gitignorePath, 'utf-8');
    patterns = content.split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .map(raw => {
        const negated = raw.startsWith('!');
        let p = negated ? raw.slice(1) : raw;
        const dirOnly = p.endsWith('/');
        if (dirOnly) p = p.slice(0, -1);
        p = normalizeRelPath(p);
        return { pattern: p, dirOnly, negated, hasSlash: p.includes('/') };
      });
  } catch {
    // no .gitignore
  }

  const filter: IgnoreFilter = {
    isIgnored(relPath: string, name: string, isDir: boolean) {
      const normalizedRelPath = normalizeRelPath(relPath);
      let ignored = false;

      for (const p of patterns) {
        if (matchesPattern(p, normalizedRelPath, name, isDir)) ignored = !p.negated;
      }

      return ignored;
    },
  };

  cache.set(rootDir, { mtime, filter });
  return filter;
}
