import type { ServerEventName, ClientEventName, WSEvent } from '@agent-spaces/shared';
import { getActiveServerUrl } from './server';
import { getToken } from './auth';

type EventHandler = (data: unknown) => void;

export class WorkspaceWS {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<EventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;
  private disposed = false;
  private _connected = false;
  get connected() { return this._connected; }

  constructor(readonly workspaceId: string) {
    const serverUrl = getActiveServerUrl();
    const token = getToken();
    const url = new URL('/ws', serverUrl ?? window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('workspaceId', workspaceId);
    if (token) url.searchParams.set('token', token);
    this.url = url.toString();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  connect() {
    if (this.disposed) return;
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
      return;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const socket = new WebSocket(this.url);
    this.ws = socket;

    socket.onopen = () => {
      if (this.disposed || this.ws !== socket) {
        socket.close();
        return;
      }
      this._connected = true;
      console.log('[WS] connected');
      const handlers = this.handlers.get('connected');
      if (handlers) {
        for (const h of handlers) h(undefined);
      }
    };

    socket.onmessage = (ev) => {
      if (this.disposed || this.ws !== socket) return;
      try {
        const msg = JSON.parse(ev.data) as WSEvent & { channel?: string };
        const event = msg.event || msg.channel;
        const data = msg.event ? msg.data : msg;
        if (!event) return;
        const handlers = this.handlers.get(event);
        if (handlers) {
          for (const h of handlers) h(data);
        }
        const wildcardHandlers = this.handlers.get('*');
        if (wildcardHandlers) {
          for (const h of wildcardHandlers) h({ event, data });
        }
      } catch {
        console.error('[WS] parse error');
      }
    };

    socket.onclose = (ev) => {
      if (this.ws === socket) {
        this.ws = null;
      }
      this._connected = false;
      if (this.disposed) return;
      console.log(`[WS] disconnected (${ev.code}${ev.reason ? `: ${ev.reason}` : ''}), reconnecting...`);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, 3000);
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  private onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && !this.disposed) {
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
        console.log('[WS] page visible, reconnecting...');
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        this.connect();
      }
    }
  };

  disconnect() {
    this.disposed = true;
    this._connected = false;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.ws;
    this.ws = null;
    this.handlers.clear();
    socket?.close();
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
