import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTeamMemberSelection, parseJsonObject } from './agent-designer.js';

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
  const result = normalizeTeamMemberSelection({
    agents: [
      { name: 'Agent Generator', description: 'Creates agents', systemPrompt: 'Generate agents.' },
      { name: 'Writer', description: 'Writes the draft', systemPrompt: 'Write the draft.' },
    ],
  });

  assert.deepEqual(result.agents.map((agent) => agent.name), ['Writer']);
  assert.match(result.agents[0]?.systemPrompt ?? '', /team_message_send/);
  assert.match(result.agents[0]?.systemPrompt ?? '', /recipient agent id/);
});
