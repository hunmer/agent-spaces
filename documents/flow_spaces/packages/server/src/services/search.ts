// packages/server/src/services/search.ts
import { execFileSync } from 'node:child_process';
import { readdir, stat, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { minimatch } from 'minimatch';
import type { Workspace, CodeSearchResult, FileSearchResult, SearchCodeOptions } from '@agent-spaces/shared';
import { resolvePath } from './file.js';
import { createGitignoreFilter, type IgnoreFilter } from './gitignore.js';

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.next', '.DS_Store', '__pycache__', '.turbo', 'dist', 'build', '.cache']);
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.zip', '.tar', '.gz', '.wasm']);
const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const MAX_PRELOAD_SIZE = 500 * 1024; // 500KB

function isBinaryPath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return BINARY_EXTENSIONS.has(`.${ext}`) || ext === path;
}

function toWorkspaceRelativePath(basePath: string, path: string): string | null {
  const absPath = isAbsolute(path) ? resolve(path) : resolve(basePath, path);
  const relPath = relative(basePath, absPath);
  if (relPath.startsWith('..') || isAbsolute(relPath)) return null;
  return relPath;
}

// --- ripgrep implementation ---

interface RgMatch {
  type: 'match';
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    absolute_offset: number;
    submatches: { start: number; end: number; match: { text: string } }[];
  };
}

function searchWithRipgrep(basePath: string, options: SearchCodeOptions): CodeSearchResult[] {
  const args = ['--json', '--max-count', String(options.maxResults || 200)];

  if (!options.caseSensitive) args.push('-i');
  if (options.regex) {
    args.push('--regexp', options.query);
  } else {
    args.push('--regexp', escapeRegex(options.query));
  }
  if (options.filePattern) args.push('--glob', options.filePattern);

  args.push('--', '.');

  try {
    const output = execFileSync('rg', args, {
      cwd: basePath,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
    });

    const results: CodeSearchResult[] = [];
    for (const line of output.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed: RgMatch = JSON.parse(line);
        if (parsed.type !== 'match') continue;

        const filePath = toWorkspaceRelativePath(basePath, parsed.data.path.text);
        if (!filePath) continue;

        const text = parsed.data.lines.text.trimEnd();
        const sub = parsed.data.submatches[0];
        if (!sub) continue;

        const rstripLen = parsed.data.lines.text.length - text.length;
        let matchStart = sub.start - rstripLen;
        if (matchStart < 0) matchStart = 0;

        results.push({
          file: filePath,
          line: parsed.data.line_number,
          column: sub.start + 1,
          text,
          matchStart,
          matchLength: sub.end - sub.start,
        });

        if (results.length >= (options.maxResults || 200)) break;
      } catch { /* skip malformed lines */ }
    }
    return results;
  } catch (err: any) {
    if (err.status === 1) return [];
    throw err;
  }
}

// --- Node.js native fallback ---

async function searchWithNodeJs(basePath: string, options: SearchCodeOptions): Promise<CodeSearchResult[]> {
  const maxResults = options.maxResults || 200;
  const results: CodeSearchResult[] = [];
  const flags = options.caseSensitive ? 'g' : 'gi';
  let regex: RegExp;
  try {
    regex = options.regex ? new RegExp(options.query, flags) : new RegExp(escapeRegex(options.query), flags);
  } catch {
    return [];
  }

  const ig = await createGitignoreFilter(basePath);

  async function walk(dir: string): Promise<void> {
    if (results.length >= maxResults) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxResults) return;
      if (IGNORED_DIRS.has(entry.name)) continue;

      const fullPath = join(dir, entry.name);
      const relPath = relative(basePath, fullPath);
      if (ig.isIgnored(relPath, entry.name, entry.isDirectory())) continue;

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        if (isBinaryPath(entry.name)) continue;

        const s = await stat(fullPath);
        if (s.size > MAX_FILE_SIZE) continue;

        if (options.filePattern && !minimatch(relPath, options.filePattern)) continue;

        try {
          const content = await readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          const relPath = relative(basePath, fullPath);

          for (let i = 0; i < lines.length; i++) {
            if (results.length >= maxResults) return;
            const text = lines[i];
            const match = regex.exec(text);
            if (match) {
              results.push({
                file: relPath,
                line: i + 1,
                column: match.index + 1,
                text: text.trimEnd(),
                matchStart: match.index,
                matchLength: match[0].length,
              });
            }
            regex.lastIndex = 0;
          }
        } catch { /* skip unreadable files */ }
      }
    }
  }

  await walk(basePath);
  return results;
}

// --- file name search ---

async function walkForFiles(dir: string, query: string, results: FileSearchResult[], basePath: string, limit: number, ig: IgnoreFilter): Promise<void> {
  if (results.length >= limit) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (results.length >= limit) return;
    if (IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = join(dir, entry.name);
    const relPath = relative(basePath, fullPath);
    if (ig.isIgnored(relPath, entry.name, entry.isDirectory())) continue;

    if (entry.name.toLowerCase().includes(query.toLowerCase())) {
      results.push({
        path: relPath,
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
      });
    }

    if (entry.isDirectory()) {
      await walkForFiles(fullPath, query, results, basePath, limit, ig);
    }
  }
}

// --- public API ---

export async function searchCode(workspace: Workspace, options: SearchCodeOptions): Promise<CodeSearchResult[]> {
  const basePath = resolvePath(workspace, '');
  if (!basePath) return [];

  try {
    return searchWithRipgrep(basePath, options);
  } catch {
    // fallback to Node.js
  }

  return searchWithNodeJs(basePath, options);
}

export async function searchFiles(workspace: Workspace, query: string): Promise<FileSearchResult[]> {
  const basePath = resolvePath(workspace, '');
  if (!basePath) return [];

  const ig = await createGitignoreFilter(basePath);
  const results: FileSearchResult[] = [];
  await walkForFiles(basePath, query, results, basePath, 100, ig);
  return results;
}

export async function getDirectoryFiles(basePath: string, dir: string, extensions: string[], maxFiles: number, maxSize: number): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (files.size >= maxFiles) break;
      if (!entry.isFile()) continue;

      const ext = entry.name.split('.').pop()?.toLowerCase() || '';
      if (!extensions.includes(`.${ext}`)) continue;

      const fullPath = join(dir, entry.name);
      try {
        const s = await stat(fullPath);
        if (s.size > maxSize) continue;
        const content = await readFile(fullPath, 'utf-8');
        const relPath = relative(basePath, fullPath);
        files.set(relPath, content);
      } catch { /* skip */ }
    }
  } catch { /* dir not readable */ }
  return files;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
