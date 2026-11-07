import type { OutputField } from '@agent-spaces/shared';
import { arrayInput, clone } from './helpers.js';
import type { JsonRecord } from './types.js';

export function summarizeOutputFields(value: unknown): Array<Pick<OutputField, 'key' | 'type' | 'description' | 'required'>> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((field): field is OutputField => field && typeof field === 'object' && !Array.isArray(field))
    .map((field) => ({
      key: String(field.key ?? ''),
      type: String(field.type ?? 'any') as OutputField['type'],
      description: typeof field.description === 'string' ? field.description : undefined,
      required: typeof field.required === 'boolean' ? field.required : undefined,
    }))
    .filter((field) => field.key);
}

export function outputFieldsInput(value: unknown): { success: true; fields: OutputField[] } | { success: false; message: string } {
  const normalized = arrayInput(value, 'fields');
  if (!normalized.success) return normalized;
  const fields: OutputField[] = [];
  for (const item of normalized.value) {
    const field = normalizeOutputField(item);
    if (!field) return { success: false, message: 'each field must include non-empty string key and type' };
    fields.push(field);
  }
  return { success: true, fields };
}

export function normalizeOutputField(value: unknown): OutputField | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as JsonRecord;
  const key = typeof record.key === 'string' ? record.key.trim() : '';
  const type = typeof record.type === 'string' ? record.type.trim() : '';
  if (!key || !type) return null;
  const field: OutputField = { key, type: type as OutputField['type'] };
  if ('value' in record) field.value = clone(record.value);
  if (typeof record.fileNameFilter === 'string') field.fileNameFilter = record.fileNameFilter;
  if (typeof record.description === 'string') field.description = record.description;
  if (typeof record.required === 'boolean') field.required = record.required;
  if (Array.isArray(record.children)) {
    const children = record.children.map(normalizeOutputField);
    if (children.some((child) => !child)) return null;
    field.children = children as OutputField[];
  }
  return field;
}

export function mergeOutputFields(existing: OutputField[], incoming: OutputField[], mode: 'append' | 'merge' | 'replace'): OutputField[] {
  if (mode === 'replace') return clone(incoming);
  if (mode === 'append') return [...clone(existing), ...clone(incoming)];

  const merged = clone(existing);
  const indexByKey = new Map(merged.map((field, index) => [field.key, index]));
  for (const field of incoming) {
    const index = indexByKey.get(field.key);
    if (index === undefined) {
      indexByKey.set(field.key, merged.length);
      merged.push(clone(field));
    } else {
      merged[index] = { ...merged[index], ...clone(field) };
    }
  }
  return merged;
}
