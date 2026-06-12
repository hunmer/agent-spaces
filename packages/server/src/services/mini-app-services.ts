import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectDir } from '../storage/mini-app-store.js';
import * as miniAppStore from '../storage/mini-app-store.js';
import { broadcastToWorkspace } from '../ws/connection-manager.js';
import { listTasks } from './mini-app-tasks.js';

export type ServiceHandler = (payload: any, ctx: MiniAppServiceContext) => unknown | Promise<unknown>;

export interface MiniAppServiceContext {
  projectId: string;
  /** 读取 configs/<path>（不广播，读无副作用） */
  readConfig(path: string): unknown | null;
  /** 写 configs/<path>，随后广播 miniApp.configChanged 给该频道所有客户端 */
  writeConfig(path: string, value: unknown): void;
  /** 原子读-改-写：updater(prev) => next；写回后广播 configChanged；返回新值 */
  updateConfig(path: string, updater: (prev: unknown) => unknown): unknown;
  /** 当前正在进行的任务（含 executorId），供客户端按发起者过滤显示队列 */
  listRunningTasks(): unknown[];
  /** 向该 projectId 频道广播任意事件 */
  broadcast(event: string, data: unknown): void;
}

const registries = new Map<string, Map<string, ServiceHandler>>();

function servicesDir(projectId: string): string {
  return join(getProjectDir(projectId), 'src', 'services');
}

/**
 * 编译单个 service 文件：剥离 import 行（services 不依赖外部模块），
 * 把 ESM `export default` 转为 CJS `module.exports =`，在沙箱里求值。
 * 默认导出应为 { eventName: handler }。
 */
function compileService(code: string): Record<string, ServiceHandler> {
  const stripped = code
    .replace(/^\s*import\s+.*$/gm, '')
    .replace(/\bexport\s+default\s+/, 'module.exports = ');
  const moduleObj = { exports: {} as Record<string, unknown> };
  const fn = new Function('module', 'exports', stripped);
  fn(moduleObj, moduleObj.exports);
  const exported = moduleObj.exports;
  if (!exported || typeof exported !== 'object') return {};
  const handlers: Record<string, ServiceHandler> = {};
  for (const [name, h] of Object.entries(exported)) {
    if (typeof h === 'function') handlers[name] = h as ServiceHandler;
  }
  return handlers;
}

function loadRegistry(projectId: string): Map<string, ServiceHandler> {
  const cached = registries.get(projectId);
  if (cached) return cached;

  const registry = new Map<string, ServiceHandler>();
  const dir = servicesDir(projectId);
  if (existsSync(dir)) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() || !/\.(js|mjs|cjs)$/.test(entry.name)) continue;
      try {
        const code = readFileSync(join(dir, entry.name), 'utf-8');
        const handlers = compileService(code);
        for (const [name, h] of Object.entries(handlers)) registry.set(name, h);
      } catch (err) {
        console.error(`[mini-app-services] failed to load ${entry.name}:`, err instanceof Error ? err.message : err);
      }
    }
  }
  registries.set(projectId, registry);
  return registry;
}

function makeContext(projectId: string): MiniAppServiceContext {
  return {
    projectId,
    readConfig: (path) => miniAppStore.readConfig(projectId, path),
    writeConfig: (path, value) => {
      miniAppStore.writeConfig(projectId, path, value);
      broadcastToWorkspace(projectId, 'miniApp.configChanged', { path, value });
    },
    updateConfig: (path, updater) => {
      const prev = miniAppStore.readConfig(projectId, path);
      const next = updater(prev);
      miniAppStore.writeConfig(projectId, path, next);
      broadcastToWorkspace(projectId, 'miniApp.configChanged', { path, value: next });
      return next;
    },
    listRunningTasks: () => listTasks(projectId).filter((t) => t.status === 'running'),
    broadcast: (event, data) => broadcastToWorkspace(projectId, event, data),
  };
}

/** 调用某项目的 service handler。handler 不存在则抛错。 */
export async function invokeService(projectId: string, name: string, payload: unknown): Promise<unknown> {
  const registry = loadRegistry(projectId);
  const handler = registry.get(name);
  if (!handler) throw new Error(`Service handler not found: ${name}`);
  const ctx = makeContext(projectId);
  return await handler(payload, ctx);
}

/** 项目删除/卸载时清理缓存。 */
export function unloadServices(projectId: string): void {
  registries.delete(projectId);
}

/** services 文件变更后重载（预留：file watcher 或手动刷新调用）。 */
export function reloadServices(projectId: string): void {
  registries.delete(projectId);
  loadRegistry(projectId);
}
