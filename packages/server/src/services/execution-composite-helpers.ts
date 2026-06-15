import type { WorkflowNode, WorkflowEdge } from '@agent-spaces/shared';

export function shouldInterrupt(session: { stopRequested: boolean; status: string }): boolean {
  return session.stopRequested || session.status === 'error';
}

export function getNodesForExecutionScope(nodes: WorkflowNode[], scopeId: string | null): WorkflowNode[] {
  if (scopeId === null) {
    return nodes.filter(n => !n.composite?.parentId);
  }
  return nodes.filter(n => n.composite?.parentId === scopeId);
}

export function findCompositeChildByRole(nodes: WorkflowNode[], parentId: string, role: string): WorkflowNode | undefined {
  return nodes.find(n => n.composite?.parentId === parentId && n.composite?.role === role);
}

export function getCompositeParentId(node: WorkflowNode): string | undefined {
  return node.composite?.parentId ?? undefined;
}

export function isGeneratedWorkflowNode(node: WorkflowNode): boolean {
  return !!node.data?._generated;
}

export function normalizeEmbeddedWorkflow(data: any, _genId: () => string): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  if (data.nodes && data.edges) return data;
  return { nodes: [], edges: [] };
}

export function normalizeLoopResult(result: unknown): Record<string, any> {
  if (result && typeof result === 'object' && !Array.isArray(result)) return result as Record<string, any>;
  return { result };
}
