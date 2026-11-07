import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { HermesRuntime } from '../src/adapters/hermes-runtime.js';

test('HermesRuntime maps runtime config and options to Hermes CLI args, env, and isolated home', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hermes-runtime-'));
  const binDir = join(root, 'bin');
  const configDir = join(root, 'agent-config');
  const captureFile = join(root, 'capture.json');
  const previousPath = currentPathEnv();

  try {
    mkdirSync(binDir, { recursive: true });
    writeFakeHermes(binDir, [
      'const { writeFileSync } = require("node:fs");',
      'const capture = {',
      '  argv: process.argv.slice(2),',
      '  cwd: process.cwd(),',
      '  env: {',
      '    HERMES_HOME: process.env.HERMES_HOME,',
      '    AGENT_SPACES_HERMES_API_KEY: process.env.AGENT_SPACES_HERMES_API_KEY,',
      '    HERMES_API_KEY: process.env.HERMES_API_KEY,',
      '    HERMES_BASE_URL: process.env.HERMES_BASE_URL,',
      '    OPENAI_API_KEY: process.env.OPENAI_API_KEY,',
      '    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,',
      '    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,',
      '    NO_COLOR: process.env.NO_COLOR,',
      '  },',
      '};',
      `writeFileSync(${JSON.stringify(captureFile)}, JSON.stringify(capture, null, 2), "utf-8");`,
      'console.log("ok");',
    ].join('\n'));
    setPathEnv(prependPath(binDir, previousPath));

    mkdirSync(join(configDir, 'skills'), { recursive: true });
    writeFileSync(join(configDir, 'skills', 'plans.md'), 'Plan skill body.', 'utf-8');

    const runtime = new HermesRuntime({
      provider: 'anthropic-messages',
      model: 'GLM-4.7',
      apiKey: 'secret-key',
      baseURL: 'https://example.test/v1',
    });
    const result = await runtime.execute('hello', root, {
      configDir,
      skills: ['plans.md'],
    });

    const capture = JSON.parse(readFileSync(captureFile, 'utf-8')) as {
      argv: string[];
      cwd: string;
      env: Record<string, string>;
    };

    assert.equal(result.success, true);
    assert.equal(capture.cwd, root);
    assert.deepEqual(capture.argv, [
      'chat',
      '-q',
      'hello',
      '--verbose',
      '-s',
      'plans',
      '--model',
      'GLM-4.7',
    ]);
    assert.equal(capture.env.HERMES_HOME, join(configDir, '.hermes'));
    assert.equal(capture.env.AGENT_SPACES_HERMES_API_KEY, 'secret-key');
    assert.equal(capture.env.HERMES_API_KEY, 'secret-key');
    assert.equal(capture.env.HERMES_BASE_URL, 'https://example.test/v1');
    assert.equal(capture.env.OPENAI_API_KEY, 'secret-key');
    assert.equal(capture.env.OPENAI_BASE_URL, 'https://example.test/v1');
    assert.equal(capture.env.ANTHROPIC_API_KEY, 'secret-key');
    assert.equal(capture.env.NO_COLOR, '1');
    assert.equal(existsSync(join(configDir, '.hermes', 'skills', 'plans.md')), true);
    assert.equal(
      readFileSync(join(configDir, '.hermes', 'config.yaml'), 'utf-8'),
      [
        '# Managed by Agent Spaces for this agent profile.',
        'model:',
        '  default: "GLM-4.7"',
        '  provider: custom',
        '  base_url: "https://example.test/v1"',
        '  api_key: ${AGENT_SPACES_HERMES_API_KEY}',
        '  api_mode: chat_completions',
        '',
      ].join('\n'),
    );
  } finally {
    restorePathEnv(previousPath);
    rmSync(root, { recursive: true, force: true });
  }
});

