import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildPersistentAgentContextDetails } from '../src/services/persistent-agent-context.js';

test('buildPersistentAgentContextDetails ignores local CLAUDE.md without boundDirs', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-data-'));
  const projectDir = mkdtempSync(join(tmpdir(), 'persistent-context-project-'));
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    writeFileSync(join(projectDir, 'CLAUDE.md'), 'local instructions', 'utf-8');

    const details = buildPersistentAgentContextDetails({
      workspaceId: 'ws-1',
      workingDir: projectDir,
    });

    assert.equal(details.summary.counts.total, 0);
    assert.equal(details.instructionContext, '');
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('buildPersistentAgentContextDetails loads instruction files from boundDirs ancestors', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-data-'));
  const workspaceDir = mkdtempSync(join(tmpdir(), 'persistent-context-workspace-'));
  const nestedDir = join(workspaceDir, 'packages', 'app');
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(join(workspaceDir, 'AGENTS.md'), 'workspace instructions', 'utf-8');
    writeFileSync(join(nestedDir, 'CLAUDE.md'), 'nested instructions', 'utf-8');

    const details = buildPersistentAgentContextDetails({
      workspaceId: 'ws-1',
      workingDir: nestedDir,
      boundDirs: [workspaceDir],
    });

    assert.ok(details.summary.instructionFiles.some((file) => file.path.endsWith('AGENTS.md')));
    assert.ok(details.summary.instructionFiles.some((file) => file.path.endsWith('CLAUDE.md')));
    assert.match(details.instructionContext, /workspace instructions/);
    assert.match(details.instructionContext, /nested instructions/);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(workspaceDir, { recursive: true, force: true });
  }
});

test('buildPersistentAgentContextDetails excludes every CLAUDE.md casing for native Claude Code loading', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-data-'));
  const workspaceDir = mkdtempSync(join(tmpdir(), 'persistent-context-workspace-'));
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    writeFileSync(join(dataDir, 'CLAUDE.md'), 'server instructions', 'utf-8');
    writeFileSync(join(workspaceDir, 'CLAUDE.md'), 'workspace instructions', 'utf-8');

    const details = buildPersistentAgentContextDetails({
      workspaceId: 'ws-1',
      workingDir: workspaceDir,
      boundDirs: [workspaceDir],
      excludeNativeClaudeMd: true,
    });

    assert.equal(details.summary.counts.claudeMd, 0);
    assert.doesNotMatch(details.instructionContext, /server instructions|workspace instructions/);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(workspaceDir, { recursive: true, force: true });
  }
});

test('buildPersistentAgentContextDetails deduplicates instruction files by case on Windows', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-data-'));
  const workspaceDir = mkdtempSync(join(tmpdir(), 'persistent-context-dedupe-'));
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    writeFileSync(join(workspaceDir, 'AGENTS.md'), 'workspace instructions', 'utf-8');

    const details = buildPersistentAgentContextDetails({
      workspaceId: 'ws-1',
      workingDir: workspaceDir,
      boundDirs: [workspaceDir],
    });

    const agentFiles = details.summary.instructionFiles.filter((file) => file.filename.toLowerCase() === 'agents.md');
    assert.equal(agentFiles.length, 1);
    assert.equal(details.summary.counts.agentsMd, 1);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(workspaceDir, { recursive: true, force: true });
  }
});
