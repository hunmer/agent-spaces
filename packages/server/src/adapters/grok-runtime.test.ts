import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGrokArgs, parseGrokJsonLine } from './grok-runtime.js';

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
