import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExecutionLogEntry } from '@agent-spaces/shared';

type AppendLog = (level: ExecutionLogEntry['level'], message: string) => void;

function assertObjectResult(result: unknown, runnerName: 'run_code' | 'run_python'): Record<string, any> {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error(`${runnerName} must return an object`);
  }
  return result as Record<string, any>;
}

export function executeCode(
  context: Record<string, any>,
  code: string,
  params: Record<string, any>,
  appendLog: AppendLog,
): any {
  const normalized = code
    .replace(/\basync\s+function\s+main\s*\(\s*\{\s*params\s*\}\s*:\s*Args\s*\)\s*:\s*Promise\s*<\s*Output\s*>/g, 'async function main({ params })')
    .replace(/\bfunction\s+main\s*\(\s*\{\s*params\s*\}\s*:\s*Args\s*\)\s*:\s*Output/g, 'function main({ params })');
  const formatConsoleValue = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.stack || value.message;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };
  const workflowConsole = {
    ...console,
    log: (...args: unknown[]) => {
      console.log(...args);
      appendLog('info', args.map(formatConsoleValue).join(' '));
    },
    info: (...args: unknown[]) => {
      console.info(...args);
      appendLog('info', args.map(formatConsoleValue).join(' '));
    },
    warn: (...args: unknown[]) => {
      console.warn(...args);
      appendLog('warning', args.map(formatConsoleValue).join(' '));
    },
    error: (...args: unknown[]) => {
      console.error(...args);
      appendLog('error', args.map(formatConsoleValue).join(' '));
    },
  };
  const fn = new Function('context', 'params', 'console', `${normalized}\nif (typeof main === 'function') return main({ params, context })`);
  const result = fn(context, params, workflowConsole);
  return result instanceof Promise
    ? result.then(value => assertObjectResult(value, 'run_code'))
    : assertObjectResult(result, 'run_code');
}

export async function executePython(
  pythonPath: string,
  code: string,
  params: Record<string, any>,
  appendLog: AppendLog,
): Promise<any> {
  const python = pythonPath.trim() || 'python';
  if (!code.trim()) throw new Error('Python code is empty');

  // User code runs at module top level, then we call main(params) if defined.
  const wrapper = `import os, json, sys

__WF_PARAMS__ = json.loads(os.environ.get('__WF_PARAMS__', '{}'))

${code}

if 'main' in dir() and callable(main):
    __wf_result = main(__WF_PARAMS__)
else:
    __wf_result = None

sys.stdout.write('__WF_RESULT__' + json.dumps(__wf_result, default=str) + '__WF_RESULT_END__')
sys.stdout.flush()
`;

  const dir = await mkdtemp(join(tmpdir(), 'wf-python-'));
  const scriptPath = join(dir, 'main.py');
  try {
    await writeFile(scriptPath, wrapper, 'utf8');

    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(python, [scriptPath], {
        cwd: dir,
        env: { ...process.env, __WF_PARAMS__: JSON.stringify(params ?? {}) },
        timeout: 300_000,
        maxBuffer: 10 * 1024 * 1024,
      }, (error, out, stderr) => {
        const stderrText = String(stderr || '');
        if (stderrText) appendLog('error', stderrText.trim());
        if (error) {
          reject(new Error(`Python execution failed: ${stderrText.trim() || error.message}`));
          return;
        }
        resolve(String(out || ''));
      });
    });

    const start = stdout.lastIndexOf('__WF_RESULT__');
    const end = stdout.lastIndexOf('__WF_RESULT_END__');
    if (start === -1 || end === -1 || end <= start) {
      const rest = stdout.replace('__WF_RESULT__', '').replace('__WF_RESULT_END__', '').trim();
      if (rest) appendLog('info', rest);
      appendLog('warning', 'Python code produced no result marker');
      throw new Error('run_python must return an object');
    }

    const before = stdout.slice(0, start);
    if (before.trim()) appendLog('info', before.trim());

    const payload = stdout.slice(start + '__WF_RESULT__'.length, end).trim();
    let result: unknown;
    try {
      result = payload === '' ? null : JSON.parse(payload);
    } catch {
      appendLog('warning', `Python returned non-JSON result: ${payload}`);
      throw new Error('run_python must return an object');
    }
    return assertObjectResult(result, 'run_python');
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
