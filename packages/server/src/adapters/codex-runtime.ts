import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { Codex } from '@openai/codex-sdk';
import type {
  CodexOptions,
  CommandExecutionItem,
  FileChangeItem,
  McpToolCallItem,
  SandboxMode,
  ThreadEvent,
  ThreadItem,
  ThreadOptions,
  TodoListItem,
  TurnCompletedEvent,
  Usage,
} from '@openai/codex-sdk';
import type {
  AgentRunOptions,
  AgentRunResult,
  AgentRuntimeEvent,
  AgentRuntime,
  AgentRuntimeConfig,
} from './agent-runtime-types.js';
import { summarizeResult } from './agent-runtime-types.js';

/**
 * Runtime backed by OpenAI's Codex SDK.
 * Spawns the bundled Codex CLI and consumes its structured JSONL event stream.
 */
export class CodexRuntime implements AgentRuntime {
  private abortController: AbortController | null = null;

  constructor(private readonly config: AgentRuntimeConfig = {}) {}

  async execute(prompt: string, workingDir: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    this.abortController = new AbortController();
    const output: string[] = [];
    const cwd = workingDir || process.cwd();
    const startTime = Date.now();
    const d = (msg: string) => console.log(`[codex] ${msg}`);
    const agentDir = options?.configDir;
    const codexHome = agentDir ? join(agentDir, '.codex') : undefined;
    if (codexHome) prepareCodexHome(codexHome, agentDir);
    const skillNames = normalizeSkillNames(options?.skills, codexHome);
    const configOverrides = buildCodexConfig(options, skillNames);
    const sandboxMode = normalizeSandboxMode(this.config.permissionMode);
    const approvalPolicy = normalizeApprovalPolicy(this.config.permissionMode);

    d(`starting | cwd=${cwd} model=${this.config.model ?? 'default'} sandboxMode=${sandboxMode} approvalPolicy=${approvalPolicy} maxTurns=${options?.maxTurns ?? '∞'} mcpServers=${Object.keys(options?.mcpServers ?? {}).join(',') || '-'} skills=${skillNames.join(',') || '-'} codexHome=${codexHome ?? 'default'} sandboxDirs=${options?.sandboxDirs?.join(',') ?? '-'}`);
    d(`prompt: ${prompt.slice(0, 300)}${prompt.length > 300 ? '...' : ''}`);

    try {
      const codex = new Codex({
        apiKey: this.config.apiKey,
        baseUrl: this.config.baseURL,
        config: configOverrides,
        env: buildEnv(this.config, codexHome),
      });
      const thread = codex.startThread({
        model: this.config.model,
        sandboxMode,
        approvalPolicy,
        workingDirectory: cwd,
        skipGitRepoCheck: true,
        additionalDirectories: options?.sandboxDirs,
        networkAccessEnabled: true,
        webSearchMode: 'live',
      });

      const { events } = await thread.runStreamed(prompt, {
        signal: this.abortController.signal,
      });

      let resultText = '';
      let tokenCount = 0;
      let error: string | undefined;
      const emittedItemLines = new Set<string>();

      for await (const event of events) {
        logEventDebug(event, d);
        const mappedEvents = mapRuntimeEvents(event);
        const mappedEventLines = new Set(mappedEvents.flatMap((runtimeEvent) => (
          runtimeEvent.type === 'tool_use' ? [runtimeEvent.line] : []
        )));
        for (const runtimeEvent of mappedEvents) {
          options?.onEvent?.(runtimeEvent);
        }

        for (const line of formatEventLines(event)) {
          if (!line || emittedItemLines.has(line)) continue;
          emittedItemLines.add(line);
          output.push(line);
          if (mappedEventLines.has(line)) continue;
          options?.onEvent?.({ type: 'output', line });
        }

        if (event.type === 'item.completed' && event.item.type === 'agent_message') {
          resultText = event.item.text;
        } else if (event.type === 'turn.completed') {
          tokenCount = countUsageTokens(event.usage);
          const usageLine = formatUsageLine(event);
          output.push(usageLine);
          options?.onEvent?.({ type: 'output', line: usageLine });
        } else if (event.type === 'turn.failed') {
          error = event.error.message;
        } else if (event.type === 'error') {
          error = event.message;
        }
      }

      const elapsed = Date.now() - startTime;
      if (error) {
        d(`failed ${elapsed}ms | tokens=${tokenCount} | ${error}`);
        return {
          success: false,
          summary: 'Codex execution failed',
          artifacts: [],
          error,
          output,
        };
      }

      const text = resultText || lastAgentMessageText(output) || output.at(-1) || '';
      d(`done ${elapsed}ms | tokens=${tokenCount}`);

      return {
        success: true,
        summary: summarizeResult(text),
        artifacts: [],
        output,
      };
    } catch (err) {
      const elapsed = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);
      d(`failed ${elapsed}ms | ${message}`);
      if (err instanceof Error && err.stack) console.error(err.stack);

      return { success: false, summary: 'Codex execution failed', artifacts: [], error: message, output };
    } finally {
      this.abortController = null;
    }
  }

  stop(): void {
    this.abortController?.abort();
  }
}

