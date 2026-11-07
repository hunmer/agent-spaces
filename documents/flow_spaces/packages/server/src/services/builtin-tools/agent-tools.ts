import { BUILT_IN_AGENT_TOOLS, type BuiltInAgentToolName } from '@agent-spaces/shared';
import type { AgentFunctionTool } from '../../adapters/agent-runtime-types.js';
import * as agentService from '../agent.js';

export function createAgentFunctionTools(workspaceId: string, allowedTools?: BuiltInAgentToolName[]): AgentFunctionTool[] {
  const allowedToolNames = new Set(allowedTools ?? BUILT_IN_AGENT_TOOLS.map((tool) => tool.name));
  const tools: AgentFunctionTool[] = [
    {
      name: 'ListAgentSessions',
      description: 'List session records and session IDs for an agent in the current workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: 'Agent ID.' },
        },
        required: ['agent_id'],
        additionalProperties: false,
      },
      annotations: { readOnly: true, openWorld: false },
      execute: async (input) => {
        const { agent_id: agentId } = input as { agent_id: string };
        return agentService.list(workspaceId)
          .filter((session) => session.agentConfigId === agentId)
          .map((session) => ({ sessionId: session.id, ...session }));
      },
    },
    {
      name: 'GetAgentSessionDetail',
      description: 'Get messages, prompts, usage, and raw data for a session in the current workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Agent session ID.' },
        },
        required: ['session_id'],
        additionalProperties: false,
      },
      annotations: { readOnly: true, openWorld: false },
      execute: async (input) => {
        const { session_id: sessionId } = input as { session_id: string };
        if (!agentService.getById(workspaceId, sessionId)) throw new Error('session not found');
        return agentService.getSessionDetail(sessionId);
      },
    },
  ];

  return tools.filter((tool) => allowedToolNames.has(tool.name as BuiltInAgentToolName));
}
