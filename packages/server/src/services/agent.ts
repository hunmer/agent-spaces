import { v4 as uuid } from 'uuid';
import type { AgentSession, AgentSessionStatus } from '@agent-spaces/shared';
import {
  listAgentSessions,
  getAgentSession,
  createAgentSession,
  updateAgentSession,
  deleteAgentSession,
} from '../storage/agent-store.js';

export function list(workspaceId: string): AgentSession[] {
  return listAgentSessions(workspaceId);
}

export function getById(workspaceId: string, sessionId: string): AgentSession | null {
  return getAgentSession(workspaceId, sessionId);
}

export function create(
  workspaceId: string,
  role: AgentSession['role'],
  configId?: string,
): AgentSession {
  const now = new Date().toISOString();
  const session: AgentSession = {
    id: uuid(),
    workspaceId,
    agentConfigId: configId || uuid(),
    role,
    status: 'idle',
    startedAt: now,
    lastActivityAt: now,
  };
  createAgentSession(session);
  return session;
}

export function updateStatus(
  workspaceId: string,
  sessionId: string,
  status: AgentSessionStatus,
  extra?: Partial<AgentSession>,
): AgentSession | null {
  const session = getAgentSession(workspaceId, sessionId);
  if (!session) return null;

  session.status = status;
  session.lastActivityAt = new Date().toISOString();
  if (extra) Object.assign(session, extra);
  updateAgentSession(session);
  return session;
}

export function assignTask(
  workspaceId: string,
  sessionId: string,
  taskId: string,
): AgentSession | null {
  return updateStatus(workspaceId, sessionId, 'active', { currentTaskId: taskId });
}

export function complete(
  workspaceId: string,
  sessionId: string,
  error?: string,
): AgentSession | null {
  return updateStatus(workspaceId, sessionId, error ? 'crashed' : 'completed', {
    currentTaskId: undefined,
    error,
  });
}

export function remove(workspaceId: string, sessionId: string): boolean {
  const session = getAgentSession(workspaceId, sessionId);
  if (!session) return false;
  deleteAgentSession(workspaceId, sessionId);
  return true;
}

export function findActiveByRole(
  workspaceId: string,
  role: AgentSession['role'],
): AgentSession | undefined {
  return listAgentSessions(workspaceId).find(
    (s) => s.role === role && (s.status === 'active' || s.status === 'idle'),
  );
}
