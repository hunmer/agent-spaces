import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  AgentRunOptions,
  AgentRunResult,
  AgentRuntime,
  AgentRuntimeConfig,
} from './agent-runtime-types.js';
import { appendOutputStyleToPrompt, summarizeResult } from './agent-runtime-types.js';

type GeminiJsonEvent = Record<string, unknown> & { type?: unknown };

export class GeminiCliRuntime implements AgentRuntime {
  private child: ChildProcess | null = null;

  constructor(private readonly config: AgentRuntimeConfig = {}) {}

  async execute(prompt: string, workingDir: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    const output: string[] = [];
    const cwd = workingDir || process.cwd();
    const args = buildGeminiArgs(appendOutputStyleToPrompt(prompt, options?.outputStyle), this.config, options);
    const startedAt = Date.now();
    const log = (message: string) => console.log(`[gemini-cli] ${message}`);

    log(`starting | cwd=${cwd} command=${resolveGeminiCommand()} model=${this.config.model ?? 'default'} baseURL=${sanitizeUrlForLog(this.config.baseURL)} auth=${this.config.apiKey ? 'set' : 'default'} resume=${options?.resumeSessionId ?? '-'} maxTurns=${options?.maxTurns ?? '-'} permission=${this.config.permissionMode ?? 'default'}`);

    return new Promise<AgentRunResult>((resolve) => {
      let settled = false;
      let stdoutBuffer = '';
      let stderrBuffer = '';
      let stderr = '';
      let sessionId = options?.resumeSessionId;
      let usage: AgentRunResult['usage'];
      let eventError: string | undefined;
      let resultText = '';
      const textChunks: string[] = [];
      const eventCounts = new Map<string, number>();

      const finish = (result: AgentRunResult) => {
        if (settled) return;
        settled = true;
        this.child = null;
        resolve(result);
      };

      const emitOutput = (line: string) => {
        if (!line) return;
        output.push(line);
        options?.onEvent?.({ type: 'output', line });
      };

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        const event = parseGeminiJsonLine(line);
        if (!event) {
          emitOutput(line);
          return;
        }

        const eventType = typeof event.type === 'string' ? event.type : 'unknown';
        eventCounts.set(eventType, (eventCounts.get(eventType) ?? 0) + 1);

        switch (event.type) {
          case 'init': {
            const nextSessionId = stringValue(event.session_id);
            if (nextSessionId && nextSessionId !== sessionId) {
              sessionId = nextSessionId;
              options?.onEvent?.({ type: 'session', sessionId });
            }
            break;
          }
          case 'message': {
            if (event.role !== 'assistant') return;
            const text = stringValue(event.content);
            if (!text) return;
            textChunks.push(text);
            resultText = event.delta === true ? textChunks.join('') : text;
            emitOutput(text);
            break;
          }
          case 'tool_use': {
            const id = stringValue(event.tool_id) || `gemini-tool-${eventCounts.get('tool_use') ?? 1}`;
            const name = stringValue(event.tool_name) || 'tool';
            const input = event.parameters ?? event.arguments;
            options?.onEvent?.({
              type: 'tool_use',
              id,
              name,
              input,
              line: formatGeminiToolUseLine(name, input),
            });
            break;
          }
          case 'tool_result': {
            options?.onEvent?.({
              type: 'tool_result',
              toolUseId: stringValue(event.tool_id),
              result: {
                status: event.status,
                output: event.output,
                error: event.error,
              },
            });
            break;
          }
          case 'error': {
            const message = stringValue(event.message) || 'Gemini CLI reported an error';
            if (event.severity === 'error') eventError = message;
            emitOutput(message);
            break;
          }
          case 'result': {
            usage = normalizeGeminiUsage(event.stats);
            if (event.status === 'error') {
              eventError = stringValue((event.error as Record<string, unknown> | undefined)?.message)
                || 'Gemini CLI execution failed';
            }
            break;
          }
          default:
            log(`event ${eventType} | keys=${Object.keys(event).join(',') || '-'}`);
        }
      };

      let child: ChildProcess;
      try {
        const command = resolveGeminiCommand();
        const spawnSpec = buildSpawnSpec(command, args);
        child = spawn(spawnSpec.command, spawnSpec.args, {
          cwd,
          env: buildGeminiEnv(this.config),
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
        this.child = child;
      } catch (error) {
        finish(failedResult(error instanceof Error ? error.message : String(error), output, sessionId));
        return;
      }

      if (!child.stdout || !child.stderr) {
        finish(failedResult('Failed to open process stdout/stderr streams', output, sessionId));
        return;
      }

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? '';
        lines.forEach(handleLine);
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
        stderrBuffer += chunk;
        const lines = stderrBuffer.split(/\r?\n/);
        stderrBuffer = lines.pop() ?? '';
        for (const stderrLine of lines) {
          if (stderrLine.trim()) log(`stderr | ${truncateLog(stderrLine)}`);
        }
      });
      child.on('error', (error) => {
        const message = error.message.includes('ENOENT')
          ? 'Gemini CLI was not found. Install @google/gemini-cli and ensure `gemini` is available on PATH.'
          : error.message;
        finish(failedResult(message, output, sessionId));
      });
      child.on('close', (code, signal) => {
        handleLine(stdoutBuffer);
        if (stderrBuffer.trim()) log(`stderr | ${truncateLog(stderrBuffer)}`);
        const error = eventError
          || (signal ? `Gemini CLI execution stopped by signal ${signal}` : undefined)
          || (code === 0 ? undefined : stderr.trim() || `Gemini CLI execution failed with exit code ${code ?? 'unknown'}`);
        log(`closed | code=${code ?? '-'} signal=${signal ?? '-'} elapsedMs=${Date.now() - startedAt} events=${formatEventCounts(eventCounts)} outputItems=${output.length}`);
        if (error) {
          finish({ ...failedResult(error, output, sessionId), usage });
          return;
        }

        const text = resultText || output.at(-1) || '';
        finish({
          success: true,
          summary: summarizeResult(text),
          artifacts: [],
          output,
          sessionId,
          usage,
        });
      });
    });
  }

  stop(): void {
    this.child?.kill();
  }
}

