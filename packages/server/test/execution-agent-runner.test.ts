import test from 'node:test';
import assert from 'node:assert/strict';
import { __resolveAgentPresetForTest } from '../src/services/execution-agent-runner.js';

test('resolveAgentPreset uses node-level model fields to find matching preset and keeps local overrides', () => {
  const resolved = __resolveAgentPresetForTest({
    modelProvider: 'openai-responses',
    providerId: 'provider-b',
    modelId: 'gpt-5.5',
    systemPrompt: 'node prompt',
  }, [
    {
      id: 'preset-a',
      name: 'Preset A',
      runtimeKind: 'claude-code',
      modelProvider: 'openai-chat-completions',
      providerId: 'provider-a',
      modelId: 'glm-4.7',
      apiKey: 'sk-a',
    },
    {
      id: 'preset-b',
      name: 'Preset B',
      runtimeKind: 'codex',
      modelProvider: 'openai-responses',
      providerId: 'provider-b',
      modelId: 'gpt-5.5',
      apiKey: 'sk-b',
      systemPrompt: 'preset prompt',
    },
  ]);

  assert.equal(resolved?.id, 'preset-b');
  assert.equal(resolved?.runtimeKind, 'codex');
  assert.equal(resolved?.apiKey, 'sk-b');
  assert.equal(resolved?.systemPrompt, 'node prompt');
});

test('resolveAgentPreset falls back to local node config when no preset matches', () => {
  const resolved = __resolveAgentPresetForTest({
    modelProvider: 'openai-chat-completions',
    providerId: 'provider-x',
    modelId: 'model-x',
    systemPrompt: 'local only',
  }, []);

  assert.equal(resolved?.modelProvider, 'openai-chat-completions');
  assert.equal(resolved?.providerId, 'provider-x');
  assert.equal(resolved?.modelId, 'model-x');
  assert.equal(resolved?.systemPrompt, 'local only');
});
