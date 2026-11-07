import type { ExecutionLog } from '@agent-spaces/shared';
import { executionLogApi } from '@/lib/workflow-api';
import type { WorkflowEditorStore, SetFn, GetFn } from './types';

export interface ExecutionLogsSlice {
  executionLogs: ExecutionLog[];
  selectedExecutionLogId: string | null;
  loadExecutionLogs: () => Promise<void>;
  deleteExecutionLog: (id: string) => Promise<void>;
  clearExecutionLogs: () => Promise<void>;
  setSelectedExecutionLogId: (id: string | null) => void;
  enterPreview: (log: ExecutionLog) => void;
  exitPreview: () => void;
}

export function createExecutionLogsSlice(
  set: SetFn,
  get: GetFn,
  prePreviewRef: { current: import('@agent-spaces/shared').Workflow | null },
): ExecutionLogsSlice {
  return {
    executionLogs: [],
    selectedExecutionLogId: null,

    loadExecutionLogs: async () => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      try {
        const logs = await executionLogApi.list(wf.id);
        set({ executionLogs: logs });
      } catch {}
    },

    deleteExecutionLog: async (id: string) => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      await executionLogApi.delete(wf.id, id);
      set(s => ({
        executionLogs: s.executionLogs.filter(l => l.id !== id),
        selectedExecutionLogId: s.selectedExecutionLogId === id ? null : s.selectedExecutionLogId,
      }));
    },

    clearExecutionLogs: async () => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      await executionLogApi.clear(wf.id);
      set({ executionLogs: [], selectedExecutionLogId: null });
    },

    setSelectedExecutionLogId: (id) => set({ selectedExecutionLogId: id }),

    enterPreview: (log: ExecutionLog) => {
      const wf = get().currentWorkflow;
      if (get().isPreview || !log.snapshot || !wf) return;
      prePreviewRef.current = JSON.parse(JSON.stringify(wf));
      set(s => ({
        currentWorkflow: s.currentWorkflow ? {
          ...s.currentWorkflow,
          nodes: JSON.parse(JSON.stringify(log.snapshot!.nodes)),
          edges: JSON.parse(JSON.stringify(log.snapshot!.edges)),
          groups: log.snapshot!.groups ? JSON.parse(JSON.stringify(log.snapshot!.groups)) : [],
        } : null,
        isPreview: true,
      }));
    },

    exitPreview: () => {
      if (!get().isPreview) return;
      if (prePreviewRef.current) {
        set({
          currentWorkflow: prePreviewRef.current,
          isPreview: false,
          selectedExecutionLogId: null,
        });
        prePreviewRef.current = null;
      } else {
        set({ isPreview: false, selectedExecutionLogId: null });
      }
    },
  };
}
