import type { OutputField, Workflow, WorkflowNode } from '@agent-spaces/shared';
import { getNodeDefinition } from '@/lib/workflow-nodes';
import { getEffectiveDataType } from './workflow-properties-utils';
import { getWorkflowFieldHandleId, parseWorkflowFieldHandleId } from './workflow-field-handles';

function getWorkflowFields(value: unknown): OutputField[] {
  return Array.isArray(value) ? value.filter((field): field is OutputField => (
    !!field && typeof field === 'object' && typeof (field as OutputField).key === 'string'
  )) : [];
}

// 支持复合 key（如 "obj.child"）在 output 字段树中递归查找类型
function findOutputFieldTypeByKey(fields: OutputField[], key: string): OutputField['type'] | undefined {
  const direct = fields.find(field => field.key === key);
  if (direct) return direct.type;
  const separatorIndex = key.indexOf('.');
  if (separatorIndex <= 0) return undefined;
  const parentKey = key.slice(0, separatorIndex);
  const childKey = key.slice(separatorIndex + 1);
  if (!childKey) return undefined;
  const parent = fields.find(field => field.key === parentKey);
  if (!parent || !Array.isArray(parent.children) || parent.children.length === 0) return undefined;
  return findOutputFieldTypeByKey(parent.children, childKey);
}

export function mapPropertyDataTypeToWorkflowHandleType(type: string | undefined): OutputField['type'] | undefined {
  if (!type) return undefined;
  if (type === 'select' || type === 'textarea' || type === 'text') return 'string';
  if (type === 'object[]') return 'array';
  if (type === 'string' || type === 'number' || type === 'boolean' || type === 'string[]' || type === 'number[]' || type === 'object' || type === 'any') {
    return type;
  }
  return undefined;
}

function normalizeWorkflowHandleValueType(type: string | undefined): OutputField['type'] | undefined {
  if (!type) return undefined;
  if (type === 'select' || type === 'textarea' || type === 'text') return 'string';
  if (type === 'array') return 'array';
  if (type === 'object[]') return 'array';
  return type as OutputField['type'];
}

function getPropertyRootKey(key: string): string {
  const dotIndex = key.indexOf('.');
  const bracketIndex = key.indexOf('[');
  const indexes = [dotIndex, bracketIndex].filter(index => index >= 0);
  return indexes.length > 0 ? key.slice(0, Math.min(...indexes)) : key;
}

function getArrayItemFieldKey(key: string, rootKey: string): string | undefined {
  const prefix = `${rootKey}[`;
  if (!key.startsWith(prefix)) return undefined;
  const closeIndex = key.indexOf(']');
  if (closeIndex < prefix.length || key[closeIndex + 1] !== '.') return undefined;
  const rest = key.slice(closeIndex + 2);
  return rest.split('.')[0] || undefined;
}

function getArrayItemIndex(key: string, rootKey: string): number | undefined {
  const prefix = `${rootKey}[`;
  if (!key.startsWith(prefix)) return undefined;
  const closeIndex = key.indexOf(']');
  if (closeIndex < prefix.length) return undefined;
  const index = Number(key.slice(prefix.length, closeIndex));
  return Number.isInteger(index) && index >= 0 ? index : undefined;
}

function isWorkflowHandleValueType(type: unknown): type is OutputField['type'] {
  return type === 'string'
    || type === 'number'
    || type === 'boolean'
    || type === 'object'
    || type === 'array'
    || type === 'file'
    || type === 'image'
    || type === 'audio'
    || type === 'video'
    || type === 'select'
    || type === 'any'
    || type === 'string[]'
    || type === 'number[]'
    || type === 'file[]'
    || type === 'image[]'
    || type === 'audio[]'
    || type === 'video[]'
    || type === 'any[]';
}

function getSetVariableValueType(node: WorkflowNode | Workflow['nodes'][number], key: string): OutputField['type'] | undefined {
  if (node.type !== 'set_variable' || getPropertyRootKey(key) !== 'variables') return undefined;
  if (getArrayItemFieldKey(key, 'variables') !== 'value') return undefined;
  const itemIndex = getArrayItemIndex(key, 'variables');
  if (itemIndex === undefined) return undefined;
  const variables = node.data?.variables;
  if (!Array.isArray(variables)) return undefined;
  const item = variables[itemIndex];
  if (!item || typeof item !== 'object' || Array.isArray(item)) return 'string';
  const type = (item as Record<string, unknown>).type;
  return isWorkflowHandleValueType(type) ? type : 'string';
}

