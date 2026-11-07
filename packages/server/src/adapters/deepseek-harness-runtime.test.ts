import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { AgentRuntimeEvent } from './agent-runtime-types.js';
import { buildDshSpawnSpec, resolveDshCommand } from './deepseek-harness-command.js';
import { buildDshArgs, DeepSeekHarnessRuntime } from './deepseek-harness-runtime.js';

// Synthetic subprocess fixtures only; real-model acceptance is separate.
const FIXTURE = String.raw`
const { spawn } = require('node:child_process');
const mode = process.env.DSH_TEST_MODE;
if (mode === 'capture') {
  process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(),
    env: { DSH_HOME: process.env.DSH_HOME, OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL } }) + '\n');
} else if (mode === 'streams') {
  const answer = Buffer.from('  First line\n' + '完整答案🙂'.repeat(50) + '\nLast line\n\n');
  process.stderr.write('dsh: startup diagnostic\r\ndsh: reason');
  setTimeout(() => {
    process.stderr.write('ing:\r\nReason one\r\nReason two');
    const split = Buffer.byteLength('  First line\n') + 1;
    process.stdout.write(answer.subarray(0, split));
    setTimeout(() => process.stdout.write(answer.subarray(split)), 15);
  }, 15);
} else if (mode === 'failure') {
  process.stdout.write('Partial answer without trailing newline');
  process.stderr.write('dsh: CLI request failed');
  process.exitCode = 7;
} else if (mode === 'empty') {
  process.stdout.write(' \r\n');
  process.stderr.write('dsh: reasoning:\nOnly reasoning, no answer');
} else if (mode === 'signal') {
  process.kill(process.pid, 'SIGTERM');
} else if (mode === 'stop') {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 15000)'], { stdio: 'ignore' });
  process.stderr.write('dsh: reasoning:\nREADY ' + process.pid + ' ' + child.pid + '\n');
  setTimeout(() => {}, 15000);
} else process.stdout.write('Fixture answer without trailing newline');
`;

