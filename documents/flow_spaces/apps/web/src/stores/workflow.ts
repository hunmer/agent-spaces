import { create } from 'zustand';
import type { WorkflowTemplate, WorkflowNode, WorkflowEdge } from '@agent-spaces/shared';
import { sdk } from '@/lib/sdk';

interface WorkflowStore {
  workflows: WorkflowTemplate[];
  currentWorkflow: WorkflowTemplate | null;
  isLoading: boolean;

  loadWorkflows: () => Promise<void>;
  createWorkflow: (data: { name: string; description?: string; nodes?: WorkflowNode[]; edges?: WorkflowEdge[] }) => Promise<WorkflowTemplate>;
  updateWorkflow: (id: string, data: Partial<Pick<WorkflowTemplate, 'name' | 'description' | 'nodes' | 'edges'>>) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  duplicateWorkflow: (id: string) => Promise<void>;
  setCurrentWorkflow: (workflow: WorkflowTemplate | null) => void;
  upsertWorkflow: (workflow: WorkflowTemplate) => void;
  removeWorkflow: (id: string) => void;
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  workflows: [],
  currentWorkflow: null,
  isLoading: false,

  loadWorkflows: async () => {
    set({ isLoading: true });
    try {
      const workflows: WorkflowTemplate[] = await sdk.workflow.list();
      set({ workflows, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createWorkflow: async (data) => {
    const workflow: WorkflowTemplate = await sdk.workflow.create(data);
    set(state => ({ workflows: [...state.workflows, workflow] }));
    return workflow;
  },

  updateWorkflow: async (id, data) => {
    const workflow: WorkflowTemplate = await sdk.workflow.update(id, data);
    get().upsertWorkflow(workflow);
  },

  deleteWorkflow: async (id) => {
    await sdk.workflow.delete_(id);
    get().removeWorkflow(id);
  },

  duplicateWorkflow: async (id) => {
    const workflow: WorkflowTemplate = await sdk.workflow.duplicate(id);
    set(state => ({ workflows: [...state.workflows, workflow] }));
  },

  setCurrentWorkflow: (workflow) => set({ currentWorkflow: workflow }),

  upsertWorkflow: (workflow) => {
    set(state => {
      const idx = state.workflows.findIndex(w => w.id === workflow.id);
      if (idx !== -1) {
        const updated = [...state.workflows];
        updated[idx] = workflow;
        return { workflows: updated };
      }
      return { workflows: [...state.workflows, workflow] };
    });
  },

  removeWorkflow: (id) => {
    set(state => ({
      workflows: state.workflows.filter(w => w.id !== id),
      currentWorkflow: state.currentWorkflow?.id === id ? null : state.currentWorkflow,
    }));
  },
}));
