import type { WebSocket } from 'ws';
import { publishWorkspaceEvent } from '../services/notification-hub/index.js';

interface ManagedConnection {
  ws: WebSocket;
  workspaceId: string;
}

const connections = new Map<WebSocket, ManagedConnection>();

export function addConnection(ws: WebSocket, workspaceId: string) {
  connections.set(ws, { ws, workspaceId });
  ws.on('close', () => connections.delete(ws));
}

export function removeConnection(ws: WebSocket) {
  connections.delete(ws);
}

export function getConnectionsByWorkspace(workspaceId: string): WebSocket[] {
  const result: WebSocket[] = [];
  for (const [ws, conn] of connections) {
    if (conn.workspaceId === workspaceId) result.push(ws);
  }
  return result;
}

export function broadcastToWorkspace(workspaceId: string, event: string, data: unknown) {
  const payload = JSON.stringify({
    event,
    workspaceId,
    timestamp: new Date().toISOString(),
    data,
  });
  for (const ws of getConnectionsByWorkspace(workspaceId)) {
    if (ws.readyState === 1) ws.send(payload);
  }
  publishWorkspaceEvent(workspaceId, event, data);
}

export function broadcastToAll(event: string, data: unknown) {
  if (connections.size === 0) return;
  const payload = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data,
  });
  for (const [ws] of connections) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

export function getConnectionCount() {
  return connections.size;
}
