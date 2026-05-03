import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname } from 'node:path';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { McpServerConfig, Options, PermissionMode, Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type {
  AgentRunOptions,
  AgentRunResult,
  AgentRuntime,
  AgentRuntimeConfig,
} from './agent-runtime-types.js';
import { summarizeResult } from './agent-runtime-types.js';

/**
 * Runtime backed by Anthropic's Claude Agent SDK.
 * Uses the bundled Claude Code runtime so agents can create and edit files.
 */
export class ClaudeCodeRuntime implements AgentRuntime {
  private abortController: AbortController | null = null;
  private activeQuery: Query | null = null;

  constructor(private readonly config: AgentRuntimeConfig = {}) {}

  async execute(prompt: string, workingDir: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    this.abortController = new AbortController();
    const output: string[] = [];
    const cwd = workingDir || process.cwd();
    const startTime = Date.now();
    const d = (msg: string) => console.log(`[claude-code] ${msg}`);
    const permissionMode = normalizePermissionMode(this.config.permissionMode);
    const agentDir = options?.configDir;
    const configDir = agentDir ? join(agentDir, '.claude') : undefined;
    if (configDir) prepareConfigDir(configDir, agentDir);
    const skillNames = normalizeSkillNames(options?.skills, configDir);
    const claudeExecutable = resolveBundledClaudeExecutable();

    d(`starting | cwd=${cwd} model=${this.config.model ?? 'default'} permissionMode=${permissionMode} maxTurns=${options?.maxTurns ?? '∞'} tools=claude_code mcpServers=${Object.keys(options?.mcpServers ?? {}).join(',') || '-'} skills=${skillNames.join(',') || '-'} configDir=${configDir ?? 'default'} sandboxDirs=${options?.sandboxDirs?.join(',') ?? '-'} claudeExecutable=${claudeExecutable ?? 'sdk-default'}`);
    d(`prompt: ${prompt.slice(0, 300)}${prompt.length > 300 ? '...' : ''}`);

    try {
      const queryOptions: Options = {
        cwd,
        model: this.config.model,
        maxTurns: options?.maxTurns,
        pathToClaudeCodeExecutable: claudeExecutable,
        tools: { type: 'preset', preset: 'claude_code' },
        mcpServers: normalizeMcpServers(options?.mcpServers),
        skills: skillNames,
        managedSettings: {
          strictPluginOnlyCustomization: ['mcp'],
        },
        settingSources: [],
        strictMcpConfig: true,
        additionalDirectories: options?.sandboxDirs,
        permissionMode,
        allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions' ? true : undefined,
        abortController: this.abortController,
        env: buildEnv(this.config, configDir),
        stderr: (data) => {
          const line = data.trim();
          if (line) d(`stderr: ${line}`);
        },
      };

      this.activeQuery = query({ prompt, options: queryOptions });
      let resultText = '';
      let turns = 0;
      let tokenCount = 0;
      let error: string | undefined;

      for await (const message of this.activeQuery) {
        logToolDebug(message, d);
        for (const toolUse of extractToolUseEvents(message)) {
          options?.onEvent?.({ type: 'tool_use', ...toolUse });
        }
        const toolResult = extractToolResultEvent(message);
        if (toolResult) {
          options?.onEvent?.({ type: 'tool_result', ...toolResult });
        }
        const line = formatMessage(message);
        if (line) {
          output.push(line);
          options?.onEvent?.({ type: 'output', line });
        }

        if (message.type === 'result') {
          turns = message.num_turns;
          tokenCount = countUsageTokens(message.usage);
          if (message.subtype === 'success') {
            resultText = message.result;
          } else {
            error = message.errors.join('\n') || message.subtype;
          }
        }
      }

      const elapsed = Date.now() - startTime;
      if (error) {
        d(`failed ${elapsed}ms | turns=${turns} tokens=${tokenCount} | ${error}`);
        return {
          success: false,
          summary: 'Claude Code execution failed',
          artifacts: [],
          error,
          output,
        };
      }

      const text = resultText || output.at(-1) || '';
      d(`done ${elapsed}ms | turns=${turns} tokens=${tokenCount}`);

      return {
        success: true,
        summary: summarizeResult(text),
        artifacts: [],
        output: resultText && !output.includes(resultText) ? [...output, resultText] : output,
      };
    } catch (err) {
      const elapsed = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);
      d(`failed ${elapsed}ms | ${message}`);
      if (err instanceof Error && err.stack) console.error(err.stack);

      return { success: false, summary: 'Claude Code execution failed', artifacts: [], error: message, output };
    } finally {
      this.activeQuery?.close();
      this.activeQuery = null;
      this.abortController = null;
    }
  }

  stop(): void {
    this.abortController?.abort();
    void this.activeQuery?.interrupt().catch(() => {
      this.activeQuery?.close();
    });
  }
}