test('HermesRuntime uses Anthropic Messages api_mode only for Anthropic base URLs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hermes-runtime-'));
  const binDir = join(root, 'bin');
  const configDir = join(root, 'agent-config');
  const previousPath = currentPathEnv();

  try {
    mkdirSync(binDir, { recursive: true });
    writeFakeHermes(binDir, 'console.log("ok");');
    setPathEnv(prependPath(binDir, previousPath));

    const runtime = new HermesRuntime({
      provider: 'anthropic-messages',
      model: 'claude-test',
      apiKey: 'secret-key',
      baseURL: 'https://api.anthropic.com',
    });
    const result = await runtime.execute('hello', root, { configDir });

    assert.equal(result.success, true);
    assert.equal(
      readFileSync(join(configDir, '.hermes', 'config.yaml'), 'utf-8'),
      [
        '# Managed by Agent Spaces for this agent profile.',
        'model:',
        '  default: "claude-test"',
        '  provider: custom',
        '  base_url: "https://api.anthropic.com"',
        '  api_key: ${AGENT_SPACES_HERMES_API_KEY}',
        '  api_mode: anthropic_messages',
        '',
      ].join('\n'),
    );
  } finally {
    restorePathEnv(previousPath);
    rmSync(root, { recursive: true, force: true });
  }
});

test('HermesRuntime uses Anthropic Messages api_mode for Anthropic-compatible URL paths', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hermes-runtime-'));
  const binDir = join(root, 'bin');
  const configDir = join(root, 'agent-config');
  const previousPath = currentPathEnv();

  try {
    mkdirSync(binDir, { recursive: true });
    writeFakeHermes(binDir, 'console.log("ok");');
    setPathEnv(prependPath(binDir, previousPath));

    const runtime = new HermesRuntime({
      provider: 'anthropic-messages',
      model: 'MiniMax-M2.7',
      apiKey: 'secret-key',
      baseURL: 'https://api.minimaxi.com/anthropic',
    });
    const result = await runtime.execute('hello', root, { configDir });

    assert.equal(result.success, true);
    assert.equal(
      readFileSync(join(configDir, '.hermes', 'config.yaml'), 'utf-8'),
      [
        '# Managed by Agent Spaces for this agent profile.',
        'model:',
        '  default: "MiniMax-M2.7"',
        '  provider: custom',
        '  base_url: "https://api.minimaxi.com/anthropic"',
        '  api_key: ${AGENT_SPACES_HERMES_API_KEY}',
        '  api_mode: anthropic_messages',
        '',
      ].join('\n'),
    );
  } finally {
    restorePathEnv(previousPath);
    rmSync(root, { recursive: true, force: true });
  }
});

test('HermesRuntime preserves existing Hermes config.yaml', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hermes-runtime-'));
  const binDir = join(root, 'bin');
  const configDir = join(root, 'agent-config');
  const previousPath = currentPathEnv();
  const existingConfig = 'model:\n  provider: openrouter\n';

  try {
    mkdirSync(binDir, { recursive: true });
    mkdirSync(join(configDir, '.hermes'), { recursive: true });
    writeFileSync(join(configDir, '.hermes', 'config.yaml'), existingConfig, 'utf-8');
    writeFakeHermes(binDir, 'console.log("ok");');
    setPathEnv(prependPath(binDir, previousPath));

    const runtime = new HermesRuntime({
      provider: 'anthropic-messages',
      model: 'GLM-4.7',
      apiKey: 'secret-key',
      baseURL: 'https://example.test/v1',
    });
    const result = await runtime.execute('hello', root, { configDir });

    assert.equal(result.success, true);
    assert.equal(readFileSync(join(configDir, '.hermes', 'config.yaml'), 'utf-8'), existingConfig);
  } finally {
    restorePathEnv(previousPath);
    rmSync(root, { recursive: true, force: true });
  }
});

