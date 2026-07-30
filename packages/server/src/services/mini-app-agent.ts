import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getProjectDir } from '../storage/mini-app-store.js';
import * as miniAppStore from '../storage/mini-app-store.js';
import { broadcastToWorkspace } from '../ws/connection-manager.js';
import { executePluginTool, getPluginConfigForScheme } from './plugin.js';
import { createBuiltinPluginApi, runWithPluginSource } from './plugin-runtime-api.js';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentRuntimeConfig, AgentRuntimeEvent, AgentFunctionTool, AgentRuntimeKind } from '../adapters/agent-runtime-types.js';
import { createMiniAppFunctionTools } from './builtin-tools/mini-app-tools.js';
import { createWorkspaceFileFunctionTools } from './builtin-tools/workspace-file-tools.js';
import { listPresets } from './agent.js';
import { listProviders } from '../storage/llm-store.js';
import { requestMiniAppClient } from './mini-app-client-rpc.js';
import type { BuiltInAgentToolName, WorkflowAgentTimelineItem } from '@agent-spaces/shared';
import { formatSimpleConversationHistory } from '../ws/agent-prompt.js';
import { createThinkTagSplitter } from './think-tags.js';

export interface ApiCtx {
  projectId: string;
  broadcast(event: string, data: unknown): void;
  callPluginTool(pluginId: string, toolName: string, args: Record<string, unknown>): Promise<unknown>;
  requestClient(type: string, payload?: unknown, timeoutMs?: number): Promise<unknown>;
  readConfig(path: string): unknown | null;
  writeConfig(path: string, value: unknown): void;
}

export type ApiHandler = (input: Record<string, unknown>, ctx: ApiCtx) => unknown | Promise<unknown>;

export interface MiniAppToolSpec {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

const miniAppToolRegistry = new Map<string, Record<string, MiniAppToolSpec>>();
const VALID_RUNTIME_KINDS = new Set<AgentRuntimeKind>(['open-agent-sdk', 'claude-code', 'codex', 'grok', 'gemini-cli', 'langchain', 'hermes', 'pi']);
const MINI_APP_FILE_TOOLS: BuiltInAgentToolName[] = ['ListWorkspaceFiles', 'SearchWorkspaceFiles', 'ReadWorkspaceFile', 'ReadWorkspaceFileLines', 'WriteWorkspaceFile', 'ReplaceWorkspaceFileLine', 'DeleteWorkspacePath', 'MoveWorkspacePath'];
const askUserQuestionRuns = new Map<string, {
  projectId: string;
  resolve: (answer: string) => void;
  timeout: ReturnType<typeof setTimeout>;
}>();

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

/**
 * 编译 src/tools.js：只读取工具元数据，不执行业务逻辑。
 * 支持 default export 数组，或 { tools: [...] }。
 */
export function compileToolsJs(code: string): MiniAppToolSpec[] {
  let moduleObj: { exports: unknown };
  try {
    const stripped = code
      .replace(/^\s*import\s+.*$/gm, '')
      .replace(/\bexport\s+default\s+/, 'module.exports = ');
    moduleObj = { exports: {} };
    const fn = new Function('module', 'exports', stripped);
    fn(moduleObj, moduleObj.exports);
  } catch {
    return [];
  }

  const exported = moduleObj.exports;
  const rawTools = Array.isArray(exported)
    ? exported
    : exported && typeof exported === 'object' && Array.isArray((exported as { tools?: unknown }).tools)
      ? (exported as { tools: unknown[] }).tools
      : [];
  return rawTools
    .map(normalizeToolSpec)
    .filter((tool): tool is MiniAppToolSpec => !!tool);
}

function normalizeToolSpec(raw: unknown): MiniAppToolSpec | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const name = typeof record.name === 'string'
    ? record.name
    : typeof record.id === 'string'
      ? record.id
      : undefined;
  if (!name) return null;
  const description = typeof record.description === 'string' ? record.description : undefined;
  const inputSchema = record.inputSchema && typeof record.inputSchema === 'object' && !Array.isArray(record.inputSchema)
    ? record.inputSchema as Record<string, unknown>
    : { type: 'object', properties: {} };
  return { name, description, inputSchema };
}

/** 从项目目录加载 src/api.js 并编译。文件缺失返回空。 */
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

/** 从项目目录加载 src/tools.js 并注册到内存表。 */
export function loadMiniAppToolsJs(projectId: string): Record<string, MiniAppToolSpec> {
  const filePath = join(getProjectDir(projectId), 'src', 'tools.js');
  if (!existsSync(filePath)) return {};
  try {
    const tools = compileToolsJs(readFileSync(filePath, 'utf-8'));
    return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
  } catch (err) {
    console.error(`[mini-app-agent] failed to load src/tools.js:`, err instanceof Error ? err.message : err);
    return {};
  }
}

