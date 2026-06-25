import type { OutputField, Workflow, WorkflowNode } from '@agent-spaces/shared';
import { getNodeDefinition } from '@/lib/workflow-nodes';
import { getEffectiveDataType } from './workflow-properties-utils';
import { parseWorkflowFieldHandleId } from './workflow-field-handles';

function getWorkflowFields(value: unknown): OutputField[] {
  return Array.isArray(value) ? value.filter((field): field is OutputField => (
    !!field && typeof field === 'object' && typeof (field as OutputField).key === 'string'
  )) : [];
}

export function mapPropertyDataTypeToWorkflowHandleType(type: string | undefined): OutputField['type'] | undefined {
  if (!type) return undefined;
  if (type === 'object[]') return 'array';
  if (type === 'string' || type === 'number' || type === 'boolean' || type === 'string[]' || type === 'number[]' || type === 'object' || type === 'any') {
    return type;
  }
  return undefined;
}

function normalizeWorkflowHandleValueType(type: string | undefined): OutputField['type'] | undefined {
  if (!type) return undefined;
  if (type === 'select') return 'string';
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
  if (!node || !handleId) return undefined;
  const parsed = parseWorkflowFieldHandleId(handleId);
  if (!parsed) return undefined;

  if (parsed.kind === 'input') {
    return getWorkflowFields(node.data?.inputFields).find(field => field.key === parsed.key)?.type;
  }

  if (parsed.kind === 'output') {
    return getWorkflowFields(node.data?.outputs).find(field => field.key === parsed.key)?.type;
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
