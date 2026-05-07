/**
 * Agent hooks retained for legacy callers.
 */

import type { TaskResult } from '@agent-spaces/shared';
import type { AgentContext } from '../agents/agent-context.js';

/**
 * Workflow task execution completes tasks directly. Review steps should be
 * modeled as workflow nodes instead of this hardcoded hook.
 */
export async function onExecutorComplete(
  workspaceId: string,
  taskId: string,
  issueId: string,
  result: TaskResult,
  _ctx: AgentContext,
): Promise<void> {
  console.log(
    `[hook:onExecutorComplete] entered workspaceId=${workspaceId} taskId=${taskId} issueId=${issueId} success=${result.success} summary=${JSON.stringify(result.summary)}`,
  );

  if (!result.success) {
    console.warn(`[hook:onExecutorComplete] task ${taskId} failed: ${result.error}`);
    return;
  }

  console.log(`[hook:onExecutorComplete] reviewer hook skipped; workflow controls task order taskId=${taskId} issueId=${issueId}`);
}
