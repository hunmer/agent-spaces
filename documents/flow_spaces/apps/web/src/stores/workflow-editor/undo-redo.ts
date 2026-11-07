import type { OperationEntry } from '@agent-spaces/shared';
import { operationHistoryApi } from '@/lib/workflow-api';
import type { WorkflowEditorStore, SetFn, GetFn } from './types';

export interface UndoRedoSlice {
  undoStack: string[];
  redoStack: string[];
  operationLog: OperationEntry[];
  pushUndo: (description: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  restoreToStep: (index: number) => void;
  clearOperationHistory: () => Promise<void>;
  loadOperationHistory: () => Promise<void>;
}

export function createUndoRedoSlice(
  set: SetFn,
  get: GetFn,
): UndoRedoSlice {
  return {
    undoStack: [],
    redoStack: [],
    operationLog: [],

    pushUndo: (description: string) => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      const snapshot = JSON.stringify({ nodes: wf.nodes, edges: wf.edges, groups: wf.groups });
      const entry: OperationEntry = { description, timestamp: Date.now(), snapshot };
      set(s => ({
        undoStack: [...s.undoStack, snapshot],
        redoStack: [],
        operationLog: [...s.operationLog, entry],
      }));
    },

    undo: () => {
      const { undoStack, redoStack, currentWorkflow } = get();
      if (undoStack.length === 0 || !currentWorkflow) return;
      const currentSnapshot = JSON.stringify({ nodes: currentWorkflow.nodes, edges: currentWorkflow.edges, groups: currentWorkflow.groups });
      const prevSnapshot = undoStack[undoStack.length - 1];
      const prev = JSON.parse(prevSnapshot);
      set({
        undoStack: undoStack.slice(0, -1),
        redoStack: [...redoStack, currentSnapshot],
        currentWorkflow: { ...currentWorkflow, nodes: prev.nodes, edges: prev.edges, groups: prev.groups },
        isDirty: true,
      });
    },

    redo: () => {
      const { undoStack, redoStack, currentWorkflow } = get();
      if (redoStack.length === 0 || !currentWorkflow) return;
      const currentSnapshot = JSON.stringify({ nodes: currentWorkflow.nodes, edges: currentWorkflow.edges, groups: currentWorkflow.groups });
      const nextSnapshot = redoStack[redoStack.length - 1];
      const next = JSON.parse(nextSnapshot);
      set({
        undoStack: [...undoStack, currentSnapshot],
        redoStack: redoStack.slice(0, -1),
        currentWorkflow: { ...currentWorkflow, nodes: next.nodes, edges: next.edges, groups: next.groups },
        isDirty: true,
      });
    },

    canUndo: () => get().undoStack.length > 0,
    canRedo: () => get().redoStack.length > 0,

    restoreToStep: (index: number) => {
      const { operationLog, currentWorkflow } = get();
      if (!currentWorkflow || index >= operationLog.length) return;
      const entry = operationLog[index];
      if (!entry.snapshot) return;
      const restored = JSON.parse(entry.snapshot);
      set(s => ({
        currentWorkflow: s.currentWorkflow ? {
          ...s.currentWorkflow,
          nodes: restored.nodes,
          edges: restored.edges,
          groups: restored.groups,
        } : null,
        isDirty: true,
      }));
    },

    clearOperationHistory: async () => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      await operationHistoryApi.clear(wf.id);
      set({ undoStack: [], redoStack: [], operationLog: [] });
    },

    loadOperationHistory: async () => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      try {
        const entries = await operationHistoryApi.load(wf.id);
        set({ operationLog: entries });
      } catch {}
    },
  };
}
