import type { Workflow, WorkflowFolder } from '@agent-spaces/shared';
import { workflowApi, workflowFolderApi } from '@/lib/workflow-api';
import type { WorkflowEditorStore, SetFn, GetFn } from './types';

export interface CrudSlice {
  workflows: Workflow[];
  workflowFolders: WorkflowFolder[];
  currentWorkflow: Workflow | null;
  loadState: 'idle' | 'loading' | 'loaded' | 'error';
  loadError: string | null;
  isDirty: boolean;
  isPreview: boolean;
  loadData: () => Promise<void>;
  saveWorkflow: (workflow?: Workflow) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  createFolder: (name: string, parentId?: string | null) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  setCurrentWorkflow: (workflow: Workflow | null) => void;
  markDirty: () => void;
  markClean: () => void;
}

export function createCrudSlice(
  set: SetFn,
  get: GetFn,
): CrudSlice {
  return {
    workflows: [],
    workflowFolders: [],
    currentWorkflow: null,
    loadState: 'idle',
    loadError: null,
    isDirty: false,
    isPreview: false,

    loadData: async () => {
      set({ loadState: 'loading' });
      try {
        const [workflows, folders] = await Promise.all([
          workflowApi.list(),
          workflowFolderApi.list(),
        ]);
        set({ workflows, workflowFolders: folders, loadState: 'loaded', loadError: null });
      } catch (err: any) {
        set({ loadState: 'error', loadError: err.message });
      }
    },

    saveWorkflow: async (workflow?: Workflow) => {
      const wf = workflow || get().currentWorkflow;
      if (!wf) return;
      const plain = JSON.parse(JSON.stringify(wf)) as Workflow;
      const now = Date.now();
      const existing = get().workflows.find(w => w.id === plain.id);
      if (existing) {
        await workflowApi.update(plain.id, { ...plain, updatedAt: now });
        set(s => ({
          workflows: s.workflows.map(w => w.id === plain.id ? { ...plain, updatedAt: now } : w),
          currentWorkflow: s.currentWorkflow?.id === plain.id ? { ...plain, updatedAt: now } : s.currentWorkflow,
          isDirty: false,
        }));
      } else {
        const created = await workflowApi.create({ ...plain, createdAt: now, updatedAt: now });
        set(s => ({
          workflows: [...s.workflows, created],
          currentWorkflow: created,
          isDirty: false,
        }));
      }
    },

    deleteWorkflow: async (id: string) => {
      await workflowApi.delete(id);
      set(s => ({
        workflows: s.workflows.filter(w => w.id !== id),
        currentWorkflow: s.currentWorkflow?.id === id ? null : s.currentWorkflow,
        isDirty: s.currentWorkflow?.id === id ? false : s.isDirty,
      }));
    },

    createFolder: async (name: string, parentId: string | null = null) => {
      const folder = await workflowFolderApi.create({ name, parentId, order: 0, createdAt: Date.now() });
      set(s => ({ workflowFolders: [...s.workflowFolders, folder] }));
    },

    deleteFolder: async (id: string) => {
      await workflowFolderApi.delete(id);
      set(s => ({ workflowFolders: s.workflowFolders.filter(f => f.id !== id) }));
    },

    renameFolder: async (id: string, name: string) => {
      await workflowFolderApi.update(id, { name });
      set(s => ({
        workflowFolders: s.workflowFolders.map(f => f.id === id ? { ...f, name } : f),
      }));
    },

    setCurrentWorkflow: (workflow: Workflow | null) => {
      set({
        currentWorkflow: workflow,
        selectedNodeIds: [],
        selectedEmbeddedNode: null,
        executionStatus: 'idle',
        executionLog: null,
        executionContext: {},
        undoStack: [],
        redoStack: [],
        isDirty: false,
        isPreview: false,
        debugNodeStatus: {},
        debugNodeResult: {},
        debugNodeId: null,
      });
      if (workflow) {
        get().loadExecutionLogs();
        get().loadVersions();
        get().loadOperationHistory();
        get().loadStagedNodes();
      }
    },

    markDirty: () => set({ isDirty: true }),
    markClean: () => set({ isDirty: false }),
  };
}
