import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPreset } from '../src/services/agent.js';
import { handleTeamManage } from '../src/services/team.js';
import { getTeamRuntime, handleTeamAgentSessionList, handleTeamTaskManage, postTeamRuntimeMessage, setTeamRuntimeFactoryForTests } from '../src/services/team-runtime.js';
import { closeDb } from '../src/storage/agent-store.js';

test('idle member run wakes owner to inspect incomplete tasks', async () => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-team-tasks-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;
  let ownerRuns = 0;
  let resolveOwnerCheck: (() => void) | undefined;
  const ownerChecked = new Promise<void>((resolve) => { resolveOwnerCheck = resolve; });
  let resolveMemberStarted: (() => void) | undefined;
  const memberStarted = new Promise<void>((resolve) => { resolveMemberStarted = resolve; });

  try {
    const owner = createPreset('', { name: 'Owner' });
    const member = createPreset('', { name: 'Member' });
    const reviewer = createPreset('', { name: 'Reviewer' });
    assert.ok(owner && member && reviewer);
    const created = handleTeamManage({
      action: 'create',
      actor_agent_id: owner.id,
      name: 'Task Team',
      initial_members: [{ agent_id: member.id }, { agent_id: reviewer.id }],
    });
    const teamId = (created.data as { team: { team_id: string } }).team.team_id;
    const sessionId = '55555555-5555-4555-8555-555555555555';

    setTeamRuntimeFactoryForTests(() => ({
      async execute(prompt, _workingDir, options) {
        if (prompt.includes(`Your actor_agent_id: ${owner.id}`)) {
          ownerRuns++;
          assert.equal(options?.tools?.includes('AskUserQuestion'), false);
          assert.equal(options?.pauseAfterTools, undefined);
          assert.ok(options?.functionTools?.some((tool) => tool.name === 'team_task_wait'));
          if (ownerRuns === 1) {
            const teamTool = options?.functionTools?.find((tool) => tool.name === 'team_manage');
            const taskTool = options?.functionTools?.find((tool) => tool.name === 'team_task_manage');
            const sendTool = options?.functionTools?.find((tool) => tool.name === 'team_message_send');
            const waitTool = options?.functionTools?.find((tool) => tool.name === 'team_task_wait');
            const team = await teamTool?.execute({ action: 'get', include_members_preview: true }) as { data: { members_preview: Array<{ agent_id: string }> } };
            assert.equal(team.data.members_preview.length, 3);
            const blocked = await sendTool?.execute({ action: 'send', mode: 'direct', recipient_agent_ids: [member.id], subject: 'work', body: 'do work' }) as { code: string };
            assert.equal(blocked.code, 'TASK_LIST_REQUIRED');
            await taskTool?.execute({ action: 'create', tasks: [
              { title: 'Member work', assignee_agent_id: member.id },
              { title: 'Review work', assignee_agent_id: reviewer.id },
            ] });
            await sendTool?.execute({ action: 'send', mode: 'direct', recipient_agent_ids: [member.id], subject: 'work', body: 'do work' });
            await waitTool?.execute({ wait_seconds: 1 });
            await memberStarted;
            const listed = await taskTool?.execute({ action: 'list' }) as { data: { tasks: Array<{ status: string }> } };
            assert.equal(listed.data.tasks.some((task) => task.status === 'pending'), true);
            resolveOwnerCheck?.();
          }
        } else if (prompt.includes(`Your actor_agent_id: ${member.id}`)) {
          resolveMemberStarted?.();
          const taskTool = options?.functionTools?.find((tool) => tool.name === 'team_task_manage');
          const listed = await taskTool?.execute({ action: 'list' }) as { data: { tasks: Array<{ id: string; assigneeAgentId: string }> } };
          const task = listed.data.tasks.find((item) => item.assigneeAgentId === member.id)!;
          await taskTool?.execute({ action: 'complete', task_id: task.id });
        }
        return {
          success: true,
          summary: 'done',
          output: ['done'],
          artifacts: [],
          sessionId: prompt.includes(`Your actor_agent_id: ${owner.id}`) ? 'owner-runtime-session' : undefined,
        };
      },
      stop() {},
    }));

    await postTeamRuntimeMessage({
      team_id: teamId,
      session_id: sessionId,
      actor_agent_id: 'admin',
      target_agent_id: owner.id,
      content: 'start',
    }, true);
    await ownerChecked;
    assert.equal(ownerRuns, 1);
    const ownerSessions = handleTeamAgentSessionList({
      team_id: teamId,
      session_id: sessionId,
      actor_agent_id: owner.id,
      agent_id: owner.id,
    });
    assert.equal((ownerSessions.data as { sessions: unknown[] }).sessions.length, 1);
    const runtime = getTeamRuntime({ team_id: teamId, session_id: sessionId, actor_agent_id: 'admin' });
    assert.equal((runtime.data as { tasks: Array<{ title: string }> }).tasks[0]?.title, 'Member work');
    const memberSessions = handleTeamAgentSessionList({
      team_id: teamId,
      session_id: sessionId,
      actor_agent_id: owner.id,
      agent_id: member.id,
    });
    const sessions = (memberSessions.data as { sessions: Array<{ agent_id: string; session_id: string }> }).sessions;
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.agent_id, member.id);
    assert.match(sessions[0]?.session_id ?? '', /^[0-9a-f-]{36}$/);
  } finally {
    setTeamRuntimeFactoryForTests();
    closeDb();
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('successful member handoff completes its running task', async () => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-team-member-handoff-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const owner = createPreset('', { name: 'Owner' });
    const member = createPreset('', { name: 'Member' });
    const reviewer = createPreset('', { name: 'Reviewer' });
    assert.ok(owner && member && reviewer);
    const created = handleTeamManage({
      action: 'create', actor_agent_id: owner.id, name: 'Handoff Team',
      initial_members: [{ agent_id: member.id }, { agent_id: reviewer.id }],
    });
    const teamId = (created.data as { team: { team_id: string } }).team.team_id;
    const sessionId = '88888888-8888-4888-8888-888888888888';
    let resolveReviewerDone: (() => void) | undefined;
    const reviewerDone = new Promise<void>((resolve) => { resolveReviewerDone = resolve; });

    setTeamRuntimeFactoryForTests(() => ({
      async execute(prompt, _workingDir, options) {
        const taskTool = options?.functionTools?.find((tool) => tool.name === 'team_task_manage');
        const sendTool = options?.functionTools?.find((tool) => tool.name === 'team_message_send');
        assert.equal(options?.pauseAfterTools, undefined);
        if (prompt.includes(`Your actor_agent_id: ${owner.id}`)) {
          const waitTool = options?.functionTools?.find((tool) => tool.name === 'team_task_wait');
          await taskTool?.execute({ action: 'create', tasks: [
            { title: 'Write', assignee_agent_id: member.id },
            { title: 'Review', assignee_agent_id: reviewer.id },
          ] });
          await sendTool?.execute({ action: 'send', mode: 'direct', recipient_agent_ids: [member.id], subject: 'write', body: 'write' });
          await waitTool?.execute({ wait_seconds: 1 });
        } else if (prompt.includes(`Your actor_agent_id: ${member.id}`)) {
          await sendTool?.execute({ action: 'send', mode: 'direct', recipient_agent_ids: [reviewer.id], subject: 'review', body: 'review' });
        } else {
          const listed = await taskTool?.execute({ action: 'list' }) as { data: { tasks: Array<{ id: string; assigneeAgentId: string }> } };
          const task = listed.data.tasks.find((item) => item.assigneeAgentId === reviewer.id)!;
          await taskTool?.execute({ action: 'complete', task_id: task.id });
          await sendTool?.execute({ action: 'send', mode: 'direct', recipient_agent_ids: [owner.id], subject: 'approved', body: 'approved' });
          resolveReviewerDone?.();
        }
        return { success: true, summary: 'done', output: [], artifacts: [], sessionId: `runtime-${prompt.includes(member.id) ? 'member' : 'agent'}` };
      },
      stop() {},
    }));

    await postTeamRuntimeMessage({ team_id: teamId, session_id: sessionId, actor_agent_id: 'admin', target_agent_id: owner.id, content: 'start' }, true);
    await reviewerDone;
    const runtime = getTeamRuntime({ team_id: teamId, session_id: sessionId, actor_agent_id: 'admin' });
    assert.deepEqual((runtime.data as { tasks: Array<{ status: string }> }).tasks.map((task) => task.status), ['completed', 'completed']);
    assert.notEqual((runtime.data as { runtime: { status: string } }).runtime.status, 'error');
    assert.equal((runtime.data as { runtime: { leader_agent_id: string } }).runtime.leader_agent_id, owner.id);
  } finally {
    setTeamRuntimeFactoryForTests();
    closeDb();
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('owner tasks are ignored and incomplete member runs fail the team runtime', async () => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-team-task-failure-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const owner = createPreset('', { name: 'Owner' });
    const member = createPreset('', { name: 'Member' });
    assert.ok(owner && member);
    const created = handleTeamManage({ action: 'create', actor_agent_id: owner.id, name: 'Failure Team', initial_members: [{ agent_id: member.id }] });
    const teamId = (created.data as { team: { team_id: string } }).team.team_id;
    const sessionId = '77777777-7777-4777-8777-777777777777';

    setTeamRuntimeFactoryForTests(() => ({
      async execute(prompt, _workingDir, options) {
        if (prompt.includes(`Your actor_agent_id: ${owner.id}`)) {
          const taskTool = options?.functionTools?.find((tool) => tool.name === 'team_task_manage');
          const sendTool = options?.functionTools?.find((tool) => tool.name === 'team_message_send');
          const result = await taskTool?.execute({ action: 'create', tasks: [
            { title: 'Owner work', assignee_agent_id: owner.id },
            { title: 'Member work', assignee_agent_id: member.id },
          ] }) as { data: { tasks: Array<{ assigneeAgentId: string }> } };
          assert.deepEqual(result.data.tasks.map((task) => task.assigneeAgentId), [member.id]);
          await sendTool?.execute({ action: 'send', mode: 'direct', recipient_agent_ids: [member.id], subject: 'work', body: 'do work' });
        }
        return { success: true, summary: 'done', output: ['done'], artifacts: [] };
      },
      stop() {},
    }));

    await postTeamRuntimeMessage({ team_id: teamId, session_id: sessionId, actor_agent_id: 'admin', target_agent_id: owner.id, content: 'start' }, true);
    const runtime = getTeamRuntime({ team_id: teamId, session_id: sessionId, actor_agent_id: 'admin' });
    assert.equal((runtime.data as { runtime: { status: string } }).runtime.status, 'error');
    assert.equal((runtime.data as { tasks: Array<{ status: string }> }).tasks[0]?.status, 'failed');
  } finally {
    setTeamRuntimeFactoryForTests();
    closeDb();
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('member completes only its own task and records its agent session ID', () => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-team-task-complete-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const owner = createPreset('', { name: 'Owner' });
    const member = createPreset('', { name: 'Member' });
    assert.ok(owner && member);
    const created = handleTeamManage({ action: 'create', actor_agent_id: owner.id, name: 'Task Team', initial_members: [{ agent_id: member.id }] });
    const teamId = (created.data as { team: { team_id: string } }).team.team_id;
    const sessionId = '66666666-6666-4666-8666-666666666666';
    const createdTasks = handleTeamTaskManage({
      action: 'create', team_id: teamId, session_id: sessionId, actor_agent_id: owner.id,
      tasks: [{ title: 'Member work', assignee_agent_id: member.id }],
    });
    const taskId = (createdTasks.data as { tasks: Array<{ id: string }> }).tasks[0]!.id;

    const completed = handleTeamTaskManage({
      action: 'complete', team_id: teamId, session_id: sessionId, actor_agent_id: member.id,
      task_id: taskId, agent_session_id: 'agent-session-1',
    });
    assert.partialDeepStrictEqual((completed.data as { task: object }).task, {
      id: taskId, status: 'completed', agentSessionId: 'agent-session-1',
    });
  } finally {
    closeDb();
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});
