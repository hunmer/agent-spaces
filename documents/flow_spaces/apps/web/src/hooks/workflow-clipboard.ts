import type { WorkflowNode } from '@agent-spaces/shared';

const NODE_REFERENCE_PATTERN = /\{\{\s*(__data__|__inputs__)\[(["'])([^"']+)\2\]\.([^}]+?)\s*\}\}/g;

export function remapPastedNodeData(
  data: WorkflowNode['data'],
  nodeIdMap: Map<string, string>,
): WorkflowNode['data'] {
  const visit = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return value.replace(NODE_REFERENCE_PATTERN, (raw, scope: string, quote: string, nodeId: string) => {
        const nextNodeId = nodeIdMap.get(nodeId);
        if (!nextNodeId) return '';
        return raw.replace(
          `${scope}[${quote}${nodeId}${quote}]`,
          `${scope}[${quote}${nextNodeId}${quote}]`,
        );
      });
    }
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child)]));
    }
    return value;
  };

  return visit(data) as WorkflowNode['data'];
}
