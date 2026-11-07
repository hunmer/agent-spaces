'use client';

import type { Workflow, WorkflowEdge, WorkflowNode } from '@agent-spaces/shared';
import { createWorkflowEdgeId } from '@/lib/workflow-edge-id';
import { getNodeDefinition } from '@/lib/workflow-nodes';
import { getWorkflowFieldHandleId, parseWorkflowFieldHandleId } from './workflow-field-handles';
import { parseVariableExpression } from './workflow-variable-path';
import {
  isGeneratedRuntimeReferenceEdge,
  REFERENCE_RUNTIME_EDGE_ID_SUFFIX,
} from './workflow-edge-capacity';

type ReferenceEdge = {
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
};

type WorkflowWithDisplayMode = Pick<Workflow, 'nodes' | 'edges'> & {
  layoutSnapshot?: {
    nodeDisplayMode?: unknown;
  };
};

function getReferenceEdgeKey(edge: Pick<WorkflowEdge, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>): string {
  return [
    edge.source,
    edge.sourceHandle || '',
    edge.target,
    edge.targetHandle || '',
  ].join('\u0000');
}

function extractNodeScopedReferences(value: unknown): Array<{ nodeId: string; scope: 'data' | 'inputs'; fieldPath: string }> {
  if (typeof value !== 'string') return [];

  const references: Array<{ nodeId: string; scope: 'data' | 'inputs'; fieldPath: string }> = [];
  for (const match of value.matchAll(/\{\{\s*(.*?)\s*\}\}/g)) {
    const parsed = parseVariableExpression(`{{ ${match[1]?.trim() || ''} }}`);
    if (!parsed || parsed.scope === 'env' || !parsed.nodeId) continue;
    references.push({
      nodeId: parsed.nodeId,
      scope: parsed.scope,
      fieldPath: parsed.fieldPath,
    });
  }
  return references;
}

function collectReferencesFromValue(
  value: unknown,
  targetNodeId: string,
  targetHandle: string,
  seen = new Set<unknown>(),
  path = '',
): ReferenceEdge[] {
  const parsedTargetHandle = parseWorkflowFieldHandleId(targetHandle);
  const getNestedTargetHandle = (nestedPath: string) => {
    if (!nestedPath || parsedTargetHandle?.kind !== 'property') return targetHandle;
    const rootPath = parsedTargetHandle.key;
    return getWorkflowFieldHandleId('property', `${rootPath}${nestedPath.startsWith('[') ? '' : '.'}${nestedPath}`);
  };

  if (typeof value === 'string') {
    return extractNodeScopedReferences(value).map((reference) => ({
      source: reference.nodeId,
      target: targetNodeId,
      sourceHandle: getWorkflowFieldHandleId(reference.scope === 'inputs' ? 'input' : 'output', reference.fieldPath),
      targetHandle: getNestedTargetHandle(path),
    }));
  }

  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectReferencesFromValue(item, targetNodeId, targetHandle, seen, `${path}[${index}]`));
  }

  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, item]) => collectReferencesFromValue(
      item,
      targetNodeId,
      targetHandle,
      seen,
      path ? `${path}.${key}` : key,
    ));
}

function collectWorkflowReferenceEdges(nodes: Workflow['nodes']): ReferenceEdge[] {
  const nodeIds = new Set(nodes.map(node => node.id));
  const edges: ReferenceEdge[] = [];

  for (const node of nodes) {
    const inputFields = Array.isArray(node.data?.inputFields) ? node.data.inputFields : [];
    inputFields.forEach((field, index) => {
      if (!field || typeof field !== 'object') return;
      const key = typeof (field as { key?: unknown }).key === 'string' ? (field as { key: string }).key : '';
      if (!key) return;
      edges.push(...collectReferencesFromValue(
        (field as { value?: unknown }).value,
        node.id,
        getWorkflowFieldHandleId('input', key, index),
      ));
    });

    const definition = getNodeDefinition(node.type);
    const propertyKeys = definition?.properties?.map(property => property.key)
      ?? Object.keys(node.data ?? {}).filter(key => (
        key !== 'inputFields'
        && key !== 'outputs'
        && !key.startsWith('__')
      ));
    for (const propertyKey of propertyKeys) {
      edges.push(...collectReferencesFromValue(
        node.data?.[propertyKey],
        node.id,
        getWorkflowFieldHandleId('property', propertyKey),
      ));
    }
  }

  return edges
    .filter(edge => edge.source !== edge.target && nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .filter((edge, index, items) => items.findIndex(item => getReferenceEdgeKey(item) === getReferenceEdgeKey(edge)) === index);
}

function isFieldReferenceEdge(edge: WorkflowEdge): boolean {
  if (edge.edgeKind === 'reference') return true;
  const sourceHandle = parseWorkflowFieldHandleId(edge.sourceHandle);
  const targetHandle = parseWorkflowFieldHandleId(edge.targetHandle);
  return sourceHandle?.kind !== undefined
    && (targetHandle?.kind === 'input' || targetHandle?.kind === 'property');
}

function needsRuntimeCompensation(edge: WorkflowEdge): boolean {
  const sourceHandle = parseWorkflowFieldHandleId(edge.sourceHandle);
  const targetHandle = parseWorkflowFieldHandleId(edge.targetHandle);
  return edge.source !== edge.target
    && sourceHandle?.kind !== undefined
    && targetHandle?.kind !== undefined;
}

function getRuntimeCompensationKey(edge: Pick<WorkflowEdge, 'source' | 'target'>): string {
  return getReferenceEdgeKey({
    source: edge.source,
    target: edge.target,
    sourceHandle: undefined,
    targetHandle: undefined,
  });
}

function hasNodeLevelRuntimePath(edges: WorkflowEdge[], source: string, target: string): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.edgeKind === 'reference') continue;
    if (isGeneratedRuntimeReferenceEdge(edge)) continue;
    if (needsRuntimeCompensation(edge)) continue;
    const targets = adjacency.get(edge.source);
    if (targets) targets.push(edge.target);
    else adjacency.set(edge.source, [edge.target]);
  }

  const visited = new Set<string>();
  const stack = [source];
  while (stack.length > 0) {
    const nodeId = stack.pop();
    if (!nodeId || visited.has(nodeId)) continue;
    visited.add(nodeId);
    for (const next of adjacency.get(nodeId) || []) {
      if (next === target) return true;
      if (!visited.has(next)) stack.push(next);
    }
  }
  return false;
}

