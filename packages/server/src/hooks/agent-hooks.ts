/**
 * Agent Hooks — chain executor completion → reviewer → result processing.
 */

import type { TaskResult } from '@agent-spaces/shared';
import type { AgentContext } from '../agents/agent-context.js';
import { runReviewer } from '../agents/reviewer-agent.js';

/**
 * Hook: executor complete → trigger reviewer.
 * This is the core hook in the agent orchestration pipeline.
 */
export async function onExecutorComplete(
  workspaceId: string,
  taskId: string,
  issueId: string,
  result: TaskResult,
  ctx: AgentContext,
): Promise<void> {
  if (!result.success) {
    // Task failed — mark issue as error if all tasks failed
    console.warn(`[hook] task ${taskId} failed: ${result.error}`);
    return;
  }

  // Trigger reviewer
  await runReviewer(workspaceId, taskId, issueId, result, ctx);
}
