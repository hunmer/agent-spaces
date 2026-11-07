import { randomUUID } from 'node:crypto';
import { broadcastToWorkspace } from '../ws/connection-manager.js';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

const pendingRequests = new Map<string, PendingRequest>();

export function requestMiniAppClient(projectId: string, type: string, payload?: unknown, timeoutMs = 5000): Promise<unknown> {
  const requestId = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`Mini-app client request timed out: ${type}`));
    }, timeoutMs);
    pendingRequests.set(requestId, { resolve, reject, timer });
    broadcastToWorkspace(projectId, 'miniApp.clientRequest', { requestId, type, payload });
  });
}

export function handleMiniAppClientResponse(data: unknown): void {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  const response = data as { requestId?: unknown; ok?: unknown; result?: unknown; error?: unknown };
  if (typeof response.requestId !== 'string') return;
  const pending = pendingRequests.get(response.requestId);
  if (!pending) return;

  pendingRequests.delete(response.requestId);
  clearTimeout(pending.timer);
  if (response.ok === false) {
    pending.reject(new Error(typeof response.error === 'string' ? response.error : 'Mini-app client request failed'));
    return;
  }
  pending.resolve(response.result);
}
