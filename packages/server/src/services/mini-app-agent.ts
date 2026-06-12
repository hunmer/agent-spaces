import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectDir } from '../storage/mini-app-store.js';
import * as miniAppStore from '../storage/mini-app-store.js';
import { broadcastToWorkspace } from '../ws/connection-manager.js';
import { executePluginTool } from './plugin.js';
import { createBuiltinPluginApi } from './plugin-runtime-api.js';
import type { AgentFunctionTool } from '../adapters/agent-runtime-types.js';

export interface ApiCtx {
  projectId: string;
  broadcast(event: string, data: unknown): void;
  callPluginTool(pluginId: string, toolName: string, args: Record<string, unknown>): Promise<unknown>;
  readConfig(path: string): unknown | null;
  writeConfig(path: string, value: unknown): void;
}

export type ApiHandler = (input: Record<string, unknown>, ctx: ApiCtx) => unknown | Promise<unknown>;

/**
 * 编译 src/api.js：剥离 import 行（api.js 不依赖外部模块），把 ESM `export default`
 * 转 CJS `module.exports =`，在沙箱求值。默认导出应为 { methodName: handler }。
 * 复用 services 的编译约定（见 mini-app-services.ts）。
 */
export function compileApiJs(code: string): Record<string, ApiHandler> {
  let moduleObj: { exports: unknown };
  try {
    const stripped = code
      .replace(/^\s*import\s+.*$/gm, '')
      .replace(/\bexport\s+default\s+/, 'module.exports = ');
    moduleObj = { exports: {} };
    const fn = new Function('module', 'exports', stripped);
    fn(moduleObj, moduleObj.exports);
  } catch {
    return {};
  }
  const exported = moduleObj.exports;
  if (!exported || typeof exported !== 'object') return {};
  const handlers: Record<string, ApiHandler> = {};
  for (const [name, h] of Object.entries(exported as Record<string, unknown>)) {
    if (typeof h === 'function') handlers[name] = h as ApiHandler;
  }
  return handlers;
}

/** 从项目目录加载 src/api.js 并编译为方法表。文件缺失返回 {}。 */
export function loadApiJs(projectId: string): Record<string, ApiHandler> {
  const filePath = join(getProjectDir(projectId), 'src', 'api.js');
  if (!existsSync(filePath)) return {};
  try {
    return compileApiJs(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`[mini-app-agent] failed to load src/api.js:`, err instanceof Error ? err.message : err);
    return {};
  }
}

export function makeApiCtx(projectId: string): ApiCtx {
  return {
    projectId,
    broadcast: (event, data) => broadcastToWorkspace(projectId, event, data),
    callPluginTool: (pluginId, toolName, args) =>
      executePluginTool(pluginId, toolName, args, createBuiltinPluginApi()),
    readConfig: (path) => miniAppStore.readConfig(projectId, path),
    writeConfig: (path, value) => miniAppStore.writeConfig(projectId, path, value),
  };
}

/**
 * 把 api.js 方法表包装成 AgentFunctionTool[]。第一版 inputSchema 为空 object
 * （无参 / 简单 object，不做参数描述——见 spec §7.2 限制说明）。
 */
export function buildApiFunctionTools(
  methods: Record<string, ApiHandler>,
  ctxProvider: () => ApiCtx,
): AgentFunctionTool[] {
  return Object.entries(methods).map(([name, handler]) => ({
    name,
    description: `${name} (project-defined api.js method)`,
    inputSchema: { type: 'object', properties: {} },
    execute: async (input) => {
      const record = input && typeof input === 'object' && !Array.isArray(input)
        ? input as Record<string, unknown>
        : {};
      return handler(record, ctxProvider());
    },
  }));
}
