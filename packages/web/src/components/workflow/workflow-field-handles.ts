'use client';

import type { OutputField } from '@agent-spaces/shared';

export type WorkflowFieldHandleKind = 'input' | 'property' | 'output';

export const WORKFLOW_FIELD_HANDLE_PREFIXES: Record<WorkflowFieldHandleKind, string> = {
  input: 'input',
  property: 'property',
  output: 'output',
};

export function getWorkflowFieldHandleId(kind: WorkflowFieldHandleKind, key: string, index?: number): string {
  const fallback = typeof index === 'number' ? String(index + 1) : 'field';
  return `${WORKFLOW_FIELD_HANDLE_PREFIXES[kind]}:${key.trim() || fallback}`;
}

export function getWorkflowFieldHandleIdFromField(kind: 'input' | 'output', field: OutputField, index: number): string {
  return getWorkflowFieldHandleId(kind, field.key, index);
}

export function parseWorkflowFieldHandleId(handleId: string | null | undefined): {
  kind: WorkflowFieldHandleKind;
  key: string;
} | null {
  if (!handleId) return null;
  const separatorIndex = handleId.indexOf(':');
  if (separatorIndex <= 0) return null;

  const kind = handleId.slice(0, separatorIndex);
  if (kind !== 'input' && kind !== 'property' && kind !== 'output') return null;

  const key = handleId.slice(separatorIndex + 1);
  if (!key) return null;
  return { kind, key };
}

export function getWorkflowFieldHandleTop(index: number, total: number): string {
  return `${((index + 0.5) / Math.max(1, total)) * 100}%`;
}