test('HermesRuntime merges Agent Spaces MCP servers into existing Hermes config.yaml', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hermes-runtime-'));
  const binDir = join(root, 'bin');
  const configDir = join(root, 'agent-config');
  const previousPath = currentPathEnv();

  try {
    mkdirSync(binDir, { recursive: true });
    mkdirSync(join(configDir, '.hermes'), { recursive: true });
    writeFileSync(
      join(configDir, '.hermes', 'config.yaml'),
      [
        'model:',
        '  provider: openrouter',
        'platform_toolsets:',
        '  cli: [hermes-cli]',
        'mcp_servers:',
        '  github:',
        '    command: "npx"',
        '    args: ["-y", "@modelcontextprotocol/server-github"]',
        '',
      ].join('\n'),
      'utf-8',
    );
    writeFakeHermes(binDir, 'console.log("ok");');
    setPathEnv(prependPath(binDir, previousPath));

    const runtime = new HermesRuntime();
    const result = await runtime.execute('hello', root, {
      configDir,
      mcpServers: {
        fetch: {
          command: 'uvx',
          args: ['mcp-server-fetch'],
          env: { PYTHONIOENCODING: 'utf-8' },
        },
      },
    });

    assert.equal(result.success, true);
    assert.equal(
      readFileSync(join(configDir, '.hermes', 'config.yaml'), 'utf-8'),
      [
        'model:',
        '  provider: openrouter',
        'platform_toolsets:',
        '  cli: [hermes-cli]',
        'mcp_servers:',
        '  # Agent Spaces managed MCP servers start',
        '  fetch:',
        '    command: "uvx"',
        '    args:',
        '      - "mcp-server-fetch"',
        '    env:',
        '      PYTHONIOENCODING: "utf-8"',
        '    enabled: true',
        '  # Agent Spaces managed MCP servers end',
        '  github:',
        '    command: "npx"',
        '    args: ["-y", "@modelcontextprotocol/server-github"]',
        '',
      ].join('\n'),
    );
  } finally {
    restorePathEnv(previousPath);
    rmSync(root, { recursive: true, force: true });
  }
});

test('HermesRuntime refreshes Agent Spaces managed MCP servers in existing Hermes config.yaml', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hermes-runtime-'));
  const binDir = join(root, 'bin');
  const configDir = join(root, 'agent-config');
  const previousPath = currentPathEnv();

  try {
    mkdirSync(binDir, { recursive: true });
    mkdirSync(join(configDir, '.hermes'), { recursive: true });
    writeFileSync(
      join(configDir, '.hermes', 'config.yaml'),
      [
        'mcp_servers:',
        '  # Agent Spaces managed MCP servers start',
        '  fetch:',
        '    command: "old-uvx"',
        '  # Agent Spaces managed MCP servers end',
        '  github:',
        '    command: "npx"',
        '',
      ].join('\n'),
      'utf-8',
    );
    writeFakeHermes(binDir, 'console.log("ok");');
    setPathEnv(prependPath(binDir, previousPath));

    const runtime = new HermesRuntime();
    const result = await runtime.execute('hello', root, {
      configDir,
      mcpServers: {
        fetch: {
          command: 'uvx',
          args: ['mcp-server-fetch'],
        },
      },
    });

    assert.equal(result.success, true);
    assert.equal(
      readFileSync(join(configDir, '.hermes', 'config.yaml'), 'utf-8'),
      [
        'mcp_servers:',
        '  # Agent Spaces managed MCP servers start',
        '  fetch:',
        '    command: "uvx"',
        '    args:',
        '      - "mcp-server-fetch"',
        '    enabled: true',
        '  # Agent Spaces managed MCP servers end',
        '  github:',
        '    command: "npx"',
        '',
      ].join('\n'),
    );
  } finally {
    restorePathEnv(previousPath);
    rmSync(root, { recursive: true, force: true });
  }
});

