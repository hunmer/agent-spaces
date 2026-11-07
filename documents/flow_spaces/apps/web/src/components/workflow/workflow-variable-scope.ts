import type { WorkflowEdge, WorkflowNode } from '@agent-spaces/shared';

function getNodeSourceId(node: WorkflowNode): string | null {
  return typeof node.data?.sourceNodeId === 'string' && node.data.sourceNodeId
    ? node.data.sourceNodeId
    : null;
}

export function getUpstreamNodeIds(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  nodeId: string,
): Set<string> {
  const incomingByTarget = new Map<string, string[]>();

  const addIncoming = (target: string, source: string) => {
    const sources = incomingByTarget.get(target) ?? [];
    sources.push(source);
    incomingByTarget.set(target, sources);
  };

  for (const edge of edges) {
    addIncoming(edge.target, edge.source);
  }

  for (const node of nodes) {
    const sourceNodeId = getNodeSourceId(node);
    if (sourceNodeId) addIncoming(node.id, sourceNodeId);
  }

  const upstream = new Set<string>();
  const pending = [...(incomingByTarget.get(nodeId) ?? [])];

  while (pending.length > 0) {
    const sourceId = pending.pop();
    if (!sourceId || upstream.has(sourceId)) continue;

    upstream.add(sourceId);
    pending.push(...(incomingByTarget.get(sourceId) ?? []));
  }

  return upstream;
}
