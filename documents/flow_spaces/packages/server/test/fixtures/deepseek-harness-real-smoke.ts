/** Opt-in real-model acceptance. Never imported by the deterministic unit suite. */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Message } from '@agent-spaces/shared';

if (process.env.DSH_REAL_SMOKE !== '1') {
  throw new Error('Set DSH_REAL_SMOKE=1 to opt in to a real DSH model request.');
}
const root = mkdtempSync(join(tmpdir(), 'dsh-real-smoke-'));
const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
// Platform imports must not access or alter the user's Agent Spaces persistent data.
process.env.AGENT_SPACES_DATA_DIR = join(root, 'platform-data');
try {
  const { buildAgentPrompt } = await import('../../src/ws/agent-prompt.js');
  const { createAgentRuntime } = await import('../../src/adapters/agent-runtime.js');
  const history: Message[] = [
    { id: 'synthetic-user', channelId: 'isolated-smoke', senderId: 'user', senderRole: 'user',
      type: 'text', status: 'completed', content: 'The starting integer is 17.', createdAt: '' },
    { id: 'synthetic-agent', channelId: 'isolated-smoke', senderId: 'agent', senderRole: 'assistant',
      type: 'text', status: 'completed', content: 'I will keep that integer for the next question.', createdAt: '' },
  ];
  const prompt = buildAgentPrompt('isolated-dsh-smoke', undefined,
    'Multiply the starting integer from the conversation history by 23. Reply with only the integer result. Do not use tools.',
    history, { runtimeKind: 'deepseek-harness', mcpServers: [], skills: [], workingDir: root });
  const historyPreserved = prompt.includes('Conversation history:')
    && prompt.includes('[User]: The starting integer is 17.')
    && prompt.includes('[assistant]: I will keep that integer for the next question.');
  assert.equal(historyPreserved, true, 'Actual platform prompt builder must retain both history messages');
  const runtime = createAgentRuntime({ kind: 'deepseek-harness' });
  const events: string[] = [];
  const timeout = setTimeout(() => runtime.stop(), 90000);
  timeout.unref();
  try {
    const result = await runtime.execute(prompt, root, { onEvent: (event) => events.push(event.type) });
    console.log(JSON.stringify({ realModel: true, historyPreserved, runtimeKind: 'deepseek-harness',
      promptChars: prompt.length, result, eventTypes: events }, null, 2));
    if (!result.success || result.output.join('\n').trim() !== '391') process.exitCode = 1;
  } finally { clearTimeout(timeout); runtime.stop(); }
} finally {
  if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
  else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
  rmSync(root, { recursive: true, force: true });
}
