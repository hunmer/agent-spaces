import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStoredFullPrompt } from '../src/routes/chat-run.js';

test('buildStoredFullPrompt keeps system prompt ahead of user prompt', () => {
  assert.equal(
    buildStoredFullPrompt('You are a writing assistant.', '你好'),
    'You are a writing assistant.\n\n你好',
  );
});

test('buildStoredFullPrompt falls back to prompt when system prompt is empty', () => {
  assert.equal(buildStoredFullPrompt('   ', '你好'), '你好');
  assert.equal(buildStoredFullPrompt(undefined, '你好'), '你好');
});
