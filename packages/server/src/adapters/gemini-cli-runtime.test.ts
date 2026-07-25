import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeminiArgs, normalizeGeminiUsage, parseGeminiJsonLine } from './gemini-cli-runtime.js';

test('builds documented Gemini CLI headless arguments', () => {
  assert.deepEqual(buildGeminiArgs('hello', {
    model: 'gemini-2.5-pro',
    permissionMode: 'bypassPermissions',
  }, {
    resumeSessionId: 'session-id',
    maxTurns: 3,
  }), [
    '-p', 'hello',
    '--output-format', 'stream-json',
    '--model', 'gemini-2.5-pro',
    '-r', 'session-id',
    '--yolo',
  ]);
  assert.deepEqual(buildGeminiArgs('hello', { permissionMode: 'acceptEdits' }), [
    '-p', 'hello',
    '--output-format', 'stream-json',
    '--approval-mode', 'auto_edit',
  ]);
});

test('parses Gemini stream-json events and usage', () => {
  assert.equal(parseGeminiJsonLine('{"type":"tool_use","tool_name":"read_file"}')?.type, 'tool_use');
  assert.equal(parseGeminiJsonLine('not json'), null);
  assert.deepEqual(normalizeGeminiUsage({
    total_tokens: 1500,
    input_tokens: 500,
    output_tokens: 1000,
    cached: 25,
  }), {
    inputTokens: 500,
    outputTokens: 1000,
    cachedInputTokens: 25,
    totalTokens: 1500,
  });
});