type CodexConfigObject = NonNullable<CodexOptions['config']>;
type CodexConfigValue = CodexConfigObject[string];

function buildEnv(config: AgentRuntimeConfig, codexHome?: string): Record<string, string> {
  return removeUndefined({
    ...process.env,
    CODEX_HOME: codexHome || process.env.CODEX_HOME,
    CODEX_API_KEY: config.apiKey || process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY,
    OPENAI_API_KEY: config.apiKey || process.env.OPENAI_API_KEY,
    CODEX_INTERNAL_ORIGINATOR_OVERRIDE: process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE || 'agent-spaces/server',
  });
}

function buildCodexConfig(options: AgentRunOptions | undefined, skillNames: string[]): CodexConfigObject {
  const config: CodexConfigObject = {};
  const mcpServers = normalizeMcpServers(options?.mcpServers);
  if (mcpServers) config.mcp_servers = mcpServers as CodexConfigValue;
  if (skillNames.length > 0) {
    config.skills = { enabled: skillNames };
  }
  return removeUndefined(config) as CodexConfigObject;
}

function normalizeMcpServers(servers?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!servers || Object.keys(servers).length === 0) return undefined;
  return Object.fromEntries(
    Object.entries(servers).flatMap(([name, server]) => {
      const normalized = normalizeMcpServer(server);
      return normalized ? [[name, normalized]] : [];
    }),
  );
}

function normalizeMcpServer(server: unknown): Record<string, unknown> | null {
  if (!server || typeof server !== 'object' || Array.isArray(server)) return null;
  const record = server as Record<string, unknown>;
  if (typeof record.command === 'string') {
    return removeUndefined({
      command: record.command,
      args: Array.isArray(record.args) ? record.args : undefined,
      env: isRecord(record.env) ? record.env : undefined,
    });
  }
  if (typeof record.url === 'string') {
    return removeUndefined({
      url: record.url,
      headers: isRecord(record.headers) ? record.headers : undefined,
      bearer_token_env_var: typeof record.bearer_token_env_var === 'string'
        ? record.bearer_token_env_var
        : typeof record.bearerTokenEnvVar === 'string'
          ? record.bearerTokenEnvVar
          : undefined,
    });
  }
  return record;
}

function normalizeSandboxMode(permissionMode?: AgentRuntimeConfig['permissionMode']): SandboxMode {
  if (permissionMode === 'plan') return 'read-only';
  if (permissionMode === 'default' || permissionMode === 'acceptEdits' || permissionMode === 'auto') {
    return 'workspace-write';
  }
  return 'danger-full-access';
}

function normalizeApprovalPolicy(permissionMode?: AgentRuntimeConfig['permissionMode']): NonNullable<ThreadOptions['approvalPolicy']> {
  if (permissionMode === 'default' || permissionMode === 'acceptEdits' || permissionMode === 'auto') {
    return 'on-request';
  }
  if (permissionMode === 'plan') return 'untrusted';
  return 'never';
}