export function registerMiniAppTools(projectId: string): Record<string, MiniAppToolSpec> {
  const tools = loadMiniAppToolsJs(projectId);
  if (Object.keys(tools).length) miniAppToolRegistry.set(projectId, tools);
  else miniAppToolRegistry.delete(projectId);
  return tools;
}

export function registerAllMiniAppTools(): void {
  for (const project of miniAppStore.listProjects()) {
    registerMiniAppTools(project.id);
  }
}

export function getRegisteredMiniAppTools(projectId: string): Record<string, MiniAppToolSpec> {
  return miniAppToolRegistry.get(projectId) ?? registerMiniAppTools(projectId);
}

export function makeApiCtx(projectId: string): ApiCtx {
  return {
    projectId,
    broadcast: (event, data) => broadcastToWorkspace(projectId, event, data),
    callPluginTool: (pluginId, toolName, args) => {
      const project = miniAppStore.getProject(projectId);
      const config = getPluginConfigForScheme(pluginId, project?.pluginConfigSchemes?.[pluginId]);
      return executePluginTool(pluginId, toolName, args, createBuiltinPluginApi({ pluginId }), undefined, config);
    },
    requestClient: (type, payload, timeoutMs) => requestMiniAppClient(projectId, type, payload, timeoutMs),
    readConfig: (path) => miniAppStore.readConfig(projectId, path),
    writeConfig: (path, value) => miniAppStore.writeConfig(projectId, path, value),
  };
}

/**
 * 把 api.js 方法表包装成 AgentFunctionTool[]。
 * 从 src/tools.js 注册表读取参数描述，注入到 inputSchema 和 description。
 */
export function buildApiFunctionTools(
  methods: Record<string, ApiHandler>,
  ctxProvider: () => ApiCtx,
  toolSpecs?: Record<string, MiniAppToolSpec>,
): AgentFunctionTool[] {
  return Object.entries(methods).map(([name, handler]) => {
    const toolSpec = toolSpecs?.[name];
    return {
      name,
      description: toolSpec?.description ?? `${name} (project-defined api.js method)`,
      inputSchema: toolSpec?.inputSchema ?? { type: 'object', properties: {} },
      execute: async (input) => {
        const record = input && typeof input === 'object' && !Array.isArray(input)
          ? input as Record<string, unknown>
          : {};
        const ctx = ctxProvider();
        // 包裹 mini-app api.js 执行入口，使其内部任意 fetch 都能在调试日志带上 mini-app 来源。
        return runWithPluginSource(
          { pluginId: `mini-app:${ctx.projectId}`, pluginName: ctx.projectId },
          () => handler(record, ctx),
        );
      },
    };
  });
}

export function createMiniAppToolsCatalogTool(currentProjectId: string): AgentFunctionTool {
  return {
    name: 'get_mini_app_tools',
    description: 'Query the project-defined mini-app api.js tool metadata from src/tools.js by mini-app id.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Mini-app id. Defaults to the current mini-app when omitted.',
        },
      },
    },
    execute: async (input) => {
      const record = input && typeof input === 'object' && !Array.isArray(input)
        ? input as Record<string, unknown>
        : {};
      const projectId = typeof record.projectId === 'string' && record.projectId.trim()
        ? record.projectId.trim()
        : currentProjectId;
      const tools = Object.values(getRegisteredMiniAppTools(projectId));
      return { projectId, tools };
    },
  };
}

export function answerMiniAppAgentQuestion(projectId: string, questionId: string, answer: string): boolean {
  const pending = askUserQuestionRuns.get(questionId);
  if (!pending || pending.projectId !== projectId) return false;
  clearTimeout(pending.timeout);
  askUserQuestionRuns.delete(questionId);
  pending.resolve(answer);
  return true;
}

function createAskUserQuestionsTool(projectId: string, stopSignal?: AbortSignal): AgentFunctionTool {
  return {
    name: 'askUserQuestions',
    description: 'Ask the user one question and wait for their answer before continuing.',
    inputSchema: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          minItems: 1,
          maxItems: 1,
          items: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              header: { type: 'string' },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    description: { type: 'string' },
                  },
                },
              },
            },
            required: ['question'],
          },
        },
      },
      required: ['questions'],
    },
    execute: async () => {
      throw new Error('askUserQuestions requires a tool call id');
    },
    executeWithToolUseId: async (input, toolUseId) => {
      const answer = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          askUserQuestionRuns.delete(toolUseId);
          reject(new Error('Timed out waiting for user answer.'));
        }, 10 * 60 * 1000);
        const onAbort = () => {
          clearTimeout(timeout);
          askUserQuestionRuns.delete(toolUseId);
          reject(new Error('Stopped while waiting for user answer.'));
        };
        if (stopSignal?.aborted) {
          onAbort();
          return;
        }
        stopSignal?.addEventListener('abort', onAbort, { once: true });
        askUserQuestionRuns.set(toolUseId, {
          projectId,
          resolve: (answer) => {
            stopSignal?.removeEventListener('abort', onAbort);
            resolve(answer);
          },
          timeout,
        });
      });
      return { answer, input };
    },
  };
}