test('HermesRuntime refreshes Agent Spaces managed Hermes config.yaml', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hermes-runtime-'));
  const binDir = join(root, 'bin');
  const configDir = join(root, 'agent-config');
  const previousPath = currentPathEnv();

  try {
    mkdirSync(binDir, { recursive: true });
    mkdirSync(join(configDir, '.hermes'), { recursive: true });
    writeFileSync(
      join(configDir, '.hermes', 'config.yaml'),
      '# Managed by Agent Spaces for this agent profile.\nmodel:\n  default: old-model\n',
      'utf-8',
    );
    writeFakeHermes(binDir, 'console.log("ok");');
    setPathEnv(prependPath(binDir, previousPath));

    const runtime = new HermesRuntime({
      provider: 'openai-chat-completions',
      model: 'new-model',
      apiKey: 'secret-key',
      baseURL: 'https://example.test/v1',
    });
    const result = await runtime.execute('hello', root, { configDir });

    assert.equal(result.success, true);
    assert.equal(
      readFileSync(join(configDir, '.hermes', 'config.yaml'), 'utf-8'),
      [
        '# Managed by Agent Spaces for this agent profile.',
        'model:',
        '  default: "new-model"',
        '  provider: custom',
        '  base_url: "https://example.test/v1"',
        '  api_key: ${AGENT_SPACES_HERMES_API_KEY}',
        '  api_mode: chat_completions',
        '',
      ].join('\n'),
    );
  } finally {
    restorePathEnv(previousPath);
    rmSync(root, { recursive: true, force: true });
  }
});

test('HermesRuntime passes Hermes-native providers through to the Hermes CLI', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hermes-runtime-'));
  const binDir = join(root, 'bin');
  const captureFile = join(root, 'capture.json');
  const previousPath = currentPathEnv();

  try {
    mkdirSync(binDir, { recursive: true });
    writeFakeHermes(binDir, [
      'const { writeFileSync } = require("node:fs");',
      `writeFileSync(${JSON.stringify(captureFile)}, JSON.stringify({ argv: process.argv.slice(2) }), "utf-8");`,
      'console.log("ok");',
    ].join('\n'));
    setPathEnv(prependPath(binDir, previousPath));

    const runtime = new HermesRuntime({
      provider: 'openrouter',
      model: 'openai/gpt-4o',
    });
    const result = await runtime.execute('hello', root);

    const capture = JSON.parse(readFileSync(captureFile, 'utf-8')) as {
      argv: string[];
    };

    assert.equal(result.success, true);
    assert.deepEqual(capture.argv, [
      'chat',
      '-q',
      'hello',
      '--verbose',
      '--model',
      'openai/gpt-4o',
      '--provider',
      'openrouter',
    ]);
  } finally {
    restorePathEnv(previousPath);
    rmSync(root, { recursive: true, force: true });
  }
});

test('HermesRuntime filters Hermes diagnostics and emits structured tool use and usage events', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hermes-runtime-'));
  const binDir = join(root, 'bin');
  const previousPath = currentPathEnv();

  try {
    mkdirSync(binDir, { recursive: true });
    writeFakeHermes(binDir, [
      'console.log("🤖 AI Agent initialized with model: GLM-4.7");',
      'console.log("🔗 Using custom base URL: https://open.bigmodel.cn/api/paas/v4");',
      'console.log("🔑 Using API key: 6331b2f6...1uLs");',
      'console.log("Query: Workspace prompt:");',
      'console.log("结果使用中文回复");',
      'console.log("Agent runtime configuration:");',
      'console.log("- Current workspace id: c591d2d6-9930-49cc-8e13-ff3b0a13381f");',
      'console.error("16:42:03 - agent.conversation_loop - INFO [20260530_164140_cf9625] - API call #2: model=GLM-4.7 provider=custom in=16935 out=122 total=17057 latency=5.4s cache=16512/16935 (98%)");',
      'console.error("16:42:03 - root - DEBUG [20260530_164140_cf9625] - Token usage: prompt=16,935, completion=122, total=17,057");',
      'console.error("16:42:03 - root - DEBUG [20260530_164140_cf9625] - Tool call: skill_view with args: {\\"name\\": \\"plans\\"}...");',
      'console.log("这是最终回复");',
    ].join('\n'));
    setPathEnv(prependPath(binDir, previousPath));

    const events: Array<{ type: string; [key: string]: unknown }> = [];
    const runtime = new HermesRuntime();
    const result = await runtime.execute('hello', root, {
      onEvent: (event) => events.push(event),
    });

    const outputEvents = events.filter((event) => event.type === 'output');
    const toolUseEvents = events.filter((event) => event.type === 'tool_use');

    assert.equal(result.success, true);
    assert.deepEqual(result.output, [
      '[Usage] total: 17057 input: 16935 output: 122 cached: 16512',
      '这是最终回复',
    ]);
    assert.deepEqual(
      outputEvents.map((event) => event.line),
      [
        '[Usage] total: 17057 input: 16935 output: 122 cached: 16512',
        '这是最终回复',
      ],
    );
    assert.equal(toolUseEvents.length, 1);
    assert.equal(toolUseEvents[0].name, 'skill_view');
    assert.deepEqual(toolUseEvents[0].input, { name: 'plans' });
    assert.equal(toolUseEvents[0].line, 'Tool: skill_view {"name": "plans"}');
  } finally {
    restorePathEnv(previousPath);
    rmSync(root, { recursive: true, force: true });
  }
});

