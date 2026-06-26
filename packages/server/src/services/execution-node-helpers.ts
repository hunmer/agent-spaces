// Workflow 节点数据变换纯函数 —— 从 execution-manager.ts 提取。
// 这些函数不访问 ExecutionManager 实例状态，仅依赖入参与模块级工具，
// 提取后行为与原 private 方法完全一致（含 mutate session.context.__env__ 的变量节点）。

import type {
  WorkflowNode,
  WorkflowEdge,
  OutputField,
  ConditionItem,
  ConditionGroup,
  ExecutionLogEntry,
} from '@agent-spaces/shared';
import { isRuntimeWorkflowEdge } from '@agent-spaces/shared';
import type { ExecutionSession, LoopIterations } from './execution-types.js';
import { getNestedValue, setNestedValue, deleteNestedValue } from './execution-value-access.js';

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function coerceFieldValue(field: OutputField): unknown {
  const value = field.value;
  switch (field.type) {
    case 'number': {
      if (value === '' || value === null || value === undefined) return value ?? '';
      if (typeof value === 'number') return value;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : value;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === '1') return true;
      if (value === 'false' || value === '0') return false;
      return value;
    }
    case 'number[]': {
      if (!Array.isArray(value)) return value ?? [];
      return value.map(item => {
        const parsed = Number(item);
        return Number.isFinite(parsed) ? parsed : item;
      });
    }
    default:
      return value ?? '';
  }
}

// ---- 节点结果归一化 / 客户端插件识别 ----

export function isClientPluginNode(node: WorkflowNode): boolean {
  const pluginType = node.data?.pluginType;
  return (pluginType === 'client' || pluginType === 'both') && typeof node.data?.pluginId === 'string';
}

export function getClientPluginId(node: WorkflowNode): string | null {
  const pluginId = node.data?.pluginId;
  return typeof pluginId === 'string' && pluginId ? pluginId : null;
}

export function normalizeNodeResult(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return { result };
  const record = result as Record<string, unknown>;
  if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
    return { ...(record.data as Record<string, unknown>), ...record };
  }
  return record;
}

// ---- 字符串 / 数组 / JSON / 模板 ----

export function executePluckArrayKey(resolvedData: Record<string, any>): Record<string, unknown[]> {
  const array = Array.isArray(resolvedData.array) ? resolvedData.array : [];
  const key = String(resolvedData.key || '').trim();
  if (!key) return { result: [] };

  return {
    result: array.map((item) => (
      item && typeof item === 'object' && key in item ? item[key] : undefined
    )),
  };
}

export function executeFlattenArray(resolvedData: Record<string, any>): Record<string, unknown[]> {
  const array = Array.isArray(resolvedData.array) ? resolvedData.array : [];
  const key = String(resolvedData.key || '').trim();
  const result: unknown[] = [];

  for (const item of array) {
    const value = key && item && typeof item === 'object' && key in item
      ? item[key]
      : item;

    if (Array.isArray(value)) {
      result.push(...value);
    } else if (value !== undefined) {
      result.push(value);
    }
  }

  return { result };
}

