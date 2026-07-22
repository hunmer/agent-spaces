import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import chokidar from 'chokidar';
import { getProjectDir } from '../storage/mini-app-store.js';
import * as miniAppStore from '../storage/mini-app-store.js';
import { getDataDir } from '../storage/json-store.js';
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

let watcherStarted = false;
const pendingReload = new Map<string, NodeJS.Timeout>();

/**
 * 启动 services 文件监听：任一项目的 `src/services/*.{js,mjs,cjs}` 增删改后，
 * 自动 reload 该项目的 registry，无需重启服务。
 *
 * - 只启动一次（幂等），在 server.listen 回调里调用。
 * - 从相对路径第一段反解 projectId（mini-apps/<projectId>/src/services/...）。
 * - 同一次保存可能触发多次事件，按 projectId debounce 200ms 合并 reload。
 */
export function startServicesWatcher(): void {
  if (watcherStarted) return;
  watcherStarted = true;

  const root = join(getDataDir(), 'mini-apps');
  if (!existsSync(root)) return;

  const scheduleReload = (projectId: string) => {
    const existing = pendingReload.get(projectId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      pendingReload.delete(projectId);
      reloadServices(projectId);
      console.log(`[mini-app-services] reloaded services for ${projectId}`);
    }, 200);
    pendingReload.set(projectId, timer);
  };

  chokidar
    .watch(['*.js', '*.mjs', '*.cjs'].map((p) => `*/src/services/${p}`), {
      cwd: root,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    })
    .on('all', (_event, changedPath) => {
      if (!changedPath) return;
      // chokidar 返回相对 cwd 的路径，分隔符可能为 \ 或 /，统一兼容
      const projectId = changedPath.split(/[\\/]/)[0];
      if (!projectId) return;
      // 仅对已加载过 registry 的项目重载，避免为未使用的项目空跑
      if (registries.has(projectId)) scheduleReload(projectId);
    });
  console.log('[mini-app-services] services file watcher started');
}

/**
 * 服务器启动检查：遍历所有 mini-app 项目，若某项目尚未落地 agents.json，
 * 但其 manifest 声明了 `agents` 种子数组，则把种子写入 agents.json。
 *
 * - 已存在 agents.json 的项目一律跳过 —— 绝不覆盖用户既有配置（哪怕文件损坏）。
 * - 无种子（manifest 未声明 agents 或为空数组）的项目跳过。
 * - 首次落地只写 agents.json，不改 manifest.updatedAt（后台初始化，无副作用）。
 *
 * 这样预览页 agent 对话（读 agents.json）在项目首次启用时即可用，
 * 用户无需手动创建 agents.json。
 */
export function ensureAgentsConfigs(): void {
  const projects = miniAppStore.listProjects();
  for (const project of projects) {
    if (miniAppStore.agentsConfigExists(project.id)) continue;
    const agents = project.agents;
    if (!Array.isArray(agents) || agents.length === 0) continue;
    miniAppStore.writeAgentsConfig(project.id, agents);
    console.log(
      `[mini-app-services] initialized agents.json for ${project.id} (${agents.length} agent(s)) from manifest seed`,
    );
  }
}
