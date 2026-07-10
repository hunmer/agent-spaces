import assert from 'node:assert/strict';
import test from 'node:test';
import { parseJsonObject } from './agent-designer.js';

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
