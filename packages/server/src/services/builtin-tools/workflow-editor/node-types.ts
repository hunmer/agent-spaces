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
    description: 'switch 节点的条件分支列表。每个数组项对应一个 case 分支，出边 sourceHandle 使用 case-0、case-1 等；未命中时走 default 分支。',
    item: {
      id: 'string',
      variable: 'string',
      field: 'string?',
      operator: 'equals | not_equals | greater_than | less_than | greater_than_or_equal | less_than_or_equal | contains | not_contains | starts_with | ends_with | is_empty | is_not_empty | is_true | is_false',
      value: 'string?',
    },
    requiredItemFields: ['id', 'variable', 'operator'],
    noValueOperators: ['is_empty', 'is_not_empty', 'is_true', 'is_false'],
    handles: {
      caseHandlePattern: 'case-{index}',
      defaultHandle: 'default',
    },
    example: [
      {
        id: 'cond_1',
        variable: '{{ __data__["start_node_id"].fileType }}',
        field: '{{ __data__["start_node_id"].fileType }}',
        operator: 'equals',
        value: 'video',
      },
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
    const result = validateNodePropertyValue(property.type, value);
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
    ...definition.properties.map((property) => `${property.key} ${property.label} ${property.tooltip ?? ''}`),
    ...(definition.outputs ?? []).map((output) => `${output.key} ${output.type} ${output.description ?? ''}`),
  ].join(' ').toLowerCase();
}
