import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { getDataDir } from '../storage/json-store.js';

export type FetchOptions = {
  headers?: Record<string, string>;
  encoding?: BufferEncoding;
  timeout?: number;
  userAgent?: string;
  proxy?: string;
};

export type PostOptions = FetchOptions & {
  body?: unknown;
};

function createHttpsTunnel(proxyUrl: string, targetHost: string, targetPort: number): Promise<tls.TLSSocket> {
  const proxy = new URL(proxyUrl);
  const proxyPort = Number(proxy.port) || 8080;

  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, proxy.hostname);
    const onError = (err: Error) => {
      socket.destroy();
      reject(err);
    };

    socket.once('error', onError);
    socket.once('connect', () => {
      let authHeader = '';
      if (proxy.username || proxy.password) {
        const credentials = Buffer.from(
          `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`,
        ).toString('base64');
        authHeader = `Proxy-Authorization: Basic ${credentials}\r\n`;
      }

      socket.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
          `Host: ${targetHost}:${targetPort}\r\n` +
          authHeader +
          '\r\n',
      );
    });

    let response = '';
    const onData = (chunk: Buffer) => {
      response += chunk.toString();
      if (!response.includes('\r\n\r\n')) return;

      socket.removeListener('data', onData);
      const statusLine = response.substring(0, response.indexOf('\r\n'));
      const statusCode = Number(statusLine.split(' ')[1]);

      if (statusCode !== 200) {
        socket.destroy();
        reject(new Error(`Proxy connection failed: ${statusLine}`));
        return;
      }

      const tlsSocket = tls.connect({ socket, servername: targetHost }, () => resolve(tlsSocket));
      tlsSocket.once('error', onError);
    };

    socket.on('data', onData);
    socket.once('timeout', () => onError(new Error('Request timed out')));
  });
}

async function createRequest(
  url: string,
  method: string,
  headers: http.OutgoingHttpHeaders,
  timeout: number,
  proxy?: string,
): Promise<http.ClientRequest> {
  const parsed = new URL(url);

  if (proxy && parsed.protocol === 'https:') {
    const targetPort = Number(parsed.port) || 443;
    const tunnel = await createHttpsTunnel(proxy, parsed.hostname, targetPort);
    const agent = new https.Agent({ keepAlive: false });
    (agent as any).createConnection = () => tunnel;
    return https.request({
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method,
      headers,
      timeout,
      agent,
    });
  }

  if (proxy && parsed.protocol === 'http:') {
    const proxyParsed = new URL(proxy);
    return http.request({
      hostname: proxyParsed.hostname,
      port: proxyParsed.port || 8080,
      path: url,
      method,
      headers,
      timeout,
    });
  }

  const mod = parsed.protocol === 'https:' ? https : http;
  return mod.request(url, { method, headers, timeout });
}

function collectBody(res: http.IncomingMessage, encoding: BufferEncoding = 'utf-8'): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => resolve(Buffer.concat(chunks).toString(encoding)));
    res.on('error', reject);
  });
}

function collectBuffer(res: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => resolve(Buffer.concat(chunks)));
    res.on('error', reject);
  });
}

// 插件网络请求调试日志，默认开启；如需关闭设环境变量 AGENT_SPACES_PLUGIN_HTTP_DEBUG=0
const httpDebugEnabled = process.env.AGENT_SPACES_PLUGIN_HTTP_DEBUG !== '0';

function httpDebug(
  tag: string,
  method: string,
  url: string,
  fields?: Record<string, unknown>,
) {
  if (!httpDebugEnabled) return;
  let msg = `[plugin-http] ${tag} ${method} ${url}`;
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      const text = v == null ? '' : typeof v === 'string' && !/\s/.test(v) ? v : JSON.stringify(v);
      msg += ` ${k}=${text}`;
    }
  }
  console.debug(msg);
}

