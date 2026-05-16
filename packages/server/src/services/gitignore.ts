import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface IgnoreFilter {
  isIgnored: (relPath: string, name: string, isDir: boolean) => boolean;
}

const cache = new Map<string, { mtime: number; filter: IgnoreFilter }>();

function matchPattern(pattern: string, name: string): boolean {
  if (pattern.startsWith('*.')) {
    return name.endsWith(pattern.slice(1));
  }
  if (pattern.startsWith('*.') && pattern.includes('/')) {
    return name.endsWith(pattern.split('/').pop()!);
  }
  if (pattern.includes('*')) {
    const re = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return re.test(name);
  }
  return name === pattern;
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

  let patterns: { raw: string; dirOnly: boolean; negated: boolean; fullPath: string }[] = [];
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
        // extract the last segment for name matching
        const namePart = p.includes('/') ? p.split('/').filter(Boolean).pop()! : p;
        return { raw: namePart, dirOnly, negated, fullPath: p };
      });
  } catch {
    // no .gitignore
  }

  const filter: IgnoreFilter = {
    isIgnored(relPath: string, name: string, isDir: boolean) {
      for (const p of patterns) {
        if (p.dirOnly && !isDir) continue;
        if (matchPattern(p.raw, name) || matchPattern(p.fullPath, relPath)) {
          return !p.negated;
        }
      }
      return false;
    },
  };

  cache.set(rootDir, { mtime, filter });
  return filter;
}
