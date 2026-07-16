import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
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
  private child: ChildProcessWithoutNullStreams | null = null;

  constructor(private readonly config: AgentRuntimeConfig = {}) {}

  async execute(prompt: string, workingDir: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    const output: string[] = [];
    const cwd = workingDir || process.cwd();
    const args = buildGrokArgs(appendOutputStyleToPrompt(prompt, options?.outputStyle), cwd, this.config, options);
    const startedAt = Date.now();
    const log = (message: string) => console.log(`[grok] ${message}`);

    log(`starting | cwd=${cwd} model=${this.config.model ?? 'default'} resume=${options?.resumeSessionId ?? '-'} maxTurns=${options?.maxTurns ?? '-'} tools=${options?.tools?.join(',') || 'default'}`);

    return new Promise<AgentRunResult>((resolve) => {
      let settled = false;
      let stdoutBuffer = '';
      let stderr = '';
      let resultText = '';
      let sessionId = options?.resumeSessionId;
      let usage: AgentRunResult['usage'];
      let costUsd: number | undefined;
      let eventError: string | undefined;

      const finish = (result: AgentRunResult) => {
        if (settled) return;
        settled = true;
        this.child = null;
        resolve(result);
      };

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        const event = parseGrokJsonLine(line);
        if (!event) {
          output.push(line);
          options?.onEvent?.({ type: 'output', line });
          return;
        }

        switch (event.type) {
          case 'text': {
            const text = typeof event.data === 'string' ? event.data : '';
            if (!text) return;
            resultText += text;
            output.push(text);
            options?.onEvent?.({ type: 'output', line: text });
            break;
          }
          case 'thought': {
            const text = typeof event.data === 'string' ? event.data : '';
            if (text) options?.onEvent?.({ type: 'reasoning', text, status: 'streaming' });
            break;
          }
          case 'end': {
            const nextSessionId = typeof event.sessionId === 'string' ? event.sessionId : undefined;
            if (nextSessionId && nextSessionId !== sessionId) {
              sessionId = nextSessionId;
              options?.onEvent?.({ type: 'session', sessionId });
            }
            usage = normalizeGrokUsage(event.usage);
            costUsd = typeof event.total_cost_usd === 'number' ? event.total_cost_usd : undefined;
            break;
          }
          case 'error':
            eventError = typeof event.message === 'string' ? event.message : 'Grok execution failed';
            usage = normalizeGrokUsage(event.usage);
            costUsd = typeof event.total_cost_usd === 'number' ? event.total_cost_usd : undefined;
            break;
        }
      };

      try {
        this.child = spawn(resolveGrokCommand(), args, {
          cwd,
          env: buildGrokEnv(this.config),
          windowsHide: true,
        });
      } catch (error) {
        finish(failedResult(error instanceof Error ? error.message : String(error), output, sessionId));
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
        const error = eventError
          || (signal ? `Grok execution stopped by signal ${signal}` : undefined)
          || (code === 0 ? undefined : stderr.trim() || `Grok execution failed with exit code ${code ?? 'unknown'}`);
        if (error) {
          log(`failed ${Date.now() - startedAt}ms | ${error}`);
          finish({ ...failedResult(error, output, sessionId), usage, costUsd });
          return;
        }

        log(`done ${Date.now() - startedAt}ms`);
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

function buildGrokEnv(config: AgentRuntimeConfig): NodeJS.ProcessEnv {
  return config.apiKey ? { ...process.env, XAI_API_KEY: config.apiKey } : process.env;
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