// 包装全局 fetch，使插件里 globalThis.fetch（如 ai-image 图像编辑/下载）也输出调试日志。
// 插件 actions.js 在主进程被 createRequire 加载，其 globalThis.fetch 解析的就是
// 主进程 globalThis.fetch，因此包装全局即可覆盖，无需改 sandbox 注入。
export function wrapFetchWithDebug(next: typeof fetch): typeof fetch {
  const wrapped = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    let url = '';
    if (typeof input === 'string') url = input;
    else if (input instanceof URL) url = input.toString();
    else if (input && typeof input === 'object' && 'url' in input) url = String((input as Request).url);
    else url = String(input);
    const method = (((init && init.method) as string) || 'GET').toUpperCase();
    const startedAt = Date.now();
    httpDebug('REQ', method, url, { via: 'fetch' });
    try {
      const res = await next(input as any, init);
      httpDebug('RES', method, url, { status: res.status, ms: Date.now() - startedAt });
      return res;
    } catch (err) {
      httpDebug('ERR', method, url, {
        error: err instanceof Error ? err.message : String(err),
        ms: Date.now() - startedAt,
      });
      throw err;
    }
  };
  return wrapped as typeof fetch;
}

async function httpGet(url: string, options: FetchOptions & { timeout: number }): Promise<http.IncomingMessage> {
  const headers: http.OutgoingHttpHeaders = {
    'User-Agent': options.userAgent || 'AgentSpaces/1.0',
    ...options.headers,
  };
  const req = await createRequest(url, 'GET', headers, options.timeout, options.proxy);

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    httpDebug('REQ', 'GET', url, { proxy: options.proxy, timeout: options.timeout });
    req.on('response', (res) => {
      const elapsed = Date.now() - startedAt;
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        httpDebug('REDIRECT', 'GET', url, { status: res.statusCode, location: redirectUrl, ms: elapsed });
        httpGet(redirectUrl, options).then(resolve, reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        collectBody(res).then(
          (text) => {
            httpDebug('ERR', 'GET', url, { status: res.statusCode, ms: elapsed, body: text.slice(0, 200) });
            reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
          },
          reject,
        );
        return;
      }
      httpDebug('RES', 'GET', url, { status: res.statusCode, ms: elapsed });
      resolve(res);
    });
    req.on('error', (err) => {
      httpDebug('ERR', 'GET', url, { error: err.message, ms: Date.now() - startedAt });
      reject(err);
    });
    req.on('timeout', () => {
      httpDebug('ERR', 'GET', url, { error: 'timeout', ms: Date.now() - startedAt });
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.end();
  });
}

async function httpPost(url: string, options: PostOptions & { timeout: number }): Promise<http.IncomingMessage> {
  const body = options.body === undefined ? '' : JSON.stringify(options.body);
  const headers: http.OutgoingHttpHeaders = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'User-Agent': options.userAgent || 'AgentSpaces/1.0',
    ...options.headers,
  };
  const req = await createRequest(url, 'POST', headers, options.timeout, options.proxy);

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    httpDebug('REQ', 'POST', url, {
      proxy: options.proxy,
      timeout: options.timeout,
      bodyBytes: Buffer.byteLength(body),
    });
    req.on('response', (res) => {
      const elapsed = Date.now() - startedAt;
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        httpDebug('REDIRECT', 'POST', url, { status: res.statusCode, location: redirectUrl, ms: elapsed });
        httpGet(redirectUrl, options).then(resolve, reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        collectBody(res).then(
          (text) => {
            httpDebug('ERR', 'POST', url, { status: res.statusCode, ms: elapsed, body: text.slice(0, 200) });
            reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
          },
          reject,
        );
        return;
      }
      httpDebug('RES', 'POST', url, { status: res.statusCode, ms: elapsed });
      resolve(res);
    });
    req.on('error', (err) => {
      httpDebug('ERR', 'POST', url, { error: err.message, ms: Date.now() - startedAt });
      reject(err);
    });
    req.on('timeout', () => {
      httpDebug('ERR', 'POST', url, { error: 'timeout', ms: Date.now() - startedAt });
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.write(body);
    req.end();
  });
}

function matchPattern(name: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
  return re.test(name);
}

