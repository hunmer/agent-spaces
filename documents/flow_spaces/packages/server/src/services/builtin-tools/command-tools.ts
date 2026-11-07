import { BUILT_IN_AGENT_TOOLS, type BuiltInAgentToolName } from '@agent-spaces/shared';
import type { AgentFunctionTool } from '../../adapters/agent-runtime-types.js';
import * as commandService from '../command.js';
import * as commandProcessManager from '../command-process-manager.js';

const readTerminalOutputInputSchema = {
  type: 'object',
  properties: {
    workspaceId: {
      type: 'string',
      description: 'Optional workspace ID. If omitted, the current workspace is used.',
    },
    sessionId: {
      type: 'string',
      description: 'Terminal session ID to read.',
    },
    offset: {
      type: 'integer',
      minimum: 0,
      description: 'Number of newest lines to skip before reading. Defaults to 0.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 1000,
      description: 'Maximum number of lines to read. Defaults to 100.',
    },
  },
  required: ['sessionId'],
  additionalProperties: false,
};

export function createCommandFunctionTools(workspaceId: string, allowedTools?: BuiltInAgentToolName[]): AgentFunctionTool[] {
  const allowedToolNames = new Set(allowedTools ?? BUILT_IN_AGENT_TOOLS.map((tool) => tool.name));
  const tools: AgentFunctionTool[] = [
    {
      name: 'ReadTerminalOutput',
      description: 'Read paginated terminal output by terminal session ID. Defaults to the newest 100 lines.',
      inputSchema: readTerminalOutputInputSchema,
      annotations: { readOnly: true, openWorld: false },
      execute: async (input) => {
        const data = input as { workspaceId?: string; sessionId: string; offset?: number; limit?: number };
        if (data.workspaceId && data.workspaceId !== workspaceId) throw new Error('workspaceId mismatch');
        return commandProcessManager.readTerminalOutput(workspaceId, data.sessionId, {
          offset: data.offset,
          limit: data.limit,
        });
      },
    },
    {
      name: 'ListQuickCommands',
      description: 'List all quick commands for the workspace with running status.',
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string', description: 'The workspace ID' },
        },
        required: ['workspaceId'],
        additionalProperties: false,
      },
      annotations: { readOnly: true, openWorld: false },
      execute: async (input) => {
        const data = input as { workspaceId: string };
        if (data.workspaceId !== workspaceId) throw new Error('workspaceId mismatch');
        const commands = commandService.listCommands(workspaceId);
        const processes = commandProcessManager.getCommandProcesses(workspaceId);
        const processMap = new Map(processes.map(p => [p.commandId, p]));
        return commands.map(cmd => ({
          ...cmd,
          running: processMap.has(cmd.id) ? processMap.get(cmd.id)!.status : false,
        }));
      },
    },
    {
      name: 'RunQuickCommand',
      description: 'Run a quick command by ID. Returns sessionId.',
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string' },
          commandId: { type: 'string' },
        },
        required: ['workspaceId', 'commandId'],
        additionalProperties: false,
      },
      annotations: { destructive: false, openWorld: false },
      execute: async (input) => {
        const data = input as { workspaceId: string; commandId: string };
        if (data.workspaceId !== workspaceId) throw new Error('workspaceId mismatch');
        return { sessionId: commandProcessManager.runCommand(workspaceId, data.commandId) };
      },
    },
    {
      name: 'StopQuickCommand',
      description: 'Stop a running quick command by ID.',
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string' },
          commandId: { type: 'string' },
        },
        required: ['workspaceId', 'commandId'],
        additionalProperties: false,
      },
      annotations: { destructive: false, openWorld: false },
      execute: async (input) => {
        const data = input as { workspaceId: string; commandId: string };
        if (data.workspaceId !== workspaceId) throw new Error('workspaceId mismatch');
        commandProcessManager.stopCommand(workspaceId, data.commandId);
        return { stopped: true };
      },
    },
  ];

  return tools.filter((tool) => allowedToolNames.has(tool.name as BuiltInAgentToolName));
}
