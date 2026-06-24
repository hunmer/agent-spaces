'use client';

import type { OutputField, WorkflowNode } from '@agent-spaces/shared';
import { getFileChildField } from './workflow-variable-fields';

export type ParsedVariableExpression = {
  scope: 'data' | 'inputs' | 'env';
  nodeId?: string;
  fieldPath: string;
};

export function unwrapExpressionPath(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  const match = text.match(/^\{\{\s*([^{}]*?)\s*\}\}$/);
  return match ? match[1].trim() : text;
}

export function parseVariableExpression(value: unknown): ParsedVariableExpression | null {
  const expression = unwrapExpressionPath(value);
  const nodeScoped = expression.match(/^__(data|inputs)__\["([^"]+)"\]\.(.+)$/);
  if (nodeScoped) {
    return {
      scope: nodeScoped[1] === 'data' ? 'data' : 'inputs',
      nodeId: nodeScoped[2],
      fieldPath: nodeScoped[3],
    };
  }
  const envScoped = expression.match(/^__env__\.(.+)$/);
  if (envScoped) return { scope: 'env', fieldPath: envScoped[1] };
  return null;
}

export function tokenizeVariableFieldPath(fieldPath: string): string[] {
  const tokens: string[] = [];
  let index = 0;

  while (index < fieldPath.length) {
    const char = fieldPath[index];

    if (char === '.') {
      index += 1;
      continue;
    }

    if (char === '[') {
      const nextChar = fieldPath[index + 1];
      if (nextChar === '"' || nextChar === '\'') {
        const quote = nextChar;
        index += 2;
        let value = '';
        while (index < fieldPath.length) {
          const current = fieldPath[index];
          if (current === '\\' && index + 1 < fieldPath.length) {
            value += fieldPath[index + 1];
            index += 2;
            continue;
          }
          if (current === quote) break;
          value += current;
          index += 1;
        }
        if (fieldPath[index] !== quote || fieldPath[index + 1] !== ']') return [];
        tokens.push(value);
        index += 2;
        continue;
      }

      const closeIndex = fieldPath.indexOf(']', index);
      if (closeIndex === -1) return [];
      const rawIndex = fieldPath.slice(index + 1, closeIndex).trim();
      if (!/^\d+$/.test(rawIndex)) return [];
      tokens.push(`[${rawIndex}]`);
      index = closeIndex + 1;
      continue;
    }

    let nextIndex = index;
    while (nextIndex < fieldPath.length && fieldPath[nextIndex] !== '.' && fieldPath[nextIndex] !== '[') {
      nextIndex += 1;
    }
    const token = fieldPath.slice(index, nextIndex).trim();
    if (!token) return [];
    tokens.push(token);
    index = nextIndex;
  }

  return tokens;
}

export function normalizeVariableFieldPath(fieldPath: string): string {
  const tokens = tokenizeVariableFieldPath(fieldPath);
  if (!tokens.length) return fieldPath.trim();

  return tokens.reduce((result, token, index) => {
    if (/^\[\d+\]$/.test(token)) return `${result}${token}`;
    if (index === 0) return token;
    const needsQuotedAccess = !/^[A-Za-z_$][\w$]*$/.test(token);
    return needsQuotedAccess ? `${result}["${token}"]` : `${result}.${token}`;
  }, '');
}

function isIndexedAccessToken(token: string): boolean {
  return /^\[\d+\]$/.test(token);
}

function getIndexedItemField(field: OutputField): OutputField | null {
  if (field.type === 'array') {
    return field.children?.length ? { key: 'item', type: 'object', children: field.children } : { key: 'item', type: 'any' };
  }

  const itemTypeByArrayType: Partial<Record<OutputField['type'], OutputField['type']>> = {
    'string[]': 'string',
    'number[]': 'number',
    'file[]': 'file',
    'image[]': 'image',
    'audio[]': 'audio',
    'video[]': 'video',
    'any[]': 'any',
  };
  const itemType = itemTypeByArrayType[field.type];
  return itemType ? { key: 'item', type: itemType } : null;
}

function getMediaChildField(field: OutputField, key: string): OutputField | null {
  return ['file', 'image', 'audio', 'video'].includes(field.type) ? getFileChildField(key) : null;
}

export function findFieldByPath(fields: OutputField[], fieldPath: string): OutputField | null {
  const tokens = tokenizeVariableFieldPath(fieldPath);
  if (!tokens.length) return null;

  let currentField = fields.find((item) => item.key === tokens[0]) ?? null;
  if (!currentField) return null;

  for (const token of tokens.slice(1)) {
    if (isIndexedAccessToken(token)) {
      currentField = getIndexedItemField(currentField);
      if (!currentField) return null;
      continue;
    }

    const mediaChild = getMediaChildField(currentField, token);
    if (mediaChild) {
      currentField = mediaChild;
      continue;
    }

    currentField = Array.isArray(currentField.children)
      ? currentField.children.find((item) => item.key === token) ?? null
      : null;
    if (!currentField) return null;
  }

  return currentField;
}

function getNodeOutputs(node: WorkflowNode): OutputField[] {
  return Array.isArray(node.data?.outputs) ? node.data.outputs as OutputField[] : [];
}

function getNodeInputFields(node: WorkflowNode): OutputField[] {
  return Array.isArray(node.data?.inputFields) ? node.data.inputFields as OutputField[] : [];
}

export function getFieldsForVariableExpression(value: unknown, nodes: WorkflowNode[], variables: OutputField[]): OutputField | null {
  const parsed = parseVariableExpression(value);
  if (!parsed) return null;
  if (parsed.scope === 'env') return findFieldByPath(variables, parsed.fieldPath);

  const node = nodes.find((item) => item.id === parsed.nodeId);
  if (!node) return null;
  const fields = parsed.scope === 'inputs' ? getNodeInputFields(node) : node.type === 'start' ? getNodeInputFields(node) : getNodeOutputs(node);
  return findFieldByPath(fields, parsed.fieldPath);
}
