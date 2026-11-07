import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { getToolDetail, saveToolDetails, type ToolDetail } from '../src/services/tool-detail.js';

test('team tool details survive parts being copied to a handoff message', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-tool-detail-'));
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const detail: ToolDetail = {
      id: 'tool-1',
      workspaceId: '__team__',
      channelId: 'runtime-1',
      messageId: 'pending-message',
      title: 'team_message_send',
      raw: 'Tool: team_message_send',
      createdAt: new Date().toISOString(),
    };
    saveToolDetails(detail.workspaceId, detail.channelId, [detail]);

    assert.equal(getToolDetail('__team__', 'runtime-1', 'handoff-message', detail.id)?.id, detail.id);
    assert.equal(getToolDetail('workspace-1', 'runtime-1', 'handoff-message', detail.id), null);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});
