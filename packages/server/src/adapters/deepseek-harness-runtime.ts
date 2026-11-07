import { spawn, type ChildProcess } from 'node:child_process';
import type { AgentRunOptions, AgentRunResult, AgentRuntime, AgentRuntimeConfig } from './agent-runtime-types.js';
import { appendOutputStyleToPrompt, summarizeResult } from './agent-runtime-types.js';
import { buildDshSpawnSpec, resolveDshCommand } from './deepseek-harness-command.js';

/** DSH's plain headless protocol: one fresh run, final stdout, reasoning on stderr. */
export class DeepSeekHarnessRuntime implements AgentRuntime {
  private child: ChildProcess | null = null;
  private stopRun: (() => void) | null = null;

  // DSH resolves provider, model and credentials from its own profile/environment.
  constructor(_config: AgentRuntimeConfig = {}) {}

  async execute(prompt: string, workingDir: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    if (this.child) return failedResult('DeepSeek Harness CLI is already running', []);
    let spec;
    try {
      spec = buildDshSpawnSpec(resolveDshCommand(), buildDshArgs(prompt, options));
    } catch (error) {
      return failedResult(error instanceof Error ? error.message : String(error), []);
    }
    return new Promise<AgentRunResult>((resolveResult) => {
      let child: ChildProcess;
      let settled = false;
      let stopped = false;
      let stdout = '';
      let stderr = '';
      let stderrBuffer = '';
      let reasoning = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const output: string[] = [];
      const finish = (result: AgentRunResult) => {
        if (settled) return;
        settled = true;
        if (killTimer) clearTimeout(killTimer);
        if (this.child === child) {
          this.child = null;
          this.stopRun = null;
        }
        resolveResult(result);
      };
      const handleStderrLine = (line: string) => {
        if (line.trim() === 'dsh: reasoning:') {
          reasoning = true;
          return;
        }
        if (/^dsh: /.test(line)) reasoning = false;
        if (reasoning && line) options?.onEvent?.({ type: 'reasoning', text: `${line}\n`, status: 'streaming' });
      };
      const killGroup = (signal: NodeJS.Signals) => {
        if (!child.pid) return;
        try {
          if (process.platform !== 'win32') process.kill(-child.pid, signal);
          else child.kill(signal);
        } catch {
          child.kill(signal);
        }
      };
      try {
        child = spawn(spec.command, spec.args, {
          cwd: workingDir || process.cwd(),
          env: { ...process.env },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          detached: process.platform !== 'win32',
        });
        this.child = child;
      } catch (error) {
        finish(failedResult(error instanceof Error ? error.message : String(error), output));
        return;
      }
      this.stopRun = () => {
        if (stopped || settled) return;
        stopped = true;
        if (process.platform === 'win32' && child.pid) {
          // Killing only node.exe would leave tools launched by the CLI running.
          const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          killer.on('error', () => killGroup('SIGTERM'));
          killer.on('close', (code) => { if (code !== 0 && !settled) killGroup('SIGTERM'); });
        } else {
          killGroup('SIGTERM');
        }
        killTimer = setTimeout(() => { if (!settled) killGroup('SIGKILL'); }, 1000);
        killTimer.unref();
      };
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => { stdout += chunk; });
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk;
        stderrBuffer += chunk;
        const lines = stderrBuffer.split(/\r?\n/);
        stderrBuffer = lines.pop() ?? '';
        lines.forEach(handleStderrLine);
      });
      child.on('error', (error) => {
        const message = error.message.includes('ENOENT')
          ? 'DeepSeek Harness CLI was not found. Install @deepseek-ai/dsh, ensure dsh is on PATH, or set DSH_CLI_PATH.'
          : error.message;
        finish(failedResult(message, output));
      });
      child.on('close', (code, signal) => {
        if (settled) return;
        if (stderrBuffer) handleStderrLine(stderrBuffer);
        if (reasoning) options?.onEvent?.({ type: 'reasoning', text: '', status: 'completed' });
        // The CLI appends one newline; retain all other formatting and the whole answer.
        const text = stdout.replace(/\r?\n$/, '');
        if (text.trim()) {
          output.push(text);
          options?.onEvent?.({ type: 'output', line: text });
        }
        const error = stopped ? 'DeepSeek Harness CLI execution stopped'
          : signal ? `DeepSeek Harness CLI execution stopped by signal ${signal}`
          : code !== 0 ? stderr.trim() || `DeepSeek Harness CLI execution failed with exit code ${code ?? 'unknown'}`
          : !text.trim() ? 'DeepSeek Harness CLI completed without an answer'
          : undefined;
        finish(error ? failedResult(error, output) : {
          success: true,
          summary: summarizeResult(text),
          artifacts: [],
          output,
        });
      });
    });
  }

  stop(): void {
    this.stopRun?.();
  }
}

export function buildDshArgs(prompt: string, options?: AgentRunOptions): string[] {
  const task = options?.systemPrompt
    ? `System instructions:\n${options.systemPrompt}\n\n${prompt}`
    : prompt;
  const styledTask = appendOutputStyleToPrompt(task, options?.outputStyle);
  // A task beginning with '-' must not become a CLI flag or stdin sentinel.
  return ['--profile', 'headless', /^-/.test(styledTask) ? `Task:\n${styledTask}` : styledTask];
}

function failedResult(error: string, output: string[]): AgentRunResult {
  return { success: false, summary: 'DeepSeek Harness CLI execution failed', artifacts: [], error, output };
}
