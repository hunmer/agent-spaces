import type { ExecutionLogEntry } from '@agent-spaces/shared';

export const WORKFLOW_LAYOUT_KEY = 'agent-spaces:workflow-editor-layout-v2';

export type DebugResult = {
  status?: 'completed' | 'error';
  output?: unknown;
  error?: string;
  duration?: number;
  logs?: ExecutionLogEntry[];
};

export type NodeSelectContext =
  | {
    mode: 'connection-drop';
    sourceNodeId: string;
    sourceHandle: string | null;
    position: { x: number; y: number } | null;
  }
  | {
    mode: 'edge-insert';
    edgeId: string | null;
    sourceNodeId: string;
    targetNodeId: string;
    sourceHandle: string | null;
  }
  | {
    mode: 'rectangle-draw';
    position: { x: number; y: number };
    size: { width: number; height: number };
  };
