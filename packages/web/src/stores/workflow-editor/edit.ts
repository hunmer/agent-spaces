import type { WorkflowNode, WorkflowEdge } from '@agent-spaces/shared';
import { getNodeDefinition } from '@/lib/workflow-nodes';
import type { WorkflowEditorStore, EmbeddedSelection, SetFn, GetFn } from './types';

export interface EditSlice {
  selectedNodeIds: string[];
  selectedEmbeddedNode: EmbeddedSelection | null;
  rightPanelTab: string;
  addNode: (type: string, position: { x: number; y: number }) => WorkflowNode | null;
  removeNode: (id: string) => void;
  updateNodeData: (id: string, data: Partial<WorkflowNode>) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  addEdge: (edge: WorkflowEdge) => void;
  removeEdge: (id: string) => void;
  selectNodes: (ids: string[]) => void;
  clearSelection: () => void;
  selectEmbeddedNode: (selection: EmbeddedSelection | null) => void;
  setRightPanelTab: (tab: string) => void;
}

export function createEditSlice(
  set: SetFn,
  get: GetFn,
): EditSlice {
  return {
    selectedNodeIds: [],
    selectedEmbeddedNode: null,
    rightPanelTab: 'properties',

    addNode: (type: string, position: { x: number; y: number }) => {
      const wf = get().currentWorkflow;
      if (!wf) return null;
      const def = getNodeDefinition(type);
      const id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const node: WorkflowNode = {
        id,
        type,
        label: '',
        position,
        data: { ...((def as typeof def & { data?: Record<string, unknown> })?.data || {}) },
        ...(def?.singleton ? {} : {}),
      };
      if (def?.properties) {
        for (const prop of def.properties) {
          if (prop.default !== undefined) {
            node.data[prop.key] = prop.default;
          }
        }
      }
      get().pushUndo('添加节点');
      set(s => ({
        currentWorkflow: s.currentWorkflow ? {
          ...s.currentWorkflow,
          nodes: [...s.currentWorkflow.nodes, node],
        } : null,
        isDirty: true,
      }));
      return node;
    },

    removeNode: (id: string) => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      get().pushUndo('删除节点');
      set(s => ({
        currentWorkflow: s.currentWorkflow ? {
          ...s.currentWorkflow,
          nodes: s.currentWorkflow.nodes.filter(n => n.id !== id),
          edges: s.currentWorkflow.edges.filter(e => e.source !== id && e.target !== id),
        } : null,
        selectedNodeIds: s.selectedNodeIds.filter(nid => nid !== id),
        isDirty: true,
      }));
    },

    updateNodeData: (id: string, data: Partial<WorkflowNode>) => {
      set(s => ({
        currentWorkflow: s.currentWorkflow ? {
          ...s.currentWorkflow,
          nodes: s.currentWorkflow.nodes.map(n => n.id === id ? { ...n, ...data } : n),
        } : null,
        isDirty: true,
      }));
    },

    updateNodePosition: (id: string, position: { x: number; y: number }) => {
      set(s => ({
        currentWorkflow: s.currentWorkflow ? {
          ...s.currentWorkflow,
          nodes: s.currentWorkflow.nodes.map(n => n.id === id ? { ...n, position } : n),
        } : null,
        isDirty: true,
      }));
    },

    addEdge: (edge: WorkflowEdge) => {
      set(s => ({
        currentWorkflow: s.currentWorkflow ? {
          ...s.currentWorkflow,
          edges: [...s.currentWorkflow.edges, edge],
        } : null,
        isDirty: true,
      }));
    },

    removeEdge: (id: string) => {
      set(s => ({
        currentWorkflow: s.currentWorkflow ? {
          ...s.currentWorkflow,
          edges: s.currentWorkflow.edges.filter(e => e.id !== id),
        } : null,
        isDirty: true,
      }));
    },

    selectNodes: (ids: string[]) => set({ selectedNodeIds: ids }),
    clearSelection: () => set({ selectedNodeIds: [], selectedEmbeddedNode: null }),
    selectEmbeddedNode: (selection) => set({ selectedEmbeddedNode: selection }),
    setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  };
}
