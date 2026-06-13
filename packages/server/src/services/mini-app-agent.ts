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
import { listProviders } from '../storage/llm-store.js';

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
 *
 * 同时提取方法上方的 JSDoc 注释，解析 `@param {type} name - description` 生成
 * JSON Schema 参数描述，供 buildApiFunctionTools 注入到 inputSchema。
 */
export function compileApiJs(code: string): {
  handlers: Record<string, ApiHandler>;
  schemas: Record<string, { description?: string; inputSchema: Record<string, unknown> }>;
} {
  const schemas = extractParamSchemas(code);
  let moduleObj: { exports: unknown };
  try {
    const stripped = code
      .replace(/^\s*import\s+.*$/gm, '')
      .replace(/\bexport\s+default\s+/, 'module.exports = ');
    moduleObj = { exports: {} };
    const fn = new Function('module', 'exports', stripped);
    fn(moduleObj, moduleObj.exports);
  } catch {
    return { handlers: {}, schemas: {} };
  }
  const exported = moduleObj.exports;
  if (!exported || typeof exported !== 'object') return { handlers: {}, schemas: {} };
  const handlers: Record<string, ApiHandler> = {};
  for (const [name, h] of Object.entries(exported as Record<string, unknown>)) {
    if (typeof h === 'function') handlers[name] = h as ApiHandler;
  }
  return { handlers, schemas };
}

/** JSDoc @param 类型到 JSON Schema 的映射 */
const TYPE_MAP: Record<string, string> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  bool: 'boolean',
  int: 'integer',
  integer: 'integer',
  object: 'object',
  array: 'array',
};

/**
 * 从源码中提取每个方法的 JSDoc 注释，解析 @param 生成 inputSchema。
 *
 * 支持的 JSDoc 格式：
 * ```js
 * /**
 *  * 方法描述文字
 *  * @param {string} prompt - 音乐风格描述
 *  * @param {boolean} [instrumental] - 是否纯音乐（可选）
 *  * @/
 * method_name: (input, ctx) => { ... }
 * ```
 *
 * 识别规则：
 * - `{type}` 映射到 JSON Schema type（string/number/boolean/integer/object/array）
 * - `[name]` 方括号表示可选参数
 * - `name - description` 破折号后为参数描述
 */
function extractParamSchemas(code: string): Record<string, { description?: string; inputSchema: Record<string, unknown> }> {
  const result: Record<string, { description?: string; inputSchema: Record<string, unknown> }> = {};

  // 匹配 JSDoc 注释 + 紧跟的方法定义（key: (...) => 或 key: function 或 key: async (...) =>）
  const jsdocMethodRegex = /\/\*\*[\s\S]*?\*\/\s*(?:async\s+)?(\w+)\s*[:=]\s*(?:async\s+)?(?:function\s*)?\(/g;
  let match: RegExpExecArray | null;

  while ((match = jsdocMethodRegex.exec(code)) !== null) {
    const methodName = match[1];
    const jsdocBlock = match[0].substring(0, match[0].indexOf('*/') + 2);

    // 提取方法描述（@param 之前的内容）
    const descLines: string[] = [];
    const params: { name: string; type: string; description: string; optional: boolean }[] = [];

    for (const line of jsdocBlock.split('\n')) {
      const trimmed = line.replace(/^\s*\*\s?/, '').trim();
      const paramMatch = trimmed.match(/@param\s+\{(\w+)\}\s+(\[?)(\w+)(\]?)\s*(?:-\s*)?(.*)/);
      if (paramMatch) {
        const [, rawType, openBracket, name, closeBracket, desc] = paramMatch;
        const jsonType = TYPE_MAP[rawType.toLowerCase()] ?? 'string';
        params.push({
          name,
          type: jsonType,
          description: desc?.trim() || '',
          optional: openBracket === '[' && closeBracket === ']',
        });
      } else if (!trimmed.startsWith('@') && trimmed && !trimmed.startsWith('/**') && !trimmed.startsWith('*/') && trimmed !== '/') {
        descLines.push(trimmed);
      }
    }

    const description = descLines.join(' ').trim() || undefined;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const p of params) {
      const prop: Record<string, unknown> = { type: p.type };
      if (p.description) prop.description = p.description;
      properties[p.name] = prop;
      if (!p.optional) required.push(p.name);
    }

    result[methodName] = {
      description,
      inputSchema: {
        type: 'object',
        ...(Object.keys(properties).length > 0 ? { properties } : {}),
        ...(required.length > 0 ? { required } : {}),
      },
    };
  }

  return result;
}

