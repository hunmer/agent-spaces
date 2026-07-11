import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as agentService from '../src/services/agent.js';
import { closeDb } from '../src/storage/agent-store.js';
import { persistTeamAgentSessionHistory } from '../src/services/team-runtime.js';

test('team agent runs persist messages for usage session details', () => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-team-history-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const session = agentService.create('__team__', 'assistant', 'agent-1');
    agentService.complete('__team__', session.id, undefined, { forceRecord: true });
    persistTeamAgentSessionHistory({
      content: '团队回复',
      agentContext: {
        sessionId: session.id,
        agentConfigId: 'agent-1',
        userPrompt: '团队问题',
        systemPrompt: '团队系统提示',
        fullPrompt: '完整团队问题',
      },
    }, [{ id: 'text-1', type: 'text', text: '团队回复' }]);

    const detail = agentService.getSessionDetail(session.id);
    assert.deepEqual(detail?.messages.map(({ role, content }) => ({ role, content })), [
      { role: 'user', content: '团队问题' },
      { role: 'agent', content: '团队回复' },
    ]);
    assert.equal(detail?.source, 'cli_history');
    assert.equal(detail?.systemPrompt, '团队系统提示');
    assert.equal(detail?.fullPrompt, '完整团队问题');
  } finally {
    closeDb();
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});
