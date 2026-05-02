import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
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

    d(`starting | cwd=${cwd} model=${this.config.model ?? 'default'} permissionMode=${permissionMode} maxTurns=${options?.maxTurns ?? '∞'} tools=${options?.tools?.join(',') ?? 'claude_code'} mcpServers=${Object.keys(options?.mcpServers ?? {}).join(',') || '-'} skills=${options?.skills?.join(',') || '-'} configDir=${configDir ?? 'default'} sandboxDirs=${options?.sandboxDirs?.join(',') ?? '-'}`);
    d(`prompt: ${prompt.slice(0, 300)}${prompt.length > 300 ? '...' : ''}`);

    try {
      const queryOptions: Options = {
        cwd,
        model: this.config.model,
        maxTurns: options?.maxTurns,
        allowedTools: options?.tools,
        tools: { type: 'preset', preset: 'claude_code' },
        mcpServers: normalizeMcpServers(options?.mcpServers),
        skills: normalizeSkillNames(options?.skills),
        settingSources: [],
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
        const line = formatMessage(message);
        if (line) output.push(line);

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

function normalizeSkillNames(skills?: string[]): string[] {
  if (!Array.isArray(skills)) return [];
  return skills
    .map((skill) => skill.trim().replace(/\.md$/i, ''))
    .filter(Boolean);
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
    const typedBlock = block as { type?: string; text?: unknown; name?: unknown };
    if (typedBlock.type === 'text' && typeof typedBlock.text === 'string') {
      return [typedBlock.text];
    }
    if (typedBlock.type === 'tool_use' && typeof typedBlock.name === 'string') {
      return [`Using ${typedBlock.name}`];
    }
    return [];
  });

  return parts.length > 0 ? parts.join('\n') : null;
}

function countUsageTokens(usage: unknown): number {
  if (!usage || typeof usage !== 'object') return 0;
  const values = Object.values(usage as Record<string, unknown>);
  return values.reduce<number>((total, value) => total + (typeof value === 'number' ? value : 0), 0);
}
