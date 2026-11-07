import { randomUUID } from 'node:crypto';
import type { ClientNodeRequest, ClientNodeResponse } from '@agent-spaces/shared';
import { onClientConnected, onClientDisconnected, sendToClient, setClientNodeResponseHandler } from '../ws/connection-manager.js';

interface RequestClientNodeParams {
  clientId: string
  executionId: string
  workflowId: string
  nodeId: string
  pluginId: string
  nodeType: string
  args: Record<string, any>
  timeoutMs?: number
}

interface PendingClientNode {
  id: string
  clientId: string
  executionId: string
  workflowId: string
  nodeId: string
  pluginId: string
  nodeType: string
  payload: ClientNodeRequest
  resolve: (data: ClientNodeResponse['data']) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
  reconnectTimer?: NodeJS.Timeout
}

const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const RECONNECT_GRACE_MS = 30_000;

export class ClientNodeManager {
  private pending = new Map<string, PendingClientNode>();

  constructor() {
    setClientNodeResponseHandler((response, clientId) => {
      this.handleResponse(response, clientId);
    });
    onClientConnected((clientId) => {
      this.handleClientReconnect(clientId);
    });
    onClientDisconnected((clientId) => {
      this.handleClientDisconnect(clientId);
    });
  }

  async request(params: RequestClientNodeParams): Promise<ClientNodeResponse['data']> {
    const id = randomUUID();
    const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const payload: ClientNodeRequest = {
      id,
      channel: 'workflow:client-node',
      type: 'client_node_request',
      executionId: params.executionId,
      workflowId: params.workflowId,
      nodeId: params.nodeId,
      pluginId: params.pluginId,
      nodeType: params.nodeType,
      args: params.args,
      timeoutMs,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Client node timeout: ${params.nodeType}`));
      }, timeoutMs);

      this.pending.set(id, {
        id,
        clientId: params.clientId,
        executionId: params.executionId,
        workflowId: params.workflowId,
        nodeId: params.nodeId,
        pluginId: params.pluginId,
        nodeType: params.nodeType,
        payload,
        resolve,
        reject,
        timer,
      });

      const sent = sendToClient(params.clientId, payload);
      if (!sent) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error(`Client not connected: ${params.nodeType}`));
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

  private handleResponse(response: ClientNodeResponse, clientId: string): void {
    const pending = this.pending.get(response.id);
    if (!pending || pending.clientId !== clientId) return;

    clearTimeout(pending.timer);
    if (pending.reconnectTimer) clearTimeout(pending.reconnectTimer);
    this.pending.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
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
        pending.reject(new Error(`Client disconnected: ${pending.nodeType}`));
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
