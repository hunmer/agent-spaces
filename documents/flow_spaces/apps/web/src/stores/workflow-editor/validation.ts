import type { Workflow } from '@agent-spaces/shared';

export function validateWorkflowExecution(wf: Workflow): string | null {
  const nodeIds = new Set(wf.nodes.map(n => n.id));
  const hasConnectedNodes = wf.edges.some(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  if (!hasConnectedNodes) return '请先连接节点';

  for (const edge of wf.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
  }
  return null;
}
