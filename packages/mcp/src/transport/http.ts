/**
 * http transport —— StreamableHTTPServerTransport，监听端口，供远程 MCP 客户端访问。
 *
 * 用法参照 packages/server/src/adapters/codex-function-tool-bridge.ts（同版本 MCP SDK）。
 */
import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export interface HttpServeResult {
  url: string;
  close: () => Promise<void>;
}

function listen(server: HttpServer, port: number, host: string): Promise<void> {
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
    server.listen(port, host);
  });
}

function closeHttpServer(server: HttpServer): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

export async function serveHttp(
  server: Server,
  port: number,
  host = '127.0.0.1',
  log?: (msg: string) => void,
): Promise<HttpServeResult> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  const httpServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/mcp') {
        res.writeHead(404).end('Not found');
        return;
      }
      log?.(`http mcp request | method=${req.method ?? '-'} path=${url.pathname}`);
      await transport.handleRequest(req, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log?.(`http mcp request failed | ${message}`);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      if (!res.writableEnded) res.end(message);
    }
  });

  await listen(httpServer, port, host);
  const url = `http://${host}:${port}/mcp`;
  log?.(`http mcp server started | url=${url}`);

  return {
    url,
    close: async () => {
      await server.close();
      await closeHttpServer(httpServer);
      log?.('http mcp server stopped');
    },
  };
}
