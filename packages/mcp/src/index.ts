#!/usr/bin/env node
/**
 * agent-spaces-mcp —— CLI 入口
 *
 * 把 @agent-spaces/sdk 的全部能力暴露为 MCP 服务。
 *
 * 用法：
 *   # stdio（默认，给 Claude Desktop / Cursor）
 *   agent-spaces-mcp --baseUrl http://localhost:3100 --token <token>
 *
 *   # http（远程）
 *   agent-spaces-mcp --transport http --port 3101 --baseUrl http://localhost:3100 --token <token>
 *
 *   token 也可通过环境变量 AGENT_SPACES_TOKEN 提供。
 */

import { createSDK, type SDKConfig } from '@agent-spaces/sdk';
import { createMcpServer } from './server.js';
import { serveStdio } from './transport/stdio.js';
import { serveHttp } from './transport/http.js';

interface CliArgs {
  baseUrl: string;
  token: string;
  transport: 'stdio' | 'http';
  port: number;
  host: string;
  debug: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const get = (key: string, fallback?: string) => {
    const i = argv.indexOf(`--${key}`);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const flag = (key: string) => argv.includes(`--${key}`);

  const baseUrl = get('baseUrl', process.env.AGENT_SPACES_BASE_URL || 'http://localhost:3100')!;
  const token = get('token', process.env.AGENT_SPACES_TOKEN || '')!;
  const transport = (get('transport', 'stdio') || 'stdio') as 'stdio' | 'http';
  const port = Number(get('port', '3101')) || 3101;
  const host = get('host', '127.0.0.1') || '127.0.0.1';
  const debug = flag('debug');

  return { baseUrl, token, transport, port, host, debug };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.error(`agent-spaces-mcp — Agent Spaces SDK → MCP

  --baseUrl <url>      Agent Spaces 服务器地址（默认 http://localhost:3100）
  --token <token>      鉴权 token（也可用 AGENT_SPACES_TOKEN 环境变量）
  --transport <t>      stdio（默认）| http
  --port <n>           http 模式端口（默认 3101）
  --host <h>           http 模式监听地址（默认 127.0.0.1）
  --debug              开启 SDK 调试日志（输出到 stderr）
`);
    process.exit(0);
  }

  const sdkConfig: SDKConfig = {
    baseUrl: args.baseUrl,
    getToken: () => args.token || null,
    onUnauthorized: () => console.error('[mcp] 鉴权失败（401/403）：请检查 --token'),
    debug: args.debug,
  };

  const sdk = createSDK(sdkConfig);
  const { server, tools } = createMcpServer(sdk);

  if (args.transport === 'stdio') {
    // stdio 模式：日志走 stderr，避免污染 stdout（MCP 消息通道）
    console.error(`[mcp] stdio transport | tools=${tools.length} baseUrl=${args.baseUrl}`);
    await serveStdio(server);
  } else {
    const log = (msg: string) => console.error(`[mcp] ${msg}`);
    await serveHttp(server, args.port, args.host, log);
    log(`已启动，tools=${tools.length}`);
    // 保持进程运行
    process.on('SIGINT', async () => {
      log('收到 SIGINT，退出');
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error('[mcp] 启动失败:', err instanceof Error ? err.message : err);
  process.exit(1);
});
