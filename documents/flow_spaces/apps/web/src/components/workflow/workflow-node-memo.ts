import type { NodeProps } from '@xyflow/react';

function areDataValuesEqual(prevValue: unknown, nextValue: unknown): boolean {
  if (Object.is(prevValue, nextValue)) return true;
  if (!Array.isArray(prevValue) || !Array.isArray(nextValue)) return false;
  if (prevValue.length !== nextValue.length) return false;
  return prevValue.every((item, index) => Object.is(item, nextValue[index]));
}

function areWorkflowNodeDataEqual(prevData: unknown, nextData: unknown): boolean {
  if (Object.is(prevData, nextData)) return true;
  if (!prevData || !nextData || typeof prevData !== 'object' || typeof nextData !== 'object') return false;

  const prevRecord = prevData as Record<string, unknown>;
  const nextRecord = nextData as Record<string, unknown>;
  const prevKeys = Object.keys(prevRecord);
  const nextKeys = Object.keys(nextRecord);
  if (prevKeys.length !== nextKeys.length) return false;

  return prevKeys.every(key => Object.prototype.hasOwnProperty.call(nextRecord, key)
    && areDataValuesEqual(prevRecord[key], nextRecord[key]));
}

export function areWorkflowNodePropsEqual(prev: NodeProps, next: NodeProps): boolean {
  return prev.id === next.id
    && prev.type === next.type
    && prev.selected === next.selected
    && areWorkflowNodeDataEqual(prev.data, next.data);
}