function buildEnv(config: AgentRuntimeConfig, configDir?: string): Record<string, string | undefined> {
  return {
    ...process.env,
    CLAUDE_CONFIG_DIR: configDir || process.env.CLAUDE_CONFIG_DIR,
    ANTHROPIC_API_KEY: config.apiKey || process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL: config.baseURL || process.env.ANTHROPIC_BASE_URL,
    CLAUDE_AGENT_SDK_CLIENT_APP: process.env.CLAUDE_AGENT_SDK_CLIENT_APP || 'agent-spaces/server',
  };
}

function normalizeMcpServers(servers?: Record<string, unknown>): Record<string, McpServerConfig> | undefined {
  if (!servers || Object.keys(servers).length === 0) return undefined;
  return servers as Record<string, McpServerConfig>;
}

function resolveBundledClaudeExecutable(): string | undefined {
  const require = createRequire(import.meta.url);
  const packageName = getBundledClaudePackageName();
  if (!packageName) return undefined;

  try {
    return require.resolve(`${packageName}/claude`);
  } catch {
    return undefined;
  }
}

function getBundledClaudePackageName(): string | undefined {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin') {
    if (arch === 'arm64') return '@anthropic-ai/claude-agent-sdk-darwin-arm64';
    if (arch === 'x64') return '@anthropic-ai/claude-agent-sdk-darwin-x64';
  }

  if (platform === 'linux') {
    if (arch === 'arm64') return isMuslRuntime() ? '@anthropic-ai/claude-agent-sdk-linux-arm64-musl' : '@anthropic-ai/claude-agent-sdk-linux-arm64';
    if (arch === 'x64') return isMuslRuntime() ? '@anthropic-ai/claude-agent-sdk-linux-x64-musl' : '@anthropic-ai/claude-agent-sdk-linux-x64';
  }

  if (platform === 'win32') {
    if (arch === 'arm64') return '@anthropic-ai/claude-agent-sdk-win32-arm64';
    if (arch === 'x64') return '@anthropic-ai/claude-agent-sdk-win32-x64';
  }

  return undefined;
}

function isMuslRuntime(): boolean {
  const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined;
  return !report?.header?.glibcVersionRuntime;
}

function normalizeSkillNames(skills?: string[], configDir?: string): string[] {
  if (!Array.isArray(skills)) return [];
  return skills
    .map((skill) => skill.trim().replace(/\.md$/i, ''))
    .filter((skill) => Boolean(skill) && hasSkillContent(skill, configDir));
}

function prepareConfigDir(configDir: string, agentDir?: string): void {
  mkdirSync(configDir, { recursive: true });
  if (!agentDir) return;

  const sourceSkillsDir = join(agentDir, 'skills');
  const targetSkillsDir = join(configDir, 'skills');
  rmSync(targetSkillsDir, { recursive: true, force: true });
  mkdirSync(targetSkillsDir, { recursive: true });

  if (!existsSync(sourceSkillsDir)) return;
  for (const file of readdirSync(sourceSkillsDir)) {
    if (extname(file).toLowerCase() !== '.md') continue;
    copyFileSync(join(sourceSkillsDir, file), join(targetSkillsDir, file));
  }
}

function hasSkillContent(skill: string, configDir?: string): boolean {
  if (!configDir) return true;
  const skillFile = join(configDir, 'skills', `${skill}.md`);
  if (!existsSync(skillFile)) return false;
  return statSync(skillFile).size > 0;
}

function normalizePermissionMode(permissionMode?: AgentRuntimeConfig['permissionMode']): PermissionMode {
  if (
    permissionMode === 'default' ||
    permissionMode === 'acceptEdits' ||
    permissionMode === 'bypassPermissions' ||
    permissionMode === 'plan' ||
    permissionMode === 'dontAsk'
  ) {
    return permissionMode;
  }
  return 'bypassPermissions';
}

function formatMessage(message: SDKMessage): string | null {
  switch (message.type) {
    case 'assistant':
      return formatAssistantMessage(message.message.content);
    case 'result':
      return message.subtype === 'success' ? message.result : message.errors.join('\n');
    case 'system':
      if (message.subtype === 'init') {
        return `Claude Code initialized with ${message.model}`;
      }
      if (message.subtype === 'task_started') {
        return message.description;
      }
      if (message.subtype === 'task_progress') {
        return message.summary || message.description;
      }
      if (message.subtype === 'task_notification') {
        return message.summary;
      }
      if (message.subtype === 'local_command_output') {
        return message.content;
      }
      return null;
    case 'tool_progress':
      return `${message.tool_name} running (${message.elapsed_time_seconds}s)`;
    case 'tool_use_summary':
      return message.summary;
    default:
      return null;
  }
}

function formatAssistantMessage(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;

  const parts = content.flatMap((block) => {
    if (!block || typeof block !== 'object') return [];
    const typedBlock = block as { type?: string; text?: unknown; name?: unknown; input?: unknown };
    if (typedBlock.type === 'text' && typeof typedBlock.text === 'string') {
      return [typedBlock.text];
    }
    if (typedBlock.type === 'tool_use' && typeof typedBlock.name === 'string') {
      return [formatToolUse(typedBlock.name, typedBlock.input)];
    }
    return [];
  });

  return parts.length > 0 ? parts.join('\n') : null;
}

