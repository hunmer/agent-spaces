import { existsSync, realpathSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { getDataDir } from '../storage/json-store.js';
import { readWorkspacePrompt } from './workspace-prompt.js';

const INSTRUCTION_FILENAMES = ['CLAUDE.md', 'claude.md', 'AGENTS.md', 'agents.md'];
const MAX_FILE_CHARS = 48_000;
const MAX_TOTAL_CHARS = 120_000;

export interface PersistentAgentContextOptions {
  workspaceId: string;
  workingDir: string;
  boundDirs?: string[];
  includeWorkspacePrompt?: boolean;
  excludeNativeClaudeMd?: boolean;
}

interface InstructionFile {
  path: string;
  label: string;
  filename: string;
  content: string;
}

export interface PersistentInstructionFileSummary {
  path: string;
  label: string;
  filename: string;
}

export interface PersistentAgentContextSummary {
  instructionFiles: PersistentInstructionFileSummary[];
  counts: {
    claudeMd: number;
    agentsMd: number;
    total: number;
  };
}

export function prependPersistentAgentContext(
  prompt: string,
  options: PersistentAgentContextOptions,
): string {
  const context = buildPersistentAgentContext(options);
  if (!context) return prompt;
  return `${context}\n\n${prompt}`;
}

export function buildPersistentAgentContext(options: PersistentAgentContextOptions): string {
  const { instructionContext } = buildPersistentAgentContextDetails(options);
  const sections: string[] = [];
  if (instructionContext) sections.push(instructionContext);

  if (options.includeWorkspacePrompt !== false) {
    const workspacePrompt = readWorkspacePrompt(options.workspaceId).trim();
    if (workspacePrompt) {
      sections.push([
        'Workspace prompt:',
        workspacePrompt,
      ].join('\n'));
    }
  }

  return sections.join('\n\n');
}

export function buildPersistentAgentContextDetails(
  options: PersistentAgentContextOptions,
): { instructionContext: string; summary: PersistentAgentContextSummary } {
  const instructionFiles = collectInstructionFiles(options.workingDir, options.boundDirs, {
    excludeNativeClaudeMd: options.excludeNativeClaudeMd,
  });
  return {
    instructionContext: buildInstructionFileContextFromFiles(instructionFiles),
    summary: buildPersistentAgentContextSummary(instructionFiles),
  };
}

function buildInstructionFileContext(
  workingDir: string,
  boundDirs?: string[],
  options: Pick<PersistentAgentContextOptions, 'excludeNativeClaudeMd'> = {},
): string {
  const files = collectInstructionFiles(workingDir, boundDirs, options);
  return buildInstructionFileContextFromFiles(files);
}

function buildInstructionFileContextFromFiles(files: InstructionFile[]): string {
  if (files.length === 0) return '';

  const lines = [
    'Persistent agent instructions:',
    'The following CLAUDE.md and AGENTS.md files were auto-loaded. Earlier files are lower priority; later files are closer to the current working directory and take precedence.',
  ];
  let usedChars = 0;

  for (const file of files) {
    if (usedChars >= MAX_TOTAL_CHARS) {
      lines.push('', '[Additional instruction files omitted because the persistent context budget was reached.]');
      break;
    }
    const remaining = MAX_TOTAL_CHARS - usedChars;
    const content = truncateForBudget(file.content, Math.min(MAX_FILE_CHARS, remaining));
    usedChars += content.length;
    lines.push('', `--- ${file.label} ---`, content);
  }

  return lines.join('\n').trim();
}

function buildPersistentAgentContextSummary(files: InstructionFile[]): PersistentAgentContextSummary {
  const instructionFiles = files.map((file) => ({
    path: file.path,
    label: file.label,
    filename: file.filename,
  }));
  const counts = instructionFiles.reduce((acc, file) => {
    acc.total += 1;
    if (file.filename === 'CLAUDE.md' || file.filename === 'claude.md') {
      acc.claudeMd += 1;
    }
    if (file.filename === 'AGENTS.md' || file.filename === 'agents.md') {
      acc.agentsMd += 1;
    }
    return acc;
  }, {
    claudeMd: 0,
    agentsMd: 0,
    total: 0,
  });

  return { instructionFiles, counts };
}

function collectInstructionFiles(
  workingDir: string,
  boundDirs?: string[],
  options: Pick<PersistentAgentContextOptions, 'excludeNativeClaudeMd'> = {},
): InstructionFile[] {
  const seen = new Set<string>();
  const files: InstructionFile[] = [];
  const filenames = getInstructionFilenames(options);

  for (const globalPath of globalInstructionPaths(options)) {
    addInstructionFile(files, seen, globalPath, compactPath(globalPath));
  }

  const cwd = resolveInstructionSearchBase(workingDir, boundDirs);
  if (!cwd) return files;

  for (const dir of ancestorDirs(cwd, resolveInstructionRoot(cwd, boundDirs))) {
    for (const filename of filenames) {
      const fullPath = join(dir, filename);
      addInstructionFile(files, seen, fullPath, relativeOrAbsolute(cwd, fullPath));
    }
  }

  return files;
}

function resolveInstructionSearchBase(workingDir: string, boundDirs?: string[]): string | null {
  const roots = (boundDirs ?? [])
    .map((dir) => safeResolve(dir))
    .filter((dir): dir is string => Boolean(dir));

  if (roots.length === 0) return null;
  const cwd = safeResolve(workingDir) ?? roots[0];
  if (roots.some((dir) => isPathWithin(cwd, dir))) return cwd;
  return roots[0];
}

function globalInstructionPaths(options: Pick<PersistentAgentContextOptions, 'excludeNativeClaudeMd'>): string[] {
  const dataDir = getDataDir();
  return getInstructionFilenames(options).map((filename) => join(dataDir, filename));
}

function getInstructionFilenames(options: Pick<PersistentAgentContextOptions, 'excludeNativeClaudeMd'>): string[] {
  if (!options.excludeNativeClaudeMd) return INSTRUCTION_FILENAMES;
  return INSTRUCTION_FILENAMES.filter((filename) => filename !== 'CLAUDE.md');
}

function resolveInstructionRoot(cwd: string, boundDirs?: string[]): string {
  const roots = (boundDirs ?? [])
    .map((dir) => safeResolve(dir))
    .filter((dir): dir is string => Boolean(dir))
    .filter((dir) => isPathWithin(cwd, dir))
    .sort((a, b) => a.length - b.length);

  if (roots.length > 0) return roots[0];
  return findNearestProjectRoot(cwd);
}

function findNearestProjectRoot(cwd: string): string {
  let current = cwd;
  while (true) {
    if (existsSync(join(current, '.git')) || existsSync(join(current, 'package.json'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return cwd;
    current = parent;
  }
}

function ancestorDirs(cwd: string, root: string): string[] {
  const dirs: string[] = [];
  let current = cwd;
  while (true) {
    dirs.push(current);
    if (current === root) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs.reverse();
}

function addInstructionFile(files: InstructionFile[], seen: Set<string>, path: string, label: string): void {
  if (!existsSync(path)) return;
  const stat = statSync(path);
  if (!stat.isFile()) return;

  const realPath = realpathSync(path);
  if (seen.has(realPath)) return;
  seen.add(realPath);

  files.push({
    path: realPath,
    label,
    filename: basename(realPath),
    content: readFileSync(path, 'utf-8').trim(),
  });
}

function truncateForBudget(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  const suffix = '\n\n[Instruction file truncated because the persistent context budget was reached.]';
  return `${content.slice(0, Math.max(0, maxChars - suffix.length)).trimEnd()}${suffix}`;
}

function safeResolve(path: string): string | null {
  if (!path.trim()) return null;
  return resolve(isAbsolute(path) ? path : join(process.cwd(), path));
}

function isPathWithin(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function relativeOrAbsolute(fromDir: string, path: string): string {
  const rel = relative(fromDir, path);
  if (!rel.startsWith('..') && !isAbsolute(rel)) return rel || path;
  return path;
}

function compactPath(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}
