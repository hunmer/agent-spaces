import { getWS } from '@/lib/ws';
import type { WorkflowEditorStore, PendingInteraction, SetFn, GetFn } from './types';

export interface InteractionSlice {
  pendingInteraction: PendingInteraction | null;
  listenForUIInteractions: () => () => void;
  resolveInteraction: (data: unknown) => void;
}

export function createInteractionSlice(
  set: SetFn,
  get: GetFn,
): InteractionSlice {
  return {
    pendingInteraction: null,

    listenForUIInteractions: () => {
      const ws = getWS(get().workspaceId);
      const handler = (data: unknown) => {
        set({ pendingInteraction: data as PendingInteraction });
      };
      ws.on('workflow:interaction', handler);
      return () => ws.off('workflow:interaction', handler);
    },

    resolveInteraction: (data: unknown) => {
      const pending = get().pendingInteraction;
      if (pending) {
        const ws = getWS(get().workspaceId);
        ws.send('workflow:interaction', {
          id: pending.id,
          channel: 'workflow:interaction',
          type: 'interaction_response',
          executionId: pending.executionId,
          workflowId: pending.workflowId,
          nodeId: pending.nodeId,
          data,
        });
      }
      set({ pendingInteraction: null });
    },
  };
}
