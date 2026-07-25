import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildGeminiArgs, buildGeminiPrompt, normalizeGeminiUsage, parseGeminiJsonLine, prepareGeminiAttachmentContext } from './gemini-cli-runtime.js';

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

test('prepares uploaded attachments as workspace-local files for Gemini CLI', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'gemini-cli-runtime-'));
  const source = join(cwd, 'uploaded.png');
  writeFileSync(source, 'png');
  try {
    const context = prepareGeminiAttachmentContext([{
      name: 'example image.png',
      path: source,
      url: '/static/uploads/uploaded.png',
      type: 'image/png',
      size: 3,
    }], cwd);

    assert.deepEqual(context.ignored, []);
    assert.match(context.prepared[0]?.relativePath ?? '', /^\.agentspace\/attachments\/1-.+\.png$/);
    assert.equal(existsSync(join(cwd, context.prepared[0]!.relativePath)), true);
    assert.match(buildGeminiPrompt('describe it', context), /@\.agentspace\/attachments\/1-.+\.png/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
