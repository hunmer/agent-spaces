import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ensureDir, getDataDir } from '../storage/json-store.js';
import { listTemplates } from './agent.js';
import type { AgentConfig } from '@agent-spaces/shared';

export interface OutputStyleTemplate {
  id: string;
  name: string;
  description?: string;
  content: string;
  storeId?: string;
  createdAt: string;
  updatedAt: string;
  boundAgents?: Array<{ id: string; name: string; avatarUrl?: string }>;
}

interface OutputStyleMeta {
  templates: OutputStyleTemplate[];
}

function getDir(): string {
  return join(getDataDir(), 'output-styles');
}

function getMetaPath(): string {
  return join(getDir(), 'meta.json');
}

function readMeta(): OutputStyleMeta {
  const path = getMetaPath();
  if (!existsSync(path)) return { templates: [] };
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as OutputStyleMeta;
  } catch {
    return { templates: [] };
  }
}

function writeMeta(meta: OutputStyleMeta): void {
  ensureDir(getDir());
  writeFileSync(getMetaPath(), JSON.stringify(meta, null, 2), 'utf-8');
}

export function listOutputStyles(): OutputStyleTemplate[] {
  const templates = readMeta().templates;
  const agents = listTemplates();
  return templates.map((tmpl) => ({
    ...tmpl,
    boundAgents: agents
      .filter((a: AgentConfig) => a.outputStyle === tmpl.name || a.outputStyle === tmpl.id)
      .map((a: AgentConfig) => ({ id: a.id, name: a.name || a.id, avatarUrl: a.avatarUrl })),
  }));
}

export function resolveOutputStyleTemplate(ref?: string): OutputStyleTemplate | null {
  const needle = sanitizeOutputStyleName(ref);
  if (!needle) return null;
  return listOutputStyles().find((template) =>
    template.id === ref?.trim()
    || template.name === ref?.trim()
    || sanitizeOutputStyleName(template.name) === needle,
  ) ?? null;
}

export function resolveOutputStyleContent(ref?: string): string | undefined {
  const raw = ref?.trim();
  if (!raw) return undefined;
  return resolveOutputStyleTemplate(raw)?.content ?? raw;
}

export function prepareClaudeOutputStyleFile(configDir: string, ref?: string): string | undefined {
  const raw = ref?.trim();
  if (!raw) return undefined;

  const template = resolveOutputStyleTemplate(raw);
  const content = template?.content ?? raw;
  const fileStem = sanitizeOutputStyleName(template?.name) || `output-style-${shortHash(content)}`;
  if (!fileStem) return undefined;

  const dir = join(configDir, 'output_styles');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${fileStem}.md`), `${content.trimEnd()}\n`, 'utf-8');
  return fileStem;
}

export function createOutputStyle(name: string, content: string, storeId?: string, description?: string): OutputStyleTemplate {
  const meta = readMeta();
  const now = new Date().toISOString();
  const id = `os-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tmpl: OutputStyleTemplate = { id, name, description, content, storeId, createdAt: now, updatedAt: now };
  meta.templates.push(tmpl);
  writeMeta(meta);
  return tmpl;
}

export function updateOutputStyle(id: string, data: { name?: string; description?: string; content?: string }): OutputStyleTemplate | null {
  const meta = readMeta();
  const tmpl = meta.templates.find((t) => t.id === id);
  if (!tmpl) return null;
  if (data.name !== undefined) tmpl.name = data.name;
  if (data.description !== undefined) tmpl.description = data.description;
  if (data.content !== undefined) tmpl.content = data.content;
  tmpl.updatedAt = new Date().toISOString();
  writeMeta(meta);
  return tmpl;
}

export function deleteOutputStyle(id: string): boolean {
  const meta = readMeta();
  const idx = meta.templates.findIndex((t) => t.id === id);
  if (idx < 0) return false;
  meta.templates.splice(idx, 1);
  writeMeta(meta);
  return true;
}

export function applyOutputStyleToAgents(styleId: string, agentIds: string[]): number {
  const meta = readMeta();
  const tmpl = meta.templates.find((t) => t.id === styleId);
  if (!tmpl) return 0;

  const agents = listTemplates();
  let applied = 0;
  for (const agentId of agentIds) {
    const agent = agents.find((a: AgentConfig) => a.id === agentId);
    if (!agent) continue;

    const agentDir = join(getDataDir(), 'agent-templates', agent.id);
    const agentPath = join(agentDir, 'agent.json');
    if (!existsSync(agentPath)) continue;

    const config = JSON.parse(readFileSync(agentPath, 'utf-8')) as AgentConfig;
    config.outputStyle = tmpl.name;
    writeFileSync(agentPath, JSON.stringify(config, null, 2), 'utf-8');
    applied++;
  }
  return applied;
}

export interface OutputStyleAgentCandidate {
  id: string;
  name: string;
  avatarUrl?: string;
  description?: string;
  hasOutputStyle: boolean;
}

export function listOutputStyleAgentCandidates(): OutputStyleAgentCandidate[] {
  return listTemplates()
    .filter((a: AgentConfig) => a.id !== 'agent-generator')
    .map((a: AgentConfig) => ({
      id: a.id,
      name: a.name || a.id,
      avatarUrl: a.avatarUrl,
      description: a.description,
      hasOutputStyle: !!a.outputStyle,
    }));
}

function sanitizeOutputStyleName(name?: string): string {
  const raw = name?.trim();
  if (!raw) return '';
  return basename(raw).replace(/\.md$/i, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

function shortHash(text: string): string {
  return createHash('sha1').update(text).digest('hex').slice(0, 8);
}