function isArrayLikeWorkflowHandleType(type: string | undefined): boolean {
  return type === 'array'
    || type === 'string[]'
    || type === 'number[]'
    || type === 'file[]'
    || type === 'image[]'
    || type === 'audio[]'
    || type === 'video[]'
    || type === 'any[]'
    || type === 'object[]';
}

export function areWorkflowHandleValueTypesCompatible(sourceType: string | undefined, targetType: string | undefined): boolean {
  if (!sourceType || !targetType) return true;
  const normalizedSource = normalizeWorkflowHandleValueType(sourceType);
  const normalizedTarget = normalizeWorkflowHandleValueType(targetType);
  if (!normalizedSource || !normalizedTarget) return true;
  if (normalizedSource === 'any' || normalizedTarget === 'any') return true;
  if (normalizedSource === normalizedTarget) return true;
  if (normalizedSource === 'any[]' && isArrayLikeWorkflowHandleType(normalizedTarget)) return true;
  if (normalizedTarget === 'any[]' && isArrayLikeWorkflowHandleType(normalizedSource)) return true;
  return false;
}

export function getWorkflowHandleValueType(
  node: WorkflowNode | Workflow['nodes'][number] | undefined,
  handleId: string | null | undefined,
): OutputField['type'] | undefined {
  if (!node) return undefined;
  const parsed = parseWorkflowFieldHandleId(getNormalizedWorkflowSourceHandle(node, handleId));
  if (!parsed) return undefined;

  if (parsed.kind === 'input') {
    return getWorkflowFields(node.data?.inputFields).find(field => field.key === parsed.key)?.type;
  }

  if (parsed.kind === 'output') {
    const isStartNode = node.type === 'start'
      || (typeof node.data?.nodeType === 'string' && node.data.nodeType === 'start');
    return findOutputFieldTypeByKey(getWorkflowFields(node.data?.outputs), parsed.key)
      ?? (isStartNode
        ? findOutputFieldTypeByKey(getWorkflowFields(node.data?.inputFields), parsed.key)
        : undefined);
  }

  const definition = getNodeDefinition(node.type);
  const propertyRootKey = getPropertyRootKey(parsed.key);
  const property = definition?.properties?.find(prop => {
    if (prop.key !== propertyRootKey) return false;
    if (!prop.visibleWhen) return true;
    const actual = node.data?.[prop.visibleWhen.key];
    return 'equals' in prop.visibleWhen
      ? actual === prop.visibleWhen.equals
      : prop.visibleWhen.in?.includes(actual);
  });
  const setVariableValueType = getSetVariableValueType(node, parsed.key);
  if (setVariableValueType) return setVariableValueType;
  const arrayItemFieldKey = property ? getArrayItemFieldKey(parsed.key, property.key) : undefined;
  if (property?.type === 'array' && arrayItemFieldKey) {
    const itemField = property.fields?.find(field => field.key === arrayItemFieldKey);
    if (!itemField) return undefined;
    if (itemField.dataType) return mapPropertyDataTypeToWorkflowHandleType(itemField.dataType);
    if (Array.isArray(property.itemTemplate?.[itemField.key])) return 'any[]';
    return mapPropertyDataTypeToWorkflowHandleType(itemField.type);
  }
  return mapPropertyDataTypeToWorkflowHandleType(property ? getEffectiveDataType(property) : undefined);
}

export function getNormalizedWorkflowSourceHandle(
  node: WorkflowNode | Workflow['nodes'][number] | undefined,
  handleId: string | null | undefined,
): string | undefined {
  const normalizedHandleId = handleId || undefined;
  if (!node || (normalizedHandleId && normalizedHandleId !== 'source')) return normalizedHandleId;

  const isStartNode = node.type === 'start'
    || (typeof node.data?.nodeType === 'string' && node.data.nodeType === 'start');
  if (!isStartNode) return normalizedHandleId;

  const inputFields = getWorkflowFields(node.data?.inputFields);
  if (inputFields.length !== 1) return normalizedHandleId;
  return getWorkflowFieldHandleId('output', inputFields[0].key, 0);
}
