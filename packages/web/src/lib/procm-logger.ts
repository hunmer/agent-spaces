import { fetchWithAuth } from '@/lib/auth';

type ProcmClient = {
  connectionState: string;
  onState: (handler: (state: string) => void) => () => void;
  publish: (topic: string, payload: unknown) => string;
};

type ProcmBrowserModule = {
  createProcmClient: (options: { roomId: string; url: string; clientName: string }) => ProcmClient;
  setupLogger: (options: {
    client: ProcmClient;
    clientName: string;
    onLog?: (entry: unknown) => void;
  }) => { info: (message: string, data?: unknown) => void };
};

const BUNDLE_URL = '/sdk/procm-browser.js';
const PROCM_LOG_TOPIC = '$procm/log';
let initialized = false;

type ProcmConfig = { roomId: string; url: string };

async function resolveConfig(): Promise<ProcmConfig | null> {
  const publicRoomId = process.env.NEXT_PUBLIC_PROCM_ROOM_ID;
  const publicUrl = process.env.NEXT_PUBLIC_PROCM_WS_URL;
  if (publicRoomId && publicUrl) return { roomId: publicRoomId, url: publicUrl };

  const response = await fetchWithAuth('/api/procm-config', { cache: 'no-store' });
  if (!response.ok) throw new Error(`procm config request failed: ${response.status}`);
  const config = await response.json() as Partial<ProcmConfig>;
  return config.roomId && config.url ? { roomId: config.roomId, url: config.url } : null;
}

export async function initProcmLogger(): Promise<void> {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  const config = await resolveConfig();
  if (!config) return;

  const mod = await import(/* webpackIgnore: true */ BUNDLE_URL) as unknown as ProcmBrowserModule;
  const client = mod.createProcmClient({ ...config, clientName: 'web' });
  const pending: unknown[] = [];
  const logger = mod.setupLogger({
    client,
    clientName: 'web',
    onLog: (entry) => {
      if (client.connectionState !== 'open') pending.push(entry);
    },
  });
  client.onState((state) => {
    if (state !== 'open') return;
    for (const entry of pending.splice(0)) client.publish(PROCM_LOG_TOPIC, entry);
  });
  logger.info('[procm] web logger initialized', { roomId: config.roomId });
}
