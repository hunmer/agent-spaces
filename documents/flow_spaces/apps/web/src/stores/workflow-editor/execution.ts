import type { EngineStatus } from '@agent-spaces/shared';
import { getWS } from '@/lib/ws';
import { validateWorkflowExecution } from './validation';
import type { WorkflowEditorStore, SetFn, GetFn } from './types';

export interface ExecutionSlice {
  executionStatus: EngineStatus;
  executionLog: import('@agent-spaces/shared').ExecutionLog | null;
  executionContext: Record<string, unknown>;
  debugNodeStatus: Record<string, 'running' | 'completed' | 'error'>;
  debugNodeResult: Record<string, unknown>;
  debugNodeId: string | null;
  execute: (input?: Record<string, unknown>, startNodeId?: string) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  debugSingleNode: (nodeId: string, context?: Record<string, unknown>) => Promise<void>;
  cancelDebug: () => void;
}

export function createExecutionSlice(
  set: SetFn,
  get: GetFn,
): ExecutionSlice {
  return {
    executionStatus: 'idle',
    executionLog: null,
    executionContext: {},
    debugNodeStatus: {},
    debugNodeResult: {},
    debugNodeId: null,

    execute: async (input?: Record<string, unknown>, startNodeId?: string) => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      const error = validateWorkflowExecution(wf);
      if (error) return;

      set({ executionStatus: 'running', executionContext: {} });
      try {
        const ws = getWS(get().workspaceId);
        ws.send('workflow:execute', { workflowId: wf.id, input, startNodeId });
      } catch (err: any) {
        set({ executionStatus: 'error' });
      }
    },

    pause: async () => {
      const log = get().executionLog;
      if (!log) return;
      const ws = getWS(get().workspaceId);
      ws.send('workflow:pause', { executionId: log.id });
    },

    resume: async () => {
      const log = get().executionLog;
      if (!log) return;
      const ws = getWS(get().workspaceId);
      ws.send('workflow:resume', { executionId: log.id });
    },

    stop: async () => {
      const log = get().executionLog;
      if (!log) return;
      const ws = getWS(get().workspaceId);
      ws.send('workflow:stop', { executionId: log.id });
    },

    debugSingleNode: async (nodeId: string, context?: Record<string, unknown>) => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      set(s => ({
        debugNodeId: nodeId,
        debugNodeStatus: { ...s.debugNodeStatus, [nodeId]: 'running' },
        debugNodeResult: { ...s.debugNodeResult, [nodeId]: undefined },
      }));
      const ws = getWS(get().workspaceId);
      ws.send('workflow:debug-node', { workflowId: wf.id, nodeId, context });
    },

    cancelDebug: () => set({ debugNodeId: null }),
  };
}
