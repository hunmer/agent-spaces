export function createWorkflowEdgeId({
  source,
  target,
  sourceHandle,
  targetHandle,
}: {
  source: string | null;
  target: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}): string {
  const sourcePart = sourceHandle || 'source';
  const targetPart = targetHandle || 'target';
  return `e-${source}-${sourcePart}-${target}-${targetPart}`;
}
