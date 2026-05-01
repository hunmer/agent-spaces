/**
 * Scheduler Agent — periodically checks for unfinished issues and wakes the Planner.
 */

import type { AgentContext } from './agent-context.js';
import * as agentService from '../services/agent.js';
import * as issueService from '../services/issue.js';
import { runPlanner } from './planner-agent.js';

const CHECK_INTERVAL = 10_000; // 10s
const timers = new Map<string, NodeJS.Timeout>();

export function startScheduler(workspaceId: string, ctx: AgentContext): void {
  if (timers.has(workspaceId)) return;

  const tick = async () => {
    const unfinished = issueService.list(workspaceId).filter(
      (i) => i.status === 'draft' || i.status === 'changes_requested',
    );

    if (unfinished.length === 0) return;

    const activePlanner = agentService.findActiveByRole(workspaceId, 'planner');
    if (activePlanner) return;

    const nextIssue = unfinished[0];
    runPlanner(workspaceId, nextIssue.id, ctx).catch((err) => {
      console.error(`[scheduler] planner error for issue ${nextIssue.id}:`, err);
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
  }
}
