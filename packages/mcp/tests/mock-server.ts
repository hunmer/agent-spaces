/**
 * mock-server —— 红绿灯测试用的 mock Agent Spaces HTTP server。
 *
 * 起一个真实监听的 http server，让 SDK 的 fetch 打到它，验证：
 * 1. MCP tool 调用被正确转发为 HTTP 请求（方法/路径/body）
 * 2. 响应被正确回传
 * 3. 错误状态码被正确处理
 *
 * 记录所有收到的请求，供断言。
 */
import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'node:http';

export interface RecordedRequest {
  method: string;
  url: string;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface MockServerHandle {
  baseUrl: string;
  requests: RecordedRequest[];
  /** 设置下个请求的响应（状态码 + body） */
  setNextResponse: (status: number, body: unknown, contentType?: string) => void;
  /** 清空已记录请求 */
  reset: () => void;
  close: () => Promise<void>;
}

export async function startMockServer(): Promise<MockServerHandle> {
  const requests: RecordedRequest[] = [];
  let nextResponse: { status: number; body: string; contentType: string } = {
    status: 200,
    body: JSON.stringify({ ok: true }),
    contentType: 'application/json',
  };

  const server: HttpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      requests.push({
        method: req.method ?? 'GET',
        url: req.url ?? '/',
        body,
        headers: req.headers,
      });

      const { status, body: respBody, contentType } = nextResponse;
      // 用完即恢复默认
      nextResponse = { status: 200, body: JSON.stringify({ ok: true }), contentType: 'application/json' };

      res.writeHead(status, { 'Content-Type': contentType });
      res.end(respBody);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.once('listening', () => {
      server.off('error', reject);
      resolve();
    });
    server.listen(0, '127.0.0.1');
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('mock server 启动失败');
  const baseUrl = `http://127.0.0.1:${(addr as { port: number }).port}`;

  return {
    baseUrl,
    requests,
    setNextResponse: (status, body, contentType = 'application/json') => {
      nextResponse = {
        status,
        body: typeof body === 'string' ? body : JSON.stringify(body),
        contentType,
      };
    },
    reset: () => {
      requests.length = 0;
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
