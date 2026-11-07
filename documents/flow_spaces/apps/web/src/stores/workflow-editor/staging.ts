import type { StagedNode } from '@agent-spaces/shared';
import { stagingApi } from '@/lib/workflow-api';
import type { WorkflowEditorStore, SetFn, GetFn } from './types';

export interface StagingSlice {
  stagedNodes: StagedNode[];
  loadStagedNodes: () => Promise<void>;
  copyNodeToStaging: (nodeId: string) => Promise<void>;
  moveNodeToStaging: (nodeId: string) => Promise<void>;
  removeStagedNode: (id: string) => Promise<void>;
  clearStagedNodes: () => Promise<void>;
  pasteStagedNode: (stagedNode: StagedNode) => void;
}

export function createStagingSlice(
  set: SetFn,
  get: GetFn,
): StagingSlice {
  return {
    stagedNodes: [],

    loadStagedNodes: async () => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      try {
        const nodes = await stagingApi.load(wf.id);
        set({ stagedNodes: nodes });
      } catch {}
    },

    copyNodeToStaging: async (nodeId: string) => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      const node = wf.nodes.find(n => n.id === nodeId);
      if (!node) return;
      const staged: StagedNode = {
        id: `staged_${Date.now()}`,
        sourceNodeId: node.id,
        type: node.type,
        label: node.label,
        data: JSON.parse(JSON.stringify(node.data)),
        composite: node.composite ? JSON.parse(JSON.stringify(node.composite)) : undefined,
        stagedAt: Date.now(),
      };
      const newNodes = [...get().stagedNodes, staged];
      await stagingApi.save(wf.id, newNodes);
      set({ stagedNodes: newNodes });
    },

    moveNodeToStaging: async (nodeId: string) => {
      await get().copyNodeToStaging(nodeId);
      get().removeNode(nodeId);
    },

    removeStagedNode: async (id: string) => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      const newNodes = get().stagedNodes.filter(n => n.id !== id);
      await stagingApi.save(wf.id, newNodes);
      set({ stagedNodes: newNodes });
    },

    clearStagedNodes: async () => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      await stagingApi.clear(wf.id);
      set({ stagedNodes: [] });
    },

    pasteStagedNode: (stagedNode: StagedNode) => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      const nodes = wf.nodes;
      let position = { x: 200, y: 200 };
      if (nodes.length > 0) {
        const avgX = nodes.reduce((s, n) => s + n.position.x, 0) / nodes.length;
        const avgY = nodes.reduce((s, n) => s + n.position.y, 0) / nodes.length;
        position = { x: Math.round(avgX) + 30, y: Math.round(avgY) + 30 };
      }
      const newNode = get().addNode(stagedNode.type, position);
      if (newNode) {
        newNode.data = JSON.parse(JSON.stringify(stagedNode.data));
        newNode.label = stagedNode.label;
      }
    },
  };
}
