import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { promises as fsp } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getProjectDir } from '../storage/mini-app-store.js';
import { broadcastToWorkspace } from '../ws/connection-manager.js';

export type BackgroundConfig = { entry?: string; enabled?: boolean };
type BackgroundHandler = (task: any, ctx: { projectId: string; emit: (event: string, data: unknown) => void }) => unknown | Promise<unknown>;
const handlers = new Map<string, BackgroundHandler>();

function loadHandler(projectId: string, config: BackgroundConfig = {}): BackgroundHandler {
  if (handlers.has(projectId)) return handlers.get(projectId)!;
  let handler: BackgroundHandler | undefined;
  const entry = config.entry || 'src/background.js';
  const path = join(getProjectDir(projectId), entry);
  if (existsSync(path)) {
    try {
      const code = readFileSync(path, 'utf8').replace(/^\s*import\s+.*$/gm, '').replace(/\bexport\s+default\s+/, 'module.exports = ');
      const mod = { exports: {} as any };
      new Function('module', 'exports', code)(mod, mod.exports);
      handler = typeof mod.exports === 'function' ? mod.exports : mod.exports?.onTask;
    } catch (err) { console.error(`[mini-app-background] load failed ${projectId}:`, err); }
  }
  handler ||= async (task, ctx) => {
    if (task?.type !== 'persist-images') return { ignored: true };
    const urls = Array.isArray(task.urls) ? task.urls : [];
    const directory = resolve(String(task.directory || ''));
    if (!directory || !directory.match(/^[A-Za-z]:[\\/]|^[/\\]/)) throw new Error('directory must be absolute');
    const out: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const response = await fetch(String(urls[i]));
      if (!response.ok) throw new Error(`download failed: ${response.status}`);
      const type = response.headers.get('content-type') || 'image/png';
      const ext = type.includes('jpeg') ? '.jpg' : type.includes('webp') ? '.webp' : '.png';
      const rel = `${String(task.historyId || 'generated').replace(/[^A-Za-z0-9_-]/g, '_')}/${i}${ext}`;
      const target = resolve(directory, rel);
      if (!target.startsWith(directory + '\\') && !target.startsWith(directory + '/')) throw new Error('path escapes directory');
      mkdirSync(join(target, '..'), { recursive: true });
      await fsp.writeFile(target, Buffer.from(await response.arrayBuffer()));
      out.push(target);
    }
    return { urls: out, originalUrls: urls.map(String) };
  };
  handlers.set(projectId, handler);
  return handler;
}

export function registerBackgroundService(projectId: string, config?: BackgroundConfig) {
  loadHandler(projectId, config);
  return { ok: true, projectId };
}

export function submitBackgroundTask(projectId: string, task: any, config?: BackgroundConfig) {
  const taskId = task?.taskId || randomUUID();
  const handler = loadHandler(projectId, config);
  void Promise.resolve(handler(task, { projectId, emit: (event, data) => broadcastToWorkspace(projectId, event, data) }))
    .then((result) => broadcastToWorkspace(projectId, 'miniApp.background.completed', { taskId, result }))
    .catch((error) => broadcastToWorkspace(projectId, 'miniApp.background.failed', { taskId, error: error instanceof Error ? error.message : String(error) }));
  return { accepted: true, taskId };
}

export function unloadBackgroundService(projectId: string) { handlers.delete(projectId); }
