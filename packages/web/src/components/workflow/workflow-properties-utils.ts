import type { ExecutionLogEntry, OutputField, NodeProperty, DataType } from '@agent-spaces/shared';

export type DebugResult = {
  status?: 'completed' | 'error';
  output?: unknown;
  error?: string;
  duration?: number;
  logs?: ExecutionLogEntry[];
};

export type JsonPreset = {
  id: string;
  name: string;
  data: Record<string, unknown>;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
};

export const JSON_PRESETS_KEY = '__jsonPresets';
export const SELECTED_JSON_PRESET_KEY = '__selectedJsonPresetId';

export const FIELD_TYPES: OutputField['type'][] = [
  'string',
  'number',
  'boolean',
  'object',
  'array',
  'file',
  'image',
  'audio',
  'video',
  'select',
  'any',
  'string[]',
  'number[]',
  'file[]',
  'image[]',
  'audio[]',
  'video[]',
  'any[]',
];

export function inferDataType(type: string): DataType {
  switch (type) {
    case 'number': return 'number';
    case 'checkbox': return 'boolean';
    case 'array':
    case 'conditions':
    case 'output_fields': return 'any';
    case 'agent': return 'object';
    default: return 'string';
  }
}

export function getEffectiveDataType(prop: { type: string; dataType?: DataType }): DataType {
  return prop.dataType ?? inferDataType(prop.type);
}

export function isArrayOutputFieldType(type: OutputField['type'] | undefined) {
  return type === 'array' || type === 'string[]' || type === 'number[]' || type === 'file[]' || type === 'image[]' || type === 'any[]';
}

export function isStructuredOutputFieldType(type: OutputField['type'] | undefined) {
  return type === 'object' || type === 'array';
}

export function isFileOutputFieldType(type: OutputField['type'] | undefined) {
  return type === 'file' || type === 'file[]';
}

export function isMediaOutputFieldType(type: OutputField['type'] | undefined) {
  return type === 'image' || type === 'audio' || type === 'video' || type === 'image[]';
}

export function stringifyOutputFieldValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value);
  return typeof value === 'string' ? value : '';
}

export function parseArrayOutputFieldValue(type: OutputField['type'] | undefined, raw: string): unknown {
  if (!isArrayOutputFieldType(type)) return raw;
  const value = raw.trim();
  if (!value) return [];
  if (!value.startsWith('[') || !value.endsWith(']')) return raw;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : raw;
  } catch {
    return raw;
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function inferType(value: unknown): OutputField['type'] {
  if (value === null || value === undefined) return 'any';
  if (Array.isArray(value)) {
    if (value.some(item => item && typeof item === 'object')) return 'array';
    if (value.every(item => typeof item === 'string')) return 'string[]';
    if (value.every(item => typeof item === 'number')) return 'number[]';
    return 'any[]';
  }
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object') return 'object';
  return 'any';
}

export function toOutputFields(value: unknown): OutputField[] {
  if (!isPlainObject(value)) return [];
  return Object.entries(value).map(([key, fieldValue]) => {
    const type = inferType(fieldValue);
    return {
      key,
      type,
      ...(isStructuredOutputFieldType(type) ? { children: toOutputFields(Array.isArray(fieldValue) ? fieldValue[0] : fieldValue) } : {}),
    };
  });
}

export function getOutputFields(value: unknown): OutputField[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isPlainObject).map(item => ({
    key: typeof item.key === 'string' ? item.key : '',
    type: FIELD_TYPES.includes(item.type as OutputField['type']) ? item.type as OutputField['type'] : 'any',
    value: item.value,
    fileNameFilter: typeof item.fileNameFilter === 'string' ? item.fileNameFilter : undefined,
    description: typeof item.description === 'string' ? item.description : undefined,
    required: typeof item.required === 'boolean' ? item.required : undefined,
    inputMode: item.inputMode === 'native' ? 'native' : item.inputMode === 'variable' ? 'variable' : undefined,
    options: Array.isArray(item.options) ? item.options.filter(option => typeof option === 'string') : undefined,
    children: getOutputFields(item.children),
  }));
}

export function getJsonPresets(value: unknown): JsonPreset[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isPlainObject).map(item => ({
    id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
    name: typeof item.name === 'string' ? item.name : '未命名预设',
    data: isPlainObject(item.data) ? item.data : {},
    inputs: isPlainObject(item.inputs) ? item.inputs : {},
    outputs: isPlainObject(item.outputs) ? item.outputs : {},
  }));
}

export function getPropertyValue(prop: NodeProperty, data: Record<string, unknown>) {
  return data[prop.key] ?? prop.default;
}

export function isVisible(prop: NodeProperty, data: Record<string, unknown>) {
  if (!prop.visibleWhen) return true;
  const actual = data[prop.visibleWhen.key];
  if ('equals' in prop.visibleWhen) return actual === prop.visibleWhen.equals;
  if (prop.visibleWhen.in) return prop.visibleWhen.in.includes(actual);
  return true;
}
