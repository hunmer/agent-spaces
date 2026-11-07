// Workflow interaction manager — handles client-side UI interactions
// (alert/prompt/form/table_confirm) during workflow execution.

import { randomUUID } from 'node:crypto';
import type { InteractionRequest, InteractionResponse, InteractionType } from '@agent-spaces/shared';
import { sendToClient, onClientConnected, onClientDisconnected, setInteractionResponseHandler } from '../ws/connection-manager.js';

interface RequestInteractionParams {
  clientId: string
  executionId: string
  workflowId: string
  nodeId: string
  interactionType: InteractionType
  schema: unknown
  timeoutMs?: number
}

interface PendingInteraction {
  id: string
  clientId: string
  executionId: string
  workflowId: string
  nodeId: string
  interactionType: InteractionType
  payload: InteractionRequest
  resolve: (data: InteractionResponse['data']) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
  reconnectTimer?: NodeJS.Timeout
}

const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const RECONNECT_GRACE_MS = 30_000;

export class InteractionManager {
  private pending = new Map<string, PendingInteraction>();

  constructor() {
    setInteractionResponseHandler((response, clientId) => {
      this.handleResponse(response, clientId);
    });
    onClientConnected((clientId) => {
      this.handleClientReconnect(clientId);
    });
    onClientDisconnected((clientId) => {
      this.handleClientDisconnect(clientId);
    });
  }

  async request(params: RequestInteractionParams): Promise<InteractionResponse['data']> {
    const id = randomUUID();
    const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const payload: InteractionRequest = {
      id,
      channel: 'workflow:interaction',
      type: 'interaction_required',
      executionId: params.executionId,
      workflowId: params.workflowId,
      nodeId: params.nodeId,
      interactionType: params.interactionType,
      schema: params.schema,
      timeoutMs,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Interaction timeout: ${params.interactionType}`));
      }, timeoutMs);

      this.pending.set(id, {
        id,
        clientId: params.clientId,
        executionId: params.executionId,
        workflowId: params.workflowId,
        nodeId: params.nodeId,
        interactionType: params.interactionType,
        payload,
        resolve,
        reject,
        timer,
      });

      const sent = sendToClient(params.clientId, payload);
      if (!sent) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error(`Client not connected: ${params.interactionType}`));
      }
    });
  }

  cancelExecution(executionId: string, message = 'Execution stopped'): number {
    let cancelled = 0;
    for (const [id, pending] of this.pending.entries()) {
      if (pending.executionId !== executionId) continue;
      this.pending.delete(id);
      clearTimeout(pending.timer);
      if (pending.reconnectTimer) clearTimeout(pending.reconnectTimer);
      pending.reject(new Error(message));
      cancelled += 1;
    }
    return cancelled;
  }

  private handleResponse(response: InteractionResponse, clientId: string): void {
    const pending = this.pending.get(response.id);
    if (!pending || pending.clientId !== clientId) return;

    clearTimeout(pending.timer);
    if (pending.reconnectTimer) clearTimeout(pending.reconnectTimer);
    this.pending.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
      return;
    }
    if (response.cancelled) {
      pending.reject(new Error(`Interaction cancelled: ${pending.interactionType}`));
      return;
    }
    pending.resolve(response.data);
  }

  private handleClientDisconnect(clientId: string): void {
    for (const [id, pending] of this.pending.entries()) {
      if (pending.clientId !== clientId || pending.reconnectTimer) continue;
      pending.reconnectTimer = setTimeout(() => {
        this.pending.delete(id);
        clearTimeout(pending.timer);
        pending.reject(new Error(`Client disconnected: ${pending.interactionType}`));
      }, RECONNECT_GRACE_MS);
    }
  }

  private handleClientReconnect(clientId: string): void {
    for (const pending of this.pending.values()) {
      if (pending.clientId !== clientId) continue;
      if (pending.reconnectTimer) {
        clearTimeout(pending.reconnectTimer);
        pending.reconnectTimer = undefined;
      }
      sendToClient(clientId, pending.payload);
    }
  }
}
