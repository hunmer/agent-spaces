import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ensureDir, getDataDir } from '../storage/json-store.js';
import { listTemplates } from './agent.js';
import type { AgentConfig } from '@agent-spaces/shared';

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  storeId?: string;
  createdAt: string;
  updatedAt: string;
  boundAgents?: Array<{ id: string; name: string; avatarUrl?: string }>;
}

interface PromptMeta {
  templates: PromptTemplate[];
}

function getPromptsDir(): string {
  return join(getDataDir(), 'prompt-templates');
}

function getMetaPath(): string {
  return join(getPromptsDir(), 'meta.json');
}

function readMeta(): PromptMeta {
  const path = getMetaPath();
  if (!existsSync(path)) return { templates: [] };
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as PromptMeta;
  } catch {
    return { templates: [] };
  }
}

function writeMeta(meta: PromptMeta): void {
  ensureDir(getPromptsDir());
  writeFileSync(getMetaPath(), JSON.stringify(meta, null, 2), 'utf-8');
}

export function listPromptTemplates(): PromptTemplate[] {
  const templates = readMeta().templates;
  const agents = listTemplates();
  return templates.map((tmpl) => ({
    ...tmpl,
    boundAgents: agents
      .filter((a: AgentConfig) => a.systemPrompt === tmpl.content)
      .map((a: AgentConfig) => ({ id: a.id, name: a.name || a.id, avatarUrl: a.avatarUrl })),
  }));
}

export function createPromptTemplate(name: string, content: string, storeId?: string): PromptTemplate {
  const meta = readMeta();
  const now = new Date().toISOString();
  const id = `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tmpl: PromptTemplate = { id, name, content, storeId, createdAt: now, updatedAt: now };
  meta.templates.push(tmpl);
  writeMeta(meta);
  return tmpl;
}

export function updatePromptTemplate(id: string, data: { name?: string; content?: string }): PromptTemplate | null {
  const meta = readMeta();
  const tmpl = meta.templates.find((t) => t.id === id);
  if (!tmpl) return null;
  if (data.name !== undefined) tmpl.name = data.name;
  if (data.content !== undefined) tmpl.content = data.content;
  tmpl.updatedAt = new Date().toISOString();
  writeMeta(meta);
  return tmpl;
}

export function deletePromptTemplate(id: string): boolean {
  const meta = readMeta();
  const idx = meta.templates.findIndex((t) => t.id === id);
  if (idx < 0) return false;
  meta.templates.splice(idx, 1);
  writeMeta(meta);
  return true;
}

export function applyPromptToAgents(templateId: string, agentIds: string[]): number {
  const meta = readMeta();
  const tmpl = meta.templates.find((t) => t.id === templateId);
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
    config.systemPrompt = tmpl.content;
    writeFileSync(agentPath, JSON.stringify(config, null, 2), 'utf-8');
    applied++;
  }
  return applied;
}

export interface AgentCandidate {
  id: string;
  name: string;
  avatarUrl?: string;
  description?: string;
  hasSystemPrompt: boolean;
}

export function listAgentCandidates(): AgentCandidate[] {
  return listTemplates()
    .filter((a: AgentConfig) => a.id !== 'agent-generator')
    .map((a: AgentConfig) => ({
      id: a.id,
      name: a.name || a.id,
      avatarUrl: a.avatarUrl,
      description: a.description,
      hasSystemPrompt: !!a.systemPrompt,
    }));
}