export function executeMergeArrays(resolvedData: Record<string, any>): Record<string, unknown[]> {
  const arrays = Array.isArray(resolvedData.arrays) ? resolvedData.arrays : [];
  const result: unknown[] = [];

  for (const item of arrays) {
    const value = item && typeof item === 'object' && 'array' in item ? item.array : item;
    if (Array.isArray(value)) {
      result.push(...value);
    }
  }

  if (!resolvedData.dedupe) return { result };

  const seen = new Set<string>();
  return {
    result: result.filter((item) => {
      const key = getStableDedupeKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
}

function getStableDedupeKey(value: unknown): string {
  if (value === null) return 'null';
  const type = typeof value;
  if (type !== 'object') return `${type}:${String(value)}`;
  return `${type}:${JSON.stringify(sortObjectKeys(value))}`;
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortObjectKeys((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
}

export function executeParseJson(resolvedData: Record<string, any>): Record<string, unknown> {
  const text = String(resolvedData.text ?? '').trim();
  if (!text) return { result: {} };
  try {
    const parsed = JSON.parse(text);
    return { result: parsed && typeof parsed === 'object' ? parsed : { value: parsed } };
  } catch {
    return { result: {} };
  }
}

/**
 * 字符串拼接节点：用 {{expression}} 占位符引用输入字段的值进行插值。
 * 表达式以输入字段为上下文执行，例如 {{users[0]}}、{{today.hour}}。
 */
export function executeStringConcat(resolvedData: Record<string, any>): Record<string, string> {
  const template = typeof resolvedData.template === 'string' ? resolvedData.template : '';
  const context = buildOutputObject(resolvedData.inputFields) ?? {};
  return { result: interpolateTemplate(template, context) };
}

/**
 * 字符串分割节点：将 source 字符串按分隔符切成数组。
 * 源字符串来自 source 属性（支持变量），分隔符来自 text 属性（默认 |）。
 */
export function executeStringSplit(resolvedData: Record<string, any>): Record<string, string[]> {
  const source = typeof resolvedData.source === 'string' ? resolvedData.source : '';
  const delimiter = typeof resolvedData.text === 'string' && resolvedData.text !== ''
    ? resolvedData.text
    : '|';
  if (source === '') return { result: [] };
  return { result: source.split(delimiter) };
}

export function interpolateTemplate(template: string, context: Record<string, any>): string {
  if (!template) return '';
  const keys = Object.keys(context);
  return template.replace(/\{\{([\s\S]*?)\}\}/g, (match, expr: string) => {
    const trimmed = expr.trim();
    if (!trimmed) return '';
    try {
      const fn = new Function(...keys, `"use strict"; return (${trimmed});`);
      const value = fn(...keys.map(k => context[k]));
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    } catch {
      return match;
    }
  });
}

export function executeArrayTextReplace(resolvedData: Record<string, any>): Record<string, string[]> {
  const array = Array.isArray(resolvedData.array) ? resolvedData.array : [];
  const findText = String(resolvedData.findText ?? '');
  const replaceText = String(resolvedData.replaceText ?? '');
  const replaceMode = resolvedData.replaceMode === 'regex' ? 'regex' : 'literal';
  const rawReplaceCount = Number(resolvedData.replaceCount);
  const replaceCount = Number.isFinite(rawReplaceCount) && rawReplaceCount > 0
    ? Math.floor(rawReplaceCount)
    : 0;

  if (!findText) return { result: array.map((item) => String(item ?? '')) };

  return {
    result: array.map((item) => replaceTextWithLimit(
      String(item ?? ''),
      findText,
      replaceText,
      replaceCount,
      replaceMode,
    )),
  };
}

export function replaceTextWithLimit(
  value: string,
  findText: string,
  replaceText: string,
  replaceCount: number,
  replaceMode: 'literal' | 'regex',
): string {
  let count = 0;
  if (replaceMode === 'regex') {
    const pattern = new RegExp(findText, 'g');
    return value.replace(pattern, (match) => {
      if (replaceCount > 0 && count >= replaceCount) return match;
      count += 1;
      return replaceText;
    });
  }

  return value.replaceAll(findText, (match) => {
    if (replaceCount > 0 && count >= replaceCount) return match;
    count += 1;
    return replaceText;
  });
}

// ---- 条件与聚合 ----

export function evaluateCondition(
  variable: any,
  value: any,
  operator: string,
  compareMode: 'value' | 'length' = 'value',
): boolean {
  const actualValue = compareMode === 'length'
    ? (Array.isArray(variable) ? variable.length : 0)
    : variable;

  switch (operator) {
    case 'equals': return actualValue == value;
    case 'not_equals': return actualValue != value;
    case 'greater_than': return Number(actualValue) > Number(value);
    case 'less_than': return Number(actualValue) < Number(value);
    case 'greater_than_or_equal': return Number(actualValue) >= Number(value);
    case 'less_than_or_equal': return Number(actualValue) <= Number(value);
    case 'contains': return String(actualValue).includes(String(value));
    case 'not_contains': return !String(actualValue).includes(String(value));
    case 'starts_with': return String(actualValue).startsWith(String(value));
    case 'ends_with': return String(actualValue).endsWith(String(value));
    case 'is_empty': return actualValue === '' || actualValue === null || actualValue === undefined;
    case 'is_not_empty': return actualValue !== '' && actualValue !== null && actualValue !== undefined;
    case 'is_true': return actualValue === true || actualValue === 'true' || actualValue === 1;
    case 'is_false': return actualValue === false || actualValue === 'false' || actualValue === 0;
    default: return false;
  }
}

function normalizeConditionGroups(conditions: unknown): ConditionGroup[] {
  const conditionItems = Array.isArray(conditions) ? conditions : [];

  return conditionItems.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];

    const maybeGroup = item as Partial<ConditionGroup> & { field?: unknown };
    if (Array.isArray(maybeGroup.conditions)) {
      return [{
        id: typeof maybeGroup.id === 'string' ? maybeGroup.id : `group_${index}`,
        joiner: maybeGroup.joiner === 'or' ? 'or' : 'and',
        conditions: maybeGroup.conditions.filter((condition: unknown): condition is ConditionItem =>
          !!condition && typeof condition === 'object'
        ),
      }];
    }

    return [{
      id: typeof maybeGroup.id === 'string' ? maybeGroup.id : `group_${index}`,
      joiner: 'and',
      conditions: [maybeGroup as ConditionItem],
    }];
  });
}

export function executeSwitch(conditions: unknown): any {
  const conditionGroups = normalizeConditionGroups(conditions);

  for (let i = 0; i < conditionGroups.length; i++) {
    const group = conditionGroups[i];
    if (!Array.isArray(group.conditions) || group.conditions.length === 0) continue;
    const joiner = group.joiner === 'or' ? 'or' : 'and';

    const results = group.conditions.map((cond: ConditionItem) => {
      if (!cond || typeof cond !== 'object') return false;
      const item = cond as Partial<ConditionItem> & { field?: unknown };
      const variable = item.variable ?? item.field ?? '';
      const value = item.value ?? '';
      const operator = typeof item.operator === 'string' ? item.operator : 'equals';
      const compareMode = item.compareMode === 'length' ? 'length' : 'value';
      return evaluateCondition(variable, value, operator, compareMode);
    });
    const matched = joiner === 'or' ? results.some(Boolean) : results.every(Boolean);

    if (matched) {
      return { __branch__: `case-${i}`, matchedIndex: i };
    }
  }
  return { __branch__: 'default', matchedIndex: -1 };
}

export function executeVariableAggregate(groups: any[]): Record<string, any> {
  if (!Array.isArray(groups)) return {};
  return groups.reduce<Record<string, any>>((result, group) => {
    const key = typeof group?.key === 'string' ? group.key.trim() : '';
    if (!key) return result;
    const variables = Array.isArray(group.variables) ? group.variables : [];
    result[key] = findFirstNonEmpty(variables);
    return result;
  }, {});
}

export function findFirstNonEmpty(variables: any[]): any {
  for (const v of variables) {
    const value = v?.value;
    if (value !== null && value !== undefined && value !== '' &&
        !(Array.isArray(value) && value.length === 0) &&
        !(typeof value === 'object' && Object.keys(value).length === 0)) return value;
  }
  return '';
}

// ---- 变量节点（mutate session.context.__env__）----

export function executeSetVariable(
  session: ExecutionSession,
  variables: any[],
  appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
): Record<string, any> {
  if (!session.context.__env__ || typeof session.context.__env__ !== 'object') session.context.__env__ = {};
  const items = Array.isArray(variables) ? variables : [];
  let count = 0;
  for (const item of items) {
    const key = typeof item?.key === 'string' ? item.key.trim() : '';
    if (!key) continue;
    setNestedValue(session.context.__env__, key, item.value);
    count++;
  }
  appendLog('info', `Set ${count} workflow variable(s)`);
  return { env: clone(session.context.__env__) };
}

export function executeGetVariable(session: ExecutionSession, resolvedData: Record<string, any>): Record<string, any> {
  const key = typeof resolvedData.key === 'string' ? resolvedData.key.trim() : '';
  if (!key) throw new Error('get_variable node missing key');
  const value = getNestedValue(session.context.__env__ ?? {}, key);
  return {
    value: value === undefined ? resolvedData.defaultValue ?? '' : value,
    exists: value !== undefined,
  };
}

export function executeDeleteVariable(
  session: ExecutionSession,
  resolvedData: Record<string, any>,
  appendLog: (level: ExecutionLogEntry['level'], message: string) => void,
): Record<string, any> {
  const key = typeof resolvedData.key === 'string' ? resolvedData.key.trim() : '';
  if (!key) throw new Error('delete_variable node missing key');
  const deleted = deleteNestedValue(session.context.__env__ ?? {}, key);
  appendLog(deleted ? 'info' : 'warning', deleted ? `Deleted workflow variable: ${key}` : `Workflow variable not found: ${key}`);
  return { deleted, env: clone(session.context.__env__ ?? {}) };
}

// ---- SQLite 辅助 ----

export function getInputFieldValues(resolvedData: Record<string, any>): unknown[] {
  const fields = Array.isArray(resolvedData?.inputFields) ? resolvedData.inputFields : [];
  return fields.map((f: any) => f?.value ?? f?.defaultValue ?? null);
}

export function resolveWhereParams(where: string): { clause: string | null; paramCount: number } {
  if (!where || !where.trim()) return { clause: null, paramCount: 0 };
  const paramCount = (where.match(/\?/g) || []).length;
  return { clause: where, paramCount };
}

// ---- 循环辅助 ----

export function resolveLoopIterations(loopType: string, data: Record<string, any>): LoopIterations {
  if (loopType === 'array') {
    const items = Array.isArray(data.arrayPath) ? data.arrayPath : [];
    return { count: items.length, items, infinite: false };
  }
  if (loopType === 'infinite') return { count: null, items: [], infinite: true };
  const count = Math.max(0, Math.floor(Number(data.count) || 0));
  return { count, items: Array.from({ length: count }, () => undefined), infinite: false };
}

export function initLoopSharedVars(vars: unknown): Record<string, unknown> {
  if (!Array.isArray(vars)) return {};
  const build = (fields: Array<Record<string, any>>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const field of fields) {
      if (!field?.key) continue;
      if (field.type === 'object') {
        result[field.key] = build(Array.isArray(field.children) ? field.children : []);
        continue;
      }
      if (field.type === 'array') {
        result[field.key] = [];
        continue;
      }
      result[field.key] = field.value ?? '';
    }
    return result;
  };
  return build(vars as Array<Record<string, any>>);
}

// ---- 执行图拓扑排序 ----

export function buildExecutionOrder(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const runtimeEdges = edges.filter(isRuntimeWorkflowEdge);
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const inDegree = new Map(nodes.map(n => [n.id, 0]));
  for (const edge of runtimeEdges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  const order: WorkflowNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (node) order.push(node);
    for (const edge of runtimeEdges) {
      if (edge.source !== id) continue;
      const deg = (inDegree.get(edge.target) ?? 1) - 1;
      inDegree.set(edge.target, deg);
      if (deg === 0) queue.push(edge.target);
    }
  }
  return order;
}

// ---- 输出构建 ----

export function getStepInput(node: WorkflowNode, data: Record<string, any>): Record<string, any> | undefined {
  if (node.type === 'start' || node.type === 'end') return undefined;
  return data;
}

export function applyNodeOutputMiddleware(output: any, data: Record<string, any>): any {
  const middleware = data.outputMiddleware;
  if (!middleware || typeof middleware !== 'object') return output;

  if ((middleware as { type?: unknown }).type === 'arrayItemField') {
    const { sourceKey, itemKey, targetKey } = middleware as {
      sourceKey?: unknown;
      itemKey?: unknown;
      targetKey?: unknown;
    };
    if (typeof sourceKey !== 'string' || typeof itemKey !== 'string' || typeof targetKey !== 'string') {
      return output;
    }
    const source = data[sourceKey];
    return {
      [targetKey]: Array.isArray(source)
        ? source
          .map((item: unknown) => item && typeof item === 'object' ? (item as Record<string, unknown>)[itemKey] : undefined)
          .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
        : [],
    };
  }

  return output;
}

export function buildOutputObject(outputs: OutputField[] | undefined): Record<string, any> | null {
  if (!Array.isArray(outputs) || outputs.length === 0) return null;
  const result: Record<string, any> = {};
  for (const field of outputs) {
    if (!field.key) continue;
    if (field.type === 'object') {
      result[field.key] = Array.isArray(field.children) && field.children.length > 0
        ? buildOutputObject(field.children) ?? {}
        : field.value ?? {};
      continue;
    }
    if (field.type === 'array') {
      result[field.key] = Array.isArray(field.value) ? field.value : [];
      continue;
    }
    result[field.key] = coerceFieldValue(field);
  }
  return result;
}

export function getFirstObjectOutputKey(outputs: OutputField[] | undefined): string | null {
  if (!Array.isArray(outputs)) return null;
  const field = outputs.find(item => (item?.type === 'object' || item?.type === 'array') && typeof item.key === 'string' && item.key.trim());
  return field?.key.trim() || null;
}
