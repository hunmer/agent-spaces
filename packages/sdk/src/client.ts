/**
 * HttpClient — SDK 的核心 HTTP 客户端
 *
 * 统一处理：
 * - baseUrl 拼接
 * - Bearer Token 自动注入
 * - 标准化错误处理
 * - 调试日志输出
 */

import type { SDKConfig, RequestOptions } from './types';
import { ApiError } from './types';

export class HttpClient {
  private config: SDKConfig;

  constructor(config: SDKConfig) {
    this.config = config;
  }

  /** 更新配置（如切换服务器） */
  updateConfig(patch: Partial<SDKConfig>): void {
    Object.assign(this.config, patch);
  }

  /** 获取当前 baseUrl */
  get baseUrl(): string {
    return this.config.baseUrl;
  }

  /** 获取当前 debug 状态 */
  get debug(): boolean {
    return this.config.debug ?? false;
  }

  /** 设置 debug 开关 */
  setDebug(enabled: boolean): void {
    this.config.debug = enabled;
  }

  /**
   * 统一请求方法 — 所有 API 模块的唯一出口
   */
  async request(
    path: string,
    init: RequestInit & RequestOptions = {},
  ): Promise<Response> {
    const {
      noAuth = false,
      absoluteUrl = false,
      rawResponse = false,
      ...fetchInit
    } = init;

    // 1. 拼接 URL
    const url = absoluteUrl ? path : this.resolveUrl(path);

    // 2. 构建 headers
    const headers: Record<string, string> = {};
    if (!noAuth) {
      const token = this.config.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    // 合并用户传入的 headers
    if (fetchInit.headers) {
      if (fetchInit.headers instanceof Headers) {
        fetchInit.headers.forEach((v, k) => { headers[k] = v; });
      } else if (Array.isArray(fetchInit.headers)) {
        for (const [k, v] of fetchInit.headers) {
          headers[k] = v;
        }
      } else {
        Object.assign(headers, fetchInit.headers);
      }
    }

    const method = fetchInit.method ?? 'GET';
    const startTime = this.config.debug ? performance.now() : 0;

    // 3. 调试日志 — 请求
    if (this.config.debug) {
      console.log(
        `%c[SDK →] %c${method} ${url}`,
        'color: #6366f1; font-weight: bold',
        'color: #0ea5e9',
        fetchInit.body ? `\n  body: ${truncate(String(fetchInit.body), 500)}` : '',
      );
    }

    // 4. 发起请求
    let response: Response;
    try {
      response = await fetch(url, { ...fetchInit, headers });
    } catch (err) {
      if (this.config.debug) {
        console.error(`%c[SDK ✗] %c${method} ${url} — network error`,
          'color: #ef4444; font-weight: bold', 'color: inherit', err);
      }
      throw err;
    }

    // 5. 调试日志 — 响应
    if (this.config.debug) {
      const elapsed = (performance.now() - startTime).toFixed(1);
      const color = response.ok ? '#22c55e' : '#ef4444';
      console.log(
        `%c[SDK ←] %c${method} ${url} %c${response.status} ${response.statusText} %c${elapsed}ms`,
        'color: #6366f1; font-weight: bold',
        'color: #0ea5e9',
        `color: ${color}; font-weight: bold`,
        'color: #a1a1aa',
      );
    }

    // 6. 仅 401 视为登录失效；403 交给业务层处理权限不足
    if (response.status === 401) {
      this.config.onUnauthorized?.();
    }

    // 7. 错误处理
    if (!rawResponse && !response.ok) {
      const body = await response.text().catch(() => '');
      throw new ApiError(response.status, response.statusText, body, url, method);
    }

    return response;
  }

  // ---- 便捷方法 ----

  /** GET + JSON 解析 */
  async get<T>(path: string, opts?: RequestOptions & Omit<RequestInit, 'method' | 'body'>): Promise<T> {
    const res = await this.request(path, { ...opts, method: 'GET' });
    return res.json();
  }

  /** POST + JSON body */
  async post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    const res = await this.request(path, {
      ...opts,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(opts?.headers as Record<string, string> ?? {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return res.json();
  }

  /** POST 不解析响应体 */
  async postVoid(path: string, body?: unknown, opts?: RequestOptions): Promise<void> {
    await this.request(path, {
      ...opts,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(opts?.headers as Record<string, string> ?? {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  /** PUT + JSON body */
  async put<T>(path: string, body: unknown, opts?: RequestOptions): Promise<T> {
    const res = await this.request(path, {
      ...opts,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(opts?.headers as Record<string, string> ?? {}) },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  /** PUT 不解析响应体 */
  async putVoid(path: string, body: unknown, opts?: RequestOptions): Promise<void> {
    await this.request(path, {
      ...opts,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(opts?.headers as Record<string, string> ?? {}) },
      body: JSON.stringify(body),
    });
  }

  /** PATCH + JSON 解析 */
  async patch<T>(path: string, body: unknown, opts?: RequestOptions): Promise<T> {
    const res = await this.request(path, {
      ...opts,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(opts?.headers as Record<string, string> ?? {}) },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  /** DELETE */
  async delete(path: string, opts?: RequestOptions): Promise<void> {
    await this.request(path, { ...opts, method: 'DELETE' });
  }

  /** DELETE + JSON 解析 */
  async deleteOf<T>(path: string, opts?: RequestOptions): Promise<T> {
    const res = await this.request(path, { ...opts, method: 'DELETE' });
    return res.json();
  }

  /** POST FormData (文件上传) */
  async upload<T>(path: string, formData: FormData, opts?: RequestOptions): Promise<T> {
    const res = await this.request(path, {
      ...opts,
      method: 'POST',
      body: formData,
    });
    return res.json();
  }

  /** SSE 流 — 返回原始 Response，调用方用 EventSource 或 reader 消费 */
  async sse(path: string, body?: unknown, opts?: RequestOptions): Promise<Response> {
    return this.request(path, {
      ...opts,
      method: 'POST',
      rawResponse: true,
      headers: {
        'Accept': 'text/event-stream',
        'Content-Type': 'application/json',
        ...(opts?.headers as Record<string, string> ?? {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  /** 获取原始 Response（不做 JSON 解析，不抛错） */
  async raw(path: string, init: RequestInit & RequestOptions = {}): Promise<Response> {
    return this.request(path, { ...init, rawResponse: true });
  }

  // ---- 内部工具 ----

  private resolveUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const base = this.config.baseUrl.replace(/\/$/, '');
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  }
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str;
}
