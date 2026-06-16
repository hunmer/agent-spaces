import type { Workflow } from '@agent-spaces/shared';
import type { JsonRecord } from './types.js';

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneWorkflow(workflow: Workflow): Workflow {
  return clone(workflow);
}

export function createWorkflowNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function schema(properties: Record<string, unknown>, required?: string[]): Record<string, unknown> {
  return { type: 'object', properties, ...(required?.length ? { required } : {}) };
}

export function workflowSearchSchema(): Record<string, unknown> {
  return schema({
    keyword: { type: 'string', description: '模糊搜索关键词。' },
    name: { type: 'string', description: '兼容参数，按节点 type 或 label 搜索。' },
    nodeType: { type: 'string', description: '兼容参数，按节点 type 搜索。' },
    node_type: { type: 'string', description: '兼容参数，按节点 type 搜索。' },
    pluginId: { type: 'string', description: '按插件 ID 精确筛选节点类型。' },
    plugin_id: { type: 'string', description: '按插件 ID 精确筛选节点类型，兼容蛇形命名。' },
    plugin: { type: 'string', description: '按插件 ID 精确筛选节点类型。' },
    type: { type: 'string', description: '按节点类型筛选。' },
    label: { type: 'string', description: '按节点标签筛选。' },
    category: { type: 'string', description: '按分类筛选。' },
    description: { type: 'string', description: '按描述筛选。' },
  });
}

export function asRecord(input: unknown): JsonRecord {
  return input && typeof input === 'object' && !Array.isArray(input) ? input as JsonRecord : {};
}

export function stringInput(input: JsonRecord, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function stringInputAny(input: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = stringInput(input, key);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function numberInput(input: JsonRecord, key: string, fallback: number): number {
  const value = input[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function booleanInput(input: JsonRecord, key: string, fallback: boolean): boolean {
  const value = input[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

export function booleanInputAny(input: JsonRecord, keys: string[], fallback: boolean): boolean {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'boolean') return value;
  }
  return fallback;
}

export function objectInput(input: JsonRecord, key: string): JsonRecord {
  const result = objectInputResult(input, key);
  return result.success ? result.value : {};
}

export function objectInputResult(input: JsonRecord, key: string): { success: true; value: JsonRecord } | { success: false; message: string } {
  const value = input[key];
  if (value === undefined) return { success: true, value: {} };
  if (value && typeof value === 'object' && !Array.isArray(value)) return { success: true, value: value as JsonRecord };
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { success: true, value: parsed as JsonRecord };
      return { success: false, message: `${key} JSON must be an object` };
    } catch {
      return { success: false, message: `${key} must be an object or JSON object string` };
    }
  }
  return { success: false, message: `${key} must be an object` };
}

export function arrayInput(value: unknown, key: string): { success: true; value: unknown[] } | { success: false; message: string } {
  if (Array.isArray(value)) return { success: true, value };
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return { success: true, value: parsed };
      return { success: false, message: `${key} JSON must be an array` };
    } catch {
      return { success: false, message: `${key} must be an array or JSON array string` };
    }
  }
  return { success: false, message: `${key} must be an array` };
}
