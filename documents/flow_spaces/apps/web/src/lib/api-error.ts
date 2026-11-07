/**
 * 前端 ApiError 解析辅助。不依赖 sdk 是否导出 ApiError 类型，
 * 用结构判别（ApiError 含 readonly status / body）。
 */

/** 取错误对应的 HTTP 状态码；非 ApiError 返回 undefined。 */
export function getApiErrorStatus(e: unknown): number | undefined {
  if (e && typeof e === 'object' && 'status' in e && typeof (e as { status: unknown }).status === 'number') {
    return (e as { status: number }).status;
  }
  return undefined;
}

/** 解析 ApiError.body 里的 { error } 字段；失败回退到 Error.message 或 String(e)。 */
export function readApiErrorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'body' in e && typeof (e as { body: unknown }).body === 'string') {
    try {
      const parsed = JSON.parse((e as { body: string }).body);
      if (parsed && typeof parsed.error === 'string') return parsed.error;
    } catch { /* ignore */ }
  }
  if (e instanceof Error) return e.message;
  return String(e);
}
