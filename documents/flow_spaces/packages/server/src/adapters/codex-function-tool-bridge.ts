import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type CallToolResult,
  type ListToolsResult,
  type Tool,
  type ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';
import type { AgentFunctionTool } from './agent-runtime-types.js';

const AGENT_SPACES_MCP_SERVER_NAME = 'agent-spaces';

export interface CodexFunctionToolBridge {
  name: typeof AGENT_SPACES_MCP_SERVER_NAME;
  url: string;
  close: () => Promise<void>;
}

export async function startCodexFunctionToolBridge(
  functionTools: AgentFunctionTool[] | undefined,
  log?: (message: string) => void,
): Promise<CodexFunctionToolBridge | undefined> {
  if (!functionTools?.length) return undefined;

  const toolsByName = new Map(functionTools.map((functionTool) => [functionTool.name, functionTool]));
  const mcpServer = new Server(
    { name: AGENT_SPACES_MCP_SERVER_NAME, version: '0.1.0' },
    {
      capabilities: {
        tools: { listChanged: false },
      },
      instructions: 'Agent Spaces built-in runtime tools for workspace data.',
    },
  );
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
    enableJsonResponse: true,
  });

  mcpServer.setRequestHandler(ListToolsRequestSchema, (): ListToolsResult => ({
    tools: functionTools.map(toMcpTool),
  }));
  mcpServer.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const functionTool = toolsByName.get(normalizeFunctionToolCallName(request.params.name));
    if (!functionTool) {
      throw new McpError(ErrorCode.InvalidParams, `Tool ${request.params.name} not found`);
    }

    const result = await functionTool.execute(request.params.arguments ?? {});
    return {
      content: [
        {
          type: 'text',
          text: stringifyToolResult(result),
        },
      ],
      ...(isRecord(result) ? { structuredContent: result } : {}),
    };
  });

  await mcpServer.connect(transport);

  const httpServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/mcp') {
        res.writeHead(404).end('Not found');
        return;
      }
      log?.(`function tool bridge request | method=${req.method ?? '-'} path=${url.pathname}`);
      await transport.handleRequest(req, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log?.(`function tool bridge request failed | ${message}`);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      if (!res.writableEnded) res.end(message);
    }
  });

  await listen(httpServer);
  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    await closeHttpServer(httpServer);
    await mcpServer.close();
    throw new Error('Failed to start Codex function tool bridge');
  }

  const url = `http://127.0.0.1:${address.port}/mcp`;
  log?.(`function tool bridge started | url=${url} tools=${functionTools.map((tool) => tool.name).join(',')}`);

  return {
    name: AGENT_SPACES_MCP_SERVER_NAME,
    url,
    close: async () => {
      await mcpServer.close();
      await closeHttpServer(httpServer);
      log?.('function tool bridge stopped');
    },
  };
}

function toMcpTool(functionTool: AgentFunctionTool): Tool {
  return {
    name: functionTool.name,
    description: functionTool.description,
    inputSchema: normalizeToolInputSchema(functionTool.inputSchema),
    annotations: toMcpToolAnnotations(functionTool),
  };
}

function normalizeFunctionToolCallName(name: string): string {
  const prefixedName = agentSpacesMcpToolNamePrefix();
  return name.startsWith(prefixedName) ? name.slice(prefixedName.length) : name;
}

function agentSpacesMcpToolNamePrefix(): string {
  return `mcp__${AGENT_SPACES_MCP_SERVER_NAME}__`;
}

function normalizeToolInputSchema(schema: Record<string, unknown>): Tool['inputSchema'] {
  if (schema.type === 'object') return schema as Tool['inputSchema'];
  return {
    type: 'object',
    properties: normalizeSchemaProperties(schema.properties),
    required: Array.isArray(schema.required) ? schema.required.map(String) : [],
  };
}

function toMcpToolAnnotations(functionTool: AgentFunctionTool): ToolAnnotations | undefined {
  if (!functionTool.annotations) return undefined;
  return {
    readOnlyHint: functionTool.annotations.readOnly,
    destructiveHint: functionTool.annotations.destructive,
    openWorldHint: functionTool.annotations.openWorld,
  };
}

function stringifyToolResult(result: unknown): string {
  if (result === undefined) return 'null';
  return JSON.stringify(result, null, 2) ?? String(result);
}

function normalizeSchemaProperties(properties: unknown): Record<string, object> {
  if (!isRecord(properties)) return {};
  return Object.fromEntries(
    Object.entries(properties).filter((entry): entry is [string, object] => isRecord(entry[1])),
  );
}

function listen(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });
}

function closeHttpServer(server: HttpServer): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
