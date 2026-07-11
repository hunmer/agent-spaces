import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('generated team agents persist only as custom memberships', async () => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-custom-team-'));
  let closeDb = () => {};
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const [{ createPreset, listPresets }, { handleTeamManage }, agentStore] = await Promise.all([
      import('../src/services/agent.js'),
      import('../src/services/team.js'),
      import('../src/storage/agent-store.js'),
    ]);
    closeDb = agentStore.closeDb;
    const owner = createPreset('', { name: 'Owner' });
    assert.ok(owner);

    const generatedAgent = {
      id: 'generated-writer',
      name: 'Generated Writer',
      role: 'agent',
      description: 'Writes the draft',
      runtimeKind: 'langchain',
      modelProvider: 'openai-chat-completions',
      providerId: 'provider-1',
      modelId: 'model-1',
      apiBase: 'https://example.com/v1',
      tools: ['team_message_send'],
      systemPrompt: 'Write, then hand off with team_message_send.',
      enabled: true,
    };
    const created = handleTeamManage({
      action: 'create',
      actor_agent_id: owner.id,
      name: 'Generated Team',
      initial_members: [{
        agent_id: generatedAgent.id,
        agent_store: 'custom',
        agent: generatedAgent,
        role: 'owner',
      }],
    });
    assert.equal(created.success, true);
    const teamId = (created.data as { team: { team_id: string } }).team.team_id;
    const memberships = JSON.parse(readFileSync(join(dataDir, 'team', teamId, 'memberships.json'), 'utf-8')) as Array<Record<string, unknown>>;
    const generatedMembership = memberships.find((item) => item.agentId === generatedAgent.id);

    assert.equal(generatedMembership?.agentStore, 'custom');
    assert.deepEqual(generatedMembership?.agent, generatedAgent);
    assert.equal(generatedMembership?.role, 'owner');
    assert.equal(memberships.length, 1);
    assert.equal(listPresets().some((agent) => agent.id === generatedAgent.id), false);
  } finally {
    closeDb();
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});
