/**
 * server —— 创建 MCP Server 并注册 tools/list、tools/call handler。
 *
 * transport 无关：返回的 Server 不绑定任何 transport，由调用方
 * （stdio.ts / http.ts / 测试）注入对应的 transport 后调 connect。
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult, ListToolsResult, Tool } from '@modelcontextprotocol/sdk/types.js';

import type { SDK } from '@agent-spaces/sdk';
import { buildToolRegistry, type McpToolDef } from './registry.js';

const SERVER_NAME = 'agent-spaces-mcp';
const SERVER_VERSION = '0.1.0';

/** 把内部 tool 定义转为 MCP 协议的 Tool 描述 */
function toMcpTool(def: McpToolDef): Tool {
  return {
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
  };
}

/** 把任意结果序列化为 MCP CallToolResult（文本 + 结构化） */
function toCallToolResult(result: unknown, isError = false): CallToolResult {
  const text =
    result === undefined ? 'null' : typeof result === 'string' ? result : (JSON.stringify(result, null, 2) ?? String(result));
  const content: CallToolResult['content'] = [{ type: 'text', text }];
  return {
    content,
    isError,
    ...(result !== undefined && typeof result === 'object' && !Array.isArray(result)
      ? { structuredContent: result as Record<string, unknown> }
      : {}),
  } as CallToolResult;
}

/**
 * 创建 MCP Server（已注册 handler，未连接 transport）。
 * @returns server 实例与已注册的 tool 定义（供测试检查）
 */
export function createMcpServer(sdk: SDK): { server: Server; tools: McpToolDef[] } {
  const tools = buildToolRegistry(sdk);
  const toolsByName = new Map(tools.map((t) => [t.name, t]));

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: { listChanged: false } },
      instructions:
        'Agent Spaces SDK 的全部能力。每个 tool 名为 `模块_方法`（如 workspace_list、git_commit），' +
        '参数以 arg0/arg1/... 按序传入，object 参数可传 JSON 字符串。',
    },
  );

  // ---- tools/list ----
  server.setRequestHandler(ListToolsRequestSchema, (): ListToolsResult => ({
    tools: tools.map(toMcpTool),
  }));

  // ---- tools/call ----
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const name = request.params.name;
    const def = toolsByName.get(name);
    if (!def) {
      throw new McpError(ErrorCode.InvalidParams, `未知 tool: ${name}`);
    }

    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    // 校验必填参数
    const missing = def.inputSchema.required.filter((k) => args[k] === undefined);
    if (missing.length > 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `缺少必填参数: ${missing.join(', ')}（tool ${name} 需 ${def.inputSchema.required.length} 个参数）`,
      );
    }

    try {
      const result = await def.execute(args);
      return toCallToolResult(result);
    } catch (err) {
      // SDK 的 ApiError 或普通错误都包装为 MCP 工具错误（isError=true），不抛中断会话
      const message = err instanceof Error ? err.message : String(err);
      return toCallToolResult({ error: message, tool: name }, true);
    }
  });

  return { server, tools };
}