test('HermesRuntime keeps final text after real verbose startup boundaries', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hermes-runtime-'));
  const binDir = join(root, 'bin');
  const previousPath = currentPathEnv();

  try {
    mkdirSync(binDir, { recursive: true });
    writeFakeHermes(binDir, [
      'console.log("Query: 请先使用 plans skill，然后只用一句中文回复");',
      'console.log("Initializing agent...");',
      'console.log("🤖 AI Agent initialized with model: MiniMax-M2.7 (Anthropic native)");',
      'console.log("🔑 Using token: eyJhbGci...bjYw");',
      'console.log("✅ Enabled toolset \'skills\': skill_manage, skill_view, skills_list");',
      'console.log("  [thinking] The user wants me to first use the plans skill.");',
      'console.error("17:15:35 - agent.conversation_loop - INFO [20260530_171525_8ee1ff] - API call #1: model=MiniMax-M2.7 provider=custom in=16249 out=47 total=16296 latency=3.1s cache=128/16249 (1%)");',
      'console.error("17:15:35 - root - DEBUG [20260530_171525_8ee1ff] - Tool call: skill_view with args: {\\"name\\": \\"plans\\"}...");',
      'console.log("  📞 Tool 1: skill_view([\'name\'])");',
      'console.log("     Args: {");',
      'console.log("       \\"name\\": \\"plans\\"");',
      'console.log("     }");',
      'console.log("🎉 Conversation completed after 2 OpenAI-compatible API call(s)");',
      'console.log("    Hermes 真实调用测试完成。");',
      'console.log("Resume this session with:");',
      'console.log("  hermes --resume 20260530_171525_8ee1ff");',
      'console.log("Session:        20260530_171525_8ee1ff");',
    ].join('\n'));
    setPathEnv(prependPath(binDir, previousPath));

    const events: Array<{ type: string; [key: string]: unknown }> = [];
    const runtime = new HermesRuntime();
    const result = await runtime.execute('hello', root, {
      onEvent: (event) => events.push(event),
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.output, [
      '[Usage] total: 16296 input: 16249 output: 47 cached: 128',
      'Hermes 真实调用测试完成。',
    ]);
    assert.equal(result.summary, 'Hermes 真实调用测试完成。');
    assert.equal(events.filter((event) => event.type === 'tool_use').length, 1);
    assert.equal(events.some((event) => event.type === 'output' && event.line === 'Hermes 真实调用测试完成。'), true);
  } finally {
    restorePathEnv(previousPath);
    rmSync(root, { recursive: true, force: true });
  }
});

