/**
 * Agent hooks retained for legacy callers.
 */

import type { AgentContext } from '../agents/agent-context.js';

type LegacyExecutorResult = {
  success: boolean;
  summary?: unknown;
  error?: string;
};

/**
 * Workflow node execution completes directly. Review steps should be
 * modeled as workflow nodes instead of this hardcoded hook.
 */
export async function onExecutorComplete(
  workspaceId: string,
  nodeExecutionId: string,
  issueId: string,
  result: LegacyExecutorResult,
  _ctx: AgentContext,
): Promise<void> {
  console.log(
    `[hook:onExecutorComplete] entered workspaceId=${workspaceId} nodeExecutionId=${nodeExecutionId} issueId=${issueId} success=${result.success} summary=${JSON.stringify(result.summary)}`,
  );

  if (!result.success) {
    console.warn(`[hook:onExecutorComplete] workflow node ${nodeExecutionId} failed: ${result.error}`);
    return;
  }

  console.log(`[hook:onExecutorComplete] reviewer hook skipped; workflow controls node order nodeExecutionId=${nodeExecutionId} issueId=${issueId}`);
}
