import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getProjectDir } from '../storage/mini-app-store.js';
import * as miniAppStore from '../storage/mini-app-store.js';
import { broadcastToWorkspace } from '../ws/connection-manager.js';
import { executePluginTool } from './plugin.js';
import { createBuiltinPluginApi } from './plugin-runtime-api.js';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentRuntimeConfig, AgentRuntimeEvent, AgentFunctionTool } from '../adapters/agent-runtime-types.js';
import { createMiniAppFunctionTools } from './builtin-tools/mini-app-tools.js';
import { listPresets } from './agent.js';

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

export interface ResolvedAgentCredentials {
  modelProvider?: string;
  modelId?: string;
  apiKey?: string;
  apiBase?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * 解析 agent 凭据优先级（spec §5.2）：
 * 1. agentId → 从 presets 提取 modelProvider/modelId/apiKey/apiBase 作为默认
 * 2. entry 本地字段覆盖 preset 值
 * 3. systemPrompt：entry 本地为准，缺失才用 preset
 * 4. 全都没有 → 返回空对象，调用方走服务端默认模型兜底
 */
export function resolveAgentCredentials(
  entry: {
    agentId?: string;
    modelProvider?: string;
    modelId?: string;
    apiKey?: string;
    apiBase?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  },
  presets: Array<{
    id: string;
    modelProvider?: string;
    modelId?: string;
    apiKey?: string;
    apiBase?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }>,
): ResolvedAgentCredentials {
  const preset = entry.agentId ? presets.find((p) => p.id === entry.agentId) : undefined;
  return {
    modelProvider: entry.modelProvider ?? preset?.modelProvider,
    modelId: entry.modelId ?? preset?.modelId,
    apiKey: entry.apiKey ?? preset?.apiKey,
    apiBase: entry.apiBase ?? preset?.apiBase,
    systemPrompt: entry.systemPrompt ?? preset?.systemPrompt,
    temperature: entry.temperature ?? preset?.temperature,
    maxTokens: entry.maxTokens ?? preset?.maxTokens,
  };
}

export interface MiniAppAgentRunInput {
  projectId: string;
  agentId: string;
  sessionId: string;
  message: string;
  route?: string;
  /** SSE 事件回调 */
  onEvent: (event: AgentRuntimeEvent) => void;
  /** 取消信号：abort 时调 runtime.stop() */
  stopSignal?: AbortSignal;
}

export interface MiniAppAgentRunOutput {
  userMessage: miniAppStore.MiniAppChatMessage;
  agentMessage: miniAppStore.MiniAppChatMessage;
}

/**
 * 自包含执行路径：读 agents.json → 解析凭据 → 组装 functionTools（plugin + api.js）
 * → 注入路由/方法清单/systemPrompt → langchain execute → 落盘 user+agent 消息。
 * 不依赖 workspace。
 */
export async function runMiniAppAgent(input: MiniAppAgentRunInput): Promise<MiniAppAgentRunOutput> {
  const { projectId, agentId, sessionId, message, route, onEvent, stopSignal } = input;

  const project = miniAppStore.getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  if (!project.enableAgents) throw new Error('Agents not enabled for this project');

  const configs = miniAppStore.readAgentsConfig(projectId);
  if (!configs) throw new Error('agents.json not found');
  const entry = configs.find((c: any) => c && c.id === agentId) as
    | {
        id: string; name: string; avatar?: string; agentId?: string;
        modelProvider?: string; modelId?: string; apiKey?: string; apiBase?: string;
        systemPrompt?: string; temperature?: number; maxTokens?: number;
        tools?: { api?: boolean; plugin?: boolean };
      }
    | undefined;
  if (!entry) throw new Error(`Agent not found in agents.json: ${agentId}`);

  const creds = resolveAgentCredentials(entry, listPresets('') as any);

  const runtimeConfig: AgentRuntimeConfig = {
    kind: 'langchain',
    ...(creds.modelProvider ? { provider: creds.modelProvider as AgentRuntimeConfig['provider'] } : {}),
    ...(creds.modelId ? { model: creds.modelId } : {}),
    ...(creds.apiKey ? { apiKey: creds.apiKey } : {}),
    ...(creds.apiBase ? { baseURL: creds.apiBase } : {}),
  };
  const runtime = createAgentRuntime(runtimeConfig);
  const onAbort = () => runtime.stop();
  if (stopSignal) stopSignal.addEventListener('abort', onAbort, { once: true });

  try {
  // 组装 functionTools
  const functionTools: AgentFunctionTool[] = [];
  const toolsCfg = entry.tools ?? { api: true, plugin: true };
  if (toolsCfg.plugin) {
    functionTools.push(...createMiniAppFunctionTools({
      enabledPlugins: project.enabledPlugins ?? [],
    }));
  }
  let apiMethodNames: string[] = [];
  if (toolsCfg.api) {
    const apiMethods = loadApiJs(projectId);
    apiMethodNames = Object.keys(apiMethods);
    if (apiMethodNames.length) {
      const ctxProvider = () => makeApiCtx(projectId);
      functionTools.push(...buildApiFunctionTools(apiMethods, ctxProvider));
    }
  }

  // 拼 systemPrompt
  const sections: string[] = [];
  if (creds.systemPrompt) sections.push(creds.systemPrompt);
  sections.push(`Current mini-app route: ${route ?? '/'}`);
  if (apiMethodNames.length) {
    sections.push(`Available project api.js methods: ${apiMethodNames.join(', ')}. ` +
      `Call them to control the UI (they broadcast events the UI reacts to).`);
  }
  if (project.enabledPlugins?.length) {
    sections.push(`Enabled plugins: ${project.enabledPlugins.join(', ')}. ` +
      `Use list_plugin_tools / get_plugin_tool_detail / execute_plugin_tool.`);
  }
  const systemPrompt = sections.join('\n\n');

  // 执行
  const output: string[] = [];
  const result = await runtime.execute(message, getProjectDir(projectId), {
    systemPrompt,
    functionTools,
    maxTurns: 20,
    onEvent: (event) => {
      onEvent(event);
      if (event.type === 'output') output.push(event.line);
    },
  });

  const now = new Date().toISOString();
  const userMessage: miniAppStore.MiniAppChatMessage = {
    id: randomUUID(), sessionId, agentId, role: 'user',
    content: message, route, timestamp: now,
  };
  const agentContent = result.success
    ? (result.output.join('\n').trim() || result.summary)
    : `Error: ${result.error ?? result.summary}`;
  const agentMessage: miniAppStore.MiniAppChatMessage = {
    id: randomUUID(), sessionId, agentId, role: 'agent',
    content: agentContent, route, timestamp: new Date().toISOString(),
  };
  miniAppStore.saveAgentChat(projectId, userMessage);
  miniAppStore.saveAgentChat(projectId, agentMessage);

  return { userMessage, agentMessage };
  } finally {
    if (stopSignal) stopSignal.removeEventListener('abort', onAbort);
  }
}
