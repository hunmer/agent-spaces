import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { AgentConfig } from '@agent-spaces/shared';
import { ensureDir, getDataDir } from '../storage/json-store.js';
import { createOutputStyle } from './output-style.js';
import { importMcps } from './mcp.js';
import { createCommand } from './agent-commands.js';
import { createPreset } from './agent.js';

export type ExternalImportKind = 'skills' | 'commands' | 'mcps' | 'output-styles' | 'agents';
export type ExternalImportMode = 'copy' | 'symlink';

export interface ExternalImportSource {
  id: string;
  kind: ExternalImportKind;
  name: string;
  source: string;
  sourceRoot: string;
  provider: 'codex' | 'claude' | 'gemini';
  relativePath: string;
  isDirectory: boolean;
  description?: string;
  group?: string;
  preview?: string;
}

export interface ExternalImportRequestItem {
  id: string;
  name?: string;
  group?: string;
  targetAgentId?: string;
}

export interface ExternalImportResult {
  id: string;
  name: string;
  kind: ExternalImportKind;
  ok: boolean;
  error?: string;
}

const HOME = homedir();
const SKILL_FILE = 'SKILL.md';

const SOURCE_ROOTS: Record<ExternalImportKind, Array<{ provider: ExternalImportSource['provider']; path: string }>> = {
  skills: [
    { provider: 'codex', path: join(HOME, '.codex', 'skills') },
    { provider: 'claude', path: join(HOME, '.claude', 'skills') },
    { provider: 'gemini', path: join(HOME, '.gemini', 'skills') },
  ],
  'output-styles': [
    { provider: 'claude', path: join(HOME, '.claude', 'output-styles') },
  ],
  commands: [
    { provider: 'claude', path: join(HOME, '.claude', 'commands') },
  ],
  agents: [
    { provider: 'claude', path: join(HOME, '.claude', 'agents') },
  ],
  mcps: [
    { provider: 'codex', path: join(HOME, '.codex', 'config.toml') },
    { provider: 'claude', path: join(HOME, '.claude', 'settings.json') },
    { provider: 'claude', path: join(HOME, '.claude', 'settings.local.json') },
    { provider: 'gemini', path: join(HOME, '.gemini', 'settings.json') },
  ],
};

export function scanExternalImports(kinds?: ExternalImportKind[]): ExternalImportSource[] {
  const targetKinds = kinds?.length ? kinds : Object.keys(SOURCE_ROOTS) as ExternalImportKind[];
  return targetKinds.flatMap((kind) => scanKind(kind));
}

