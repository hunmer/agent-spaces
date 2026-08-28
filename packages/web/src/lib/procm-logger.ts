import { fetchWithAuth } from '@/lib/auth';

type ProcmClient = {
  memberId: string;
  connectionState: string;
  onState: (handler: (state: string) => void) => () => void;
  subscribe: (topic: string, handler: (message: { messageId: string; memberId: string }) => void) => () => void;
  publish: (topic: string, payload: unknown) => string;
};

type ProcmBrowserModule = {
  createProcmClient: (options: { roomId: string; url: string; token?: string; clientName: string }) => ProcmClient;
  setupLogger: (options: {
    client: ProcmClient;
    clientName: string;
    onLog?: (entry: unknown) => void;
  }) => { info: (message: string, data?: unknown) => void };
};

const BUNDLE_URL = '/sdk/procm-browser.js';
const PROCM_LOG_TOPIC = '$procm/log';
let initialized = false;

type ProcmConfig = { roomId: string; url: string; token?: string };

async function resolveConfig(): Promise<ProcmConfig | null> {
  const publicRoomId = process.env.NEXT_PUBLIC_PROCM_ROOM_ID;
  const publicUrl = process.env.NEXT_PUBLIC_PROCM_WS_URL;
  const publicToken = process.env.NEXT_PUBLIC_PROCM_HTTP_TOKEN;
  try {
    const response = await fetchWithAuth('/api/procm-config', { cache: 'no-store' });
    if (response.ok) {
      const config = await response.json() as Partial<ProcmConfig>;
      if (config.roomId && config.url) return config as ProcmConfig;
    }
  } catch { /* use build-time values when runtime config is unavailable */ }
  return publicRoomId && publicUrl ? { roomId: publicRoomId, url: publicUrl, token: publicToken } : null;
}

export async function initProcmLogger(): Promise<void> {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  const nativeInfo = console.info.bind(console);
  const nativeWarn = console.warn.bind(console);
  const nativeError = console.error.bind(console);

  const config = await resolveConfig();
  if (!config) {
    nativeWarn('[procm-debug] no room config; console will not publish');
    return;
  }
  nativeInfo('[procm-debug] config resolved', {
    roomId: config.roomId,
    url: config.url,
    hasToken: Boolean(config.token),
  });

  const mod = await import(/* webpackIgnore: true */ BUNDLE_URL) as unknown as ProcmBrowserModule;
  const client = mod.createProcmClient({ ...config, clientName: 'web' });
  const originalPublish = client.publish.bind(client);
  client.publish = (topic, payload) => {
    try {
      const messageId = originalPublish(topic, payload);
      nativeInfo('[procm-debug] publish sent', { topic, messageId, state: client.connectionState });
      return messageId;
    } catch (error) {
      nativeError('[procm-debug] publish failed', {
        topic,
        state: client.connectionState,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
  nativeInfo('[procm-debug] client created', { state: client.connectionState });
  client.subscribe(PROCM_LOG_TOPIC, (message) => {
    if (message.memberId !== client.memberId) return;
    nativeInfo('[procm-debug] publish acknowledged', { topic: PROCM_LOG_TOPIC, messageId: message.messageId });
  });
  const pending: unknown[] = [];
  const logger = mod.setupLogger({
    client,
    clientName: 'web',
    onLog: (entry) => {
      if (client.connectionState !== 'open') pending.push(entry);
    },
  });
  client.onState((state) => {
    nativeInfo('[procm-debug] connection state', { state, pending: pending.length });
    if (state !== 'open') return;
    for (const entry of pending.splice(0)) client.publish(PROCM_LOG_TOPIC, entry);
  });
  logger.info('[procm] web logger initialized', { roomId: config.roomId });
}
