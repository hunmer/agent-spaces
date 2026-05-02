/**
 * Agent runtime adapter interface.
 */

import { createAgent } from '@codeany/open-agent-sdk';
import type { Agent, AgentOptions, ApiType } from '@codeany/open-agent-sdk';

export interface AgentRunResult {
  success: boolean;
  summary: string;
  artifacts: string[];
  error?: string;
  output: string[];
}

export interface AgentRuntime {
  execute(prompt: string, workingDir: string, options?: AgentRunOptions): Promise<AgentRunResult>;
  stop(): void;
}

export interface AgentRunOptions {
  maxTurns?: number;
  tools?: string[];
  sandboxDirs?: string[];
}

export type AgentRuntimeKind = 'open-agent-sdk' | 'claude-code';

export interface AgentRuntimeConfig {
  kind?: AgentRuntimeKind;
  provider?: ApiType | string;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  permissionMode?: AgentOptions['permissionMode'];
}

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

    d(`starting | cwd=${cwd} provider=${this.config.provider ?? 'default'} model=${this.config.model ?? 'default'} baseURL=${this.config.baseURL ?? 'default'} permissionMode=${this.config.permissionMode ?? 'bypassPermissions'} maxTurns=${options?.maxTurns ?? '∞'} tools=${options?.tools?.join(',') ?? 'all'} sandboxDirs=${options?.sandboxDirs?.join(',') ?? '-'}`);
    d(`prompt: ${prompt.slice(0, 300)}${prompt.length > 300 ? '...' : ''}`);

    try {
      this.agent = createAgent({
        apiType: normalizeApiType(this.config.provider),
        model: this.config.model,
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
        cwd,
        maxTurns: options?.maxTurns,
        allowedTools: options?.tools,
        additionalDirectories: options?.sandboxDirs,
        permissionMode: this.config.permissionMode ?? 'bypassPermissions',
        abortController: this.abortController,
      });

      d('agent created, sending prompt...');
      const result = await this.agent.prompt(prompt);
      const elapsed = Date.now() - startTime;
      const inputTokens = result.usage.input_tokens;
      const outputTokens = result.usage.output_tokens;
      const cacheRead = (result.usage as Record<string, unknown>).cache_read_input_tokens ?? 0;
      const cacheCreation = (result.usage as Record<string, unknown>).cache_creation_input_tokens ?? 0;

      output.push(result.text);
      d(`done ${elapsed}ms | turns=${result.num_turns} tokens=${inputTokens + outputTokens} (in=${inputTokens} out=${outputTokens})${Number(cacheRead) > 0 || Number(cacheCreation) > 0 ? ` cache=(read=${cacheRead},create=${cacheCreation})` : ''}`);

      return { success: true, summary: summarizeResult(result.text), artifacts: [], output };
    } catch (err) {
      const elapsed = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);
      d(`failed ${elapsed}ms | ${message}`);
      if (err instanceof Error && err.stack) console.error(err.stack);

      return { success: false, summary: 'Agent execution failed', artifacts: [], error: message, output };
    } finally {
      await this.agent?.close();
      this.agent = null;
      this.abortController = null;
    }
  }

  stop(): void {
    this.abortController?.abort();
    this.agent?.interrupt();
  }
}

/**
 * Placeholder for a future Claude Code runtime implementation.
 * Keeps the runtime factory shape stable while the implementation is added.
 */
export class ClaudeCodeRuntime implements AgentRuntime {
  async execute(): Promise<AgentRunResult> {
    return {
      success: false,
      summary: 'Claude Code runtime is not implemented yet',
      artifacts: [],
      error: 'Claude Code runtime is not implemented yet',
      output: ['Claude Code runtime is not implemented yet'],
    };
  }

  stop(): void {
    // No active process until the Claude Code runtime is implemented.
  }
}

export function createAgentRuntime(config?: AgentRuntimeConfig): AgentRuntime;
export function createAgentRuntime(provider?: string, model?: string): AgentRuntime;
export function createAgentRuntime(
  configOrProvider: AgentRuntimeConfig | string = {},
  model?: string,
): AgentRuntime {
  const config =
    typeof configOrProvider === 'string'
      ? { provider: configOrProvider, model }
      : configOrProvider;

  switch (config.kind ?? 'open-agent-sdk') {
    case 'open-agent-sdk':
      return new OpenAgentSdkRuntime(config);
    case 'claude-code':
      return new ClaudeCodeRuntime();
  }
}

function normalizeApiType(provider?: string): ApiType | undefined {
  if (provider === 'anthropic-messages' || provider === 'openai-completions') {
    return provider;
  }
  return undefined;
}

function summarizeResult(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return 'Completed agent execution';
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}
