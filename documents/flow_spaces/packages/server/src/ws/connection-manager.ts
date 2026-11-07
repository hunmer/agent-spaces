import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { ClientNodeResponse, InteractionResponse } from '@agent-spaces/shared';
import { publishWorkspaceEvent } from '../services/notification-hub/index.js';

interface ManagedConnection {
  ws: WebSocket;
  workspaceId: string;
  clientId: string;
}

type ClientConnectedCallback = (clientId: string, ws: WebSocket) => void;
type ClientDisconnectedCallback = (clientId: string) => void;
type InteractionResponseHandler = (response: InteractionResponse, clientId: string) => void;
type ClientNodeResponseHandler = (response: ClientNodeResponse, clientId: string) => void;

const connections = new Map<WebSocket, ManagedConnection>();
const clientIdIndex = new Map<string, ManagedConnection>();

const clientConnectedCallbacks: ClientConnectedCallback[] = [];
const clientDisconnectedCallbacks: ClientDisconnectedCallback[] = [];
let interactionResponseHandler: InteractionResponseHandler | null = null;
let clientNodeResponseHandler: ClientNodeResponseHandler | null = null;

export function addConnection(ws: WebSocket, workspaceId: string): string {
  const clientId = randomUUID();
  const conn: ManagedConnection = { ws, workspaceId, clientId };
  connections.set(ws, conn);
  clientIdIndex.set(clientId, conn);
  ws.on('close', () => {
    connections.delete(ws);
    clientIdIndex.delete(clientId);
    for (const cb of clientDisconnectedCallbacks) cb(clientId);
  });
  for (const cb of clientConnectedCallbacks) cb(clientId, ws);
  return clientId;
}

export function removeConnection(ws: WebSocket) {
  const conn = connections.get(ws);
  if (conn) {
    clientIdIndex.delete(conn.clientId);
    for (const cb of clientDisconnectedCallbacks) cb(conn.clientId);
  }
  connections.delete(ws);
}

export function getClientId(ws: WebSocket): string | undefined {
  return connections.get(ws)?.clientId;
}

export function getConnectionByClientId(clientId: string): ManagedConnection | undefined {
  return clientIdIndex.get(clientId);
}

export function sendToClient(clientId: string, data: unknown): boolean {
  const conn = clientIdIndex.get(clientId);
  if (!conn || conn.ws.readyState !== 1) return false;
  conn.ws.send(JSON.stringify(data));
  return true;
}

export function onClientConnected(cb: ClientConnectedCallback) {
  clientConnectedCallbacks.push(cb);
}

export function onClientDisconnected(cb: ClientDisconnectedCallback) {
  clientDisconnectedCallbacks.push(cb);
}

export function setInteractionResponseHandler(handler: InteractionResponseHandler) {
  interactionResponseHandler = handler;
}

export function handleInteractionResponse(response: InteractionResponse, clientId: string) {
  interactionResponseHandler?.(response, clientId);
}

export function setClientNodeResponseHandler(handler: ClientNodeResponseHandler) {
  clientNodeResponseHandler = handler;
}

export function handleClientNodeResponse(response: ClientNodeResponse, clientId: string) {
  clientNodeResponseHandler?.(response, clientId);
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
