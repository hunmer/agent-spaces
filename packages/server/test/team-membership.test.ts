import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPreset } from '../src/services/agent.js';
import { createAgent as createChatAgent } from '../src/services/chat.js';
import { handleTeamManage, handleTeamMembershipManage } from '../src/services/team.js';

test('team memberships persist agent store, validate invite target, and allow custom agent config', () => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-team-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const owner = createPreset('', { name: 'Owner Agent' });
    const member = createPreset('', { name: 'Member Agent' });
    assert.ok(owner);
    assert.ok(member);

    const created = handleTeamManage({
      action: 'create',
      actor_agent_id: owner.id,
      name: 'Test Team',
      initial_members: [{ agent_id: member.id }],
    });
    assert.equal(created.success, true);
    const teamId = (created.data as { team: { team_id: string } }).team.team_id;

    const initialMemberships = JSON.parse(readFileSync(join(dataDir, 'team', teamId, 'memberships.json'), 'utf-8')) as Array<Record<string, unknown>>;
    assert.equal(initialMemberships[0]?.agentStore, 'agent');
    assert.equal(initialMemberships[1]?.agentStore, 'agent');

    const missingInvite = handleTeamMembershipManage({
      action: 'invite',
      actor_agent_id: owner.id,
      team_id: teamId,
      target_agent_id: 'missing-agent',
      agent_store: 'agent',
    });
    assert.equal(missingInvite.success, false);
    assert.equal(missingInvite.code, 'AGENT_NOT_FOUND');

    const chatAgent = createChatAgent({
      name: 'Chat Member',
      model: 'gpt-4o-mini',
      enabled: true,
    });
    const chatInvite = handleTeamMembershipManage({
      action: 'invite',
      actor_agent_id: owner.id,
      team_id: teamId,
      target_agent_id: chatAgent.id,
      agent_store: 'chat',
    });
    assert.equal(chatInvite.success, true);

    const customInvite = handleTeamMembershipManage({
      action: 'invite',
      actor_agent_id: owner.id,
      team_id: teamId,
      agent_store: 'custom',
      agent: { id: 'custom-agent', name: 'Custom Agent', systemPrompt: 'Be precise.' },
      role: 'observer',
    });
    assert.equal(customInvite.success, true);

    const finalMemberships = JSON.parse(readFileSync(join(dataDir, 'team', teamId, 'memberships.json'), 'utf-8')) as Array<Record<string, unknown>>;
    assert.equal(finalMemberships.find((item) => item.agentId === chatAgent.id)?.agentStore, 'chat');
    assert.deepEqual(
      finalMemberships.find((item) => item.agentId === 'custom-agent')?.agent,
      { id: 'custom-agent', name: 'Custom Agent', systemPrompt: 'Be precise.' },
    );
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});
