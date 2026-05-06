import { createAgent } from '@codeany/open-agent-sdk';
import type { Agent, ApiType } from '@codeany/open-agent-sdk';
import type {
  AgentRunOptions,
  AgentRunResult,
  AgentRuntime,
  AgentRuntimeConfig,
} from './agent-runtime-types.js';
import { summarizeResult } from './agent-runtime-types.js';

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
        systemPrompt: options?.systemPrompt,
        maxTurns: options?.maxTurns,
        allowedTools: options?.tools,
        additionalDirectories: options?.sandboxDirs,
        permissionMode: this.config.permissionMode ?? 'bypassPermissions',
        abortController: this.abortController,
      });

      d('agent created, sending prompt...');
      d('tool debug | open-agent-sdk runtime does not expose per-tool stream events through prompt(); only final text/usage is available here');
      const result = await this.agent.prompt(prompt);
      const elapsed = Date.now() - startTime;
      const inputTokens = result.usage.input_tokens;
      const outputTokens = result.usage.output_tokens;
      const usage = result.usage as unknown as Record<string, unknown>;
      const cacheRead = usage.cache_read_input_tokens ?? 0;
      const cacheCreation = usage.cache_creation_input_tokens ?? 0;

      output.push(result.text);
      output.push(`[Usage] tokens=${inputTokens + outputTokens + Number(cacheRead) + Number(cacheCreation)} input=${inputTokens} output=${outputTokens} cached=${Number(cacheRead) + Number(cacheCreation)}`);
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

function normalizeApiType(provider?: string): ApiType | undefined {
  if (provider === 'anthropic-messages' || provider === 'openai-completions') {
    return provider;
  }
  return undefined;
}
