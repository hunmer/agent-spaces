import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { clearSkills, getSkill } from '@codeany/open-agent-sdk';
import { normalizeOpenAgentMcpServers, registerConfiguredSkills } from '../src/adapters/open-agent-sdk-runtime.js';

test('normalizeOpenAgentMcpServers maps the retired fetch npm package to uvx', () => {
  const normalized = normalizeOpenAgentMcpServers({
    fetch: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch', '--ignore-robots-txt'],
      env: { CUSTOM_ENV: '1' },
    },
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    },
  }) as Record<string, { command: string; args: string[]; env?: Record<string, string> }>;

  assert.deepEqual(normalized.fetch, {
    command: 'uvx',
    args: ['mcp-server-fetch', '--ignore-robots-txt'],
    env: { PYTHONIOENCODING: 'utf-8', CUSTOM_ENV: '1' },
  });
  assert.deepEqual(normalized.filesystem, {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
  });
});

test('registerConfiguredSkills loads folder skills from agent config', async () => {
  clearSkills();
  const agentDir = mkdtempSync(join(tmpdir(), 'agent-skills-'));
  try {
    mkdirSync(join(agentDir, 'skills', 'brainstorming'), { recursive: true });
    writeFileSync(
      join(agentDir, 'skills', 'brainstorming', 'SKILL.md'),
      [
        '---',
        'name: brainstorming',
        'description: Explore requirements before implementation.',
        '---',
        '',
        'Ask clarifying questions and produce a design.',
      ].join('\n'),
      'utf-8',
    );

    const registered = registerConfiguredSkills(agentDir, ['brainstorming']);
    const skill = getSkill('brainstorming');

    assert.deepEqual(registered, ['brainstorming']);
    assert.ok(skill);
    assert.equal(skill.description, 'Explore requirements before implementation.');
    assert.deepEqual(await skill.getPrompt('', {} as never), [
      { type: 'text', text: 'Ask clarifying questions and produce a design.' },
    ]);
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
    clearSkills();
  }
});

test('registerConfiguredSkills falls back to global skills when agent copy is empty', async () => {
  clearSkills();
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-data-'));
  const agentDir = mkdtempSync(join(tmpdir(), 'agent-skills-'));
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    mkdirSync(join(dataDir, 'skills', 'brainstorming'), { recursive: true });
    writeFileSync(
      join(dataDir, 'skills', 'brainstorming', 'SKILL.md'),
      '---\nname: brainstorming\ndescription: Brainstorm globally.\n---\n\nGlobal skill body.',
      'utf-8',
    );
    mkdirSync(join(agentDir, 'skills'), { recursive: true });
    writeFileSync(join(agentDir, 'skills', 'brainstorming.md'), '', 'utf-8');

    const registered = registerConfiguredSkills(agentDir, ['brainstorming']);
    const skill = getSkill('brainstorming');

    assert.deepEqual(registered, ['brainstorming']);
    assert.ok(skill);
    assert.equal(skill.description, 'Brainstorm globally.');
    assert.deepEqual(await skill.getPrompt('', {} as never), [
      { type: 'text', text: 'Global skill body.' },
    ]);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(agentDir, { recursive: true, force: true });
    clearSkills();
  }
});
