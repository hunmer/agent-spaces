import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

test('resolveAgentPreset refreshes apiKey from provider when node config points to another provider', (t) => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-exec-runner-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;
  t.after(() => {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  });

  mkdirSync(join(dataDir, 'llm'), { recursive: true });
  writeFileSync(join(dataDir, 'llm', 'providers.json'), JSON.stringify([
    {
      id: 'provider-new',
      name: 'new-provider',
      apiBase: 'https://api.new-provider.test/anthropic',
      apiKey: 'sk-new',
      modelProvider: 'anthropic-messages',
      createdAt: '2026-06-30T00:00:00.000Z',
      updatedAt: '2026-06-30T00:00:00.000Z',
    },
  ], null, 2), 'utf-8');

  const resolved = __resolveAgentPresetForTest({
    agent: {
      id: 'topic_agent',
      modelProvider: 'anthropic-messages',
      providerId: 'provider-new',
      modelId: 'MiniMax-M2.7',
      apiBase: 'https://api.new-provider.test/anthropic',
    },
  }, [
    {
      id: 'fallback-preset',
      name: 'Fallback Preset',
      runtimeKind: 'claude-code',
      modelProvider: 'anthropic-messages',
      providerId: 'provider-old',
      modelId: 'MiniMax-M2.7',
      apiBase: 'https://api.old-provider.test/anthropic',
      apiKey: 'sk-old',
    },
  ]);

  assert.equal(resolved?.providerId, 'provider-new');
  assert.equal(resolved?.apiBase, 'https://api.new-provider.test/anthropic');
  assert.equal(resolved?.apiKey, 'sk-new');
});
