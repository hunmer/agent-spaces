import type { WorkflowVersion } from '@agent-spaces/shared';
import { workflowVersionApi } from '@/lib/workflow-api';
import type { WorkflowEditorStore, SetFn, GetFn } from './types';

export interface VersionsSlice {
  versions: WorkflowVersion[];
  loadVersions: () => Promise<void>;
  saveVersion: (name: string) => Promise<void>;
  deleteVersion: (id: string) => Promise<void>;
  restoreVersion: (id: string) => Promise<void>;
}

export function createVersionsSlice(
  set: SetFn,
  get: GetFn,
): VersionsSlice {
  return {
    versions: [],

    loadVersions: async () => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      try {
        const versions = await workflowVersionApi.list(wf.id);
        set({ versions });
      } catch {}
    },

    saveVersion: async (name: string) => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      const version = await workflowVersionApi.add(wf.id, name, wf.nodes, wf.edges);
      set(s => ({ versions: [...s.versions, version] }));
    },

    deleteVersion: async (id: string) => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      await workflowVersionApi.delete(wf.id, id);
      set(s => ({ versions: s.versions.filter(v => v.id !== id) }));
    },

    restoreVersion: async (id: string) => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      get().pushUndo('恢复版本');
      const version = await workflowVersionApi.get(wf.id, id);
      set(s => ({
        currentWorkflow: s.currentWorkflow ? {
          ...s.currentWorkflow,
          nodes: JSON.parse(JSON.stringify(version.snapshot.nodes)),
          edges: JSON.parse(JSON.stringify(version.snapshot.edges)),
        } : null,
        isDirty: true,
      }));
    },
  };
}
