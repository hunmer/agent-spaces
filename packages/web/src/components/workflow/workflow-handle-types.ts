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
  const property = definition?.properties?.find(prop => {
    if (prop.key !== parsed.key) return false;
    if (!prop.visibleWhen) return true;
    const actual = node.data?.[prop.visibleWhen.key];
    return 'equals' in prop.visibleWhen
      ? actual === prop.visibleWhen.equals
      : prop.visibleWhen.in?.includes(actual);
  });
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
