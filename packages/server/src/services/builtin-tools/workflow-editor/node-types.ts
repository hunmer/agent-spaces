import type { NodeTypeDefinition } from '@agent-spaces/shared';
import { clone } from './helpers.js';
import type { JsonRecord } from './types.js';

export const COMMON_NODE_PROPERTY_TYPES = new Set([
  'text',
  'textarea',
  'number',
  'select',
  'checkbox',
  'code',
  'conditions',
  'array',
  'output_fields',
  'sqlite',
]);

export const NODE_PROPERTY_TYPE_DEFINITIONS = new Map<string, JsonRecord>([
  ['conditions', {
    valueType: 'array',
    description: 'switch 节点的条件分支列表。data.conditions 必须是数组；工具会兼容常见误传的 { item: [...] } 或 { items: { item: [...] } } 并自动展开。每个数组项对应一个 case 分支，推荐结构为 { id, conditions: ConditionItem[] }，组内 conditions 按 && 关系同时成立才命中该分支；未命中时走 default 分支。',
    item: {
      id: 'string',
      joiner: 'and | or ?',
      conditions: [{
        id: 'string',
        variable: 'string',
        field: 'string?',
        compareMode: 'value | length ?',
        operator: 'equals | not_equals | greater_than | less_than | greater_than_or_equal | less_than_or_equal | contains | not_contains | starts_with | ends_with | is_empty | is_not_empty | is_true | is_false',
        value: 'string?',
      }],
    },
    requiredItemFields: ['id', 'conditions'],
    noValueOperators: ['is_empty', 'is_not_empty', 'is_true', 'is_false'],
    handles: {
      caseHandlePattern: 'case-{index}',
      defaultHandle: 'default',
    },
    example: [
      {
        id: 'group_1',
        conditions: [
          {
            id: 'cond_1',
            variable: '{{ __data__["start_node_id"].fileType }}',
            field: '{{ __data__["start_node_id"].fileType }}',
            operator: 'equals',
            value: 'video',
          },
          {
            id: 'cond_2',
            variable: '{{ __data__["start_node_id"].duration }}',
            field: '{{ __data__["start_node_id"].duration }}',
            operator: 'greater_than',
            value: '30',
          },
        ],
        joiner: 'and',
      },
    ],
  }],
  ['output_fields', {
    valueType: 'array',
    description: '节点 inputFields/outputs 字段数组。优先使用 set_node_io_fields 设置；直接写 data 时必须传数组，禁止包成 { item: [...] }。',
    item: {
      key: 'string',
      type: 'string',
      value: 'any?',
      description: 'string?',
      required: 'boolean?',
      children: 'OutputField[]?',
    },
    requiredItemFields: ['key', 'type'],
    example: [
      { key: 'result', type: 'string', value: '{{ __data__["node_id"].result }}' },
    ],
  }],
  ['agent', {
    valueType: 'object',
    description: '工作流节点内联保存的 Agent 配置对象。不能只传 agent id 字符串；需要传对象。',
    required: ['id', 'name', 'role', 'enabled'],
    fields: {
      id: 'string',
      name: 'string',
      role: 'string',
      enabled: 'boolean',
      description: 'string?',
      runtimeKind: 'string?',
      modelProvider: 'string?',
      providerId: 'string?',
      modelId: 'string?',
      apiBase: 'string?',
      apiKey: 'string?',
      workingDir: 'string?',
      mcps: 'object?',
      skills: 'string[]?',
      tools: 'string[]?',
      systemPrompt: 'string?',
      outputStyle: 'string?',
      temperature: 'number?',
      maxTokens: 'number?',
      sandboxDirs: 'string[]?',
      avatarUrl: 'string?',
      icon: 'string?',
    },
    example: {
      id: 'agent-id',
      name: 'Agent 名称',
      role: 'agent',
      enabled: true,
      systemPrompt: '你是...',
    },
  }],
]);

const BUILTIN_NODE_SEARCH_ALIASES = new Map<string, string[]>([
  ['start', ['开始', '入口', '工作流入口']],
  ['end', ['结束', '出口', '返回结果', '工作流出口']],
  ['run_code', ['运行 JS 代码', '运行 JavaScript 代码', '代码', '数据整形', '字段映射', '结构转换']],
  ['run_python', ['运行 Python 代码', 'Python 代码', '代码', '数据整形', '字段映射', '结构转换']],
  ['toast', ['Toast 消息', '通知', '提示消息']],
  ['switch', ['选择器', '选择', '条件', '条件判断', '条件分支', '分支', '路由']],
  ['loop', ['循环', '遍历', '重复执行']],
  ['loop_body', ['循环体']],
  ['loop_break', ['跳出循环', '终止循环']],
  ['variable_aggregate', ['变量聚合', '合并变量', '聚合']],
]);

export function getNodeSearchAliases(type: string): string[] {
  return BUILTIN_NODE_SEARCH_ALIASES.get(type) ?? [];
}

export function getPropertyTypeDefinition(type: string): JsonRecord | undefined {
  return NODE_PROPERTY_TYPE_DEFINITIONS.get(type);
}