function createRuntimeReferenceEdge(reference: ReferenceEdge): WorkflowEdge {
  return {
    id: `${createWorkflowEdgeId({
      source: reference.source,
      target: reference.target,
    })}${REFERENCE_RUNTIME_EDGE_ID_SUFFIX}`,
    source: reference.source,
    target: reference.target,
    edgeKind: 'runtime',
    sourceHandle: undefined,
    targetHandle: undefined,
    composite: {
      generated: true,
      hidden: false,
      locked: false,
    },
  };
}

function createFieldReferenceEdge(reference: ReferenceEdge): WorkflowEdge {
  return {
    id: createWorkflowEdgeId(reference),
    source: reference.source,
    target: reference.target,
    edgeKind: 'reference',
    sourceHandle: reference.sourceHandle,
    targetHandle: reference.targetHandle,
  };
}

export function syncWorkflowReferenceEdges<T extends Pick<Workflow, 'nodes' | 'edges'>>(workflow: T): T {
  const canSyncRuntimeCompensation = (workflow as WorkflowWithDisplayMode).layoutSnapshot?.nodeDisplayMode === 'properties';
  const references = collectWorkflowReferenceEdges(workflow.nodes);
  const desiredFieldKeys = new Set(references.map(getReferenceEdgeKey));
  const desiredRuntimeKeys = new Set<string>();
  if (canSyncRuntimeCompensation) {
    for (const reference of references) {
      if (hasNodeLevelRuntimePath(workflow.edges, reference.source, reference.target)) continue;
      desiredRuntimeKeys.add(getRuntimeCompensationKey(reference));
    }
    for (const edge of workflow.edges) {
      if (!needsRuntimeCompensation(edge)) continue;
      if (hasNodeLevelRuntimePath(workflow.edges, edge.source, edge.target)) continue;
      desiredRuntimeKeys.add(getRuntimeCompensationKey(edge));
    }
  }

  const nextEdges = workflow.edges.filter((edge) => {
    if (isFieldReferenceEdge(edge)) return desiredFieldKeys.has(getReferenceEdgeKey(edge));
    if (isGeneratedRuntimeReferenceEdge(edge)) return desiredRuntimeKeys.has(getReferenceEdgeKey(edge));
    return true;
  }).map((edge) => {
    if (isFieldReferenceEdge(edge) && edge.edgeKind !== 'reference') {
      return { ...edge, edgeKind: 'reference' as const };
    }
    if (isGeneratedRuntimeReferenceEdge(edge) && edge.edgeKind !== 'runtime') {
      return { ...edge, edgeKind: 'runtime' as const };
    }
    return edge;
  });
  const existingKeys = new Set(nextEdges.map(getReferenceEdgeKey));

  for (const reference of references) {
    const runtimeEdge = createRuntimeReferenceEdge(reference);
    const runtimeKey = getReferenceEdgeKey(runtimeEdge);
    if (desiredRuntimeKeys.has(runtimeKey) && !existingKeys.has(runtimeKey)) {
      nextEdges.push(runtimeEdge);
      existingKeys.add(runtimeKey);
    }

    const fieldEdge = createFieldReferenceEdge(reference);
    const fieldKey = getReferenceEdgeKey(fieldEdge);
    if (!existingKeys.has(fieldKey)) {
      nextEdges.push(fieldEdge);
      existingKeys.add(fieldKey);
    }
  }
  if (canSyncRuntimeCompensation) {
    for (const edge of workflow.edges) {
      if (!needsRuntimeCompensation(edge)) continue;
      const runtimeEdge = createRuntimeReferenceEdge({
        source: edge.source,
        target: edge.target,
        sourceHandle: '',
        targetHandle: '',
      });
      const runtimeKey = getReferenceEdgeKey(runtimeEdge);
      if (desiredRuntimeKeys.has(runtimeKey) && !existingKeys.has(runtimeKey)) {
        nextEdges.push(runtimeEdge);
        existingKeys.add(runtimeKey);
      }
    }
  }

  if (nextEdges.length === workflow.edges.length && nextEdges.every((edge, index) => edge === workflow.edges[index])) {
    return workflow;
  }
  return { ...workflow, edges: nextEdges };
}

export function syncWorkflowReferenceEdgesForNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  return syncWorkflowReferenceEdges({ nodes, edges });
}
