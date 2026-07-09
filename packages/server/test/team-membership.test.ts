import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPreset } from '../src/services/agent.js';
import { createAgent as createChatAgent } from '../src/services/chat.js';
import { createWorkflow } from '../src/services/workflow.js';
import {
  handleTeamManage,
  handleTeamMembershipManage,
  handleTeamMessageDelete,
  handleTeamMessageSend,
  resolveTeamAgentSource,
} from '../src/services/team.js';
import { createProvider } from '../src/storage/llm-store.js';
import {
  postTeamRuntimeMessage,
  resolveCustomAgentProvider,
  setTeamRuntimeFactoryForTests,
} from '../src/services/team-runtime.js';

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

test('team resolves workflow agent ids as custom members and deletes team messages', () => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-team-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const owner = createPreset('', { name: 'Owner Agent' });
    assert.ok(owner);

    createWorkflow({
      name: 'Workflow Team Source',
      nodes: [{
        id: 'agent-run-topic',
        type: 'agent_run',
        label: 'Topic Agent',
        position: { x: 0, y: 0 },
        data: {
          agentConfigId: 'topic_agent',
          agent: {
            id: 'topic_agent',
            name: 'Topic Agent',
            runtimeKind: 'claude-code',
            modelProvider: 'anthropic-messages',
            modelId: 'test-model',
            systemPrompt: 'Be helpful.',
          },
        },
      }],
      edges: [],
    });

    const created = handleTeamManage({
      action: 'create',
      actor_agent_id: owner.id,
      name: 'Workflow Team',
      initial_members: [{ agent_id: 'topic_agent' }],
    });
    assert.equal(created.success, true);
    const teamId = (created.data as { team: { team_id: string } }).team.team_id;

    const source = resolveTeamAgentSource('topic_agent');
    assert.deepEqual(source, {
      agentStore: 'custom',
      agent: {
        id: 'topic_agent',
        name: 'Topic Agent',
        runtimeKind: 'claude-code',
        modelProvider: 'anthropic-messages',
        modelId: 'test-model',
        systemPrompt: 'Be helpful.',
      },
    });

    const memberships = JSON.parse(readFileSync(join(dataDir, 'team', teamId, 'memberships.json'), 'utf-8')) as Array<Record<string, unknown>>;
    assert.equal(memberships.find((item) => item.agentId === 'topic_agent')?.agentStore, 'custom');

    const sent = handleTeamMessageSend({
      action: 'send',
      actor_agent_id: owner.id,
      team_id: teamId,
      mode: 'direct',
      subject: 'hello',
      body: 'hello',
      recipient_agent_ids: ['topic_agent'],
    });
    assert.equal(sent.success, true);
    const messageId = (sent.data as { message: { message_id: string } }).message.message_id;

    const deleted = handleTeamMessageDelete({
      actor_agent_id: owner.id,
      message_id: messageId,
    });
    assert.equal(deleted.success, true);

    const messages = JSON.parse(readFileSync(join(dataDir, 'team', teamId, 'messages.json'), 'utf-8')) as Array<Record<string, unknown>>;
    const deliveries = JSON.parse(readFileSync(join(dataDir, 'team', teamId, 'deliveries.json'), 'utf-8')) as Array<Record<string, unknown>>;
    assert.equal(messages.length, 0);
    assert.equal(deliveries.length, 0);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('team runtime custom agent resolves apiKey from providerId', async () => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-team-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const provider = createProvider({
      name: 'minimax',
      apiBase: 'https://api.minimaxi.com/anthropic',
      apiKey: 'provider-api-key',
      modelProvider: 'anthropic-messages',
    });

    const resolved = resolveCustomAgentProvider({
      id: 'topic_agent',
      name: 'Topic Agent',
      runtimeKind: 'claude-code',
      modelProvider: 'anthropic-messages',
      providerId: provider.id,
      modelId: 'MiniMax-M2.7',
      apiBase: 'https://api.minimaxi.com/anthropic',
      systemPrompt: 'Be helpful.',
    });
    assert.equal(resolved?.id, provider.id);
    assert.equal(resolved?.apiKey, 'provider-api-key');
    assert.equal(resolved?.apiBase, 'https://api.minimaxi.com/anthropic');
    assert.equal(resolved?.modelProvider, 'anthropic-messages');
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('team runtime custom agent can self-test full reply flow with providerId only', async () => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-team-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  const capturedConfigs: Array<Record<string, unknown>> = [];
  const capturedRuns: Array<Record<string, unknown>> = [];
  const capturedPrompts: string[] = [];
  setTeamRuntimeFactoryForTests((config) => {
    capturedConfigs.push((config ?? {}) as Record<string, unknown>);
    return {
      async execute(prompt, _workingDir, options) {
        capturedPrompts.push(prompt);
        capturedRuns.push((options ?? {}) as Record<string, unknown>);
        return { success: true, summary: 'stub-summary', output: ['stub-reply'], artifacts: [] };
      },
      stop() {},
    };
  });

  try {
    const owner = createPreset('', { name: 'Owner Agent' });
    assert.ok(owner);

    const provider = createProvider({
      name: 'minimax',
      apiBase: 'https://api.minimaxi.com/anthropic',
      apiKey: 'provider-api-key',
      modelProvider: 'anthropic-messages',
    });

    createWorkflow({
      name: 'Workflow Runtime Provider',
      nodes: [{
        id: 'agent-run-topic',
        type: 'agent_run',
        label: 'Topic Agent',
        position: { x: 0, y: 0 },
        data: {
          agentConfigId: 'topic_agent',
          agent: {
            id: 'topic_agent',
            name: 'Topic Agent',
            runtimeKind: 'claude-code',
            modelProvider: 'anthropic-messages',
            providerId: provider.id,
            modelId: 'MiniMax-M2.7',
            apiBase: 'https://api.minimaxi.com/anthropic',
            workingDir: dataDir,
            tools: ['team_message_send', 'team_inbox_query', 'ListWorkspaceFiles', 'list_workflows'],
            systemPrompt: 'Be helpful.',
          },
        },
      }],
      edges: [],
    });

    const created = handleTeamManage({
      action: 'create',
      actor_agent_id: owner.id,
      name: 'Runtime Provider Team',
      initial_members: [{ agent_id: 'topic_agent' }],
    });
    assert.equal(created.success, true);
    const teamId = (created.data as { team: { team_id: string } }).team.team_id;

    const sent = postTeamRuntimeMessage({
      team_id: teamId,
      actor_agent_id: owner.id,
      content: 'hello runtime',
      target_agent_id: 'topic_agent',
      context_length: 0,
    });
    assert.equal(sent.success, true);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const messages = JSON.parse(readFileSync(join(dataDir, 'team', teamId, 'messages.json'), 'utf-8')) as Array<Record<string, unknown>>;
    assert.equal(capturedConfigs.length, 1);
    assert.equal(capturedConfigs[0]?.apiKey, 'provider-api-key');
    assert.equal(capturedConfigs[0]?.baseURL, 'https://api.minimaxi.com/anthropic');
    assert.equal(capturedConfigs[0]?.provider, 'anthropic-messages');
    const runtimeToolNames = Array.isArray(capturedRuns[0]?.tools) ? capturedRuns[0].tools as string[] : [];
    assert.ok(runtimeToolNames.includes('team_message_send'));
    assert.ok(runtimeToolNames.includes('team_inbox_query'));
    assert.ok(runtimeToolNames.includes('ListWorkspaceFiles'));
    assert.ok(runtimeToolNames.includes('list_workflows'));
    const runtimeFunctionTools = Array.isArray(capturedRuns[0]?.functionTools)
      ? capturedRuns[0].functionTools as Array<{ name: string; execute: (input: unknown) => Promise<unknown> }>
      : [];
    assert.ok(runtimeFunctionTools.some((tool) => tool.name === 'team_message_send'));
    assert.ok(runtimeFunctionTools.some((tool) => tool.name === 'team_inbox_query'));
    assert.ok(runtimeFunctionTools.some((tool) => tool.name === 'ListWorkspaceFiles'));
    assert.ok(runtimeFunctionTools.some((tool) => tool.name === 'list_workflows'));
    assert.match(capturedPrompts[0] ?? '', /Available teammates for handoff:/);
    assert.match(capturedPrompts[0] ?? '', /Owner Agent/);
    assert.match(capturedPrompts[0] ?? '', /team_message_send/);
    const listWorkspaceFilesTool = runtimeFunctionTools.find((tool) => tool.name === 'ListWorkspaceFiles');
    assert.ok(listWorkspaceFilesTool);
    const listed = await listWorkspaceFilesTool.execute({ path: '', depth: 1 }) as { files: Array<{ name: string }> };
    assert.ok(Array.isArray(listed.files));
    const deliveries = JSON.parse(readFileSync(join(dataDir, 'team', teamId, 'deliveries.json'), 'utf-8')) as Array<Record<string, unknown>>;
    const inbound = deliveries.find((item) => item.recipientAgentId === 'topic_agent');
    assert.equal(inbound?.executionStatus, 'done');
    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.senderAgentId, owner.id);
    assert.equal(messages[1]?.senderAgentId, 'topic_agent');
    assert.equal(messages[1]?.body, 'stub-reply');
  } finally {
    setTeamRuntimeFactoryForTests();
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('team cannot remove the last active owner', () => {
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
      name: 'Protected Owner Team',
      initial_members: [{ agent_id: member.id }],
    });
    assert.equal(created.success, true);
    const teamId = (created.data as { team: { team_id: string } }).team.team_id;

    const removed = handleTeamMembershipManage({
      action: 'remove',
      actor_agent_id: owner.id,
      team_id: teamId,
      agent_id: owner.id,
    });
    assert.equal(removed.success, false);
    assert.equal(removed.code, 'PERMISSION_DENIED');

    const detail = handleTeamManage({
      action: 'get',
      actor_agent_id: owner.id,
      team_id: teamId,
    });
    assert.equal(detail.success, true);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('team detail can be viewed without active membership', () => {
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
      name: 'Readable Team',
      initial_members: [{ agent_id: member.id }],
    });
    assert.equal(created.success, true);
    const teamId = (created.data as { team: { team_id: string } }).team.team_id;

    const removed = handleTeamMembershipManage({
      action: 'remove',
      actor_agent_id: owner.id,
      team_id: teamId,
      agent_id: member.id,
    });
    assert.equal(removed.success, true);

    const detail = handleTeamManage({
      action: 'get',
      actor_agent_id: member.id,
      team_id: teamId,
      include_members_preview: true,
    });
    assert.equal(detail.success, true);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('transferring owner and removing previous owner does not dissolve team', () => {
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
      name: 'Transfer Owner Team',
      initial_members: [{ agent_id: member.id }],
    });
    assert.equal(created.success, true);
    const teamId = (created.data as { team: { team_id: string } }).team.team_id;

    const transferred = handleTeamMembershipManage({
      action: 'set_role',
      actor_agent_id: owner.id,
      team_id: teamId,
      agent_id: member.id,
      role: 'owner',
    });
    assert.equal(transferred.success, true);

    const removed = handleTeamMembershipManage({
      action: 'remove',
      actor_agent_id: member.id,
      team_id: teamId,
      agent_id: owner.id,
    });
    assert.equal(removed.success, true);

    const detail = handleTeamManage({
      action: 'get',
      actor_agent_id: owner.id,
      team_id: teamId,
    });
    assert.equal(detail.success, true);
    assert.equal((detail.data as { team: { status: string; my_role: string | null } }).team.status, 'active');
    assert.equal((detail.data as { team: { status: string; my_role: string | null } }).team.my_role, null);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});
