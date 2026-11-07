import { create } from 'zustand';
import type { Workflow } from '@agent-spaces/shared';
import type { EngineStatus } from '@agent-spaces/shared';
import { getWS } from '@/lib/ws';
import type { WorkflowEditorStore } from './types';
import { createCrudSlice } from './crud';
import { createEditSlice } from './edit';
import { createExecutionSlice } from './execution';
import { createExecutionLogsSlice } from './execution-logs';
import { createVersionsSlice } from './versions';
import { createStagingSlice } from './staging';
import { createUndoRedoSlice } from './undo-redo';
import { createGroupsSlice } from './groups';
import { createInteractionSlice } from './interaction';

export type { WorkflowChanges, EmbeddedSelection, WorkflowEditorStore } from './types';

function createWorkflowEditorStore(workspaceId: string) {
  const prePreviewRef: { current: Workflow | null } = { current: null };

  const store = create<WorkflowEditorStore>((set, get) => ({
    workspaceId,
    ...createCrudSlice(set, get),
    ...createEditSlice(set, get),
    ...createExecutionSlice(set, get),
    ...createExecutionLogsSlice(set, get, prePreviewRef),
    ...createVersionsSlice(set, get),
    ...createStagingSlice(set, get),
    ...createUndoRedoSlice(set, get),
    ...createGroupsSlice(set, get),
    ...createInteractionSlice(set, get),
  }));

  // Setup WS event listeners
  const ws = getWS(workspaceId);

  const executionEvents = [
    'workflow:execute:result',
    'workflow:execute:error',
    'workflow:pause:result',
    'workflow:pause:error',
    'workflow:resume:result',
    'workflow:resume:error',
    'workflow:stop:result',
    'workflow:stop:error',
    'workflow:debug-node:result',
    'workflow:debug-node:error',
  ];

  for (const evt of executionEvents) {
    ws.on(evt, (data: unknown) => {
      const d = data as Record<string, unknown>;
      const st = store.getState();
      if (evt === 'workflow:execute:result') {
        st.loadExecutionLogs();
        if (d?.status) {
          store.setState({ executionStatus: d.status as EngineStatus });
        }
      }
      if (evt === 'workflow:execute:error') {
        store.setState({ executionStatus: 'error' });
      }
      if (evt.startsWith('workflow:debug-node:')) {
        const nodeId = st.debugNodeId;
        if (nodeId) {
          if (evt === 'workflow:debug-node:result') {
            store.setState(s => ({
              debugNodeStatus: { ...s.debugNodeStatus, [nodeId]: 'completed' },
              debugNodeResult: { ...s.debugNodeResult, [nodeId]: d },
              debugNodeId: null,
            }));
          } else {
            store.setState(s => ({
              debugNodeStatus: { ...s.debugNodeStatus, [nodeId]: 'error' },
              debugNodeId: null,
            }));
          }
        }
      }
    });
  }

  return store;
}

// ---- Store registry (per workspace) ----

const storeRegistry = new Map<string, ReturnType<typeof createWorkflowEditorStore>>();

export function getWorkflowEditorStore(workspaceId: string) {
  let store = storeRegistry.get(workspaceId);
  if (!store) {
    store = createWorkflowEditorStore(workspaceId);
    storeRegistry.set(workspaceId, store);
  }
  return store;
}

export function disposeWorkflowEditorStore(workspaceId: string) {
  storeRegistry.delete(workspaceId);
}
