import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createChannel, updateChannel } from '../src/services/channel.js';
import { saveTeam } from '../src/services/team-internal.js';

test('channel persists only unique active team bindings', () => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-channel-team-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const now = new Date().toISOString();
    saveTeam({
      id: 'active-team',
      name: 'Active Team',
      description: '',
      status: 'active',
      visibility: 'private',
      createdBy: 'owner',
      createdAt: now,
      updatedAt: now,
      memberCount: 0,
    });

    const { channel } = createChannel('workspace', {
      name: 'Team Channel',
      type: 'general',
      teamIds: ['active-team', 'missing-team', 'active-team'],
    });
    assert.deepEqual(channel.teamIds, ['active-team']);

    const updated = updateChannel('workspace', channel.id, { teamIds: [] });
    assert.deepEqual(updated?.teamIds, []);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});
