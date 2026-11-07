import type { HttpClient } from '../client';

export function createAgentCommandsApi(http: HttpClient) {
  return {
    /** List agents that have commands */
    listAgents: (): Promise<Array<{ id: string; name: string }>> =>
      http.get('/api/agent-commands/agents'),

    /** List all commands across all agents */
    listAll: (): Promise<Array<{ agentId: string; agentName: string; name: string; content: string; group?: string }>> =>
      http.get('/api/agent-commands/all'),

    /** Get commands for a specific agent */
    listForAgent: (agentId: string): Promise<Array<{ name: string; content: string; group?: string }>> =>
      http.get(`/api/agent-commands/${agentId}`),

    /** Create a command for an agent */
    create: (agentId: string, data: { name: string; content: string; group?: string }): Promise<void> =>
      http.postVoid(`/api/agent-commands/${agentId}`, data),

    /** Update a command */
    update: (agentId: string, name: string, data: { content?: string; group?: string }): Promise<void> =>
      http.putVoid(`/api/agent-commands/${agentId}/${encodeURIComponent(name)}`, data),

    /** Delete a command */
    delete_: (agentId: string, name: string, query?: string): Promise<void> =>
      http.delete(`/api/agent-commands/${agentId}/${encodeURIComponent(name)}${query || ''}`),

    /** Apply a command to multiple agents */
    apply: (agentId: string, name: string, data: { group?: string; agentIds: string[] }): Promise<void> =>
      http.postVoid(`/api/agent-commands/${agentId}/${encodeURIComponent(name)}/apply`, data),
  };
}
