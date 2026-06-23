import type { OutputField } from '@agent-spaces/shared';

export const FILE_CHILD_FIELDS = [
  { key: 'path', type: 'string' },
  { key: 'relativePath', type: 'string' },
  { key: 'name', type: 'string' },
  { key: 'size', type: 'number' },
  { key: 'type', type: 'string' },
  { key: 'url', type: 'string' },
  { key: 'httpPath', type: 'string' },
] as const satisfies ReadonlyArray<Pick<OutputField, 'key' | 'type'>>;

export const FILE_CHILD_KEYS = FILE_CHILD_FIELDS.map((field) => field.key);

export function getFileChildField(key: string): OutputField | null {
  const field = FILE_CHILD_FIELDS.find((item) => item.key === key);
  return field ? { key: field.key, type: field.type } : null;
}
