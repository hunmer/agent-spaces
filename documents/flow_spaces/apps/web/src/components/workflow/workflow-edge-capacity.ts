import type { WorkflowEdge } from '@agent-spaces/shared';

export const REFERENCE_RUNTIME_EDGE_ID_SUFFIX = '--reference-runtime';

export function isGeneratedRuntimeReferenceEdge(edge: WorkflowEdge): boolean {
  return edge.id.endsWith(REFERENCE_RUNTIME_EDGE_ID_SUFFIX)
    && edge.composite?.generated === true
    && !edge.composite.hidden
    && !edge.composite.locked
    && !edge.sourceHandle
    && !edge.targetHandle;
}

export function countsTowardTargetConnectionLimit(edge: WorkflowEdge): boolean {
  return !isGeneratedRuntimeReferenceEdge(edge);
}