function prepareCodexHome(codexHome: string, agentDir?: string): void {
  mkdirSync(codexHome, { recursive: true });
  const skillsDir = join(codexHome, 'skills');
  rmSync(skillsDir, { recursive: true, force: true });
  mkdirSync(skillsDir, { recursive: true });
  if (!agentDir) return;

  const sourceSkillsDir = join(agentDir, 'skills');
  if (!existsSync(sourceSkillsDir)) return;
  for (const file of readdirSync(sourceSkillsDir)) {
    if (extname(file).toLowerCase() !== '.md') continue;
    const skillName = sanitizeSkillName(file);
    const targetSkillDir = join(skillsDir, skillName);
    mkdirSync(targetSkillDir, { recursive: true });
    const sourceFile = join(sourceSkillsDir, file);
    const targetFile = join(targetSkillDir, 'SKILL.md');
    writeFileSync(targetFile, ensureCodexSkillFrontmatter(skillName, sourceFile), 'utf-8');
  }
}

function ensureCodexSkillFrontmatter(skillName: string, sourceFile: string): string {
  const content = readFileSync(sourceFile, 'utf-8');
  if (/^---\r?\n[\s\S]*?\r?\n---\r?\n/.test(content)) return content;
  const title = basename(sourceFile).replace(/\.md$/i, '');
  return [
    '---',
    `name: ${skillName}`,
    `description: ${title}`,
    '---',
    '',
    content,
  ].join('\n');
}

function normalizeSkillNames(skills?: string[], codexHome?: string): string[] {
  if (!Array.isArray(skills)) return [];
  return skills
    .map(sanitizeSkillName)
    .filter((skill) => Boolean(skill) && hasSkillContent(skill, codexHome));
}

function hasSkillContent(skill: string, codexHome?: string): boolean {
  if (!codexHome) return true;
  const skillFile = join(codexHome, 'skills', skill, 'SKILL.md');
  return existsSync(skillFile) && statSync(skillFile).size > 0;
}