test('HermesRuntime emits reasoning events from Hermes thinking output and captured reasoning logs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hermes-runtime-'));
  const binDir = join(root, 'bin');
  const previousPath = currentPathEnv();

  try {
    mkdirSync(binDir, { recursive: true });
    writeFakeHermes(binDir, [
      'console.log("Query: @test 你好");',
      'console.log("Initializing agent...");',
      'console.log("  [thinking] 用户用中文说了 @test 你好。");',
      'console.log("我应该用中文友好地回应。");',
      'console.log("╭─ Hermes ───────────────────────────────────────────────────────────────────╮");',
      'console.error("18:05:02 - root - DEBUG [20260530_180452_f166bc] - API Response received - Model: glm-4.7, Usage: CompletionUsage(completion_tokens=110, prompt_tokens=16700, total_tokens=16810, completion_tokens_details=CompletionTokensDetails(reasoning_tokens=100), prompt_tokens_details=PromptTokensDetails(cached_tokens=16640))");',
      'console.error("18:05:02 - agent.conversation_loop - INFO [20260530_180452_f166bc] - API call #1: model=GLM-4.7 provider=custom in=16700 out=110 total=16810 latency=4.4s cache=16640/16700 (100%)");',
      'console.error("18:05:03 - root - DEBUG [20260530_180452_f166bc] - Token usage: prompt=16,700, completion=110, total=16,810");',
      'console.error("18:05:03 - root - DEBUG [20260530_180452_f166bc] - Captured reasoning (40 chars):");',
      'console.error("用户的消息很简单，就是你好。");',
      'console.error("我应该简单友好地回应。");',
      'console.log("🎉 Conversation completed after 1 OpenAI-compatible API call(s)");',
      'console.log("你好！有什么可以帮你的吗？");',
    ].join('\n'));
    setPathEnv(prependPath(binDir, previousPath));

    const events: Array<{ type: string; [key: string]: unknown }> = [];
    const runtime = new HermesRuntime();
    const result = await runtime.execute('hello', root, {
      onEvent: (event) => events.push(event),
    });

    const reasoningTexts = events
      .filter((event) => event.type === 'reasoning')
      .map((event) => event.text);

    assert.equal(result.success, true);
    assert.deepEqual(result.output, [
      '[Usage] total: 16810 input: 16700 output: 110 cached: 16640',
      '你好！有什么可以帮你的吗？',
    ]);
    assert.equal(reasoningTexts.some((text) => String(text).includes('用户用中文说了')), true);
    assert.equal(reasoningTexts.some((text) => String(text).includes('用户的消息很简单')), true);
    assert.equal(reasoningTexts.some((text) => String(text).includes('我应该简单友好地回应')), true);
  } finally {
    restorePathEnv(previousPath);
    rmSync(root, { recursive: true, force: true });
  }
});

test('HermesRuntime returns a clear error when the Hermes CLI is missing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hermes-runtime-'));
  const previousPath = currentPathEnv();
  const previousLocalAppData = process.env.LOCALAPPDATA;
  const previousUserProfile = process.env.USERPROFILE;
  const previousHermesCliPath = process.env.HERMES_CLI_PATH;

  try {
    setPathEnv(root);
    delete process.env.HERMES_CLI_PATH;
    process.env.LOCALAPPDATA = join(root, 'missing-local-app-data');
    process.env.USERPROFILE = join(root, 'missing-user-profile');

    const runtime = new HermesRuntime();
    const result = await runtime.execute('hello', root);

    assert.equal(result.success, false);
    assert.equal(
      result.error,
      'Hermes CLI was not found. Install Hermes and ensure the `hermes` command is available on PATH.',
    );
  } finally {
    restorePathEnv(previousPath);
    restoreEnvValue('LOCALAPPDATA', previousLocalAppData);
    restoreEnvValue('USERPROFILE', previousUserProfile);
    restoreEnvValue('HERMES_CLI_PATH', previousHermesCliPath);
    rmSync(root, { recursive: true, force: true });
  }
});

test('HermesRuntime falls back to the Windows local Hermes install when PATH is stale', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('Windows-specific executable lookup');
    return;
  }

  const root = mkdtempSync(join(tmpdir(), 'hermes-runtime-'));
  const localAppData = join(root, 'local-app-data');
  const binDir = join(localAppData, 'hermes', 'hermes-agent', 'venv', 'Scripts');
  const previousPath = currentPathEnv();
  const previousLocalAppData = process.env.LOCALAPPDATA;
  const previousHermesCliPath = process.env.HERMES_CLI_PATH;

  try {
    mkdirSync(binDir, { recursive: true });
    writeFakeHermes(binDir, 'console.log("ok from local app data");');
    setPathEnv(root);
    delete process.env.HERMES_CLI_PATH;
    process.env.LOCALAPPDATA = localAppData;

    const runtime = new HermesRuntime();
    const result = await runtime.execute('hello', root);

    assert.equal(result.success, true);
    assert.deepEqual(result.output, ['ok from local app data']);
  } finally {
    restorePathEnv(previousPath);
    restoreEnvValue('LOCALAPPDATA', previousLocalAppData);
    restoreEnvValue('HERMES_CLI_PATH', previousHermesCliPath);
    rmSync(root, { recursive: true, force: true });
  }
});

