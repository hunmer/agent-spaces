import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getDataDir, ensureDir } from '../storage/json-store.js';

export interface AgentCommand {
  name: string;
  content: string;
  group: string;
  agentId: string;
  agentName?: string;
}

export interface AgentInfo {
  agentId: string;
  agentName: string;
  commandCount: number;
}

function getAgentTemplatesDir(): string {
  return join(getDataDir(), 'agent-templates');
}

function getCommandsDir(agentId: string): string {
  return join(getAgentTemplatesDir(), agentId, 'commands');
}

function getAgentName(agentId: string): string | undefined {
  const agentPath = join(getAgentTemplatesDir(), agentId, 'agent.json');
  if (!existsSync(agentPath)) return undefined;
  try {
    const config = JSON.parse(readFileSync(agentPath, 'utf-8'));
    return config.name || agentId;
  } catch {
    return agentId;
  }
}

function readCommandsFromDir(dir: string, agentId: string, group: string = ''): AgentCommand[] {
  if (!existsSync(dir)) return [];
  const agentName = getAgentName(agentId);

  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.isDirectory()) {
        return readCommandsFromDir(join(dir, entry.name), agentId, entry.name);
      }
      if (!entry.name.endsWith('.md')) return [];
      return {
        name: entry.name.replace(/\.md$/, ''),
        content: readFileSync(join(dir, entry.name), 'utf-8'),
        group,
        agentId,
        agentName,
      };
    });
}

export function listAgentsWithCommands(): AgentInfo[] {
  const templatesDir = getAgentTemplatesDir();
  if (!existsSync(templatesDir)) return [];

  return readdirSync(templatesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const commandsDir = getCommandsDir(entry.name);
      const commands = readCommandsFromDir(commandsDir, entry.name);
      return {
        agentId: entry.name,
        agentName: getAgentName(entry.name) || entry.name,
        commandCount: commands.length,
      };
    });
}

export function listAllCommands(): AgentCommand[] {
  const templatesDir = getAgentTemplatesDir();
  if (!existsSync(templatesDir)) return [];

  return readdirSync(templatesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const commandsDir = getCommandsDir(entry.name);
      return readCommandsFromDir(commandsDir, entry.name);
    });
}

export function listCommands(agentId: string): AgentCommand[] {
  return readCommandsFromDir(getCommandsDir(agentId), agentId);
}

function resolveCommandPath(agentId: string, name: string, group?: string): string {
  if (group) {
    return join(getCommandsDir(agentId), group, `${name}.md`);
  }
  return join(getCommandsDir(agentId), `${name}.md`);
}

function findCommandPath(agentId: string, name: string, group?: string): string | null {
  if (group) {
    const p = join(getCommandsDir(agentId), group, `${name}.md`);
    return existsSync(p) ? p : null;
  }
  // Search root first, then subdirectories
  const root = join(getCommandsDir(agentId), `${name}.md`);
  if (existsSync(root)) return root;
  if (existsSync(getCommandsDir(agentId))) {
    for (const entry of readdirSync(getCommandsDir(agentId), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const p = join(getCommandsDir(agentId), entry.name, `${name}.md`);
        if (existsSync(p)) return p;
      }
    }
  }
  return null;
}

export function getCommand(agentId: string, name: string, group?: string): AgentCommand | null {
  const filePath = findCommandPath(agentId, name, group);
  if (!filePath) return null;

  // Infer group from path
  const commandsDir = getCommandsDir(agentId);
  const relative = filePath.slice(commandsDir.length + 1);
  const parts = relative.split('/');
  const inferredGroup = parts.length > 1 ? parts.slice(0, -1).join('/') : '';

  return {
    name,
    content: readFileSync(filePath, 'utf-8'),
    group: inferredGroup,
    agentId,
    agentName: getAgentName(agentId),
  };
}

export function createCommand(agentId: string, name: string, content: string, group?: string): AgentCommand {
  const dir = group ? join(getCommandsDir(agentId), group) : getCommandsDir(agentId);
  ensureDir(dir);
  const filePath = join(dir, `${name}.md`);
  writeFileSync(filePath, content, 'utf-8');
  return {
    name,
    content,
    group: group || '',
    agentId,
    agentName: getAgentName(agentId),
  };
}

export function updateCommand(agentId: string, name: string, content: string, group?: string): AgentCommand | null {
  const filePath = findCommandPath(agentId, name, group);
  if (!filePath) return null;
  writeFileSync(filePath, content, 'utf-8');

  const commandsDir = getCommandsDir(agentId);
  const relative = filePath.slice(commandsDir.length + 1);
  const parts = relative.split('/');
  const inferredGroup = parts.length > 1 ? parts.slice(0, -1).join('/') : '';

  return {
    name,
    content,
    group: inferredGroup,
    agentId,
    agentName: getAgentName(agentId),
  };
}

export function deleteCommand(agentId: string, name: string, group?: string): boolean {
  const filePath = findCommandPath(agentId, name, group);
  if (!filePath) return false;
  unlinkSync(filePath);
  return true;
}

export function applyCommandToAgents(sourceAgentId: string, name: string, group: string, targetAgentIds: string[]): number {
  const src = getCommand(sourceAgentId, name, group);
  if (!src) return 0;

  let applied = 0;
  for (const targetId of targetAgentIds) {
    if (targetId === sourceAgentId) continue;
    try {
      createCommand(targetId, src.name, src.content);
      applied++;
    } catch { /* skip */ }
  }
  return applied;
}
