import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPreset, queryRecentUsage } from '../src/services/agent.js';
import { createAgent as createChatAgent } from '../src/services/chat.js';
import { createWorkflow } from '../src/services/workflow.js';
import {
  handleTeamManage,
  handleTeamInboxDelete,
  handleTeamMembershipManage,
  handleTeamMessageDelete,
  handleTeamMessageSend,
  resolveTeamAgentSource,
} from '../src/services/team.js';
import { createProvider } from '../src/storage/llm-store.js';
import { closeDb as closeAgentDb } from '../src/storage/agent-store.js';
import {
  getTeamRuntime,
  listTeamSessions,
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

    assert.equal(existsSync(join(dataDir, 'team', teamId, 'messages.json')), false);
    assert.equal(existsSync(join(dataDir, 'team', teamId, 'deliveries.json')), false);
    assert.equal(existsSync(join(dataDir, 'team', teamId, 'comments.json')), false);

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

    const sessionId = '11111111-1111-4111-8111-111111111111';

    const sent = handleTeamMessageSend({
      action: 'send',
      actor_agent_id: owner.id,
      team_id: teamId,
      session_id: sessionId,
      mode: 'direct',
      subject: 'hello',
      body: 'hello',
      recipient_agent_ids: ['topic_agent'],
    });
    assert.equal(sent.success, true);
    const messageId = (sent.data as { message: { message_id: string } }).message.message_id;
    const deliveryPath = join(dataDir, 'team', teamId, sessionId, 'deliveries.json');
    const sentDeliveries = JSON.parse(readFileSync(deliveryPath, 'utf-8')) as Array<{ id: string }>;
    const deletedDelivery = handleTeamInboxDelete({ actor_agent_id: owner.id, delivery_id: sentDeliveries[0]?.id });
    assert.equal(deletedDelivery.success, true);
    assert.deepEqual(JSON.parse(readFileSync(deliveryPath, 'utf-8')), []);

    const deleted = handleTeamMessageDelete({
      actor_agent_id: owner.id,
      message_id: messageId,
    });
    assert.equal(deleted.success, true);

    const messages = JSON.parse(readFileSync(join(dataDir, 'team', teamId, sessionId, 'messages.json'), 'utf-8')) as Array<Record<string, unknown>>;
    const deliveries = JSON.parse(readFileSync(join(dataDir, 'team', teamId, sessionId, 'deliveries.json'), 'utf-8')) as Array<Record<string, unknown>>;
    assert.equal(messages.length, 0);
    assert.equal(deliveries.length, 0);
    assert.equal(existsSync(join(dataDir, 'team', teamId, 'messages.json')), false);
    assert.equal(existsSync(join(dataDir, 'team', teamId, 'deliveries.json')), false);
    assert.equal(existsSync(join(dataDir, 'team', teamId, 'comments.json')), false);
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
  let releaseTopic: (() => void) | undefined;
  const topicGate = new Promise<void>((resolve) => { releaseTopic = resolve; });
  let releaseEditor: (() => void) | undefined;
  const editorGate = new Promise<void>((resolve) => { releaseEditor = resolve; });
  let markEditorCompleted: (() => void) | undefined;
  const editorCompleted = new Promise<void>((resolve) => { markEditorCompleted = resolve; });
  setTeamRuntimeFactoryForTests((config) => {
    capturedConfigs.push((config ?? {}) as Record<string, unknown>);
    return {
      async execute(prompt, _workingDir, options) {
        capturedPrompts.push(prompt);
        capturedRuns.push((options ?? {}) as Record<string, unknown>);
        options?.onEvent?.({ type: 'tool_use', id: 'read-1', name: 'Read', line: 'Tool: Read path="AGENTS.md"' });
        if (prompt.includes('Your actor_agent_id: topic_agent')) {
          const sendTool = options?.functionTools?.find((tool) => tool.name === 'team_message_send');
          assert.ok(sendTool);
          const handoff = await sendTool.execute({
            action: 'send',
            actor_agent_id: 'topic_agent',
            team_id: 'wrong-team-is-overridden',
            mode: 'direct',
            recipient_agent_ids: ['editor_agent'],
            subject: 'continue',
            body: 'continue',
          }) as { success: boolean };
          assert.equal(handoff.success, true);
          await topicGate;
        }
        if (prompt.includes('Your actor_agent_id: editor_agent')) {
          await editorGate;
          markEditorCompleted?.();
        }
        return {
          success: true,
          summary: 'stub-summary',
          output: ['<think>hidden</think>stub-reply'],
          artifacts: [],
          usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
        };
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
      nodes: [
        {
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
        },
        {
          id: 'agent-run-editor',
          type: 'agent_run',
          label: 'Editor Agent',
          position: { x: 100, y: 0 },
          data: {
            agentConfigId: 'editor_agent',
            agent: { id: 'editor_agent', name: 'Editor Agent', workingDir: dataDir },
          },
        },
      ],
      edges: [],
    });

    const created = handleTeamManage({
      action: 'create',
      actor_agent_id: owner.id,
      name: 'Runtime Provider Team',
      initial_members: [{ agent_id: 'topic_agent' }, { agent_id: 'editor_agent' }],
    });
    assert.equal(created.success, true);
    const teamId = (created.data as { team: { team_id: string } }).team.team_id;
    const sessionId = '11111111-1111-4111-8111-111111111111';

    const sentPromise = postTeamRuntimeMessage({
      team_id: teamId,
      session_id: sessionId,
      actor_agent_id: 'admin',
      content: 'hello runtime',
      target_agent_id: 'topic_agent',
      context_length: 0,
    }, true);

    await new Promise((resolve) => setTimeout(resolve, 20));
    const running = getTeamRuntime({ team_id: teamId, session_id: sessionId, actor_agent_id: 'admin' });
    const runningMessages = (running.data as { messages: Array<{ senderAgentId: string; status: string; parts?: Array<{ type: string }> }> }).messages;
    assert.equal(runningMessages.some((message) => message.senderAgentId === 'topic_agent'), true);
    const runningDeliveries = JSON.parse(readFileSync(join(dataDir, 'team', teamId, sessionId, 'deliveries.json'), 'utf-8')) as Array<Record<string, unknown>>;
    const runningInbound = runningDeliveries.find((item) => item.recipientAgentId === 'topic_agent');
    assert.equal(runningInbound?.inboxStatus, 'read');
    assert.equal(typeof runningInbound?.readAt, 'string');
    assert.equal(capturedPrompts.some((prompt) => prompt.includes('Your actor_agent_id: editor_agent')), false);

    releaseTopic?.();
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(capturedConfigs.length, 2);
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
    assert.match(capturedPrompts[0] ?? '', /Current team members \(agent id, name, team role\):/);
    assert.match(capturedPrompts[0] ?? '', /Owner Agent/);
    assert.match(capturedPrompts[0] ?? '', /role=owner/);
    assert.match(capturedPrompts[0] ?? '', /topic_agent \(Topic Agent, role=member\)/);
    assert.match(capturedPrompts[0] ?? '', /team_message_send/);
    assert.match(capturedPrompts[0] ?? '', new RegExp(`Current team_id: ${teamId}`));
    assert.match(capturedPrompts[0] ?? '', new RegExp(`Your actor_agent_id: topic_agent`));
    const teamMessageSendTool = runtimeFunctionTools.find((tool) => tool.name === 'team_message_send');
    assert.ok(teamMessageSendTool);
    assert.equal(capturedPrompts.some((prompt) => prompt.includes('Your actor_agent_id: editor_agent')), true);
    releaseEditor?.();
    await editorCompleted;
    const sent = await sentPromise;
    assert.equal(sent.success, true);
    const returnedSessionId = (sent.data as { runtime: { session_id: string } }).runtime.session_id;
    assert.equal(returnedSessionId, sessionId);
    const usage = queryRecentUsage({ days: 30, page: 1, pageSize: 10 });
    assert.equal(usage.total, 2);
    const dryRun = await teamMessageSendTool.execute({
      action: 'send',
      actor_agent_id: 'wrong-agent',
      team_id: 'reviewer_agent',
      mode: 'broadcast',
      recipient_agent_ids: [owner.id],
      subject: 'done',
      body: 'done',
      dry_run: true,
    }) as { success: boolean };
    assert.equal(dryRun.success, true);
    const listWorkspaceFilesTool = runtimeFunctionTools.find((tool) => tool.name === 'ListWorkspaceFiles');
    assert.ok(listWorkspaceFilesTool);
    const listed = await listWorkspaceFilesTool.execute({ path: '', depth: 1 }) as { files: Array<{ name: string }> };
    assert.ok(Array.isArray(listed.files));
    const messages = JSON.parse(readFileSync(join(dataDir, 'team', teamId, sessionId, 'messages.json'), 'utf-8')) as Array<Record<string, unknown>>;
    const deliveries = JSON.parse(readFileSync(join(dataDir, 'team', teamId, sessionId, 'deliveries.json'), 'utf-8')) as Array<Record<string, unknown>>;
    const inbound = deliveries.find((item) => item.recipientAgentId === 'topic_agent');
    assert.ok(inbound, JSON.stringify(deliveries));
    assert.equal(inbound?.senderAgentId, 'admin');
    assert.equal(inbound?.executionStatus, 'done');
    assert.ok(deliveries.some((item) => item.senderAgentId === 'topic_agent' && item.recipientAgentId === 'editor_agent'));
    assert.equal(deliveries.some((item) => item.senderAgentId === 'editor_agent'), false);
    assert.equal(deliveries.some((item) => item.subject === 'Thinking'), false);
    assert.deepEqual(
      deliveries.filter((item) => item.executionStatus !== 'done').map((item) => `${item.senderAgentId}->${item.recipientAgentId}:${item.executionStatus}`),
      [],
    );
    assert.equal(messages.length, 3);
    assert.equal(messages[0]?.senderAgentId, 'admin');
    assert.equal(messages[1]?.senderAgentId, 'topic_agent');
    assert.equal(messages[1]?.body, 'continue');
    const handoffParts = (messages[1]?.metadata as { parts?: Array<{ type: string }> } | undefined)?.parts ?? [];
    assert.ok(handoffParts.some((part) => part.type === 'context'));
    assert.equal(messages[2]?.senderAgentId, 'editor_agent');
    assert.equal(messages[2]?.body, 'stub-reply');
    const replyParts = (messages[2]?.metadata as { parts?: Array<{ type: string }> } | undefined)?.parts ?? [];
    assert.ok(replyParts.some((part) => part.type === 'chain'));
    const contextPart = replyParts.find((part) => part.type === 'context') as { agentContext?: { name?: string; userPrompt?: string } } | undefined;
    assert.equal(contextPart?.agentContext?.name, 'Editor Agent');
    assert.equal(contextPart?.agentContext?.userPrompt, 'continue');
    assert.ok(replyParts.some((part) => part.type === 'text'));
    const logFiles = readdirSync(join(dataDir, 'team', teamId, sessionId, 'logs'));
    assert.deepEqual(logFiles, ['team.log']);
    const logs = readFileSync(join(dataDir, 'team', teamId, sessionId, 'logs', 'team.log'), 'utf-8');
    assert.deepEqual([...logs.matchAll(/^===== RUN (\S+) /gm)].map((match) => match[1]), [sessionId, sessionId]);
    assert.match(logs, /\[INPUT\]/);
    assert.match(logs, /Your actor_agent_id: topic_agent/);
    assert.match(logs, /\[TOOL CALL\]/);
    assert.match(logs, /name: Read/);
    assert.match(logs, /\[OUTPUT\]/);
    assert.match(logs, /stub-reply/);
    const loaded = getTeamRuntime({ team_id: teamId, session_id: sessionId, actor_agent_id: 'admin' });
    assert.equal(loaded.success, true);
    assert.deepEqual(
      (loaded.data as { messages: Array<{ senderAgentId: string; recipientAgentId: string }> }).messages
        .map((item) => [item.senderAgentId, item.recipientAgentId]),
      [
        ['admin', 'topic_agent'],
        ['topic_agent', 'editor_agent'],
        ['editor_agent', 'admin'],
      ],
    );
    const nextSent = await postTeamRuntimeMessage({
      team_id: teamId,
      session_id: sessionId,
      actor_agent_id: 'admin',
      content: 'next run',
      target_agent_id: 'editor_agent',
      context_length: 0,
    }, true);
    assert.equal((nextSent.data as { runtime: { session_id: string } }).runtime.session_id, sessionId);
    const nextLogs = readFileSync(join(dataDir, 'team', teamId, sessionId, 'logs', 'team.log'), 'utf-8');
    assert.deepEqual([...nextLogs.matchAll(/^===== RUN (\S+) /gm)].map((match) => match[1]), [sessionId, sessionId, sessionId]);
  } finally {
    setTeamRuntimeFactoryForTests();
    closeAgentDb();
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('owner runtime gets a completion tool and can finish the current team task', async () => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-team-owner-complete-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;
  let releaseRun: (() => void) | undefined;
  let markStarted: (() => void) | undefined;
  const runGate = new Promise<void>((resolve) => { releaseRun = resolve; });
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  let prompt = '';
  let functionTools: Array<{ name: string; execute: (input: unknown) => Promise<unknown> }> = [];
  setTeamRuntimeFactoryForTests(() => ({
    async execute(nextPrompt, _workingDir, options) {
      prompt = nextPrompt;
      functionTools = options?.functionTools ?? [];
      markStarted?.();
      await runGate;
      return { success: true, summary: 'done', output: ['done'], artifacts: [] };
    },
    stop() {},
  }));

  try {
    const owner = createPreset('', { name: 'Owner Agent', tools: ['team_message_send'] });
    assert.ok(owner);
    const created = handleTeamManage({ action: 'create', actor_agent_id: owner.id, name: 'Owner Completion Team' });
    assert.equal(created.success, true);
    const teamId = (created.data as { team: { team_id: string } }).team.team_id;
    const sessionId = '22222222-2222-4222-8222-222222222222';
    const sentPromise = postTeamRuntimeMessage({
      team_id: teamId,
      session_id: sessionId,
      actor_agent_id: 'admin',
      target_agent_id: owner.id,
      content: 'finish this task',
    }, true);
    await started;

    assert.match(prompt, /team_task_complete/);
    const completionTool = functionTools.find((tool) => tool.name === 'team_task_complete');
    assert.ok(completionTool);
    const completed = await completionTool.execute({ action: 'complete', output: 'final team result' });
    assert.deepEqual(completed, { success: true, output: 'final team result' });
    const loaded = getTeamRuntime({ team_id: teamId, session_id: sessionId, actor_agent_id: 'admin' });
    assert.partialDeepStrictEqual(
      (loaded.data as { runtime: { status: string; output?: string } }).runtime,
      { status: 'completed', output: 'final team result' },
    );

    releaseRun?.();
    await sentPromise;
    const finished = getTeamRuntime({ team_id: teamId, session_id: sessionId, actor_agent_id: 'admin' });
    assert.equal((finished.data as { runtime: { output?: string } }).runtime.output, 'final team result');
  } finally {
    releaseRun?.();
    setTeamRuntimeFactoryForTests();
    closeAgentDb();
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('owner runtime stays running when the completion tool is not called', async () => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-team-owner-running-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;
  setTeamRuntimeFactoryForTests(() => ({
    async execute() {
      return { success: true, summary: 'done', output: ['ordinary reply'], artifacts: [] };
    },
    stop() {},
  }));

  try {
    const owner = createPreset('', { name: 'Owner Agent' });
    assert.ok(owner);
    const created = handleTeamManage({ action: 'create', actor_agent_id: owner.id, name: 'Owner Running Team' });
    assert.equal(created.success, true);
    const teamId = (created.data as { team: { team_id: string } }).team.team_id;
    const sessionId = '33333333-3333-4333-8333-333333333333';

    await postTeamRuntimeMessage({
      team_id: teamId,
      session_id: sessionId,
      actor_agent_id: 'admin',
      target_agent_id: owner.id,
      content: 'work on this task',
    }, true);

    const loaded = getTeamRuntime({ team_id: teamId, session_id: sessionId, actor_agent_id: 'admin' });
    assert.equal((loaded.data as { runtime: { status: string } }).runtime.status, 'running');
  } finally {
    setTeamRuntimeFactoryForTests();
    closeAgentDb();
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('team runtime sessions store and load messages independently', () => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-team-session-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const owner = createPreset('', { name: 'Owner Agent' });
    assert.ok(owner);
    const created = handleTeamManage({ action: 'create', actor_agent_id: owner.id, name: 'Session Team' });
    const teamId = (created.data as { team: { team_id: string } }).team.team_id;
    const firstSessionId = '33333333-3333-4333-8333-333333333333';
    const secondSessionId = '44444444-4444-4444-8444-444444444444';

    const first = getTeamRuntime({ team_id: teamId, session_id: firstSessionId, actor_agent_id: 'admin' });
    const second = getTeamRuntime({ team_id: teamId, session_id: secondSessionId, actor_agent_id: 'admin' });
    const listed = listTeamSessions({ team_id: teamId });

    assert.equal((first.data as { runtime: { session_id: string } }).runtime.session_id, firstSessionId);
    assert.equal((second.data as { runtime: { session_id: string } }).runtime.session_id, secondSessionId);
    assert.deepEqual(
      (listed.data as { sessions: Array<{ session_id: string }> }).sessions.map((session) => session.session_id).sort(),
      [firstSessionId, secondSessionId].sort(),
    );
    assert.deepEqual(readdirSync(join(dataDir, 'team', teamId)).sort(), [
      firstSessionId,
      secondSessionId,
      'info.json',
      'memberships.json',
    ].sort());
  } finally {
    closeAgentDb();
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