export interface ResolvedAgentCredentials {
  runtimeKind: AgentRuntimeKind;
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
    runtimeKind?: string;
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
    runtimeKind?: string;
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
    runtimeKind: normalizeRuntimeKind(entry.runtimeKind ?? preset?.runtimeKind),
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

function normalizeRuntimeKind(value?: string): AgentRuntimeKind {
  return VALID_RUNTIME_KINDS.has(value as AgentRuntimeKind) ? value as AgentRuntimeKind : 'langchain';
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
        runtimeKind?: string;
        modelProvider?: string; providerId?: string; modelId?: string; apiKey?: string; apiBase?: string;
        systemPrompt?: string; temperature?: number; maxTokens?: number;
        tools?: { api?: boolean; plugin?: boolean };
      }
    | undefined;
  if (!entry) throw new Error(`Agent not found in agents.json: ${agentId}`);

  const creds = resolveAgentCredentials(entry, listPresets('') as any);

  const runtimeConfig: AgentRuntimeConfig = {
    kind: creds.runtimeKind,
    ...(creds.modelProvider ? { provider: creds.modelProvider as AgentRuntimeConfig['provider'] } : {}),
    ...(creds.modelId ? { model: creds.modelId } : {}),
    ...(creds.apiKey ? { apiKey: creds.apiKey } : {}),
    ...(creds.apiBase ? { baseURL: creds.apiBase } : {}),
    ...(typeof creds.maxTokens === 'number' ? { maxTokens: creds.maxTokens } : {}),
  };
  const runtime = createAgentRuntime(runtimeConfig);
  const onAbort = () => runtime.stop();
  if (stopSignal) stopSignal.addEventListener('abort', onAbort, { once: true });

