import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Workspace } from '@agent-spaces/shared';
import { createWorkspaceFileFunctionTools } from '../src/services/builtin-tools/workspace-file-tools.js';

function testWorkspace(dir: string): Workspace {
  return {
    id: 'workspace-1',
    name: 'Test Workspace',
    boundDirs: [dir],
    agentspaceDir: dir,
    createdAt: '',
    updatedAt: '',
    activeChannels: [],
    activeIssues: [],
  };
}

test('ReplaceWorkspaceFileLine replaces one line and rejects stale or invalid edits', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-spaces-workspace-file-tools-'));
  const filePath = join(dir, 'notes.txt');
  writeFileSync(filePath, 'one\r\ntwo\r\nthree\r\n', 'utf-8');

  try {
    const tools = createWorkspaceFileFunctionTools('workspace-1', ['ReplaceWorkspaceFileLine'], () => testWorkspace(dir));
    const replaceLine = tools.find((tool) => tool.name === 'ReplaceWorkspaceFileLine');
    assert.ok(replaceLine);

    assert.deepEqual(await replaceLine.execute({ path: 'notes.txt', line: 2, content: 'TWO', expected: 'two' }), {
      ok: true,
      path: 'notes.txt',
      line: 2,
    });
    assert.equal(readFileSync(filePath, 'utf-8'), 'one\r\nTWO\r\nthree\r\n');
    await assert.rejects(() => replaceLine.execute({ path: 'notes.txt', line: 2, content: 'two', expected: 'two' }), /does not match expected/);
    await assert.rejects(() => replaceLine.execute({ path: 'notes.txt', line: 5, content: 'five' }), /out of range/);
    await assert.rejects(() => replaceLine.execute({ path: '../notes.txt', line: 1, content: 'bad' }), /Parent path traversal/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ReadWorkspaceFileLines reads from a start line with count', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-spaces-workspace-file-tools-'));
  const filePath = join(dir, 'notes.txt');
  writeFileSync(filePath, 'one\ntwo\nthree\nfour\n', 'utf-8');

  try {
    const tools = createWorkspaceFileFunctionTools('workspace-1', ['ReadWorkspaceFileLines'], () => testWorkspace(dir));
    const readLines = tools.find((tool) => tool.name === 'ReadWorkspaceFileLines');
    assert.ok(readLines);

    assert.deepEqual(await readLines.execute({ path: 'notes.txt', startLine: 2, count: 2 }), {
      path: 'notes.txt',
      startLine: 2,
      endLine: 3,
      totalLines: 4,
      lines: [
        { line: 2, content: 'two' },
        { line: 3, content: 'three' },
      ],
    });
    await assert.rejects(() => readLines.execute({ path: 'notes.txt', startLine: 5 }), /out of range/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
