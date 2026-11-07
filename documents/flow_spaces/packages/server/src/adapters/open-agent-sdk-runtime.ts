import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createAgent, registerSkill, unregisterSkill } from '@codeany/open-agent-sdk';
import type { Agent, ApiType, SDKMessage } from '@codeany/open-agent-sdk';
import type {
  AgentRunOptions,
  AgentRunResult,
  AgentRuntime,
  AgentRuntimeConfig,
} from './agent-runtime-types.js';
import { appendOutputStyleToPrompt, summarizeResult } from './agent-runtime-types.js';
import { startCodexFunctionToolBridge, type CodexFunctionToolBridge } from './codex-function-tool-bridge.js';
import { getDataDir } from '../storage/json-store.js';

const registeredConfiguredSkills = new Set<string>();

/**
 * Runtime backed by @codeany/open-agent-sdk.
 * Runs the agent loop in-process with the SDK's built-in tools.
 */
export class OpenAgentSdkRuntime implements AgentRuntime {
  private agent: Agent | null = null;
  private abortController: AbortController | null = null;

  constructor(private readonly config: AgentRuntimeConfig = {}) {}

  async execute(prompt: string, workingDir: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    this.abortController = new AbortController();
    const output: string[] = [];
    const cwd = workingDir || process.cwd();
    const startTime = Date.now();
    const d = (msg: string) => console.log(`[agent] ${msg}`);
    let functionToolBridge: CodexFunctionToolBridge | undefined;

    d(`starting | cwd=${cwd} provider=${this.config.provider ?? 'default'} model=${this.config.model ?? 'default'} baseURL=${this.config.baseURL ?? 'default'} permissionMode=${this.config.permissionMode ?? 'bypassPermissions'} maxTurns=${options?.maxTurns ?? '∞'} allowedTools=${options?.tools?.join(',') ?? 'all'} mcpServers=${Object.keys(options?.mcpServers ?? {}).join(',') || '-'} functionTools=${options?.functionTools?.map((tool) => tool.name).join(',') || '-'} sandboxDirs=${options?.sandboxDirs?.join(',') ?? '-'}`);
    d(`prompt: ${prompt.slice(0, 300)}${prompt.length > 300 ? '...' : ''}`);

    try {
      functionToolBridge = await startCodexFunctionToolBridge(options?.functionTools, d);
      const mcpServers = withFunctionToolBridge(normalizeOpenAgentMcpServers(options?.mcpServers), functionToolBridge);
      d(`resolved tools | allowedTools=${options?.tools?.join(',') ?? 'all'} mcpServers=${Object.keys(mcpServers ?? {}).join(',') || '-'} functionTools=${options?.functionTools?.map((tool) => tool.name).join(',') || '-'}`);

      this.agent = createAgent({
        apiType: normalizeApiType(this.config.provider),
        model: this.config.model,
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
        cwd,
        systemPrompt: options?.systemPrompt,
        maxTurns: options?.maxTurns,
        allowedTools: options?.tools,
        mcpServers,
        additionalDirectories: options?.sandboxDirs,
        permissionMode: this.config.permissionMode ?? 'bypassPermissions',
        abortController: this.abortController,
      });
      const registeredSkills = registerConfiguredSkills(options?.configDir, options?.skills);
      if (options?.skills?.length) {
        d(`skills registered | requested=${options.skills.join(',') || '-'} registered=${registeredSkills.join(',') || '-'}`);
      }

      d('agent created, sending prompt...');
      const result = await collectQueryResult(
        this.agent.query(appendOutputStyleToPrompt(prompt, options?.outputStyle)),
        output,
        options,
        d,
      );
      const elapsed = Date.now() - startTime;
      const inputTokens = result.usage.input_tokens;
      const outputTokens = result.usage.output_tokens;
      const usage = result.usage as unknown as Record<string, unknown>;
      const cacheRead = usage.cache_read_input_tokens ?? 0;
      const cacheCreation = usage.cache_creation_input_tokens ?? 0;

      output.push(result.text);
      options?.onEvent?.({ type: 'output', line: result.text });
      d(`done ${elapsed}ms | turns=${result.num_turns} tokens=${inputTokens + outputTokens} (in=${inputTokens} out=${outputTokens})${Number(cacheRead) > 0 || Number(cacheCreation) > 0 ? ` cache=(read=${cacheRead},create=${cacheCreation})` : ''}`);

      return {
        success: true,
        summary: summarizeResult(result.text),
        artifacts: [],
        output,
        usage: {
          inputTokens,
          outputTokens,
          cachedInputTokens: Number(cacheRead) + Number(cacheCreation),
          totalTokens: inputTokens + outputTokens + Number(cacheRead) + Number(cacheCreation),
        },
      };
    } catch (err) {
      const elapsed = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);
      d(`failed ${elapsed}ms | ${message}`);
      if (err instanceof Error && err.stack) console.error(err.stack);

      return { success: false, summary: 'Agent execution failed', artifacts: [], error: message, output };
    } finally {
      try {
        await this.agent?.close();
      } finally {
        try {
          await functionToolBridge?.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          d(`function tool bridge close failed | ${message}`);
        }
      }
      this.agent = null;
      this.abortController = null;
    }
  }

  stop(): void {
    this.abortController?.abort();
    this.agent?.interrupt();
  }
}

