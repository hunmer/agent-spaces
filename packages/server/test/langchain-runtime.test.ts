import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createLangChainRunProgress,
  buildLangChainPromptWithSkills,
  createThrottledRuntimeEventSink,
  extractReasoningFromToken,
  extractTextFromToken,
  isAiStreamToken,
  normalizeLangChainMcpServers,
  resolveLangChainModelSettings,
  stringifyToolResult,
  summarizeToolResultForAssistant,
  __testables,
} from '../src/adapters/langchain-runtime.js';

test('LangChain run progress flags tool results without final assistant text as incomplete', () => {
  const progress = createLangChainRunProgress();

  progress.recordAiText();
  progress.recordToolUse();
  progress.recordToolResult();

  assert.match(progress.getIncompleteReason() ?? '', /without a final assistant response/);
});

test('LangChain run progress accepts final assistant text after tools', () => {
  const progress = createLangChainRunProgress();

  progress.recordToolUse();
  progress.recordToolResult();
  progress.recordAiText();

  assert.equal(progress.getIncompleteReason(), undefined);
});

test('LangChain run progress reset clears incomplete attempt state', () => {
  const progress = createLangChainRunProgress();

  progress.recordToolUse();
  progress.recordToolResult();
  assert.match(progress.getIncompleteReason() ?? '', /without a final assistant response/);

  progress.reset();

  assert.equal(progress.getIncompleteReason(), undefined);
});

test('LangChain run progress flags pending tool calls', () => {
  const progress = createLangChainRunProgress();

  progress.recordToolUse();

  assert.match(progress.getIncompleteReason() ?? '', /pending tool calls/);
});

test('LangChain run progress exposes successful tool result message as assistant fallback', () => {
  const progress = createLangChainRunProgress();

  progress.recordToolUse();
  progress.recordToolResult({ ok: true, message: '歌曲生成完成' });

  assert.match(progress.getIncompleteReason() ?? '', /without a final assistant response/);
  assert.equal(progress.getToolResultFallbackText(), '歌曲生成完成');
});

test('summarizeToolResultForAssistant ignores failed tool results', () => {
  assert.equal(summarizeToolResultForAssistant({ ok: false, message: 'failed' }), undefined);
  assert.equal(summarizeToolResultForAssistant({ success: false, message: 'failed' }), undefined);
});

test('resolveLangChainModelSettings uses OpenAI for BigModel compatible Anthropic misconfiguration', () => {
  const settings = resolveLangChainModelSettings({
    provider: 'anthropic-messages',
    model: 'anthropic:GLM-4.7',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
  });

  assert.equal(settings.provider, 'openai');
  assert.equal(settings.modelIdentifier, 'openai:GLM-4.7');
  assert.match(settings.providerCorrectionReason ?? '', /OpenAI-compatible/);
});

test('resolveLangChainModelSettings preserves real Anthropic Messages configuration', () => {
  const settings = resolveLangChainModelSettings({
    provider: 'anthropic-messages',
    model: 'claude-sonnet-4-6',
    baseURL: 'https://api.anthropic.com/v1',
  });

  assert.equal(settings.provider, 'anthropic');
  assert.equal(settings.modelIdentifier, 'anthropic:claude-sonnet-4-6');
  assert.equal(settings.providerCorrectionReason, undefined);
});

test('stringifyToolResult serializes structured function tool results for chat content', () => {
  assert.equal(stringifyToolResult('ok'), 'ok');
  assert.equal(stringifyToolResult(undefined), 'null');
  assert.equal(
    stringifyToolResult([{ id: 'db-1', name: 'Knowledge' }]),
    '[\n  {\n    "id": "db-1",\n    "name": "Knowledge"\n  }\n]',
  );
});

test('stringifyToolResult falls back for circular function tool results', () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  assert.equal(stringifyToolResult(circular), '[object Object]');
});

test('LangChain stream content blocks expose AI text and reasoning', () => {
  const token = {
    contentBlocks: [
      { type: 'reasoning', reasoning: 'thinking about the answer' },
      { type: 'text', text: 'hello' },
      { type: 'text', text: ' world' },
    ],
  };

  assert.equal(extractReasoningFromToken(token), 'thinking about the answer');
  assert.equal(extractTextFromToken(token), 'hello world');
});

test('LangChain stream text extraction falls back to message content', () => {
  assert.equal(extractTextFromToken({ content: 'plain text' }), 'plain text');
  assert.equal(extractTextFromToken({
    content: [
      { type: 'text', text: 'first' },
      { type: 'text', text: ' second' },
    ],
  }), 'first\n second');
});

