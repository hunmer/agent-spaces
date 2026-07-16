import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AgentRunOptions,
  AgentRunResult,
  AgentRuntime,
  AgentRuntimeConfig,
} from './agent-runtime-types.js';
import { appendOutputStyleToPrompt, summarizeResult } from './agent-runtime-types.js';

type GrokJsonEvent = Record<string, unknown> & { type?: unknown };

export class GrokRuntime implements AgentRuntime {
  private static nextRunId = 1;
  private child: ChildProcessWithoutNullStreams | null = null;
  private activeRunId: number | null = null;

  constructor(private readonly config: AgentRuntimeConfig = {}) {}

  async execute(prompt: string, workingDir: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    const output: string[] = [];
    const cwd = workingDir || process.cwd();
    const grokHome = prepareGrokHome(this.config, options?.configDir, cwd);
    const args = buildGrokArgs(appendOutputStyleToPrompt(prompt, options?.outputStyle), cwd, this.config, options);
    const startedAt = Date.now();
    const runId = GrokRuntime.nextRunId++;
    const command = resolveGrokCommand();
    const endpoint = this.config.baseURL ? normalizeGrokEndpoint(this.config.provider, this.config.baseURL) : undefined;
    const log = (message: string) => console.log(`[grok:${runId}] ${message}`);
    this.activeRunId = runId;

    log(`starting | cwd=${cwd} command=${command} model=${this.config.model ?? 'default'} provider=${this.config.provider ?? 'default'} backend=${endpoint?.backend ?? 'native'} baseURL=${sanitizeUrlForLog(endpoint?.baseURL)} auth=${this.config.apiKey ? 'set' : 'default'} grokHome=${grokHome ?? 'default'} promptChars=${prompt.length} resume=${options?.resumeSessionId ?? '-'} maxTurns=${options?.maxTurns ?? '-'} tools=${options?.tools?.join(',') || 'default'} permission=${this.config.permissionMode ?? 'default'} effort=${this.config.thinkingEnabled === false ? 'none' : this.config.thinkingEffort ?? 'default'}`);

    return new Promise<AgentRunResult>((resolve) => {
      let settled = false;
      let stdoutBuffer = '';
      let stderrBuffer = '';
      let stderr = '';
      const textChunks: string[] = [];
      const thoughtChunks: string[] = [];
      let buffersFlushed = false;
      let sessionId = options?.resumeSessionId;
      let usage: AgentRunResult['usage'];
      let costUsd: number | undefined;
      let eventError: string | undefined;
      const eventCounts = new Map<string, number>();

      const flushBuffers = () => {
        if (buffersFlushed) return;
        buffersFlushed = true;
        const thought = mergeGrokTextChunks(thoughtChunks);
        const text = mergeGrokTextChunks(textChunks);
        if (thought) options?.onEvent?.({ type: 'reasoning', text: thought, status: 'completed' });
        if (text) {
          output.push(text);
          options?.onEvent?.({ type: 'output', line: text });
        }
        log(`buffers flushed | textChunks=${textChunks.length} textChars=${text.length} thoughtChunks=${thoughtChunks.length} thoughtChars=${thought.length}`);
      };

      const finish = (result: AgentRunResult) => {
        if (settled) return;
        settled = true;
        this.child = null;
        this.activeRunId = null;
        resolve(result);
      };

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        const event = parseGrokJsonLine(line);
        if (!event) {
          log(`stdout unparsed | chars=${line.length} preview=${truncateLog(line)}`);
          output.push(line);
          options?.onEvent?.({ type: 'output', line });
          return;
        }

        const eventType = typeof event.type === 'string' ? event.type : 'unknown';
        eventCounts.set(eventType, (eventCounts.get(eventType) ?? 0) + 1);

        switch (event.type) {
          case 'text': {
            const text = typeof event.data === 'string' ? event.data : '';
            if (!text) return;
            textChunks.push(text);
            log(`event text | chars=${text.length} chunks=${textChunks.length}`);
            break;
          }
          case 'thought': {
            const text = typeof event.data === 'string' ? event.data : '';
            log(`event thought | chars=${text.length}`);
            if (text) thoughtChunks.push(text);
            break;
          }
          case 'end': {
            flushBuffers();
            const nextSessionId = typeof event.sessionId === 'string' ? event.sessionId : undefined;
            if (nextSessionId && nextSessionId !== sessionId) {
              sessionId = nextSessionId;
              options?.onEvent?.({ type: 'session', sessionId });
            }
            usage = normalizeGrokUsage(event.usage);
            costUsd = typeof event.total_cost_usd === 'number' ? event.total_cost_usd : undefined;
            log(`event end | stopReason=${String(event.stopReason ?? '-')} session=${sessionId ?? '-'} usage=${formatUsage(usage)} costUsd=${costUsd ?? '-'} turns=${numberValue(event.num_turns) || '-'}`);
            break;
          }
          case 'error':
            eventError = typeof event.message === 'string' ? event.message : 'Grok execution failed';
            usage = normalizeGrokUsage(event.usage);
            costUsd = typeof event.total_cost_usd === 'number' ? event.total_cost_usd : undefined;
            log(`event error | message=${truncateLog(eventError)} usage=${formatUsage(usage)} costUsd=${costUsd ?? '-'}`);
            break;
          default:
            log(`event ${eventType} | keys=${Object.keys(event).join(',') || '-'}`);
        }
      };

      try {
        this.child = spawn(command, args, {
          cwd,
          env: buildGrokEnv(this.config, grokHome),
          windowsHide: true,
        });
        log(`spawned | pid=${this.child.pid ?? '-'}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`spawn failed | message=${truncateLog(message)}`);
        finish(failedResult(message, output, sessionId));
        return;
      }

      this.child.stdout.setEncoding('utf8');
      this.child.stderr.setEncoding('utf8');
      this.child.stdout.on('data', (chunk: string) => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? '';
        lines.forEach(handleLine);
      });
      this.child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
        stderrBuffer += chunk;
        const lines = stderrBuffer.split(/\r?\n/);
        stderrBuffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) log(`stderr | ${truncateLog(line)}`);
        }
      });
      this.child.on('error', (error) => {
        const message = error.message.includes('ENOENT')
          ? 'Grok CLI was not found. Install Grok and ensure the `grok` command is available on PATH.'
          : error.message;
        log(`failed ${Date.now() - startedAt}ms | ${message}`);
        finish(failedResult(message, output, sessionId));
      });
      this.child.on('close', (code, signal) => {
        handleLine(stdoutBuffer);
        flushBuffers();
        if (stderrBuffer.trim()) log(`stderr | ${truncateLog(stderrBuffer)}`);
        log(`closed | code=${code ?? '-'} signal=${signal ?? '-'} elapsedMs=${Date.now() - startedAt} events=${formatEventCounts(eventCounts)} stdoutItems=${output.length} stderrChars=${stderr.length}`);
        const error = eventError
          || (signal ? `Grok execution stopped by signal ${signal}` : undefined)
          || (code === 0 ? undefined : stderr.trim() || `Grok execution failed with exit code ${code ?? 'unknown'}`);
        if (error) {
          log(`failed | elapsedMs=${Date.now() - startedAt} message=${truncateLog(error)}`);
          finish({ ...failedResult(error, output, sessionId), usage, costUsd });
          return;
        }

        const resultText = mergeGrokTextChunks(textChunks);
        log(`done | elapsedMs=${Date.now() - startedAt} session=${sessionId ?? '-'} resultChars=${resultText.length} usage=${formatUsage(usage)} costUsd=${costUsd ?? '-'}`);
        finish({
          success: true,
          summary: summarizeResult(resultText),
          artifacts: [],
          output,
          sessionId,
          usage,
          costUsd,
        });
      });
    });
  }

  stop(): void {
    console.log(`[grok:${this.activeRunId ?? '-'}] stop requested | pid=${this.child?.pid ?? '-'}`);
    this.child?.kill();
  }
}

export function buildGrokArgs(
  prompt: string,
  cwd: string,
  config: AgentRuntimeConfig,
  options?: AgentRunOptions,
): string[] {
  const args = ['-p', prompt, '--cwd', cwd, '--output-format', 'streaming-json', '--no-auto-update'];
  if (config.model) args.push('--model', config.model);
  if (options?.resumeSessionId) args.push('--resume', options.resumeSessionId);
  if (options?.maxTurns) args.push('--max-turns', String(options.maxTurns));
  if (options?.tools?.length) args.push('--tools', options.tools.join(','));
  if (options?.systemPrompt?.trim()) args.push('--rules', options.systemPrompt.trim());
  if (config.permissionMode === 'bypassPermissions') args.push('--yolo');
  else if (config.permissionMode) args.push('--permission-mode', String(config.permissionMode));
  if (config.thinkingEnabled === false) args.push('--effort', 'none');
  else if (config.thinkingEffort) args.push('--effort', config.thinkingEffort);
  return args;
}

export function parseGrokJsonLine(line: string): GrokJsonEvent | null {
  try {
    const value = JSON.parse(line) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as GrokJsonEvent : null;
  } catch {
    return null;
  }
}

export function mergeGrokTextChunks(chunks: string[]): string {
  return chunks.join('');
}

function normalizeGrokUsage(value: unknown): AgentRunResult['usage'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const usage = value as Record<string, unknown>;
  const inputTokens = numberValue(usage.input_tokens);
  const outputTokens = numberValue(usage.output_tokens);
  const cachedInputTokens = numberValue(usage.cache_read_input_tokens);
  const totalTokens = numberValue(usage.total_tokens) || inputTokens + outputTokens + cachedInputTokens;
  return { inputTokens, outputTokens, cachedInputTokens, totalTokens };
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatUsage(usage: AgentRunResult['usage']): string {
  return usage
    ? `in=${usage.inputTokens},out=${usage.outputTokens},cached=${usage.cachedInputTokens ?? 0},total=${usage.totalTokens}`
    : '-';
}

function formatEventCounts(counts: Map<string, number>): string {
  return [...counts.entries()].map(([type, count]) => `${type}:${count}`).join(',') || '-';
}

function truncateLog(value: string, maxLength = 500): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function sanitizeUrlForLog(value?: string): string {
  if (!value) return 'default';
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return 'custom';
  }
}

function buildGrokEnv(config: AgentRuntimeConfig, grokHome?: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(config.apiKey ? {
      [grokHome ? 'AGENT_SPACES_GROK_API_KEY' : 'XAI_API_KEY']: config.apiKey,
    } : {}),
    ...(grokHome ? { GROK_HOME: grokHome } : {}),
  };
}

function prepareGrokHome(config: AgentRuntimeConfig, configDir: string | undefined, cwd: string): string | undefined {
  const content = buildGrokCustomModelConfig(config);
  if (!content) return undefined;
  const grokHome = join(configDir || cwd, '.grok');
  mkdirSync(grokHome, { recursive: true });
  writeFileSync(join(grokHome, 'config.toml'), content, { encoding: 'utf8', mode: 0o600 });
  return grokHome;
}

export function buildGrokCustomModelConfig(config: AgentRuntimeConfig): string | undefined {
  if (!config.model || !config.baseURL) return undefined;
  const endpoint = normalizeGrokEndpoint(config.provider, config.baseURL);
  const backend = endpoint?.backend;
  if (!backend) throw new Error(`Grok custom models do not support provider: ${config.provider ?? 'unknown'}`);

  const lines = [
    `[model.${tomlString(config.model)}]`,
    `model = ${tomlString(config.model)}`,
    `base_url = ${tomlString(endpoint.baseURL)}`,
    `name = ${tomlString(config.model)}`,
    `api_backend = ${tomlString(backend)}`,
    `max_completion_tokens = ${config.maxTokens ?? 16384}`,
  ];
  if (config.apiKey) {
    lines.push('env_key = "AGENT_SPACES_GROK_API_KEY"');
    if (backend === 'messages') {
      lines.push('extra_headers = { "x-api-key" = "${AGENT_SPACES_GROK_API_KEY}", "anthropic-version" = "2023-06-01" }');
    }
  }
  return `${lines.join('\n')}\n`;
}

function normalizeGrokEndpoint(
  provider: AgentRuntimeConfig['provider'],
  baseURL: string,
): { backend: 'chat_completions' | 'responses' | 'messages'; baseURL: string } | undefined {
  const normalized = baseURL.replace(/\/+$/, '');
  if (/^https:\/\/api\.minimaxi\.com\/anthropic$/i.test(normalized)) {
    return { backend: 'chat_completions', baseURL: 'https://api.minimaxi.com/v1' };
  }
  if (
    provider === 'anthropic-messages'
    || provider === 'openai-responses-to-anthropic-messages'
    || provider === 'openai-chat-completions-to-anthropic-messages'
  ) return { backend: 'messages', baseURL: normalized.endsWith('/v1') ? normalized : `${normalized}/v1` };
  if (provider === 'openai-responses') return { backend: 'responses', baseURL: normalized };
  if (provider === 'openai-chat-completions' || !provider) return { backend: 'chat_completions', baseURL: normalized };
  return undefined;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function resolveGrokCommand(): string {
  const configured = process.env.GROK_CLI_PATH?.trim();
  if (configured) return configured;
  if (process.platform === 'win32' && process.env.USERPROFILE) {
    const installed = join(process.env.USERPROFILE, '.grok', 'bin', 'grok.exe');
    if (existsSync(installed)) return installed;
  }
  return 'grok';
}

function failedResult(error: string, output: string[], sessionId?: string): AgentRunResult {
  return { success: false, summary: 'Grok execution failed', artifacts: [], error, output, sessionId };
}
