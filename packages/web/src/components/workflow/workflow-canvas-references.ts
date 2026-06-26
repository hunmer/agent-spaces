'use client';

import type { Workflow } from '@agent-spaces/shared';
import {
  LOOP_NODE_TYPE,
  LOOP_NEXT_SOURCE_HANDLE,
} from '@agent-spaces/shared';
import { createWorkflowEdgeId } from '@/lib/workflow-edge-id';
import {
  cloneData,
  sanitizeFieldKey,
} from './workflow-canvas-utils';
import {
  normalizeVariableFieldPath,
  parseVariableExpression,
  tokenizeVariableFieldPath,
} from './workflow-variable-path';

export function makeInputReference(nodeId: string, fieldPath: string): string {
  return `{{ __inputs__["${nodeId}"].${fieldPath} }}`;
}

export function makeDataReference(nodeId: string, fieldPath: string): string {
  return `{{ __data__["${nodeId}"].${fieldPath} }}`;
}

export function normalizeInputKey(baseKey: string, usedKeys: Set<string>): string {
  const sanitized = sanitizeFieldKey(baseKey);
  let key = sanitized;
  let index = 2;
  while (usedKeys.has(key)) {
    key = `${sanitized}_${index}`;
    index += 1;
  }
  usedKeys.add(key);
  return key;
}

export function getReferenceFieldKey(node: Workflow['nodes'][0] | undefined, fieldPath: string): string {
  const prefix = node?.label || node?.type || 'input';
  const leaf = fieldPath.split('.').filter(Boolean).at(-1) || 'value';
  return `${prefix}_${leaf}`;
}

export function collectExternalReferences(
  value: unknown,
  selectedIds: Set<string>,
): Array<{ raw: string; source: '__data__' | '__inputs__'; nodeId: string; fieldPath: string }> {
  const refs: Array<{ raw: string; source: '__data__' | '__inputs__'; nodeId: string; fieldPath: string }> = [];
  const pattern = /\{\{\s*(__data__|__inputs__)\[(["'])([^"']+)\2\]\.([^}]+?)\s*\}\}/g;

  const visit = (item: unknown) => {
    if (typeof item === 'string') {
      for (const match of item.matchAll(pattern)) {
        const nodeId = match[3];
        if (!selectedIds.has(nodeId)) {
          refs.push({
            raw: match[0],
            source: match[1] as '__data__' | '__inputs__',
            nodeId,
            fieldPath: match[4].trim(),
          });
        }
      }
      return;
    }
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
      return;
    }
    if (item && typeof item === 'object') {
      for (const child of Object.values(item)) visit(child);
    }
  };

  visit(value);
  return refs;
}

export function replaceReferences(value: unknown, replacements: Map<string, string>): unknown {
  if (typeof value === 'string') {
    let next = value;
    for (const [raw, replacement] of replacements) {
      next = next.split(raw).join(replacement);
    }
    return next;
  }
  if (Array.isArray(value)) return value.map(item => replaceReferences(item, replacements));
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      next[key] = replaceReferences(child, replacements);
    }
    return next;
  }
  return value;
}

export function replaceReferenceNodeIds(value: unknown, replacements: Map<string, string>): unknown {
  if (typeof value === 'string') {
    return value.replace(
      /(__data__|__inputs__)\[(["'])([^"']+)\2\]/g,
      (raw, source: string, quote: string, nodeId: string) => {
        const replacement = replacements.get(nodeId);
        return replacement ? `${source}[${quote}${replacement}${quote}]` : raw;
      },
    );
  }
  if (Array.isArray(value)) return value.map(item => replaceReferenceNodeIds(item, replacements));
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      next[key] = replaceReferenceNodeIds(child, replacements);
    }
    return next;
  }
  return value;
}

export function clearStartInputFieldValues(workflow: { nodes?: Workflow['nodes'] }): void {
  if (!Array.isArray(workflow.nodes)) return;
  for (const node of workflow.nodes) {
    if (node.type === 'start' && Array.isArray(node.data?.inputFields)) {
      node.data.inputFields = node.data.inputFields.map((field) => {
        const next = { ...(field as Record<string, unknown>) };
        delete next.value;
        return next;
      });
    }
    const bodyWorkflow = node.data?.bodyWorkflow;
    if (bodyWorkflow && typeof bodyWorkflow === 'object') {
      clearStartInputFieldValues(bodyWorkflow as { nodes?: Workflow['nodes'] });
    }
  }
}

export function remapSelectedWorkflowNodes(
  nodes: Workflow['nodes'],
  edges: Workflow['edges'],
  selectedIds: Set<string>,
  selectedRootIds: Set<string>,
  startNodeId: string,
  endNodeId: string,
): { nodes: Workflow['nodes']; edges: Workflow['edges'] } {
  const boundaryIdMap = new Map<string, string>();
  for (const node of nodes) {
    if (!selectedRootIds.has(node.id)) continue;
    if (node.type === 'start') boundaryIdMap.set(node.id, startNodeId);
    if (node.type === 'end') boundaryIdMap.set(node.id, endNodeId);
  }
  const remapNodeId = (nodeId: string): string => boundaryIdMap.get(nodeId) ?? nodeId;
  const selectedNodes = nodes
    .filter(node => selectedIds.has(node.id) && !boundaryIdMap.has(node.id))
    .map(node => cloneData(node));
  const selectedEdges = edges
    .filter(edge => selectedIds.has(edge.source) && selectedIds.has(edge.target))
    .map((edge) => {
      const next = cloneData(edge);
      next.source = remapNodeId(next.source);
      next.target = remapNodeId(next.target);
      next.id = createWorkflowEdgeId(next);
      return next;
    })
    .filter((edge, index, items) => (
      edge.source !== edge.target
      && items.findIndex(item => item.id === edge.id) === index
    ));
  const selectedRootNodes = nodes.filter(node => selectedRootIds.has(node.id)).map(node => cloneData(node));
  const rootEdges = edges.filter(edge => selectedRootIds.has(edge.source) && selectedRootIds.has(edge.target));
  const firstNode = [...selectedRootNodes]
    .filter(node => !rootEdges.some(edge => edge.target === node.id))
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)[0]
    ?? [...selectedRootNodes].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)[0];
  const lastNode = [...selectedRootNodes]
    .filter(node => !rootEdges.some(edge => edge.source === node.id))
    .sort((a, b) => b.position.x - a.position.x || b.position.y - a.position.y)[0]
    ?? [...selectedRootNodes].sort((a, b) => b.position.x - a.position.x || b.position.y - a.position.y)[0];
  const firstTargetHandle = firstNode
    ? rootEdges.find(edge => edge.target === firstNode.id)?.targetHandle ?? null
    : null;
  const firstNodeId = firstNode ? remapNodeId(firstNode.id) : null;
  const entryEdges: Workflow['edges'] = firstNodeId && firstNodeId !== startNodeId ? [{
    id: createWorkflowEdgeId({
      source: startNodeId,
      target: firstNodeId,
      sourceHandle: null,
      targetHandle: firstTargetHandle,
    }),
    source: startNodeId,
    target: firstNodeId,
    sourceHandle: null,
    targetHandle: firstTargetHandle,
  }] : [];
  const lastNodeId = lastNode ? remapNodeId(lastNode.id) : null;
  const exitSourceHandle = lastNode?.type === LOOP_NODE_TYPE ? LOOP_NEXT_SOURCE_HANDLE : null;
  const exitEdges: Workflow['edges'] = lastNodeId && lastNodeId !== endNodeId ? [{
    id: createWorkflowEdgeId({
      source: lastNodeId,
      target: endNodeId,
      sourceHandle: exitSourceHandle,
      targetHandle: null,
    }),
    source: lastNodeId,
    target: endNodeId,
    sourceHandle: exitSourceHandle,
    targetHandle: null,
  }] : [];

  return {
    nodes: selectedNodes,
    edges: [...selectedEdges, ...entryEdges, ...exitEdges],
  };
}

export type WorkflowFieldKeyReferenceMatch = {
  scope: 'data' | 'inputs' | 'env';
  nodeId?: string;
  oldPath: string;
  newPath: string;
};

function isArrayIndexToken(token: string) {
  return /^\[\d+\]$/.test(token);
}

function findMatchedTokenIndexes(tokens: string[], targetTokens: string[]): number[] | null {
  if (!targetTokens.length) return null;

  const matchedIndexes: number[] = [];
  let targetIndex = 0;

  for (let tokenIndex = 0; tokenIndex < tokens.length && targetIndex < targetTokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex];
    if (isArrayIndexToken(token)) continue;
    if (token !== targetTokens[targetIndex]) return null;
    matchedIndexes.push(tokenIndex);
    targetIndex += 1;
  }

  return targetIndex === targetTokens.length ? matchedIndexes : null;
}