type FixtureContext = { root: string; entry: string; setEnv: (key: string, value: string | undefined) => void };
async function withFixture(mode: string, run: (c: FixtureContext) => Promise<void> | void): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'dsh runtime 中文 '));
  const entry = join(root, 'fake dsh.cjs');
  const original = new Map<string, string | undefined>();
  const setEnv = (key: string, value: string | undefined) => {
    if (!original.has(key)) original.set(key, process.env[key]);
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  };
  writeFileSync(entry, FIXTURE, 'utf8');
  setEnv('DSH_CLI_PATH', entry);
  setEnv('DSH_TEST_MODE', mode);
  try { await run({ root, entry, setEnv }); }
  finally {
    for (const [key, value] of original) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    rmSync(root, { recursive: true, force: true });
  }
}
async function deadline<T>(promise: Promise<T>, ms = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('DSH fixture timed out')), ms);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
function pidExists(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }
function cleanPid(pid: number | undefined): void {
  if (!pid || !pidExists(pid)) return;
  if (process.platform === 'win32') spawnSync('taskkill.exe', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else try { process.kill(pid, 'SIGKILL'); } catch { /* exited */ }
}

test('buildDshArgs preserves complete prompt as one positional arg and omits platform controls', () => {
  const prompt = '完整历史\nuser: say "hello"\nassistant: earlier\nuser: %NAME% !literal! & | < > ^ ` $() \\';
  assert.deepEqual(buildDshArgs(prompt, {
    resumeSessionId: 'must-not-resume', maxTurns: 3, tools: ['platform-tool'],
    mcpServers: { platform: { command: 'must-not-run' } }, skills: ['platform-skill'],
  }), ['--profile', 'headless', prompt]);
  assert.deepEqual(buildDshArgs('hello', { systemPrompt: 'Be concise.\nKeep history.' }), [
    '--profile', 'headless', 'System instructions:\nBe concise.\nKeep history.\n\nhello',
  ]);
  assert.deepEqual(buildDshArgs('--flag'), ['--profile', 'headless', 'Task:\n--flag']);
});

test('DSH_CLI_PATH override is trimmed and an explicit invalid value remains authoritative', async () => {
  await withFixture('answer', ({ root, entry, setEnv }) => {
    setEnv('DSH_CLI_PATH', `  ${entry}  `); assert.equal(resolveDshCommand(), entry);
    const missing = join(root, 'missing.exe'); setEnv('DSH_CLI_PATH', missing);
    assert.equal(resolveDshCommand(), missing);
    setEnv('DSH_CLI_PATH', '  '); assert.notEqual(resolveDshCommand(), missing);
  });
});

test('buildDshSpawnSpec invokes JS through node without changing argument boundaries', async () => {
  await withFixture('answer', ({ entry }) => {
    const args = ['--profile', 'headless', 'line\n"quoted" %PATH% !name! & | ^ <> 中文'];
    assert.deepEqual(buildDshSpawnSpec(entry, args), { command: process.execPath, args: [entry, ...args] });
    assert.deepEqual(args, ['--profile', 'headless', 'line\n"quoted" %PATH% !name! & | ^ <> 中文']);
    for (const ext of ['js', 'mjs', 'cjs']) {
      const path = entry.replace(/cjs$/, ext);
      assert.deepEqual(buildDshSpawnSpec(path, args), { command: process.execPath, args: [path, ...args] });
    }
  });
});

test('Windows npm DSH shim is unwrapped and unknown batches fail clearly', { skip: process.platform !== 'win32' }, async () => {
  await withFixture('answer', ({ root }) => {
    const bin = join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
    mkdirSync(join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib'), { recursive: true }); writeFileSync(bin, '', 'utf8');
    const shim = join(root, 'dsh.cmd'); writeFileSync(shim, '@"%dp0%\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js" %*', 'utf8');
    const args = ['--profile', 'headless', 'literal "quotes"\n%NAME% !name! & echo text'];
    assert.deepEqual(buildDshSpawnSpec(shim, args), { command: process.execPath, args: [bin, ...args] });
    const custom = join(root, 'custom.cmd'); writeFileSync(custom, '@echo custom launcher', 'utf8');
    assert.throws(() => buildDshSpawnSpec(custom, args), /DSH batch launcher.*DSH_CLI_PATH/);
    assert.throws(() => buildDshSpawnSpec(join(root, 'missing.bat'), args), /DSH batch launcher/);
  });
});

test('runtime inherits local DSH env, while not bridging platform model, tools, or resume config', async () => {
  await withFixture('capture', async ({ root, setEnv }) => {
    setEnv('DSH_HOME', join(root, 'local DSH home')); setEnv('OPENAI_API_KEY', 'synthetic-local-key');
    setEnv('OPENAI_BASE_URL', 'https://local.example.test/v1');
    const prompt = 'History:\nuser: first\nassistant: earlier\nuser: 中文 "quotes" %KEY% !literal! & | < > ^';
    let toolCalls = 0; const events: AgentRuntimeEvent[] = [];
    const runtime = new DeepSeekHarnessRuntime({ kind: 'deepseek-harness', provider: 'platform-provider', model: 'platform-model',
      apiKey: 'synthetic-platform-key', baseURL: 'https://platform.example.test/v1', permissionMode: 'bypassPermissions',
      thinkingEffort: 'high', maxTokens: 123 });
    const result = await deadline(runtime.execute(prompt, root, {
      tools: ['platform-tool'], resumeSessionId: 'old-session', configDir: join(root, 'agent-config'),
      userPrompt: 'latest-only shorthand must not replace the complete prompt',
      mcpServers: { platform: { command: 'must-not-run' } }, skills: ['platform-skill'], maxTurns: 4,
      functionTools: [{ name: 'platform-tool', description: 'must not run', inputSchema: {},
        execute: async () => { toolCalls += 1; return 'not called'; } }], onEvent: (event) => events.push(event),
    }));
    assert.equal(result.success, true, result.error);
    const capture = JSON.parse(result.output[0]!) as { argv: string[]; cwd: string; env: Record<string, string> };
    assert.deepEqual(capture.argv, ['--profile', 'headless', prompt]); assert.equal(capture.cwd, root);
    assert.deepEqual(capture.env, { DSH_HOME: join(root, 'local DSH home'), OPENAI_API_KEY: 'synthetic-local-key',
      OPENAI_BASE_URL: 'https://local.example.test/v1' });
    assert.equal(toolCalls, 0); assert.equal(result.sessionId, undefined); assert.equal(result.usage, undefined);
    assert.equal(result.costUsd, undefined);
    assert.equal(events.some((e) => e.type === 'session' || e.type === 'tool_use'), false);
    assert.deepEqual(readdirSync(root), ['fake dsh.cjs']);
  });
});

test('runtime preserves chunked stdout, emits one answer, and separates stderr reasoning', async () => {
  await withFixture('streams', async ({ root }) => {
    const events: AgentRuntimeEvent[] = [];
    const result = await deadline(new DeepSeekHarnessRuntime().execute('hello', root, { onEvent: (e) => events.push(e) }));
    const answer = '  First line\n' + '完整答案🙂'.repeat(50) + '\nLast line\n';
    assert.equal(result.success, true, result.error); assert.deepEqual(result.output, [answer]);
    assert.deepEqual(events.filter((e) => e.type === 'output'), [{ type: 'output', line: answer }]);
    assert.equal(result.summary.length <= 160, true);
    const reasoning = events.filter((e) => e.type === 'reasoning');
    assert.equal(reasoning.map((e) => e.text).join(''), 'Reason one\nReason two\n');
    assert.equal(reasoning.at(-1)?.status, 'completed');
    assert.equal(JSON.stringify(result).includes('Reason one'), false);
    assert.equal(JSON.stringify(events).includes('startup diagnostic'), false);
  });
});

test('runtime accepts no-final-newline answer and can run twice', async () => {
  await withFixture('answer', async ({ root }) => {
    const runtime = new DeepSeekHarnessRuntime();
    for (let i = 0; i < 2; i++) {
      const result = await deadline(runtime.execute('hello', root));
      assert.equal(result.success, true, result.error); assert.deepEqual(result.output, ['Fixture answer without trailing newline']);
    }
    runtime.stop();
  });
});

test('runtime reports nonzero exit and retains partial stdout', async () => {
  await withFixture('failure', async ({ root }) => {
    const result = await deadline(new DeepSeekHarnessRuntime().execute('hello', root));
    assert.equal(result.success, false); assert.match(result.error ?? '', /dsh: CLI request failed/);
    assert.deepEqual(result.output, ['Partial answer without trailing newline']);
  });
});

test('runtime rejects a successful exit with no answer despite stderr reasoning', async () => {
  await withFixture('empty', async ({ root }) => {
    const result = await deadline(new DeepSeekHarnessRuntime().execute('hello', root));
    assert.equal(result.success, false); assert.match(result.error ?? '', /without an answer/); assert.deepEqual(result.output, []);
  });
});

test('invalid explicit CLI path fails with no installed-CLI fallback', async () => {
  await withFixture('answer', async ({ root, setEnv }) => {
    setEnv('DSH_CLI_PATH', join(root, 'not-installed.exe'));
    const runtime = new DeepSeekHarnessRuntime();
    let outputEvents = 0;
    const result = await deadline(runtime.execute('do not call real CLI', root, { onEvent: () => { outputEvents += 1; } }));
    assert.equal(result.success, false); assert.match(result.error ?? '', /CLI was not found.*DSH_CLI_PATH/);
    assert.deepEqual(result.output, []); assert.equal(outputEvents, 0);
    // ENOENT emits error then close; a stale close must not publish output or clear the next run.
    setEnv('DSH_CLI_PATH', join(root, 'fake dsh.cjs'));
    const next = await deadline(runtime.execute('fixture only', root, { onEvent: () => { outputEvents += 1; } }));
    assert.equal(next.success, true, next.error);
    assert.equal(result.success, false);
    assert.equal(outputEvents, 1);
  });
});

test('platform prompt history survives factory dispatch into the DSH child', async () => {
  await withFixture('capture', async ({ root, setEnv }) => {
    setEnv('AGENT_SPACES_DATA_DIR', join(root, 'isolated-platform-data'));
    const { createAgentRuntime } = await import('./agent-runtime.js');
    const { buildAgentPrompt } = await import('../ws/agent-prompt.js');
    const prompt = buildAgentPrompt('isolated-dsh-test', undefined, 'Multiply the previous integer by 23.', [
      { id: 'h1', channelId: 'synthetic', senderId: 'user', type: 'text', status: 'completed',
        content: 'The starting integer is 17.', createdAt: '' },
      { id: 'h2', channelId: 'synthetic', senderId: 'agent', senderRole: 'assistant', type: 'text', status: 'completed',
        content: 'I will remember the integer.', createdAt: '' },
    ], { runtimeKind: 'deepseek-harness', mcpServers: [], skills: [], workingDir: root });
    const runtime = createAgentRuntime({ kind: 'deepseek-harness' });
    const result = await deadline(runtime.execute(prompt, root, { userPrompt: 'latest-only shorthand' }));
    assert.equal(result.success, true, result.error);
    const capture = JSON.parse(result.output[0]!) as { argv: string[] };
    assert.deepEqual(capture.argv, ['--profile', 'headless', prompt]);
    assert.match(capture.argv[2]!, /Conversation history:/);
    assert.match(capture.argv[2]!, /\[User\]: The starting integer is 17\./);
    assert.match(capture.argv[2]!, /\[assistant\]: I will remember the integer\./);
    assert.match(capture.argv[2]!, /User message:\nMultiply the previous integer by 23\./);
  });
});

test('runtime reports child signal termination as failure', { skip: process.platform === 'win32' }, async () => {
  await withFixture('signal', async ({ root }) => {
    const result = await deadline(new DeepSeekHarnessRuntime().execute('hello', root));
    assert.equal(result.success, false); assert.match(result.error ?? '', /stopped by signal SIGTERM/);
  });
});

test('stop kills active CLI tree and overlapping execution is rejected', { timeout: 10000 }, async () => {
  await withFixture('stop', async ({ root }) => {
    const runtime = new DeepSeekHarnessRuntime(); let parent: number | undefined; let child: number | undefined;
    let signalReady!: () => void; const ready = new Promise<void>((resolve) => { signalReady = resolve; });
    const running = runtime.execute('wait', root, { onEvent: (e) => {
      if (e.type !== 'reasoning') return;
      const match = /READY (\d+) (\d+)/.exec(e.text); if (match) { parent = Number(match[1]); child = Number(match[2]); signalReady(); }
    } });
    try {
      await deadline(ready); const overlap = await runtime.execute('must not spawn', root);
      assert.equal(overlap.success, false); assert.match(overlap.error ?? '', /already running/);
      runtime.stop(); runtime.stop(); const result = await deadline(running);
      assert.equal(result.success, false); assert.match(result.error ?? '', /execution stopped/); assert.deepEqual(result.output, []);
      const until = Date.now() + 2000;
      while (child && pidExists(child) && Date.now() < until) await new Promise((r) => setTimeout(r, 25));
      assert.equal(parent ? pidExists(parent) : true, false); assert.equal(child ? pidExists(child) : true, false);
    } finally {
      runtime.stop(); cleanPid(parent); cleanPid(child); await deadline(running).catch(() => undefined);
    }
  });
});