/** 从项目目录加载 src/api.js 并编译。文件缺失返回空。 */
export function loadApiJs(projectId: string): {
  handlers: Record<string, ApiHandler>;
  schemas: Record<string, { description?: string; inputSchema: Record<string, unknown> }>;
} {
  const filePath = join(getProjectDir(projectId), 'src', 'api.js');
  if (!existsSync(filePath)) return { handlers: {}, schemas: {} };
  try {
    return compileApiJs(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`[mini-app-agent] failed to load src/api.js:`, err instanceof Error ? err.message : err);
    return { handlers: {}, schemas: {} };
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
 * 把 api.js 方法表包装成 AgentFunctionTool[]。
 * 从 schemas 中读取 JSDoc 提取的参数描述，注入到 inputSchema 和 description。
 */
export function buildApiFunctionTools(
  methods: Record<string, ApiHandler>,
  ctxProvider: () => ApiCtx,
  schemas?: Record<string, { description?: string; inputSchema: Record<string, unknown> }>,
): AgentFunctionTool[] {
  return Object.entries(methods).map(([name, handler]) => {
    const schema = schemas?.[name];
    return {
      name,
      description: schema?.description ?? `${name} (project-defined api.js method)`,
      inputSchema: schema?.inputSchema ?? { type: 'object', properties: {} },
      execute: async (input) => {
        const record = input && typeof input === 'object' && !Array.isArray(input)
          ? input as Record<string, unknown>
          : {};
        return handler(record, ctxProvider());
      },
    };
  });
}

export interface ResolvedAgentCredentials {
  modelProvider?: string;
  providerId?: string;
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
    providerId?: string;
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
    providerId?: string;
    modelId?: string;
    apiKey?: string;
    apiBase?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }>,
): ResolvedAgentCredentials {
  const preset = entry.agentId ? presets.find((p) => p.id === entry.agentId) : undefined;
  const provider = resolveProvider(entry.providerId, entry.apiBase, entry.apiKey);
  return {
    modelProvider: entry.modelProvider ?? preset?.modelProvider,
    providerId: entry.providerId ?? preset?.providerId,
    modelId: entry.modelId ?? preset?.modelId,
    apiKey: provider?.apiKey ?? entry.apiKey ?? preset?.apiKey,
    apiBase: provider?.apiBase ?? entry.apiBase ?? preset?.apiBase,
    systemPrompt: entry.systemPrompt ?? preset?.systemPrompt,
    temperature: entry.temperature ?? preset?.temperature,
    maxTokens: entry.maxTokens ?? preset?.maxTokens,
  };
}

function resolveProvider(providerId?: string, apiBase?: string, apiKey?: string) {
  const providers = listProviders();
  if (providerId) {
    const provider = providers.find((entry) => entry.id === providerId);
    if (provider) return provider;
  }
  if (!apiBase && !apiKey) return undefined;
  return providers.find((provider) =>
    (!apiBase || provider.apiBase === apiBase)
    && (!apiKey || provider.apiKey === apiKey),
  );
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
        modelProvider?: string; providerId?: string; modelId?: string; apiKey?: string; apiBase?: string;
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
    const { handlers: apiMethods, schemas: apiSchemas } = loadApiJs(projectId);
    apiMethodNames = Object.keys(apiMethods);
    if (apiMethodNames.length) {
      const ctxProvider = () => makeApiCtx(projectId);
      functionTools.push(...buildApiFunctionTools(apiMethods, ctxProvider, apiSchemas));
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
  // 用户消息时间戳在执行【前】捕获，确保严格早于 agent 回复时间戳，
  // 避免 user/agent 同毫秒落盘后历史排序错乱（重载后顺序反转）。
  const userTimestamp = new Date().toISOString();
  const output: string[] = [];
  const toolCalls = new Map<string, { name: string; input: unknown; result: unknown }>();
  const result = await runtime.execute(message, getProjectDir(projectId), {
    systemPrompt,
    functionTools,
    maxTurns: 20,
    onEvent: (event) => {
      onEvent(event);
      if (event.type === 'output') output.push(event.line);
      if (event.type === 'tool_use') {
        toolCalls.set(event.id, { name: event.name, input: event.input, result: undefined });
      }
      if (event.type === 'tool_result' && event.toolUseId) {
        const existing = toolCalls.get(event.toolUseId);
        if (existing) {
          toolCalls.set(event.toolUseId, { ...existing, result: event.result });
        }
      }
    },
  });

  const userMessage: miniAppStore.MiniAppChatMessage = {
    id: randomUUID(), sessionId, agentId, role: 'user',
    content: message, route, timestamp: userTimestamp,
  };
  const agentContent = result.success
    ? (result.output.join('\n').trim() || result.summary)
    : `Error: ${result.error ?? result.summary}`;
  const agentMessage: miniAppStore.MiniAppChatMessage = {
    id: randomUUID(), sessionId, agentId, role: 'agent',
    content: agentContent, route, timestamp: new Date().toISOString(),
    ...(toolCalls.size ? { toolCalls: Array.from(toolCalls.values()) } : {}),
  };
  miniAppStore.saveAgentChat(projectId, userMessage);
  miniAppStore.saveAgentChat(projectId, agentMessage);

  return { userMessage, agentMessage };
  } finally {
    if (stopSignal) stopSignal.removeEventListener('abort', onAbort);
  }
}