test('LangChain stream token filter skips tool results', () => {
  assert.equal(isAiStreamToken({ type: 'ai', contentBlocks: [{ type: 'text', text: 'hello' }] }), true);
  assert.equal(isAiStreamToken({ role: 'assistant', contentBlocks: [{ type: 'reasoning', reasoning: 'thinking' }] }), true);
  assert.equal(isAiStreamToken({ id: ['langchain_core', 'messages', 'AIMessage'], kwargs: { content: 'hello' } }), true);
  assert.equal(isAiStreamToken({ type: 'generic', role: 'assistant', content: 'hello' }), true);
  assert.equal(isAiStreamToken({ type: 'tool', contentBlocks: [{ type: 'reasoning', reasoning: 'tool output' }] }), false);
  assert.equal(isAiStreamToken({ tool_call_id: 'call-1', contentBlocks: [{ type: 'text', text: 'tool output' }] }), false);
});

test('LangChain stream event sink throttles text chunks and flushes before tool events', async () => {
  const events: unknown[] = [];
  const sink = createThrottledRuntimeEventSink((event) => events.push(event));

  sink.emit({ type: 'output', line: 'hel' });
  sink.emit({ type: 'output', line: 'lo' });
  assert.deepEqual(events, []);

  sink.emit({ type: 'tool_use', id: 'tool', name: 'tool', line: 'Tool: tool' });
  assert.deepEqual(events, [
    { type: 'output', line: 'hello' },
    { type: 'tool_use', id: 'tool', name: 'tool', line: 'Tool: tool' },
  ]);

  sink.emit({ type: 'output', line: '!' });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(events.at(-1), { type: 'output', line: '!' });
});

test('LangChain stream update extraction flattens nested update payloads', () => {
  assert.deepEqual(__testables.extractUpdateMessages({
    nodeA: { messages: [{ role: 'assistant', contentBlocks: [{ type: 'text', text: 'step 1' }] }] },
    nodeB: [{ messages: [{ role: 'assistant', contentBlocks: [{ type: 'text', text: 'step 2' }] }] }],
  }), [
    { role: 'assistant', contentBlocks: [{ type: 'text', text: 'step 1' }] },
    { role: 'assistant', contentBlocks: [{ type: 'text', text: 'step 2' }] },
  ]);
});

test('LangChain stream state extraction uses messages arrays only', () => {
  assert.deepEqual(__testables.extractStateMessages({
    messages: [{ role: 'assistant', content: 'final' }],
  }), [{ role: 'assistant', content: 'final' }]);
  assert.deepEqual(__testables.extractStateMessages({ state: [] }), []);
});

test('normalizeLangChainMcpServers maps retired fetch npm package to uvx', () => {
  const normalized = normalizeLangChainMcpServers({
    fetch: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch', '--ignore-robots-txt'],
      env: { CUSTOM_ENV: '1' },
    },
  });

  assert.deepEqual(normalized?.fetch, {
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-server-fetch', '--ignore-robots-txt'],
    env: { PYTHONIOENCODING: 'utf-8', CUSTOM_ENV: '1' },
  });
});

test('normalizeLangChainMcpServers preserves HTTP MCP config', () => {
  const normalized = normalizeLangChainMcpServers({
    remote: {
      url: 'https://example.test/mcp',
      headers: { Authorization: 'Bearer token' },
    },
  });

  assert.deepEqual(normalized?.remote, {
    transport: 'http',
    url: 'https://example.test/mcp',
    headers: { Authorization: 'Bearer token' },
  });
});

test('buildLangChainPromptWithSkills injects configured skill markdown bodies', () => {
  const agentDir = mkdtempSync(join(tmpdir(), 'langchain-agent-skills-'));
  try {
    mkdirSync(join(agentDir, 'skills', 'brainstorming'), { recursive: true });
    writeFileSync(
      join(agentDir, 'skills', 'brainstorming', 'SKILL.md'),
      [
        '---',
        'name: brainstorming',
        'description: Explore requirements before implementation.',
        '---',
        '',
        'Ask clarifying questions and produce a design.',
      ].join('\n'),
      'utf-8',
    );

    const prompt = buildLangChainPromptWithSkills('Build the feature.', agentDir, ['brainstorming']);

    assert.match(prompt, /Configured skill instructions:/);
    assert.match(prompt, /## Skill: brainstorming/);
    assert.match(prompt, /Ask clarifying questions and produce a design\./);
    assert.doesNotMatch(prompt, /description: Explore requirements/);
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test('buildLangChainPromptWithSkills falls back to global skills when agent copy is empty', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'langchain-data-skills-'));
  const agentDir = mkdtempSync(join(tmpdir(), 'langchain-agent-skills-'));
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    mkdirSync(join(dataDir, 'skills', 'brainstorming'), { recursive: true });
    writeFileSync(
      join(dataDir, 'skills', 'brainstorming', 'SKILL.md'),
      '---\nname: brainstorming\ndescription: Brainstorm globally.\n---\n\nGlobal skill body.',
      'utf-8',
    );
    mkdirSync(join(agentDir, 'skills'), { recursive: true });
    writeFileSync(join(agentDir, 'skills', 'brainstorming.md'), '', 'utf-8');

    const prompt = buildLangChainPromptWithSkills('Build the feature.', agentDir, ['brainstorming']);

    assert.match(prompt, /## Skill: brainstorming/);
    assert.match(prompt, /Global skill body\./);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(agentDir, { recursive: true, force: true });
  }
});