export function createBuiltinPluginApi(): Record<string, any> {
  const api = {
    async fetchText(url: string, options: FetchOptions = {}): Promise<string> {
      const res = await httpGet(url, { ...options, timeout: options.timeout || 30000 });
      return collectBody(res, options.encoding);
    },

    async fetchJson<T = any>(url: string, options: FetchOptions = {}): Promise<T> {
      const text = await api.fetchText(url, options);
      return JSON.parse(text);
    },

    async fetchBuffer(url: string, options: FetchOptions = {}) {
      const res = await httpGet(url, { ...options, timeout: options.timeout || 60000 });
      const buffer = await collectBuffer(res);
      return {
        buffer,
        size: buffer.length,
        mimeType: res.headers['content-type'] || 'application/octet-stream',
      };
    },

    async fetchBuffers(urls: string[], options: FetchOptions = {}) {
      const results = [];
      for (const url of urls) {
        try {
          const result = await api.fetchBuffer(url, options);
          results.push({ url, ...result, success: true });
        } catch (err) {
          results.push({ url, success: false, error: err instanceof Error ? err.message : String(err) });
        }
      }
      return results;
    },

    async postJson<T = any>(url: string, options: PostOptions = {}): Promise<T> {
      const res = await httpPost(url, { ...options, timeout: options.timeout || 60000 });
      const text = await collectBody(res);
      return JSON.parse(text);
    },

    writeFile: (filePath: string, content: string, encoding: BufferEncoding = 'utf-8') =>
      fs.writeFile(filePath, content, encoding),

    writeBinaryFile: (filePath: string, data: string | Buffer) => {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64');
      return fs.writeFile(filePath, buffer);
    },

    readFile: (filePath: string, encoding: BufferEncoding = 'utf-8') => fs.readFile(filePath, encoding),

    async editFile(filePath: string, oldContent: string, newContent: string) {
      const content = await fs.readFile(filePath, 'utf-8');
      if (!content.includes(oldContent)) throw new Error('Content to replace was not found');
      await fs.writeFile(filePath, content.replace(oldContent, newContent), 'utf-8');
      return { replaced: true };
    },

    deleteFile: (filePath: string) => fs.unlink(filePath),

    async listFiles(dirPath: string, options: { recursive?: boolean; pattern?: string } = {}) {
      const results: Array<{ name: string; path: string; type: 'file' | 'directory' }> = [];
      const visit = async (currentDir: string) => {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          const type = entry.isDirectory() ? 'directory' : 'file';
          if (!options.pattern || matchPattern(entry.name, options.pattern)) {
            results.push({ name: entry.name, path: fullPath, type });
          }
          if (entry.isDirectory() && options.recursive) await visit(fullPath);
        }
      };
      await visit(dirPath);
      return results;
    },

    createDir: (dirPath: string, options: { recursive?: boolean } = {}) =>
      fs.mkdir(dirPath, { recursive: options.recursive ?? true }),

    removeDir: (dirPath: string, options: { recursive?: boolean; force?: boolean } = {}) =>
      fs.rm(dirPath, { recursive: options.recursive ?? false, force: options.force ?? false }),

    async stat(filePath: string) {
      const stat = await fs.stat(filePath);
      return {
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
        size: stat.size,
        createdAt: stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString(),
      };
    },

    exists: (filePath: string) => fs.access(filePath).then(() => true).catch(() => false),
    rename: (oldPath: string, newPath: string) => fs.rename(oldPath, newPath),
    copyFile: (src: string, dest: string) => fs.copyFile(src, dest),

    savePublicFile(buffer: Buffer, ext: string): { filePath: string; httpPath: string } {
      const dataDir = getDataDir();
      const uploadsDir = path.join(dataDir, 'public', 'uploads');
      if (!fsSync.existsSync(uploadsDir)) fsSync.mkdirSync(uploadsDir, { recursive: true });
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = path.join(uploadsDir, filename);
      fsSync.writeFileSync(filePath, buffer);
      const port = process.env.PORT || '3100';
      const host = process.env.HTTP_HOST || 'localhost';
      const protocol = process.env.HTTPS ? 'https' : 'http';
      const origin = `${protocol}://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;
      return { filePath, httpPath: `${origin}/static/uploads/${filename}` };
    },
  };

  return {
    ...api,
    getJson: api.fetchJson,
  };
}

// 调试开启时，在模块加载阶段包装全局 fetch。包成幂等（防热重载重复包装）。
if (httpDebugEnabled && typeof globalThis.fetch === 'function') {
  const originalFetch = globalThis.fetch as typeof fetch;
  if (!(originalFetch as any).__pluginHttpDebugWrapped) {
    const wrapped = wrapFetchWithDebug(originalFetch);
    (wrapped as any).__pluginHttpDebugWrapped = true;
    globalThis.fetch = wrapped;
  }
}
