import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPreset } from '../src/services/agent.js';
import { handleTeamManage } from '../src/services/team.js';
import { getTeamRuntime, handleTeamTaskManage, postTeamRuntimeMessage, setTeamRuntimeFactoryForTests } from '../src/services/team-runtime.js';
import { closeDb } from '../src/storage/agent-store.js';

test('idle member run wakes owner to inspect incomplete tasks', async () => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-team-tasks-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;
  let ownerRuns = 0;
  let resolveOwnerCheck: (() => void) | undefined;
  const ownerChecked = new Promise<void>((resolve) => { resolveOwnerCheck = resolve; });

  try {
    const owner = createPreset('', { name: 'Owner' });
    const member = createPreset('', { name: 'Member' });
    assert.ok(owner && member);
    const created = handleTeamManage({
      action: 'create',
      actor_agent_id: owner.id,
      name: 'Task Team',
      initial_members: [{ agent_id: member.id }],
    });
    const teamId = (created.data as { team: { team_id: string } }).team.team_id;
    const sessionId = '55555555-5555-4555-8555-555555555555';

    setTeamRuntimeFactoryForTests(() => ({
      async execute(prompt, _workingDir, options) {
        if (prompt.includes(`Your actor_agent_id: ${owner.id}`)) {
          ownerRuns++;
          if (prompt.includes('Team members are idle')) {
            const taskTool = options?.functionTools?.find((tool) => tool.name === 'team_task_manage');
            const listed = await taskTool?.execute({ action: 'list' }) as { data: { tasks: Array<{ status: string }> } };
            assert.equal(listed.data.tasks[0]?.status, 'running');
            resolveOwnerCheck?.();
          } else {
            const teamTool = options?.functionTools?.find((tool) => tool.name === 'team_manage');
            const taskTool = options?.functionTools?.find((tool) => tool.name === 'team_task_manage');
            const sendTool = options?.functionTools?.find((tool) => tool.name === 'team_message_send');
            const team = await teamTool?.execute({ action: 'get', include_members_preview: true }) as { data: { members_preview: Array<{ agent_id: string }> } };
            assert.equal(team.data.members_preview.length, 2);
            const blocked = await sendTool?.execute({ action: 'send', mode: 'direct', recipient_agent_ids: [member.id], subject: 'work', body: 'do work' }) as { code: string };
            assert.equal(blocked.code, 'TASK_LIST_REQUIRED');
            await taskTool?.execute({ action: 'create', tasks: [{ title: 'Member work', assignee_agent_id: member.id }] });
            await sendTool?.execute({ action: 'send', mode: 'direct', recipient_agent_ids: [member.id], subject: 'work', body: 'do work' });
          }
        }
        return { success: true, summary: 'done', output: ['done'], artifacts: [] };
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
    assert.equal(ownerRuns, 2);
    const runtime = getTeamRuntime({ team_id: teamId, session_id: sessionId, actor_agent_id: 'admin' });
    assert.equal((runtime.data as { tasks: Array<{ title: string }> }).tasks[0]?.title, 'Member work');
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