function withFunctionToolBridge(
  mcpServers: Record<string, unknown> | undefined,
  bridge: CodexFunctionToolBridge | undefined,
): Record<string, unknown> | undefined {
  if (!bridge) return mcpServers;
  return {
    ...(mcpServers ?? {}),
    [bridge.name]: { type: 'http', url: bridge.url },
  };
}

export function normalizeOpenAgentMcpServers(
  mcpServers: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!mcpServers) return undefined;

  return Object.fromEntries(
    Object.entries(mcpServers).map(([name, server]) => [name, normalizeOpenAgentMcpServer(server)]),
  );
}

function normalizeOpenAgentMcpServer(server: unknown): unknown {
  if (!isRecord(server)) return server;

  const args = Array.isArray(server.args) ? server.args.map(String) : undefined;
  const badFetchPackageIndex = args?.indexOf('@modelcontextprotocol/server-fetch') ?? -1;
  if (String(server.command) !== 'npx' || !args || badFetchPackageIndex < 0) return server;

  return {
    ...server,
    command: 'uvx',
    args: ['mcp-server-fetch', ...args.slice(badFetchPackageIndex + 1)],
    env: {
      PYTHONIOENCODING: 'utf-8',
      ...(isRecord(server.env) ? server.env : {}),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function collectQueryResult(
  events: AsyncGenerator<SDKMessage, void>,
  output: string[],
  options: AgentRunOptions | undefined,
  log: (message: string) => void,
): Promise<{ text: string; usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }; num_turns: number }> {
  const collected: {
    text: string;
    usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
    num_turns: number;
  } = {
    text: '',
    usage: { input_tokens: 0, output_tokens: 0 },
    num_turns: 0,
  };

  for await (const event of events) {
    if (event.type === 'system' && event.subtype === 'init') {
      log(`sdk init | session=${event.session_id} model=${event.model} cwd=${event.cwd} permissionMode=${event.permission_mode} tools=${event.tools.join(',') || '-'} mcpServers=${event.mcp_servers.map((server) => `${server.name}:${server.status}`).join(',') || '-'}`);
      options?.onEvent?.({ type: 'session', sessionId: event.session_id });
      continue;
    }

    if (event.type === 'assistant') {
      const text = event.message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
      if (text) collected.text = text;

      for (const block of event.message.content) {
        if (block.type !== 'tool_use') continue;
        const line = `Tool: ${block.name} input=${JSON.stringify(block.input)}`;
        log(`tool use | id=${block.id} name=${block.name} input=${JSON.stringify(block.input)}`);
        output.push(line);
        options?.onEvent?.({ type: 'tool_use', id: block.id, name: block.name, input: block.input, line });
      }
      continue;
    }

    if (event.type === 'tool_result') {
      const result = event.result;
      log(`tool result | id=${result.tool_use_id} name=${result.tool_name} output=${truncateForLog(result.output)}`);
      options?.onEvent?.({ type: 'tool_result', toolUseId: result.tool_use_id, result: result.output });
      continue;
    }

    if (event.type === 'result') {
      collected.num_turns = event.num_turns ?? 0;
      collected.usage = {
        input_tokens: event.usage?.input_tokens ?? 0,
        output_tokens: event.usage?.output_tokens ?? 0,
        cache_read_input_tokens: event.usage?.cache_read_input_tokens,
        cache_creation_input_tokens: event.usage?.cache_creation_input_tokens,
      };
      if (event.is_error) {
        log(`sdk result error | subtype=${event.subtype} errors=${event.errors?.join('; ') || '-'}`);
      }
    }
  }

  return collected;
}

function truncateForLog(value: string, max = 1000): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function normalizeApiType(provider?: string): ApiType | undefined {
  if (provider === 'anthropic-messages' || provider === 'openai-completions') {
    return provider;
  }
  return undefined;
}

export function registerConfiguredSkills(agentDir: string | undefined, skills?: string[]): string[] {
  for (const skill of registeredConfiguredSkills) unregisterSkill(skill);
  registeredConfiguredSkills.clear();

  if (!agentDir || !Array.isArray(skills)) return [];

  const registered: string[] = [];
  for (const rawSkill of skills) {
    const skillName = sanitizeSkillName(rawSkill);
    if (!skillName) continue;

    const skillFile = resolveSkillFile(agentDir, skillName);
    if (!skillFile) continue;

    const source = readFileSync(skillFile, 'utf-8');
    const parsed = parseSkillMarkdown(source);
    const name = sanitizeSkillName(parsed.meta.name) || skillName;
    const aliases = new Set(parseListMeta(parsed.meta.aliases).map(sanitizeSkillName).filter(Boolean));
    if (name !== skillName) aliases.add(skillName);

    registerSkill({
      name,
      aliases: aliases.size ? [...aliases] : undefined,
      description: parsed.meta.description || summarizeSkillDescription(parsed.body, skillName),
      whenToUse: parsed.meta['when-to-use'] || parsed.meta.whenToUse,
      userInvocable: true,
      async getPrompt() {
        return [{ type: 'text', text: parsed.body || source }];
      },
    });
    registeredConfiguredSkills.add(name);
    registered.push(name);
  }

  return registered;
}

function resolveSkillFile(agentDir: string, skillName: string): string | undefined {
  const skillsBase = join(agentDir, 'skills');
  const folderSkillFile = join(skillsBase, skillName, 'SKILL.md');
  if (existsSync(folderSkillFile) && statSync(folderSkillFile).size > 0) return folderSkillFile;

  const legacySkillFile = join(skillsBase, `${skillName}.md`);
  if (existsSync(legacySkillFile) && statSync(legacySkillFile).size > 0) return legacySkillFile;

  const globalSkillFile = join(getDataDir(), 'skills', skillName, 'SKILL.md');
  if (existsSync(globalSkillFile) && statSync(globalSkillFile).size > 0) return globalSkillFile;

  const globalLegacySkillFile = join(getDataDir(), 'skills', `${skillName}.md`);
  if (existsSync(globalLegacySkillFile) && statSync(globalLegacySkillFile).size > 0) return globalLegacySkillFile;

  return undefined;
}

function parseSkillMarkdown(source: string): { meta: Record<string, string>; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: {}, body: source.trim() };

  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const parsed = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!parsed) continue;
    meta[parsed[1]] = parsed[2].trim().replace(/^['"]|['"]$/g, '');
  }

  return { meta, body: source.slice(match[0].length).trim() };
}

function summarizeSkillDescription(body: string, skillName: string): string {
  const firstLine = body
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find(Boolean);
  return firstLine || `Configured skill ${skillName}`;
}

function parseListMeta(value: string | undefined): string[] {
  if (!value) return [];
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, ''));
  }
  return trimmed.split(',').map((item) => item.trim());
}

function sanitizeSkillName(name: string | undefined): string {
  const raw = basename(name ?? '').replace(/\.md$/i, '').trim();
  return raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}