function sanitizeSkillName(name: string): string {
  const raw = basename(name).replace(/\.md$/i, '').trim();
  return raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

function mapRuntimeEvents(event: ThreadEvent): AgentRuntimeEvent[] {
  if (event.type === 'item.started') {
    const toolUse = mapToolUse(event.item);
    return toolUse ? [toolUse] : [];
  }
  if (event.type === 'item.completed') {
    const toolResult = mapToolResult(event.item);
    return toolResult ? [toolResult] : [];
  }
  return [];
}

function mapToolUse(item: ThreadItem): { type: 'tool_use'; id: string; name: string; input?: unknown; line: string } | null {
  switch (item.type) {
    case 'command_execution':
      return {
        type: 'tool_use',
        id: item.id,
        name: 'Bash',
        input: { command: item.command },
        line: formatCommandLine(item),
      };
    case 'mcp_tool_call':
      return {
        type: 'tool_use',
        id: item.id,
        name: `${item.server}.${item.tool}`,
        input: item.arguments,
        line: formatMcpToolCallLine(item),
      };
    case 'web_search':
      return {
        type: 'tool_use',
        id: item.id,
        name: 'WebSearch',
        input: { query: item.query },
        line: `Tool: WebSearch query=${JSON.stringify(truncate(item.query, 140))}`,
      };
    default:
      return null;
  }
}

function mapToolResult(item: ThreadItem): { type: 'tool_result'; toolUseId?: string; result: unknown } | null {
  switch (item.type) {
    case 'command_execution':
      return {
        type: 'tool_result',
        toolUseId: item.id,
        result: {
          status: item.status,
          exit_code: item.exit_code,
          output: item.aggregated_output,
        },
      };
    case 'mcp_tool_call':
      return {
        type: 'tool_result',
        toolUseId: item.id,
        result: item.error ?? item.result ?? { status: item.status },
      };
    default:
      return null;
  }
}

function formatEventLines(event: ThreadEvent): string[] {
  switch (event.type) {
    case 'thread.started':
      return [`Codex initialized with thread ${event.thread_id}`];
    case 'item.started':
    case 'item.updated':
    case 'item.completed': {
      const line = formatItemLine(event.item);
      return line ? [line] : [];
    }
    case 'turn.failed':
      return [event.error.message];
    case 'error':
      return [event.message];
    default:
      return [];
  }
}

function formatItemLine(item: ThreadItem): string | null {
  switch (item.type) {
    case 'agent_message':
      return item.text;
    case 'reasoning':
      return `[Reasoning] ${item.text}`;
    case 'command_execution':
      return formatCommandLine(item);
    case 'file_change':
      return formatFileChangeLine(item);
    case 'mcp_tool_call':
      return formatMcpToolCallLine(item);
    case 'web_search':
      return `Tool: WebSearch query=${JSON.stringify(truncate(item.query, 140))}`;
    case 'todo_list':
      return formatTodoListLine(item);
    case 'error':
      return item.message;
  }
}

function formatCommandLine(item: CommandExecutionItem): string {
  return `Tool: Bash command=${JSON.stringify(truncate(item.command, 180))}`;
}

function formatFileChangeLine(item: FileChangeItem): string {
  const changes = item.changes
    .map((change) => `${change.kind}:${change.path}`)
    .join(', ');
  return `Tool: ApplyPatch ${changes || item.status}`;
}

function formatMcpToolCallLine(item: McpToolCallItem): string {
  const summary = summarizeToolInput(item.arguments);
  const toolName = `${item.server}.${item.tool}`;
  return summary ? `Tool: ${toolName} ${summary}` : `Tool: ${toolName}`;
}

function formatTodoListLine(item: TodoListItem): string {
  const counts = item.items.reduce(
    (acc, todo) => {
      acc.total += 1;
      if (todo.completed) acc.completed += 1;
      return acc;
    },
    { total: 0, completed: 0 },
  );
  return `Todo: ${counts.completed}/${counts.total} completed`;
}

function formatUsageLine(event: TurnCompletedEvent): string {
  const usage = event.usage;
  const total = countUsageTokens(usage);
  return `[Usage] tokens=${total} input=${usage.input_tokens} output=${usage.output_tokens} reasoning=${usage.reasoning_output_tokens}`;
}

function logEventDebug(event: ThreadEvent, d: (message: string) => void): void {
  switch (event.type) {
    case 'item.started':
      logItemDebug('item started', event.item, d);
      return;
    case 'item.updated':
      logItemDebug('item updated', event.item, d);
      return;
    case 'item.completed':
      logItemDebug('item completed', event.item, d);
      return;
    case 'turn.completed':
      d(`turn completed | tokens=${countUsageTokens(event.usage)}`);
      return;
    case 'turn.failed':
      d(`turn failed | ${truncate(event.error.message, 240)}`);
      return;
    case 'error':
      d(`stream error | ${truncate(event.message, 240)}`);
      return;
    default:
      return;
  }
}

function logItemDebug(prefix: string, item: ThreadItem, d: (message: string) => void): void {
  switch (item.type) {
    case 'command_execution':
      d(`${prefix} | command=${truncate(item.command, 180)} status=${item.status}`);
      return;
    case 'file_change':
      d(`${prefix} | file_change=${item.changes.map((change) => `${change.kind}:${change.path}`).join(',') || '-'} status=${item.status}`);
      return;
    case 'mcp_tool_call':
      d(`${prefix} | mcp=${item.server}.${item.tool} status=${item.status}`);
      return;
    case 'agent_message':
      d(`${prefix} | agent_message=${truncate(item.text, 180)}`);
      return;
    case 'reasoning':
      d(`${prefix} | reasoning=${truncate(item.text, 180)}`);
      return;
    case 'web_search':
      d(`${prefix} | web_search=${truncate(item.query, 180)}`);
      return;
    case 'todo_list':
      d(`${prefix} | todo_list=${item.items.length}`);
      return;
    case 'error':
      d(`${prefix} | error=${truncate(item.message, 180)}`);
      return;
  }
}

function lastAgentMessageText(output: string[]): string {
  return [...output].reverse().find((line) => {
    return line.trim() && !isToolLikeLine(line) && !/^\[.*\]/.test(line.trim());
  }) ?? '';
}

function isToolLikeLine(line: string): boolean {
  return /^(Tool:|Todo:|Codex initialized\b)/i.test(line.trim());
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

function redactLargeInput(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => {
    if (typeof value === 'string') return [key, truncate(value, 140)];
    return [key, value];
  }));
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function countUsageTokens(usage: Usage): number {
  return usage.input_tokens
    + usage.cached_input_tokens
    + usage.output_tokens
    + usage.reasoning_output_tokens;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function removeUndefined<T extends Record<string, unknown>>(record: T): Record<string, NonNullable<T[keyof T]>> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as Record<string, NonNullable<T[keyof T]>>;
}
