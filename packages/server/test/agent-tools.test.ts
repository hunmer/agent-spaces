import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as agentService from '../src/services/agent.js';
import { createAgentFunctionTools } from '../src/services/builtin-tools/agent-tools.js';
import { closeDb } from '../src/storage/agent-store.js';

test('ListAgentSessions returns only sessions for the requested agent', async () => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-agent-tools-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const expected = agentService.create('workspace-1', 'assistant', 'agent-1');
    agentService.create('workspace-1', 'assistant', 'agent-2');
    const tool = createAgentFunctionTools('workspace-1').find(({ name }) => name === 'ListAgentSessions');

    const result = await tool?.execute({ agent_id: 'agent-1' }) as Array<{ sessionId: string; agentConfigId: string }>;
    assert.deepEqual(result.map(({ sessionId, agentConfigId }) => ({ sessionId, agentConfigId })), [
      { sessionId: expected.id, agentConfigId: 'agent-1' },
    ]);
  } finally {
    closeDb();
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('GetAgentSessionDetail returns detail only from the current workspace', async () => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-agent-detail-tool-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const session = agentService.create('workspace-1', 'assistant', 'agent-1');
    const otherSession = agentService.create('workspace-2', 'assistant', 'agent-1');
    const tool = createAgentFunctionTools('workspace-1').find(({ name }) => name === 'GetAgentSessionDetail');

    const detail = await tool?.execute({ session_id: session.id }) as { session: { id: string } };
    assert.equal(detail.session.id, session.id);
    await assert.rejects(() => tool!.execute({ session_id: otherSession.id }), /session not found/);
  } finally {
    closeDb();
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});
