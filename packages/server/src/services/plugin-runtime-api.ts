import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { PassThrough, Readable } from 'node:stream';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getDataDir } from '../storage/json-store.js';
import { resolveDataPath, writeDataFile } from './mini-apps.js';

// 拼服务端 origin（供插件产物转 httpPath），与 savePublicFile 原逻辑一致。
function serverOrigin(): string {
  const port = process.env.PORT || '3100';
  const host = process.env.HTTP_HOST || 'localhost';
  const protocol = process.env.HTTPS ? 'https' : 'http';
  return `${protocol}://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;
}

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

// 插件来源标识，用于在 HTTP 调试日志中标注请求由哪个插件发起。
// workspaceId 命中 mini-app 时携带，使插件能访问该 mini-app 的 data 目录。
export type PluginSource = {
  pluginId?: string;
  pluginName?: string;
  workspaceId?: string;
};

// 跨 async/await 透传当前调用栈的插件来源，供 httpDebug / wrapFetchWithDebug 读取。
const pluginSourceStorage = new AsyncLocalStorage<PluginSource>();

// 在插件/mini-app 代码执行入口包裹，使其内部任意 fetch（含 globalThis.fetch）都能带上来源。
// 同一调用栈若已有相同来源则直接执行，避免无意义嵌套。
export function runWithPluginSource<T>(source: PluginSource, fn: () => T): T {
  const outer = pluginSourceStorage.getStore();
  if (outer && outer.pluginId === source.pluginId && outer.pluginName === source.pluginName) {
    return fn();
  }
  return pluginSourceStorage.run(source, fn);
}

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

// 将已读取的 body 文本重新封装成类 IncomingMessage 流，使下游 collectBody/collectBuffer 可再次读取。
// 用于调试日志采样 body 后避免消耗原始响应体。
function replayResponse(original: http.IncomingMessage, body: string): http.IncomingMessage {
  const pass = new PassThrough() as unknown as http.IncomingMessage;
  (pass as any).statusCode = original.statusCode;
  (pass as any).headers = original.headers;
  (pass as any).statusMessage = original.statusMessage;
  Readable.from(Buffer.from(body)).pipe(pass as any);
  return pass;
}

// 插件网络请求调试日志，默认开启；如需关闭设环境变量 AGENT_SPACES_PLUGIN_HTTP_DEBUG=0
const httpDebugEnabled = process.env.AGENT_SPACES_PLUGIN_HTTP_DEBUG !== '0';

// 响应体在调试日志中保留的最大字符数，超过则截断并追加省略标记。
const HTTP_DEBUG_BODY_LIMIT = Number(process.env.AGENT_SPACES_PLUGIN_HTTP_BODY_LIMIT || 500);

function formatLogValue(v: unknown): string {
  if (v == null) return '';
  return typeof v === 'string' && !/\s/.test(v) ? v : JSON.stringify(v);
}

function httpDebug(
  tag: string,
  method: string,
  url: string,
  fields?: Record<string, unknown>,
) {
  if (!httpDebugEnabled) return;

  // 自动从 AsyncLocalStorage 读取当前调用栈的插件来源。
  const source = pluginSourceStorage.getStore();
  const merged: Record<string, unknown> = { ...fields };
  if (source?.pluginId && merged.plugin === undefined) {
    merged.plugin = source.pluginName ? `${source.pluginId}/${source.pluginName}` : source.pluginId;
  }

  let msg = `[plugin-http] ${tag} ${method} ${url}`;
  for (const [k, v] of Object.entries(merged)) {
    msg += ` ${k}=${formatLogValue(v)}`;
  }
  console.debug(msg);
}

// 统一的响应体裁剪：超过上限截断并标注，供调试日志使用，不影响返回给插件的数据。
function trimBodyForLog(text: string): string {
  if (text.length <= HTTP_DEBUG_BODY_LIMIT) return text;
  return `${text.slice(0, HTTP_DEBUG_BODY_LIMIT)}…(+${text.length - HTTP_DEBUG_BODY_LIMIT} chars)`;
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
      // 克隆一份用于读取 body 摘要，避免消耗原始 body 影响插件逻辑。
      const contentType = res.headers.get('content-type') || '';
      const isTextLike = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded))/i.test(contentType);
      const preview = isTextLike ? await res.clone().text().then((t) => trimBodyForLog(t)).catch(() => undefined) : undefined;
      httpDebug('RES', method, url, {
        status: res.status,
        bytes: res.headers.get('content-length') || undefined,
        body: preview,
        ms: Date.now() - startedAt,
      });
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
            httpDebug('ERR', 'GET', url, { status: res.statusCode, ms: elapsed, body: trimBodyForLog(text) });
            reject(new Error(`HTTP ${res.statusCode}: ${trimBodyForLog(text)}`));
          },
          reject,
        );
        return;
      }
      const contentType = String(res.headers['content-type'] || '');
      const isTextLike = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded))/i.test(contentType);
      if (isTextLike) {
        collectBody(res).then(
          (text) => {
            httpDebug('RES', 'GET', url, {
              status: res.statusCode,
              bytes: text.length,
              body: trimBodyForLog(text),
              ms: elapsed,
            });
            // 重新封装响应体，避免被读取后消费导致插件拿不到数据。
            resolve(replayResponse(res, text));
          },
          reject,
        );
        return;
      }
      httpDebug('RES', 'GET', url, {
        status: res.statusCode,
        bytes: res.headers['content-length'],
        contentType,
        ms: elapsed,
      });
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
            httpDebug('ERR', 'POST', url, { status: res.statusCode, ms: elapsed, body: trimBodyForLog(text) });
            reject(new Error(`HTTP ${res.statusCode}: ${trimBodyForLog(text)}`));
          },
          reject,
        );
        return;
      }
      const contentType = String(res.headers['content-type'] || '');
      const isTextLike = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded))/i.test(contentType);
      if (isTextLike) {
        collectBody(res).then(
          (text) => {
            httpDebug('RES', 'POST', url, {
              status: res.statusCode,
              bytes: text.length,
              body: trimBodyForLog(text),
              ms: elapsed,
            });
            resolve(replayResponse(res, text));
          },
          reject,
        );
        return;
      }
      httpDebug('RES', 'POST', url, {
        status: res.statusCode,
        bytes: res.headers['content-length'],
        contentType,
        ms: elapsed,
      });
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

export function createBuiltinPluginApi(source: PluginSource = {}): Record<string, any> {
  // 把任意函数包进 pluginSourceStorage 上下文，使其内部发起的 httpDebug 能读到插件来源。
  // 同一调用栈若已有相同来源则复用，避免无意义嵌套。
  const withSource = <T extends (...args: any[]) => any>(fn: T): T =>
    ((...args: any[]) => {
      const outer = pluginSourceStorage.getStore();
      const sameSource =
        outer && outer.pluginId === source.pluginId && outer.pluginName === source.pluginName;
      if (sameSource) return fn(...args);
      return pluginSourceStorage.run(source, () => fn(...args));
    }) as T;

  const api = {
    async fetchText(url: string, options: FetchOptions = {}): Promise<string> {
      const res = await httpGet(url, { ...options, timeout: options.timeout || 1000 * 60 * 1 });
      return collectBody(res, options.encoding);
    },

    async fetchJson<T = any>(url: string, options: FetchOptions = {}): Promise<T> {
      const text = await api.fetchText(url, options);
      return JSON.parse(text);
    },

    async fetchBuffer(url: string, options: FetchOptions = {}) {
      const res = await httpGet(url, { ...options, timeout: options.timeout || 1000 * 60 * 3 });
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
      const res = await httpPost(url, { ...options, timeout: options.timeout || 1000 * 60 * 3 });
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
      return { filePath, httpPath: `${serverOrigin()}/static/uploads/${filename}` };
    },

    // 取当前 mini-app 的 data 目录绝对路径（workspaceId 缺失时返回 null）。
    // 插件据此把产物写到该 mini-app 的隔离沙箱，而非全局 public/uploads。
    // 注意：resolveDataPath 要求非空 filePath，这里传 '.' 表示 data 目录自身。
    getMiniAppDataDir(): string | null {
      const wsId = source.workspaceId;
      if (!wsId) return null;
      return resolveDataPath(wsId, '.');
    },

    // 把输入路径规整为 ffmpeg 可处理的形态：
    // - 完整 http(s) URL → 原样返回（ffmpeg 直接下载）
    // - /static/xxx 这类同站相对 URL → 补全为完整 http URL（交给 ffmpeg 下载，
    //   避免依赖宿主 public 目录的具体磁盘布局——上传文件由 /static 路由 serve）
    // - 已是绝对路径 → 原样返回
    resolveInputPath(inputPath: string): string {
      if (!inputPath) return inputPath;
      if (/^(https?):\/\//i.test(inputPath)) return inputPath;
      if (inputPath.startsWith('/static/') || inputPath.startsWith('/api/')) {
        // 补全 origin，让 ffmpeg 走 http 拉取（web 的 /static 路由已能 serve 上传文件）
        return `${serverOrigin()}${inputPath}`;
      }
      return inputPath;
    },

    // 把 buffer 写入当前 mini-app 的 data 目录（relPath 相对 data/，如 'video-frames/x/f.jpg'），
    // 返回可直接用于 <img>/<video> src 的 httpPath。复用 /api/mini-apps/:id/data/file 路由。
    saveMiniAppDataFile(relPath: string, buffer: Buffer): { filePath: string; httpPath: string } | null {
      const wsId = source.workspaceId;
      if (!wsId) return null;
      const filePath = resolveDataPath(wsId, relPath);
      writeDataFile(wsId, relPath, buffer);
      const rel = relPath.replace(/^\/+/, '');
      return { filePath, httpPath: `${serverOrigin()}/api/mini-apps/${encodeURIComponent(wsId)}/data/file?path=${encodeURIComponent(rel)}` };
    },
  };

  // 用 source 上下文包装所有方法，使插件内部发起的网络请求在日志中带上 plugin 来源。
  const wrapped: Record<string, any> = {};
  for (const [key, value] of Object.entries(api)) {
    wrapped[key] = typeof value === 'function' ? withSource(value) : value;
  }
  wrapped.getJson = wrapped.fetchJson;
  return wrapped;
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