function replaceMatchedPath(fieldPath: string, oldPath: string, newPath: string): string | null {
  const tokens = tokenizeVariableFieldPath(fieldPath);
  const oldTokens = tokenizeVariableFieldPath(oldPath);
  const newTokens = tokenizeVariableFieldPath(newPath);
  const matchedIndexes = findMatchedTokenIndexes(tokens, oldTokens);

  if (!tokens.length || !oldTokens.length || !newTokens.length || !matchedIndexes) return null;

  if (newTokens.length !== oldTokens.length) return null;

  const nextTokens = [...tokens];
  matchedIndexes.forEach((tokenIndex, index) => {
    nextTokens[tokenIndex] = newTokens[index];
  });
  return normalizeVariableFieldPath(nextTokens.join('.'));
}

function replaceExpressionReference(expression: string, matches: WorkflowFieldKeyReferenceMatch[]): string {
  const parsed = parseVariableExpression(expression);
  if (!parsed) return expression;

  for (const match of matches) {
    if (match.scope !== parsed.scope) continue;
    if ((match.scope === 'data' || match.scope === 'inputs') && match.nodeId !== parsed.nodeId) continue;

    const nextFieldPath = replaceMatchedPath(parsed.fieldPath, match.oldPath, match.newPath);
    if (!nextFieldPath) continue;

    if (parsed.scope === 'env') return `__env__.${nextFieldPath}`;
    return `__${parsed.scope}__["${parsed.nodeId}"].${nextFieldPath}`;
  }

  return expression;
}

export function replaceFieldKeyReferences(value: unknown, matches: WorkflowFieldKeyReferenceMatch[]): unknown {
  if (!matches.length) return value;

  if (typeof value === 'string') {
    return value.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, (raw, expression: string) => {
      const nextExpression = replaceExpressionReference(expression.trim(), matches);
      return nextExpression === expression.trim() ? raw : `{{ ${nextExpression} }}`;
    });
  }

  if (Array.isArray(value)) {
    return value.map(item => replaceFieldKeyReferences(item, matches));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceFieldKeyReferences(item, matches)]),
    );
  }

  return value;
}
