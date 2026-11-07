import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJsonFile, writeJsonFile } from '../src/storage/json-store.js';
import {
  recoverTeamRuntimesOnStartup,
  saveTeamIds,
  teamRuntimesPath,
} from '../src/services/team-internal.js';

test('startup marks persisted running team runtimes as error', () => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-team-startup-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const teamId = 'team-1';
    const sessionId = '7305b983-31fc-4cef-98df-87d6ee63f34c';
    const path = teamRuntimesPath(teamId, sessionId);
    saveTeamIds([teamId]);
    writeJsonFile(path, [
      { sessionId: 'run-1', status: 'running', updatedAt: 'old' },
      { sessionId: 'run-2', status: 'completed', updatedAt: 'done' },
    ]);

    assert.equal(recoverTeamRuntimesOnStartup(), 1);
    const runtimes = readJsonFile<Array<{ status: string; updatedAt: string }>>(path);
    assert.equal(runtimes?.[0]?.status, 'error');
    assert.notEqual(runtimes?.[0]?.updatedAt, 'old');
    assert.deepEqual(runtimes?.[1], { sessionId: 'run-2', status: 'completed', updatedAt: 'done' });
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});