function prependPath(binDir: string, previousPath: string | undefined): string {
  return previousPath ? `${binDir}${delimiter}${previousPath}` : binDir;
}

function pathEnvKey(): string {
  return Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
}

function currentPathEnv(): string | undefined {
  return process.env[pathEnvKey()];
}

function setPathEnv(value: string): void {
  process.env[pathEnvKey()] = value;
}

function restorePathEnv(value: string | undefined): void {
  restoreEnvValue(pathEnvKey(), value);
}

function restoreEnvValue(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function writeFakeHermes(binDir: string, source: string): void {
  const scriptPath = join(binDir, 'fake-hermes.cjs');
  writeFileSync(scriptPath, source, 'utf-8');

  if (process.platform === 'win32') {
    writeWindowsExeShim(binDir, scriptPath);
    return;
  }

  const executablePath = join(binDir, 'hermes');
  writeFileSync(
    executablePath,
    '#!/bin/sh\nSCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec node "$SCRIPT_DIR/fake-hermes.cjs" "$@"\n',
    'utf-8',
  );
  chmodSync(executablePath, 0o755);
}

function writeWindowsExeShim(binDir: string, scriptPath: string): void {
  const sourcePath = join(binDir, 'hermes-shim.c');
  const executablePath = join(binDir, 'hermes.exe');
  const cSource = [
    '#include <windows.h>',
    '#include <stdio.h>',
    '#include <string.h>',
    '',
    'static void append(char *buffer, size_t size, const char *text) {',
    '  strncat(buffer, text, size - strlen(buffer) - 1);',
    '}',
    '',
    'static void append_quoted(char *buffer, size_t size, const char *text) {',
    '  append(buffer, size, "\\"");',
    '  for (const char *p = text; *p; p++) {',
    '    if (*p == \'"\') append(buffer, size, "\\\\\\"");',
    '    else {',
    '      char ch[2] = { *p, 0 };',
    '      append(buffer, size, ch);',
    '    }',
    '  }',
    '  append(buffer, size, "\\"");',
    '}',
    '',
    'int main(int argc, char **argv) {',
    '  char command[32768] = "";',
    `  append_quoted(command, sizeof(command), ${JSON.stringify(process.execPath.replace(/\\/g, '\\\\'))});`,
    '  append(command, sizeof(command), " ");',
    `  append_quoted(command, sizeof(command), ${JSON.stringify(scriptPath.replace(/\\/g, '\\\\'))});`,
    '  for (int i = 1; i < argc; i++) {',
    '    append(command, sizeof(command), " ");',
    '    append_quoted(command, sizeof(command), argv[i]);',
    '  }',
    '',
    '  STARTUPINFOA startup;',
    '  PROCESS_INFORMATION process;',
    '  ZeroMemory(&startup, sizeof(startup));',
    '  ZeroMemory(&process, sizeof(process));',
    '  startup.cb = sizeof(startup);',
    '',
    '  if (!CreateProcessA(NULL, command, NULL, NULL, TRUE, 0, NULL, NULL, &startup, &process)) {',
    '    fprintf(stderr, "CreateProcess failed: %lu\\n", GetLastError());',
    '    return 1;',
    '  }',
    '',
    '  WaitForSingleObject(process.hProcess, INFINITE);',
    '  DWORD exitCode = 1;',
    '  GetExitCodeProcess(process.hProcess, &exitCode);',
    '  CloseHandle(process.hProcess);',
    '  CloseHandle(process.hThread);',
    '  return (int)exitCode;',
    '}',
    '',
  ].join('\n');
  writeFileSync(sourcePath, cSource, 'utf-8');

  const result = spawnSync('gcc', [sourcePath, '-o', executablePath], { encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error(`Failed to build fake hermes.exe: ${result.stderr || result.stdout}`);
  }
}
