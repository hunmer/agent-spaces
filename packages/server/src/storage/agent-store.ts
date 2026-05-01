import { join } from 'node:path';
import type { AgentSession } from '@agent-spaces/shared';
import { getDataDir, ensureDir, readJsonFile, writeJsonFile } from './json-store.js';

function agentsDir(workspaceId: string) {
  return join(getDataDir(), 'workspaces', workspaceId, 'agents');
}

function agentsIndex(workspaceId: string) {
  return join(agentsDir(workspaceId), 'index.json');
}

function agentFile(workspaceId: string, sessionId: string) {
  return join(agentsDir(workspaceId), `${sessionId}.json`);
}

export function listAgentSessions(workspaceId: string): AgentSession[] {
  return readJsonFile<AgentSession[]>(agentsIndex(workspaceId)) || [];
}

export function getAgentSession(workspaceId: string, sessionId: string): AgentSession | null {
  return readJsonFile<AgentSession>(agentFile(workspaceId, sessionId));
}

export function createAgentSession(session: AgentSession): void {
  ensureDir(agentsDir(session.workspaceId));
  writeJsonFile(agentFile(session.workspaceId, session.id), session);

  const list = listAgentSessions(session.workspaceId);
  list.push(session);
  writeJsonFile(agentsIndex(session.workspaceId), list);
}

export function updateAgentSession(session: AgentSession): void {
  writeJsonFile(agentFile(session.workspaceId, session.id), session);

  const list = listAgentSessions(session.workspaceId);
  const idx = list.findIndex((s) => s.id === session.id);
  if (idx >= 0) list[idx] = session;
  writeJsonFile(agentsIndex(session.workspaceId), list);
}

export function deleteAgentSession(workspaceId: string, sessionId: string): void {
  const list = listAgentSessions(workspaceId).filter((s) => s.id !== sessionId);
  writeJsonFile(agentsIndex(workspaceId), list);
}
