import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDir, getDataDir } from '../storage/json-store.js';
import { listTemplates } from './agent.js';
import type { AgentConfig } from '@agent-spaces/shared';

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface McpServerInfo {
  name: string;
  description: string;
  config: McpServerConfig;
  favorited: boolean;
  boundAgents: Array<{ id: string; name: string; avatarUrl?: string }>;
}

interface McpMeta {
  favorites: string[];
}

function getMcpsDir(): string {
  return join(getDataDir(), 'mcps');
}

function getMcpMetaPath(): string {
  return join(getMcpsDir(), '_meta.json');
}

function readMeta(): McpMeta {
  const path = getMcpMetaPath();
  if (!existsSync(path)) return { favorites: [] };
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as McpMeta;
  } catch {
    return { favorites: [] };
  }
}

function writeMeta(meta: McpMeta): void {
  ensureDir(getMcpsDir());
  writeFileSync(getMcpMetaPath(), JSON.stringify(meta, null, 2), 'utf-8');
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'mcp-server';
}

export function listMcps(): McpServerInfo[] {
  const agents = listTemplates();
  const mcpsDir = getMcpsDir();
  const meta = readMeta();
  ensureDir(mcpsDir);

  const files = readdirSync(mcpsDir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'));

  return files.map((filename) => {
    const raw = readFileSync(join(mcpsDir, filename), 'utf-8');
    const parsed = JSON.parse(raw) as { name?: string; description?: string; config?: McpServerConfig };
    const name = parsed.name || filename.replace(/\.json$/, '');

    const boundAgents = agents
      .filter((a: AgentConfig) => {
        const mcps = a.mcps as Record<string, unknown> | undefined;
        if (!mcps || typeof mcps !== 'object') return false;
        const servers = mcps.mcpServers as Record<string, unknown> | undefined;
        return servers && name in servers;
      })
      .map((a: AgentConfig) => ({
        id: a.id,
        name: a.name || 'Agent',
        avatarUrl: a.avatarUrl,
      }));

    return {
      name,
      description: parsed.description || '',
      config: parsed.config || {},
      favorited: meta.favorites.includes(name),
      boundAgents,
    };
  });
}

export function importMcps(jsonText: string): McpServerInfo[] {
  const parsed = JSON.parse(jsonText);
  const servers: Record<string, McpServerConfig> = {};

  // Support both { mcpServers: {...} } and flat { name: {...} } formats
  if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
    Object.assign(servers, parsed.mcpServers);
  } else if (typeof parsed === 'object') {
    Object.assign(servers, parsed);
  }

  const mcpsDir = getMcpsDir();
  ensureDir(mcpsDir);
  const results: McpServerInfo[] = [];

  for (const [rawName, config] of Object.entries(servers)) {
    const name = sanitizeName(rawName);
    const filePath = join(mcpsDir, `${name}.json`);
    writeFileSync(filePath, JSON.stringify({ name, config }, null, 2), 'utf-8');
    results.push({
      name,
      description: '',
      config: config as McpServerConfig,
      favorited: false,
      boundAgents: [],
    });
  }

  return results;
}

export function updateMcpConfig(name: string, config: McpServerConfig): boolean {
  const mcpsDir = getMcpsDir();
  const filePath = join(mcpsDir, `${name}.json`);
  if (!existsSync(filePath)) return false;
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  parsed.config = config;
  writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8');
  return true;
}

export function deleteMcp(name: string): boolean {
  const mcpsDir = getMcpsDir();
  const filePath = join(mcpsDir, `${name}.json`);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  return true;
}

export function toggleFavorite(name: string): boolean {
  const meta = readMeta();
  const idx = meta.favorites.indexOf(name);
  if (idx >= 0) {
    meta.favorites.splice(idx, 1);
  } else {
    meta.favorites.push(name);
  }
  writeMeta(meta);
  return idx < 0;
}