  try {
  // 组装 functionTools
  const functionTools: AgentFunctionTool[] = [];
  const sections: string[] = [];
  const toolsCfg = entry.tools ?? { api: true, plugin: true };
  functionTools.push(createAskUserQuestionsTool(projectId, stopSignal));
  const hasAgentFilePermission = miniAppStore.getProject(projectId)?.agentPermissions?.includes('Files') === true;
  if (toolsCfg.plugin) {
    functionTools.push(...createMiniAppFunctionTools({
      enabledPlugins: project.enabledPlugins ?? [],
      pluginConfigSchemes: project.pluginConfigSchemes,
    }));
  }
  if (hasAgentFilePermission) {
    functionTools.push(...createWorkspaceFileFunctionTools(
      `mini-app:${projectId}:agent_files:preview`,
      MINI_APP_FILE_TOOLS,
      () => miniAppStore.getProject(projectId) ? {
        id: `mini-app:${projectId}:agent_files:preview`,
        name: `${projectId} agent files (preview)`,
        boundDirs: [miniAppStore.resolveDataPath(projectId, 'agent_files/preview')],
        agentspaceDir: miniAppStore.resolveDataPath(projectId, 'agent_files/preview'),
        createdAt: '',
        updatedAt: '',
        activeChannels: [],
        activeIssues: [],
      } : null,
    ));
  }
  let apiMethodNames: string[] = [];
  if (toolsCfg.api) {
    const apiMethods = loadApiJs(projectId);
    const apiToolSpecs = getRegisteredMiniAppTools(projectId);
    apiMethodNames = Object.keys(apiMethods);
    functionTools.push(createMiniAppToolsCatalogTool(projectId));
    if (apiMethodNames.length) {
      const ctxProvider = () => makeApiCtx(projectId);
      functionTools.push(...buildApiFunctionTools(apiMethods, ctxProvider, apiToolSpecs));
    }
  }

  // 拼 systemPrompt
  if (creds.systemPrompt) sections.push(creds.systemPrompt);
  sections.push(`Current mini-app route: ${route ?? '/'}`);
  sections.push(`Current mini-app id: ${projectId}`);
  if (hasAgentFilePermission) {
    sections.push('Mini-app agent files are available through workspace file tools. Use relative paths under data/agent_files/preview only.');
  }
  if (apiMethodNames.length) {
    sections.push([
      `Available project api.js methods: ${apiMethodNames.join(', ')}.`,
      `Use get_mini_app_tools with the current mini-app id to inspect descriptions and input schemas before calling project api.js methods.`,
    ].join(' '));
  }
  if (toolsCfg.plugin && project.enabledPlugins?.length) {
    sections.push(`Enabled plugins: ${project.enabledPlugins.join(', ')}. ` +
      `Use list_plugin_tools / get_plugin_tool_detail / execute_plugin_tool.`);
  }
  // 读取本 session 已落盘的历史消息作为上下文（不含当前轮，按时间升序），
  // 用与 chat agent 一致的 "Conversation history:" 文本块拼进 systemPrompt。
  const history = miniAppStore.listAgentChats(projectId, sessionId)
    .filter((m) => m.agentId === agentId)
    .map((m) => ({ role: m.role, content: m.content }));
  const historyBlock = formatSimpleConversationHistory(history);
  if (historyBlock) sections.push(historyBlock);
  const systemPrompt = sections.join('\n\n');

  // 执行
  // 用户消息时间戳在执行【前】捕获，确保严格早于 agent 回复时间戳，
  // 避免 user/agent 同毫秒落盘后历史排序错乱（重载后顺序反转）。
  const userTimestamp = new Date().toISOString();
  const output: string[] = [];
  const toolCalls = new Map<string, { name: string; input: unknown; result: unknown }>();
  const timeline: WorkflowAgentTimelineItem[] = [];
  const appendTimelineText = (type: 'message' | 'thinking', content: string) => {
    const latest = timeline.at(-1);
    if (latest?.type === type) {
      latest.content += content;
    } else {
      timeline.push({ id: `${type}-${timeline.length}-${Date.now()}`, type, content });
    }
  };
  const splitter = createThinkTagSplitter((part) => {
    appendTimelineText(part.type, part.content);
    if (part.type === 'message') {
      output.push(part.content);
      onEvent({ type: 'output', line: part.content });
    } else {
      onEvent({ type: 'reasoning', text: part.content, status: 'streaming' });
    }
  });
  const result = await runtime.execute(message, getProjectDir(projectId), {
    systemPrompt,
    functionTools,
    maxTurns: 20,
    onEvent: (event) => {
      if (event.type === 'output') {
        splitter.push(event.line);
        return;
      }
      onEvent(event);
      if (event.type === 'reasoning') {
        appendTimelineText('thinking', event.text);
      }
      if (event.type === 'tool_use') {
        toolCalls.set(event.id, { name: event.name, input: event.input, result: undefined });
        timeline.push({
          id: event.id,
          type: 'tool',
          name: event.name,
          input: event.input,
          status: 'running',
        });
      }
      if (event.type === 'tool_result' && event.toolUseId) {
        const existing = toolCalls.get(event.toolUseId);
        if (existing) {
          toolCalls.set(event.toolUseId, { ...existing, result: event.result });
        }
        const index = findLastIndex(timeline, (item) => item.type === 'tool' && item.id === event.toolUseId);
        const item = index >= 0 ? timeline[index] : undefined;
        if (item?.type === 'tool') {
          timeline[index] = { ...item, result: event.result, status: isErrorToolResult(event.result) ? 'error' : 'success' };
        }
      }
    },
  });
  splitter.flush();

  const userMessage: miniAppStore.MiniAppChatMessage = {
    id: randomUUID(), sessionId, agentId, role: 'user',
    content: message, route, timestamp: userTimestamp,
  };
  const agentContent = result.success
    ? (output.join('').trim() || result.summary)
    : `Error: ${result.error ?? result.summary}`;
  const agentMessage: miniAppStore.MiniAppChatMessage = {
    id: randomUUID(), sessionId, agentId, role: 'agent',
    content: agentContent, route, timestamp: new Date().toISOString(),
    ...(toolCalls.size ? { toolCalls: Array.from(toolCalls.values()) } : {}),
    ...(timeline.length ? { timeline: completeTimeline(timeline) } : {}),
  };
  miniAppStore.saveAgentChat(projectId, userMessage);
  miniAppStore.saveAgentChat(projectId, agentMessage);

  return { userMessage, agentMessage };
  } finally {
    if (stopSignal) stopSignal.removeEventListener('abort', onAbort);
  }
}

function completeTimeline(timeline: WorkflowAgentTimelineItem[]): WorkflowAgentTimelineItem[] {
  return timeline.map((item) => (
    item.type === 'tool' && item.status === 'running'
      ? { ...item, status: 'error' as const, result: { success: false, error: 'Tool did not return a result.' } }
      : item
  ));
}

function isErrorToolResult(result: unknown): boolean {
  return Boolean(
    result
    && typeof result === 'object'
    && 'success' in result
    && (result as { success?: unknown }).success === false
  );
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
}
