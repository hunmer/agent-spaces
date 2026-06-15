// 嵌套值访问基础设施 —— 从 execution-manager.ts 提取的纯函数簇。
// 负责 workflow 变量路径（"a.b[0].c" 风格）的解析、读取、写入、删除。
// 零外部依赖，零副作用（set/delete 直接 mutate 传入对象，与原行为一致）。

export function getNestedValue(obj: any, path: string): any {
  const parts = normalizeVariablePath(path).split('.').filter(Boolean);
  return getNestedPathValue(obj, parts);
}

function getNestedPathValue(current: any, parts: string[]): any {
  if (parts.length === 0) return current;
  if (current == null) return undefined;

  const [part, ...rest] = parts;
  if (Array.isArray(current) && !isArrayIndex(part) && part !== 'length') {
    const values = current
      .map(item => getNestedPathValue(item, parts))
      .filter(value => value !== undefined);
    if (values.length === 0) return undefined;
    return values.flatMap(value => Array.isArray(value) ? value : [value]);
  }

  return getNestedPathValue(current[part], rest);
}

function isArrayIndex(part: string): boolean {
  return /^(0|[1-9]\d*)$/.test(part);
}

export function setNestedValue(obj: Record<string, any>, path: string, value: unknown): void {
  const parts = normalizeVariablePath(path).split('.').filter(Boolean);
  if (parts.length === 0) return;
  let current: Record<string, any> = obj;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!next || typeof next !== 'object' || Array.isArray(next)) current[part] = {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

export function deleteNestedValue(obj: Record<string, any>, path: string): boolean {
  const parts = normalizeVariablePath(path).split('.').filter(Boolean);
  if (parts.length === 0) return false;
  let current: Record<string, any> = obj;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!next || typeof next !== 'object') return false;
    current = next;
  }
  const last = parts[parts.length - 1];
  if (!Object.prototype.hasOwnProperty.call(current, last)) return false;
  delete current[last];
  return true;
}

export function normalizeVariablePath(path: string): string {
  return path
    .trim()
    .replace(/\]\s*\[\s*/g, '.')
    .replace(/\[\s*(["'])([^"']+)\1\s*\]/g, '.$2')
    .replace(/\[\s*([^\]"'\s]+)\s*\]/g, '.$1')
    .replace(/^\[\s*/, '')
    .replace(/\s*\]$/, '')
    .replace(/^(["'])([^"']+)\1$/, '$2')
    .replace(/(["'])\s*\.\s*(["'])/g, '.')
    .replace(/["']/g, '')
    .replace(/^\./, '');
}
