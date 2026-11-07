import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Workspace } from '@agent-spaces/shared';

test('createPreset copies global folder skills into the agent template', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-data-'));
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    mkdirSync(join(dataDir, 'skills', 'brainstorming'), { recursive: true });
    writeFileSync(
      join(dataDir, 'skills', 'brainstorming', 'SKILL.md'),
      '---\nname: brainstorming\ndescription: Brainstorm first.\n---\n\nSkill body.',
      'utf-8',
    );

    const agentService = await import(`../src/services/agent.ts?case=${Date.now()}`);
    const preset = agentService.createPreset('workspace-id', {
      name: 'test',
      skills: ['brainstorming'],
    });

    assert.ok(preset);
    const copied = readFileSync(
      join(dataDir, 'agent-templates', preset.id, 'skills', 'brainstorming', 'SKILL.md'),
      'utf-8',
    );
    assert.match(copied, /Skill body\./);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('getAvailableSkillNames falls back to global skills when agent copy is empty', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-data-'));
  const agentDir = mkdtempSync(join(tmpdir(), 'agent-dir-'));
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    mkdirSync(join(dataDir, 'skills', 'brainstorming'), { recursive: true });
    writeFileSync(join(dataDir, 'skills', 'brainstorming', 'SKILL.md'), 'Skill body.', 'utf-8');
    mkdirSync(join(agentDir, 'skills'), { recursive: true });
    writeFileSync(join(agentDir, 'skills', 'brainstorming.md'), '', 'utf-8');

    const agentService = await import(`../src/services/agent.ts?case=${Date.now()}-fallback`);

    assert.deepEqual(agentService.getAvailableSkillNames(agentDir, ['brainstorming']), ['brainstorming']);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test('getMcpServers resolves empty agent MCP selections from stored MCP configs', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-data-'));
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    mkdirSync(join(dataDir, 'mcps'), { recursive: true });
    writeFileSync(
      join(dataDir, 'mcps', 'fetch.json'),
      JSON.stringify({
        name: 'fetch',
        config: {
          command: 'uvx',
          args: ['mcp-server-fetch'],
          env: { PYTHONIOENCODING: 'utf-8' },
        },
      }, null, 2),
      'utf-8',
    );

    const agentService = await import(`../src/services/agent.ts?case=${Date.now()}-mcp`);

    assert.deepEqual(
      agentService.getMcpServers({
        mcpServers: {
          fetch: {},
          missing: {},
        },
      }),
      {
        fetch: {
          command: 'uvx',
          args: ['mcp-server-fetch'],
          env: { PYTHONIOENCODING: 'utf-8' },
        },
      },
    );
    assert.deepEqual(agentService.getAllowedTools({ mcpServers: { fetch: {}, missing: {} } }), ['fetch']);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('getAgentConfigDir refreshes workspace agent skills when only an empty placeholder exists', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-data-'));
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'agent-space-workspace-'));
  const agentspaceDir = join(workspaceRoot, '.agentspace');
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const agentId = 'agent-with-plans';
    mkdirSync(join(dataDir, 'agent-templates', agentId, 'skills', 'plans'), { recursive: true });
    writeFileSync(
      join(dataDir, 'agent-templates', agentId, 'agent.json'),
      JSON.stringify({
        id: agentId,
        name: 'Planner',
        role: 'agent',
        runtimeKind: 'pi',
        modelId: 'test-model',
        skills: ['plans'],
        enabled: true,
      }, null, 2),
      'utf-8',
    );
    writeFileSync(join(dataDir, 'agent-templates', agentId, 'mcp.json'), '{}', 'utf-8');
    writeFileSync(join(dataDir, 'agent-templates', agentId, 'skills', 'plans', 'SKILL.md'), 'Plans skill body.', 'utf-8');

    mkdirSync(join(agentspaceDir, 'agents', agentId, 'skills'), { recursive: true });
    writeFileSync(join(agentspaceDir, 'agents', agentId, 'agent.json'), '{}', 'utf-8');
    writeFileSync(join(agentspaceDir, 'agents', agentId, 'mcp.json'), '{}', 'utf-8');
    writeFileSync(join(agentspaceDir, 'agents', agentId, 'skills', 'plans.md'), '', 'utf-8');

    const workspace: Workspace = {
      id: 'workspace-id',
      name: 'Workspace',
      boundDirs: [workspaceRoot],
      agentspaceDir,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activeChannels: [],
      activeIssues: [],
    };
    mkdirSync(join(dataDir, 'workspaces', workspace.id), { recursive: true });
    writeFileSync(join(dataDir, 'workspaces', workspace.id, 'workspace.json'), JSON.stringify(workspace, null, 2), 'utf-8');

    const agentService = await import(`../src/services/agent.ts?case=${Date.now()}-refresh`);
    const configDir = agentService.getAgentConfigDir(workspace.id, {
      id: agentId,
      name: 'Planner',
      role: 'agent',
      runtimeKind: 'pi',
      modelId: 'test-model',
      skills: ['plans'],
      enabled: true,
    });

    assert.equal(configDir, join(agentspaceDir, 'agents', agentId));
    assert.equal(
      readFileSync(join(agentspaceDir, 'agents', agentId, 'skills', 'plans', 'SKILL.md'), 'utf-8'),
      'Plans skill body.',
    );
    assert.deepEqual(agentService.getAvailableSkillNames(configDir, ['plans']), ['plans']);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