export function importExternalItems(
  kind: ExternalImportKind,
  mode: ExternalImportMode,
  items: ExternalImportRequestItem[],
): ExternalImportResult[] {
  const sources = new Map(scanKind(kind).map((item) => [item.id, item]));
  return items.map((item) => {
    const source = sources.get(item.id);
    const name = sanitizeName(item.name || source?.name || 'imported');
    if (!source) return { id: item.id, name, kind, ok: false, error: 'source not found' };
    try {
      importOne(kind, mode, source, { ...item, name });
      return { id: item.id, name, kind, ok: true };
    } catch (err) {
      return { id: item.id, name, kind, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

function scanKind(kind: ExternalImportKind): ExternalImportSource[] {
  if (kind === 'mcps') return scanMcpSources();
  return SOURCE_ROOTS[kind].flatMap((root) => scanDirectoryKind(kind, root));
}

function scanDirectoryKind(
  kind: Exclude<ExternalImportKind, 'mcps'>,
  root: { provider: ExternalImportSource['provider']; path: string },
): ExternalImportSource[] {
  if (!existsSync(root.path)) return [];
  if (kind === 'skills') return scanSkillsRoot(root);
  return scanMarkdownRoot(kind, root);
}

function scanSkillsRoot(root: { provider: ExternalImportSource['provider']; path: string }): ExternalImportSource[] {
  return readdirSync(root.path, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return [];
    const full = join(root.path, entry.name);
    if (entry.isDirectory()) {
      const skillFile = join(full, SKILL_FILE);
      if (!existsSync(skillFile)) return [];
      const content = readTextPreview(skillFile);
      return [makeSource('skills', root, full, entry.name, true, content)];
    }
    if (!isImportTextFile(entry.name)) return [];
    const content = readTextPreview(full);
    return [makeSource('skills', root, full, basename(entry.name, extname(entry.name)), false, content)];
  });
}

function scanMarkdownRoot(
  kind: Exclude<ExternalImportKind, 'skills' | 'mcps'>,
  root: { provider: ExternalImportSource['provider']; path: string },
): ExternalImportSource[] {
  const out: ExternalImportSource[] = [];
  walk(root.path, (file) => {
    if (!isImportTextFile(file)) return;
    const rel = toSlash(relative(root.path, file));
    const name = basename(file, extname(file));
    const content = readTextPreview(file);
    out.push({
      ...makeSource(kind, root, file, name, false, content),
      group: rel.includes('/') ? rel.split('/').slice(0, -1).join('/') : undefined,
    });
  });
  return out;
}

function scanMcpSources(): ExternalImportSource[] {
  const out: ExternalImportSource[] = [];
  for (const root of SOURCE_ROOTS.mcps) {
    if (!existsSync(root.path)) continue;
    const text = readFileSync(root.path, 'utf-8');
    const servers = root.path.endsWith('.toml') ? parseTomlMcpServers(text) : parseJsonMcpServers(text);
    for (const [name, config] of Object.entries(servers)) {
      out.push({
        id: makeId('mcps', root.path, name),
        kind: 'mcps',
        name,
        source: root.path,
        sourceRoot: root.path,
        provider: root.provider,
        relativePath: name,
        isDirectory: false,
        preview: JSON.stringify(config, null, 2),
      });
    }
  }
  return out;
}

function importOne(
  kind: ExternalImportKind,
  mode: ExternalImportMode,
  source: ExternalImportSource,
  item: ExternalImportRequestItem & { name: string },
): void {
  if (kind === 'skills') importSkillSource(source, mode, item.name, item.group);
  else if (kind === 'output-styles') importOutputStyleSource(source, mode, item.name);
  else if (kind === 'commands') importCommandSource(source, item);
  else if (kind === 'mcps') importMcpSource(source);
  else importAgentSource(source, item.name);
}

function importSkillSource(source: ExternalImportSource, mode: ExternalImportMode, name: string, group?: string): void {
  const target = join(getDataDir(), 'skills', sanitizeName(name));
  linkOrCopy(source.source, target, mode);
  if (group) {
    const metaPath = join(getDataDir(), 'skills', '_meta.json');
    const meta = readJson(metaPath, { favorites: [], groups: {} as Record<string, string> });
    meta.groups[sanitizeName(name)] = group;
    ensureDir(dirname(metaPath));
    writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  }
}

function importOutputStyleSource(source: ExternalImportSource, mode: ExternalImportMode, name: string): void {
  if (mode === 'symlink') {
    const target = join(getDataDir(), 'output-styles', `${sanitizeName(name)}.md`);
    linkOrCopy(source.source, target, mode);
  }
  createOutputStyle(name, readFileSync(source.source, 'utf-8'));
}

function importCommandSource(source: ExternalImportSource, item: ExternalImportRequestItem & { name: string }): void {
  if (!item.targetAgentId) throw new Error('targetAgentId required');
  createCommand(item.targetAgentId, item.name, readFileSync(source.source, 'utf-8'), item.group ?? source.group);
}

function importMcpSource(source: ExternalImportSource): void {
  if (!source.preview) throw new Error('mcp config missing');
  importMcps(JSON.stringify({ mcpServers: { [source.name]: JSON.parse(source.preview) } }));
}

function importAgentSource(source: ExternalImportSource, name: string): void {
  const raw = readFileSync(source.source, 'utf-8');
  const parsed = tryParseJson(raw);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    createPreset('', { ...(parsed as Partial<AgentConfig>), name: (parsed as Partial<AgentConfig>).name || name });
    return;
  }
  createPreset('', { name, systemPrompt: raw, description: source.description || '' });
}

function makeSource(
  kind: ExternalImportKind,
  root: { provider: ExternalImportSource['provider']; path: string },
  source: string,
  name: string,
  isDirectory: boolean,
  preview: string,
): ExternalImportSource {
  const fm = parseFrontmatter(preview);
  const resolved = resolve(source);
  return {
    id: makeId(kind, resolved),
    kind,
    name: fm.name || name,
    source: resolved,
    sourceRoot: resolve(root.path),
    provider: root.provider,
    relativePath: toSlash(relative(root.path, resolved)),
    isDirectory,
    description: fm.description,
    preview,
  };
}

function linkOrCopy(source: string, target: string, mode: ExternalImportMode): void {
  ensureDir(dirname(target));
  rmSync(target, { recursive: true, force: true });
  if (mode === 'symlink') {
    symlinkSync(source, target, lstatSync(source).isDirectory() ? 'junction' : 'file');
    return;
  }
  cpSync(source, target, { recursive: true, force: true });
}

function parseJsonMcpServers(text: string): Record<string, unknown> {
  const parsed = tryParseJson(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const record = parsed as Record<string, unknown>;
  for (const key of ['mcpServers', 'mcp_servers', 'servers']) {
    const value = record[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  }
  return {};
}

function parseTomlMcpServers(text: string): Record<string, unknown> {
  const servers: Record<string, Record<string, unknown>> = {};
  let current = '';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const section = line.match(/^\[(?:mcp_servers|mcpServers)\.([^\]]+)\]$/);
    if (section) {
      current = section[1].replace(/^"|"$/g, '');
      servers[current] = servers[current] || {};
      continue;
    }
    if (!current || !line || line.startsWith('#')) continue;
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    servers[current][kv[1]] = parseTomlValue(kv[2]);
  }
  return servers;
}

function parseTomlValue(value: string): unknown {
  const trimmed = value.trim();
  if (/^".*"$/.test(trimmed)) return trimmed.slice(1, -1);
  if (/^\[.*\]$/.test(trimmed)) {
    return trimmed.slice(1, -1).split(',').map((part) => String(parseTomlValue(part.trim()))).filter(Boolean);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return trimmed;
}

function parseFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const out: { name?: string; description?: string } = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^\s*(name|description)\s*:\s*(.+)\s*$/i);
    if (kv) out[kv[1].toLowerCase() as 'name' | 'description'] = kv[2].trim().replace(/^"|"$/g, '');
  }
  return out;
}

function walk(dir: string, visit: (file: string) => void): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else visit(full);
  }
}

function readTextPreview(file: string): string {
  return readFileSync(file, 'utf-8').slice(0, 4000);
}

function isImportTextFile(file: string): boolean {
  return ['.md', '.markdown', '.txt', '.json'].includes(extname(file).toLowerCase());
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) as T : fallback;
  } catch {
    return fallback;
  }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sanitizeName(name: string): string {
  return basename(name).replace(/\.(md|markdown|txt|json)$/i, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'imported';
}

function makeId(kind: ExternalImportKind, source: string, suffix = ''): string {
  return Buffer.from(`${kind}:${source}:${suffix}`).toString('base64url');
}

function toSlash(path: string): string {
  return path.replace(/\\/g, '/');
}
