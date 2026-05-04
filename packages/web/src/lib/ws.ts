import type { ServerEventName, ClientEventName, WSEvent } from '@agent-spaces/shared';
import { getActiveServerUrl } from './server';

type EventHandler = (data: unknown) => void;

export class WorkspaceWS {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<EventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;

  constructor(readonly workspaceId: string) {
    const serverUrl = getActiveServerUrl();
    if (serverUrl) {
      const wsProtocol = serverUrl.startsWith('https') ? 'wss' : 'ws';
      const wsBase = serverUrl.replace(/^https?/, wsProtocol);
      this.url = `${wsBase}/ws?workspaceId=${workspaceId}`;
    } else {
      const port = process.env.NEXT_PUBLIC_WS_PORT || '3100';
      this.url = `ws://localhost:${port}/ws?workspaceId=${workspaceId}`;
    }
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('[WS] connected');
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WSEvent;
        const handlers = this.handlers.get(msg.event);
        if (handlers) {
          for (const h of handlers) h(msg.data);
        }
      } catch {
        console.error('[WS] parse error');
      }
    };

    this.ws.onclose = () => {
      console.log('[WS] disconnected, reconnecting...');
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  send(event: ClientEventName, data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }));
    }
  }

  on(event: ServerEventName | string, handler: EventHandler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  off(event: string, handler: EventHandler) {
    this.handlers.get(event)?.delete(handler);
  }
}

let instance: WorkspaceWS | null = null;

export function getWS(workspaceId: string): WorkspaceWS {
  if (instance && instance.workspaceId !== workspaceId) {
    instance.disconnect();
    instance = null;
  }
  if (!instance) {
    instance = new WorkspaceWS(workspaceId);
    instance.connect();
  }
  return instance;
}

export function disconnectWS() {
  instance?.disconnect();
  instance = null;
}
