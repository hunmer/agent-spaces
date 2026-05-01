/**
 * Shared agent context — passed between agents and hooks.
 * Provides broadcast, task/issue mutation, and runtime creation.
 */

import type { AgentSession } from '@agent-spaces/shared';

export interface AgentContext {
  workspaceId: string;
  broadcast: (event: string, data: unknown) => void;
  getSession: (sessionId: string) => AgentSession | null;
  updateSessionStatus: (sessionId: string, status: AgentSession['status'], extra?: Partial<AgentSession>) => AgentSession | null;
}