export function buildGeminiArgs(prompt: string, config: AgentRuntimeConfig, options?: AgentRunOptions): string[] {
  const args = ['-p', prompt, '--output-format', 'stream-json'];
  if (config.model) args.push('--model', config.model);
  if (options?.resumeSessionId) args.push('-r', options.resumeSessionId);
  if (options?.maxTurns) args.push('--max-turns', String(options.maxTurns));
  if (config.permissionMode === 'bypassPermissions') args.push('--yolo');
  else if (config.permissionMode === 'acceptEdits' || config.permissionMode === 'auto') {
    args.push('--approval-mode', 'auto_edit');
  }
  return args;
}

export function parseGeminiJsonLine(line: string): GeminiJsonEvent | null {
  try {
    const value = JSON.parse(line) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as GeminiJsonEvent : null;
  } catch {
    return null;
  }
}

export function normalizeGeminiUsage(value: unknown): AgentRunResult['usage'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const stats = value as Record<string, unknown>;
  const inputTokens = numberValue(stats.input_tokens ?? stats.input);
  const outputTokens = numberValue(stats.output_tokens);
  const cachedInputTokens = numberValue(stats.cached);
  const totalTokens = numberValue(stats.total_tokens) || inputTokens + outputTokens + cachedInputTokens;
  return { inputTokens, outputTokens, cachedInputTokens, totalTokens };
}

function buildGeminiEnv(config: AgentRuntimeConfig): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(config.apiKey ? { GEMINI_API_KEY: config.apiKey } : {}),
    ...(config.baseURL ? { GOOGLE_GEMINI_BASE_URL: config.baseURL } : {}),
  };
}

function resolveGeminiCommand(): string {
  const configured = process.env.GEMINI_CLI_PATH?.trim();
  if (configured) return configured;
  if (process.platform === 'win32') {
    const installed = resolveWindowsGeminiShim();
    if (installed) return installed;
  }
  return 'gemini';
}

function buildSpawnSpec(command: string, args: string[]): { command: string; args: string[] } {
  const bundle = resolveGeminiBundle(command);
  if (bundle) return { command: process.execPath, args: [bundle, ...args] };
  if (process.platform !== 'win32' || !/\.(?:cmd|bat)$/i.test(command)) return { command, args };
  return { command: 'cmd.exe', args: ['/d', '/s', '/c', buildWindowsCommandLine(command, args)] };
}

function resolveWindowsGeminiShim(): string | undefined {
  const candidates = [
    process.env.APPDATA ? join(process.env.APPDATA, 'npm', 'gemini.cmd') : undefined,
    process.env.USERPROFILE ? join(process.env.USERPROFILE, 'AppData', 'Roaming', 'npm', 'gemini.cmd') : undefined,
  ];
  return candidates.find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
}

function resolveGeminiBundle(command: string): string | undefined {
  if (process.platform !== 'win32' || !/\.(?:cmd|bat)$/i.test(command)) return undefined;
  const bundle = join(dirname(command), 'node_modules', '@google', 'gemini-cli', 'bundle', 'gemini.js');
  return existsSync(bundle) ? bundle : undefined;
}

function buildWindowsCommandLine(command: string, args: string[]): string {
  return [quoteWindowsArg(command), ...args.map(quoteWindowsArg)].join(' ');
}

function quoteWindowsArg(value: string): string {
  if (value.length === 0) return '""';
  if (!/[\s"]/u.test(value)) return value;
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;
}

function formatGeminiToolUseLine(name: string, input: unknown): string {
  const summary = summarizeToolInput(input);
  return summary ? `Tool: ${name} ${summary}` : `Tool: ${name}`;
}

function summarizeToolInput(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '';
  const record = input as Record<string, unknown>;
  for (const key of ['path', 'file_path', 'command', 'query', 'pattern', 'prompt']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return `${key}=${JSON.stringify(truncateLog(value.trim(), 140))}`;
  }
  return JSON.stringify(Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, typeof value === 'string' ? truncateLog(value, 140) : value]),
  ));
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
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

function formatEventCounts(counts: Map<string, number>): string {
  return [...counts.entries()].map(([type, count]) => `${type}:${count}`).join(',') || '-';
}

function truncateLog(value: string, maxLength = 500): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function failedResult(error: string, output: string[], sessionId?: string): AgentRunResult {
  return { success: false, summary: 'Gemini CLI execution failed', artifacts: [], error, output, sessionId };
}
