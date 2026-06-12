/**
 * SDK 通用类型定义
 */

/** SDK 配置 */
export interface SDKConfig {
  /** 服务器基础 URL，如 http://localhost:3100 */
  baseUrl: string;
  /** Token 获取函数（延迟求值，每次请求时调用） */
  getToken: () => string | null;
  /** 401/403 时的回调（通常跳转登录页） */
  onUnauthorized?: () => void;
  /** 是否启用调试日志，默认 false */
  debug?: boolean;
}

/** API 错误 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
    public readonly url: string,
    public readonly method: string,
  ) {
    super(`[${status}] ${statusText}: ${body.slice(0, 200)}`);
    this.name = 'ApiError';
  }
}

/** 请求选项（扩展 RequestInit） */
export interface RequestOptions extends RequestInit {
  /** 是否跳过自动 auth header 注入，默认 false */
  noAuth?: boolean;
  /** 是否跳过 baseUrl 拼接（传入完整 URL），默认 false */
  absoluteUrl?: boolean;
  /** 是否不抛出错误（返回原始 Response），默认 false */
  rawResponse?: boolean;
}
