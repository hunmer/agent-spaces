import type { WorkflowGroup } from '@agent-spaces/shared';
import type { WorkflowEditorStore, SetFn, GetFn } from './types';

export interface GroupsSlice {
  createGroup: (name: string, childNodeIds: string[]) => void;
  removeGroup: (id: string) => void;
  toggleGroupLock: (id: string) => void;
  toggleGroupDisabled: (id: string) => void;
}

export function createGroupsSlice(
  set: SetFn,
  get: GetFn,
): GroupsSlice {
  return {
    createGroup: (name: string, childNodeIds: string[]) => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      get().pushUndo('创建分组');
      const group: WorkflowGroup = {
        id: `group_${Date.now()}`,
        name,
        childNodeIds,
        childGroupIds: [],
        locked: false,
        disabled: false,
        savedNodeStates: {},
      };
      set(s => ({
        currentWorkflow: s.currentWorkflow ? {
          ...s.currentWorkflow,
          groups: [...(s.currentWorkflow.groups || []), group],
        } : null,
        isDirty: true,
      }));
    },

    removeGroup: (id: string) => {
      get().pushUndo('删除分组');
      set(s => ({
        currentWorkflow: s.currentWorkflow ? {
          ...s.currentWorkflow,
          groups: (s.currentWorkflow.groups || []).filter(g => g.id !== id),
        } : null,
        isDirty: true,
      }));
    },

    toggleGroupLock: (id: string) => {
      set(s => ({
        currentWorkflow: s.currentWorkflow ? {
          ...s.currentWorkflow,
          groups: (s.currentWorkflow.groups || []).map(g =>
            g.id === id ? { ...g, locked: !g.locked } : g
          ),
        } : null,
        isDirty: true,
      }));
    },

    toggleGroupDisabled: (id: string) => {
      const wf = get().currentWorkflow;
      if (!wf) return;
      const groups = wf.groups || [];
      const group = groups.find(g => g.id === id);
      if (!group) return;
      get().pushUndo('切换分组禁用');
      const newDisabled = !group.disabled;
      const savedNodeStates = { ...group.savedNodeStates };

      if (newDisabled) {
        for (const nid of group.childNodeIds) {
          const node = wf.nodes.find(n => n.id === nid);
          if (node) savedNodeStates[nid] = node.nodeState || 'normal';
        }
      }

      set(s => ({
        currentWorkflow: s.currentWorkflow ? {
          ...s.currentWorkflow,
          groups: groups.map(g => g.id === id ? { ...g, disabled: newDisabled, savedNodeStates } : g),
          nodes: newDisabled
            ? s.currentWorkflow.nodes.map(n =>
                group.childNodeIds.includes(n.id) ? { ...n, nodeState: 'disabled' as const } : n
              )
            : s.currentWorkflow.nodes.map(n =>
                group.childNodeIds.includes(n.id)
                  ? { ...n, nodeState: savedNodeStates[n.id] || 'normal' as const }
                  : n
              ),
        } : null,
        isDirty: true,
      }));
    },
  };
}
