/**
 * Scheduler Agent — periodically checks for unfinished issues and wakes the Planner.
 */

import type { AgentContext } from './agent-context.js';
import * as issueService from '../services/issue.js';
import * as workspaceService from '../services/workspace.js';
import { hasActiveIssueAutomation, runIssueAutomation } from './issue-agent-runner.js';
import { retryErrorIssues } from '../services/issue-retry.js';

const CHECK_INTERVAL = 10 * 60 *1000; // 10m
const timers = new Map<string, NodeJS.Timeout>();

export function startScheduler(workspaceId: string, ctx: AgentContext): void {
  if (timers.has(workspaceId)) {
    console.log(`[scheduler:${workspaceId}] already running, skip`);
    return;
  }

  console.log(`[scheduler:${workspaceId}] started (interval=${CHECK_INTERVAL}ms)`);

  const tick = async () => {
    // 检查 workspace 是否关闭了自动处理
    const workspace = workspaceService.getById(workspaceId);
    if (workspace && workspace.autoProcessIssues === false) {
      console.log(`[scheduler:${workspaceId}] auto-processing disabled for this workspace, skip`);
      return;
    }

    await retryErrorIssues(workspaceId, ctx);

    const allIssues = issueService.list(workspaceId);
    const unfinished = allIssues.filter(
      (i) => i.status === 'draft' || i.status === 'changes_requested',
    );

    if (unfinished.length === 0) {
      console.log(`[scheduler:${workspaceId}] tick: no unfinished issues (total=${allIssues.length})`);
      return;
    }

    console.log(`[scheduler:${workspaceId}] tick: ${unfinished.length} unfinished issue(s):`,
      unfinished.map((i) => ({ id: i.id, title: i.title, status: i.status })));

    if (hasActiveIssueAutomation(workspaceId)) {
      console.log(`[scheduler:${workspaceId}] issue automation already active, waiting`);
      return;
    }

    const nextIssue = unfinished[0];
    console.log(`[scheduler:${workspaceId}] running automation for issue "${nextIssue.title}" (${nextIssue.id})`);
    runIssueAutomation(workspaceId, nextIssue.id, ctx).catch((err) => {
      console.error(`[scheduler:${workspaceId}] issue automation error for issue ${nextIssue.id}:`, err);
    });
  };

  timers.set(workspaceId, setInterval(tick, CHECK_INTERVAL));
  tick();
}

export function stopScheduler(workspaceId: string): void {
  const timer = timers.get(workspaceId);
  if (timer) {
    clearInterval(timer);
    timers.delete(workspaceId);
    console.log(`[scheduler:${workspaceId}] stopped`);
  }
}