export function validateNodeDataPatch(
  definition: NodeTypeDefinition,
  data: JsonRecord,
): { success: true } | { success: false; message: string; property?: string; expected_type?: string; received_type?: string; type_definition?: JsonRecord } {
  const properties = new Map((definition.properties ?? []).map((property) => [property.key, property]));
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('$') || key.includes('invoke name=')) {
      return {
        success: false,
        message: `Invalid node data key: ${key}. Tool-call markup must not be placed inside node data.`,
        property: key,
      };
    }
    if (key === 'inputs') {
      return {
        success: false,
        message: 'Invalid node data key: inputs. Use data.inputFields array for node inputs, or call set_node_io_fields with field_kind=inputFields.',
        property: key,
      };
    }
    if ((key === 'inputFields' || key === 'outputs') && !Array.isArray(value)) {
      return {
        success: false,
        message: `Invalid value for ${key}: expected array, received ${describeValueType(value)}. Do not wrap fields as { "item": [...] }; pass the array directly or use set_node_io_fields.`,
        property: key,
        expected_type: 'array',
        received_type: describeValueType(value),
      };
    }
    const property = properties.get(key);
    if (!property) continue;
    if (property.type === 'conditions') {
      const normalized = normalizeConditionsValue(value);
      if (normalized !== value) data[key] = normalized;
    }
    if (property.type === 'agent') {
      const normalized = normalizeAgentValue(value);
      if (normalized !== value) data[key] = normalized;
    }
    const result = validateNodePropertyValue(property.type, data[key]);
    if (!result.success) {
      return {
        success: false,
        message: `Invalid value for ${key}: expected ${property.type}, received ${describeValueType(value)}`,
        property: key,
        expected_type: property.type,
        received_type: describeValueType(value),
        type_definition: result.typeDefinition,
      };
    }
  }
  return { success: true };
}

function normalizeAgentValue(value: unknown): unknown {
  if (isPlainRecord(value)) return normalizeAgentRecord(value);
  if (typeof value !== 'string' || !value.trim()) return value;
  try {
    const parsed = JSON.parse(value);
    return isPlainRecord(parsed) ? normalizeAgentRecord(parsed) : value;
  } catch {
    return value;
  }
}

function normalizeAgentRecord(value: JsonRecord): JsonRecord {
  const record: JsonRecord = { ...value };
  if (typeof record.enabled === 'string') {
    const normalized = record.enabled.trim().toLowerCase();
    if (normalized === 'true') record.enabled = true;
    if (normalized === 'false') record.enabled = false;
  }

  for (const key of ['temperature', 'maxTokens']) {
    const current = record[key];
    if (typeof current === 'string' && current.trim()) {
      const parsed = Number(current);
      if (Number.isFinite(parsed)) record[key] = parsed;
    }
  }

  for (const key of ['skills', 'tools', 'sandboxDirs']) {
    record[key] = normalizeStringArrayLike(record[key]);
  }

  if (isPlainRecord(record.mcps)) {
    const mcps = { ...(record.mcps as JsonRecord) };
    const servers = mcps.mcpServers;
    if (isPlainRecord(servers)) {
      mcps.mcpServers = Object.fromEntries(
        Object.entries(servers).map(([name, config]) => [name, isPlainRecord(config) ? config : {}]),
      );
    }
    record.mcps = mcps;
  }

  return record;
}

function normalizeStringArrayLike(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (!isPlainRecord(value)) return value;
  if (Array.isArray(value.item)) return normalizeStringArrayLike(value.item);
  if (isPlainRecord(value.items) && Array.isArray(value.items.item)) return normalizeStringArrayLike(value.items.item);
  return value;
}

export function validateNodePropertyValue(
  propertyType: string,
  value: unknown,
): { success: true } | { success: false; typeDefinition?: JsonRecord } {
  if (propertyType === 'number') return typeof value === 'number' && Number.isFinite(value) ? { success: true } : { success: false };
  if (propertyType === 'checkbox') return typeof value === 'boolean' ? { success: true } : { success: false };
  if (propertyType === 'array' || propertyType === 'output_fields' || propertyType === 'conditions') return Array.isArray(value) ? { success: true } : { success: false };
  if (propertyType === 'text' || propertyType === 'textarea' || propertyType === 'select' || propertyType === 'code' || propertyType === 'sqlite') {
    return typeof value === 'string' ? { success: true } : { success: false };
  }

  const typeDefinition = getPropertyTypeDefinition(propertyType);
  if (!typeDefinition) return COMMON_NODE_PROPERTY_TYPES.has(propertyType) ? { success: true } : { success: true };
  if (typeDefinition.valueType === 'object' && !isPlainRecord(value)) return { success: false, typeDefinition };

  if (propertyType === 'agent') {
    const record = value as JsonRecord;
    const valid = typeof record.id === 'string'
      && typeof record.name === 'string'
      && typeof record.role === 'string'
      && typeof record.enabled === 'boolean';
    return valid ? { success: true } : { success: false, typeDefinition };
  }

  return { success: true };
}

function normalizeConditionsValue(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (!isPlainRecord(value)) return value;
  if (Array.isArray(value.item)) return value.item;
  if (isPlainRecord(value.items) && Array.isArray(value.items.item)) return value.items.item;
  return value;
}

export function isPlainRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function describeValueType(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

export function defaultData(definition: NodeTypeDefinition): JsonRecord {
  const data: JsonRecord = {};
  for (const property of definition.properties ?? []) {
    if (property.default !== undefined) data[property.key] = clone(property.default);
  }
  return data;
}

export function searchableDefinitionText(definition: NodeTypeDefinition): string {
  return [
    definition.type,
    definition.label,
    definition.category,
    definition.description,
    ...getNodeSearchAliases(definition.type),
    ...definition.properties.map((property) => `${property.key} ${property.label} ${property.tooltip ?? ''}`),
    ...(definition.outputs ?? []).map((output) => `${output.key} ${output.type} ${output.description ?? ''}`),
  ].join(' ').toLowerCase();
}
