import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

export type PluginStartupTrigger = 'server-load' | 'first-request';

export type PluginStartupConfig = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  trigger: PluginStartupTrigger;
  readyUrl?: string;
  readyTimeoutMs?: number;
};

const processes = new Map<string, ChildProcess>();
const startupPromises = new Map<string, Promise<void>>();

function resolveWorkingDirectory(pluginDir: string, configured?: string): string {
  const resolved = path.resolve(pluginDir, configured || '.');
  const relative = path.relative(pluginDir, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Plugin startup cwd must stay inside the plugin directory: ${configured}`);
  }
  return resolved;
}

async function isReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitUntilReady(pluginId: string, child: ChildProcess, url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isReady(url)) return;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Plugin startup process exited before becoming ready: ${pluginId} (${child.exitCode ?? child.signalCode})`);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Plugin startup readiness timed out after ${timeoutMs}ms: ${pluginId} (${url})`);
}

async function launchPluginSidecar(pluginId: string, pluginDir: string, config: PluginStartupConfig): Promise<void> {
  if (!config.command?.trim()) throw new Error(`Plugin startup command is required: ${pluginId}`);
  if (config.readyUrl && await isReady(config.readyUrl)) {
    console.log(`[plugin:${pluginId}] startup service already ready`);
    return;
  }

  const child = spawn(config.command, config.args || [], {
    cwd: resolveWorkingDirectory(pluginDir, config.cwd),
    env: { ...process.env, ...config.env },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processes.set(pluginId, child);

  child.stdout?.on('data', chunk => console.log(`[plugin:${pluginId}:startup] ${String(chunk).trimEnd()}`));
  child.stderr?.on('data', chunk => console.error(`[plugin:${pluginId}:startup] ${String(chunk).trimEnd()}`));
  child.once('exit', (code, signal) => {
    if (processes.get(pluginId) === child) {
      processes.delete(pluginId);
      startupPromises.delete(pluginId);
    }
    console.log(`[plugin:${pluginId}] startup process exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
  });

  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  console.log(`[plugin:${pluginId}] startup process launched pid=${child.pid ?? 'unknown'}`);

  if (config.readyUrl) {
    await waitUntilReady(pluginId, child, config.readyUrl, config.readyTimeoutMs ?? 30_000);
    console.log(`[plugin:${pluginId}] startup service ready`);
  }
}

export function ensurePluginSidecar(
  pluginId: string,
  pluginDir: string,
  config: PluginStartupConfig | undefined,
  trigger: PluginStartupTrigger,
): Promise<void> {
  if (!config || config.trigger !== trigger) return Promise.resolve();
  const existing = startupPromises.get(pluginId);
  if (existing) return existing;

  const startup = launchPluginSidecar(pluginId, pluginDir, config).catch((error) => {
    startupPromises.delete(pluginId);
    const child = processes.get(pluginId);
    if (child && child.exitCode === null) child.kill();
    processes.delete(pluginId);
    throw error;
  });
  startupPromises.set(pluginId, startup);
  return startup;
}

export function stopPluginSidecar(pluginId: string): void {
  startupPromises.delete(pluginId);
  const child = processes.get(pluginId);
  processes.delete(pluginId);
  if (child && child.exitCode === null) child.kill();
}

export function stopAllPluginSidecars(): void {
  for (const pluginId of processes.keys()) stopPluginSidecar(pluginId);
}

process.once('exit', stopAllPluginSidecars);
