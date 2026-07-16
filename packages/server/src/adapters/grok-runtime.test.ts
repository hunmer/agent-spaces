import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGrokArgs, buildGrokCustomModelConfig, parseGrokJsonLine } from './grok-runtime.js';

test('builds documented Grok headless arguments', () => {
  const args = buildGrokArgs('hello', 'C:/work', {
    model: 'grok-build',
    permissionMode: 'bypassPermissions',
    thinkingEffort: 'high',
  }, {
    resumeSessionId: 'session-id',
    maxTurns: 3,
    tools: ['read_file', 'grep'],
    systemPrompt: 'Be concise.',
  });

  assert.deepEqual(args, [
    '-p', 'hello',
    '--cwd', 'C:/work',
    '--output-format', 'streaming-json',
    '--no-auto-update',
    '--model', 'grok-build',
    '--resume', 'session-id',
    '--max-turns', '3',
    '--tools', 'read_file,grep',
    '--rules', 'Be concise.',
    '--yolo',
    '--effort', 'high',
  ]);
  assert.equal(parseGrokJsonLine('{"type":"text","data":"ok"}')?.type, 'text');
  assert.equal(parseGrokJsonLine('not json'), null);
});

test('maps an Anthropic-compatible provider to a Grok custom model', () => {
  assert.equal(buildGrokCustomModelConfig({
    provider: 'anthropic-messages',
    model: 'MiniMax-M2.5',
    baseURL: 'https://api.minimaxi.com/anthropic',
    apiKey: 'secret',
    maxTokens: 8192,
  }), [
    '[model."MiniMax-M2.5"]',
    'model = "MiniMax-M2.5"',
    'base_url = "https://api.minimaxi.com/anthropic/v1"',
    'name = "MiniMax-M2.5"',
    'api_backend = "messages"',
    'max_completion_tokens = 8192',
    'env_key = "AGENT_SPACES_GROK_API_KEY"',
    'extra_headers = { "x-api-key" = "${AGENT_SPACES_GROK_API_KEY}", "anthropic-version" = "2023-06-01" }',
    '',
  ].join('\n'));
});
