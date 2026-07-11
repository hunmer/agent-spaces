import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentConfig } from '@agent-spaces/shared';
import { normalizeTeamMemberSelection, parseJsonObject } from './agent-designer.js';

const generatorTemplate = {
  id: 'agent-generator',
  name: 'Agent Generator',
  role: 'agent',
  runtimeKind: 'claude-code' as const,
  modelProvider: 'openai-chat-completions' as const,
  providerId: 'provider-1',
  modelId: 'model-1',
  apiBase: 'https://example.com/v1',
  temperature: 0.2,
  maxTokens: 2048,
  enabled: true,
};

test('repairs model JSON containing markdown fences and unescaped prompt text', () => {
  const source = [
    '{"agents":[{',
    '"name":"审核员",',
    '"description":"审核分镜脚本",',
    '"systemPrompt":"输出要求：',
    '```text',
    '[镜头编号] ["场景描述"]',
    '```"',
    '}]}',
  ].join('\n');

  const parsed = parseJsonObject(source) as { agents: Array<{ systemPrompt: string }> };
  assert.equal(parsed.agents[0]?.systemPrompt.includes('[镜头编号] ["场景描述"]'), true);
});

test('filters agent-generator and adds team tool instructions', () => {
  const normalize = normalizeTeamMemberSelection as unknown as (
    value: unknown,
    template: typeof generatorTemplate,
  ) => { agents: Array<Record<string, unknown>> };
  const result = normalize({
    agents: [
      { name: 'Agent Generator', description: 'Creates agents', systemPrompt: 'Generate agents.', isOwner: true },
      { name: 'Writer', description: 'Writes the draft', systemPrompt: 'Write the draft.', isOwner: true },
    ],
  }, generatorTemplate);

  assert.deepEqual(result.agents.map((agent) => agent.name), ['Writer']);
  assert.match(String(result.agents[0]?.systemPrompt ?? ''), /team_message_send/);
  assert.match(String(result.agents[0]?.systemPrompt ?? ''), /recipient agent id/);
  assert.equal(result.agents[0]?.runtimeKind, 'langchain');
  assert.equal(result.agents[0]?.providerId, 'provider-1');
  assert.deepEqual(result.agents[0]?.tools, ['team_message_send']);
  assert.equal(result.agents[0]?.isOwner, true);
  assert.match(String(result.agents[0]?.id ?? ''), /^[0-9a-f-]{36}$/);
});

test('keeps exactly one generated team owner', () => {
  const result = normalizeTeamMemberSelection({
    agents: [
      { name: 'Lead', description: 'Leads', systemPrompt: 'Lead.', isOwner: true },
      { name: 'Writer', description: 'Writes', systemPrompt: 'Write.', isOwner: true },
    ],
  }, generatorTemplate as AgentConfig);

  assert.deepEqual(result.agents.map((agent) => agent.isOwner), [true, false]);
});
