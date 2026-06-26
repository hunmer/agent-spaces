import type { ReactFlowState } from '@xyflow/react';
import type { OutputField } from '@agent-spaces/shared';

// ---- Handle colors ----
export const DEFAULT_SOURCE_HANDLE_COLOR = '#10b981';
export const LOOP_BODY_SOURCE_HANDLE_COLOR = '#3b82f6';
export const DEFAULT_DYNAMIC_HANDLE_COLOR = '#10b981';
export const DEFAULT_DYNAMIC_FALLBACK_HANDLE_COLOR = '#f97316';
export const SOURCE_HANDLE_KEY = 'source';

// ---- Layout constants ----
export const COMPACT_NODE_ZOOM_THRESHOLD = 0.65;
export const COLLAPSED_NODE_SIZE = 56;

// 持久化折叠状态到 nodeData 的 key：记录被折叠的 output object 复合 key
export const COLLAPSED_OUTPUT_HANDLES_KEY = '__collapsedOutputHandles';

// ---- React Flow store selectors ----
export const showFullNodeSelector = (state: ReactFlowState) =>
  state.transform[2] >= COMPACT_NODE_ZOOM_THRESHOLD;
export const canvasZoomSelector = (state: ReactFlowState) => state.transform[2] || 1;
export const workflowNodesSelector = (state: ReactFlowState) => state.nodes;

// ---- Types ----
export type NodePreviewDragPhase = 'start' | 'move' | 'end' | 'cancel';

export type PropertyModeHandle = {
  id: string;
  label: string;
  side: 'left' | 'right';
  type: 'target' | 'source';
  color: string;
  valueType?: string;
  tooltip?: string;
  depth?: number;
  collapsible?: boolean;
  collapsedKey?: string;
  parentCollapsedKey?: string;
};

// ---- Pure helpers ----
export function getWorkflowFields(value: unknown): OutputField[] {
  return Array.isArray(value) ? value.filter((field): field is OutputField => (
    !!field && typeof field === 'object' && typeof (field as OutputField).key === 'string'
  )) : [];
}

export function getWorkflowFieldsSignature(fields: OutputField[]): string {
  return fields
    .map((field, index) => {
      const children = getWorkflowFields(field.children);
      return [
        index,
        field.key,
        field.type,
        children.length > 0 ? getWorkflowFieldsSignature(children) : '',
      ].join(':');
    })
    .join('|');
}

export function getRecordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