function extractToolUseEvents(message: SDKMessage): Array<{ id: string; name: string; input?: unknown; line: string }> {
  if (message.type !== 'assistant' || !Array.isArray(message.message.content)) return [];

  return message.message.content.flatMap((block) => {
    if (!block || typeof block !== 'object') return [];
    const typedBlock = block as { type?: string; id?: unknown; name?: unknown; input?: unknown };
    if (typedBlock.type !== 'tool_use' || typeof typedBlock.name !== 'string') return [];

    return [{
      id: typeof typedBlock.id === 'string' ? typedBlock.id : typedBlock.name,
      name: typedBlock.name,
      input: typedBlock.input,
      line: formatToolUse(typedBlock.name, typedBlock.input),
    }];
  });
}

function extractToolResultEvent(message: SDKMessage): { toolUseId?: string; result: unknown } | null {
  if (message.type !== 'user') return null;
  const parentToolUseId = (message as { parent_tool_use_id?: unknown }).parent_tool_use_id;
  const toolUseId = typeof parentToolUseId === 'string' && parentToolUseId ? parentToolUseId : undefined;

  const directResult = (message as { tool_use_result?: unknown }).tool_use_result;
  if (directResult !== undefined) {
    return { toolUseId, result: directResult };
  }

  const content = (message as { message?: { content?: unknown } }).message?.content;
  if (Array.isArray(content)) {
    const toolResultBlock = content.find((block) => {
      return Boolean(block && typeof block === 'object' && (block as { type?: unknown }).type === 'tool_result');
    }) as { content?: unknown } | undefined;
    if (toolResultBlock) {
      return { toolUseId, result: toolResultBlock.content };
    }
  }

  return null;
}

function logToolDebug(message: SDKMessage, d: (message: string) => void): void {
  switch (message.type) {
    case 'assistant':
      logAssistantToolUses(message.message.content, d);
      return;
    case 'user': {
      const toolResult = (message as { tool_use_result?: unknown }).tool_use_result;
      if (toolResult !== undefined) {
        d(`tool result | parent=${message.parent_tool_use_id ?? '-'} result=${summarizeToolResult(toolResult)}`);
      }
      return;
    }
    case 'tool_progress':
      d(`tool progress | id=${message.tool_use_id} name=${message.tool_name} elapsed=${message.elapsed_time_seconds}s parent=${message.parent_tool_use_id ?? '-'}`);
      return;
    case 'tool_use_summary':
      d(`tool summary | ids=${message.preceding_tool_use_ids.join(',') || '-'} summary=${truncate(message.summary, 240)}`);
      return;
    case 'system':
      if (message.subtype === 'task_started') {
        d(`subagent started | ${truncate(message.description, 240)}`);
      } else if (message.subtype === 'task_progress') {
        d(`subagent progress | ${truncate(message.summary || message.description, 240)}`);
      } else if (message.subtype === 'task_notification') {
        d(`subagent notification | ${truncate(message.summary, 240)}`);
      } else if (message.subtype === 'local_command_output') {
        d(`local command output | ${truncate(message.content, 240)}`);
      }
      return;
    default:
      return;
  }
}

function logAssistantToolUses(content: unknown, d: (message: string) => void): void {
  if (!Array.isArray(content)) return;

  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const typedBlock = block as { type?: string; id?: unknown; name?: unknown; input?: unknown };
    if (typedBlock.type !== 'tool_use' || typeof typedBlock.name !== 'string') continue;
    const id = typeof typedBlock.id === 'string' ? typedBlock.id : '-';
    d(`tool use | id=${id} name=${typedBlock.name} input=${summarizeToolInput(typedBlock.input) || '-'}`);
  }
}

function formatToolUse(name: string, input: unknown): string {
  const summary = summarizeToolInput(input);
  return summary ? `Tool: ${name} ${summary}` : `Tool: ${name}`;
}

function summarizeToolInput(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '';
  const record = input as Record<string, unknown>;
  const keys = ['file_path', 'path', 'command', 'pattern', 'query', 'description', 'prompt'];
  const details = keys.flatMap((key) => {
    const value = record[key];
    if (typeof value !== 'string' || !value.trim()) return [];
    return `${key}=${JSON.stringify(truncate(value.trim(), 140))}`;
  });
  if (details.length > 0) return details.join(' ');
  return JSON.stringify(redactLargeInput(record));
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function redactLargeInput(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => {
    if (typeof value === 'string') return [key, truncate(value, 140)];
    return [key, value];
  }));
}

function summarizeToolResult(result: unknown): string {
  if (typeof result === 'string') return JSON.stringify(truncate(result, 240));
  if (!result || typeof result !== 'object') return JSON.stringify(result);
  return JSON.stringify(redactLargeInput(result as Record<string, unknown>));
}

function countUsageTokens(usage: unknown): number {
  if (!usage || typeof usage !== 'object') return 0;
  const values = Object.values(usage as Record<string, unknown>);
  return values.reduce<number>((total, value) => total + (typeof value === 'number' ? value : 0), 0);
}
