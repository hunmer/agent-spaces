/**
 * stdio transport —— 用 stdin/stdout 通信，适配 Claude Desktop / Cursor 等本地 MCP 客户端。
 */
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export async function serveStdio(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
