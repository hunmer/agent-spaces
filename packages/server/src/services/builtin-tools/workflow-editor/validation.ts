import type { NodeProperty, Workflow, WorkflowEdge, WorkflowNode } from '@agent-spaces/shared';
import { asRecord } from './helpers.js';
import type { JsonRecord } from './types.js';

export interface MissingRequiredField {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  field: string;
  label: string;
  type: string;
  reason: string;
}

export interface VariableDependencyIssue {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  field: string;
  referencedNodeId: string;
  referencedPath: string;
  reason: string;
}

function isRequiredValueMissing(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

function isPropertyVisible(property: NodeProperty, data: JsonRecord): boolean {
  if (!property.visibleWhen) return true;
  const actual = data[property.visibleWhen.key];
  if ('equals' in property.visibleWhen) return actual === property.visibleWhen.equals;
  if (property.visibleWhen.in) return property.visibleWhen.in.includes(actual);
  return true;
}

function addMissingArrayItemFields(
  missing: MissingRequiredField[],
  node: WorkflowNode,
  property: NodeProperty,
  value: unknown,
) {
  if (property.type !== 'array' || !Array.isArray(value) || !property.fields?.length) return;
  value.forEach((item, index) => {
    const itemRecord = asRecord(item);
    for (const field of property.fields ?? []) {
      if (!field.required || !isRequiredValueMissing(itemRecord[field.key])) continue;
      missing.push({
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: node.type,
        field: `${property.key}[${index}].${field.key}`,
        label: `${property.label}.${field.label}`,
        type: field.type,
        reason: 'required array item field is empty',
      });
    }
  });
}

function findReachableNodes(workflow: Pick<Workflow, 'nodes' | 'edges'>, startNodeId: string): WorkflowNode[] | null {
  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]));
  if (!nodeById.has(startNodeId)) return null;
  const outgoing = new Map<string, WorkflowEdge[]>();
  for (const edge of workflow.edges) {
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge);
    outgoing.set(edge.source, list);
  }

  const reachable: WorkflowNode[] = [];
  const visited = new Set<string>();
  const queue = [startNodeId];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId)) continue;
    visited.add(nodeId);
    const node = nodeById.get(nodeId);
    if (!node) continue;
    reachable.push(node);
    for (const edge of outgoing.get(nodeId) ?? []) {
      if (!visited.has(edge.target)) queue.push(edge.target);
    }
  }
  return reachable;
}

function normalizeReferencePath(path: string): string {
  return path
    .trim()
    .replace(/^\[['"]?/, '')
    .replace(/['"]?\]$/, '')
    .replace(/\[['"]?([^'"\]]+)['"]?\]/g, '.$1');
}

function collectDataReferences(value: unknown, fieldPath: string, refs: Array<{ field: string; nodeId: string; path: string }>) {
  if (typeof value === 'string') {
    const pattern = /\{\{\s*__data__\[(["'])([^"']+)\1\](?:\.|\[)([^}]+?)\s*\}\}/g;
    for (const match of value.matchAll(pattern)) {
      refs.push({ field: fieldPath, nodeId: match[2], path: normalizeReferencePath(match[3]) });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectDataReferences(item, `${fieldPath}[${index}]`, refs));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      collectDataReferences(nested, fieldPath ? `${fieldPath}.${key}` : key, refs);
    }
  }
}

function hasDirectedPath(edges: WorkflowEdge[], sourceId: string, targetId: string): boolean {
  if (sourceId === targetId) return true;
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge.target);
    outgoing.set(edge.source, list);
  }
  const visited = new Set<string>();
  const queue = [sourceId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    for (const next of outgoing.get(current) ?? []) {
      if (next === targetId) return true;
      if (!visited.has(next)) queue.push(next);
    }
  }
  return false;
}

function checkVariableDependencies(
  workflow: Pick<Workflow, 'nodes' | 'edges'>,
  nodes: WorkflowNode[],
): VariableDependencyIssue[] {
  const issues: VariableDependencyIssue[] = [];
  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    const refs: Array<{ field: string; nodeId: string; path: string }> = [];
    collectDataReferences(node.data, 'data', refs);
    collectDataReferences(node.inputFields, 'inputFields', refs);
    collectDataReferences(node.outputs, 'outputs', refs);

    for (const ref of refs) {
      const referencedNode = nodeById.get(ref.nodeId);
      if (!referencedNode) {
        issues.push({
          nodeId: node.id,
          nodeLabel: node.label,
          nodeType: node.type,
          field: ref.field,
          referencedNodeId: ref.nodeId,
          referencedPath: ref.path,
          reason: 'referenced node does not exist',
        });
        continue;
      }

      const sameScope = (referencedNode.composite?.parentId ?? null) === (node.composite?.parentId ?? null);
      if (sameScope && !hasDirectedPath(workflow.edges, ref.nodeId, node.id)) {
        issues.push({
          nodeId: node.id,
          nodeLabel: node.label,
          nodeType: node.type,
          field: ref.field,
          referencedNodeId: ref.nodeId,
          referencedPath: ref.path,
          reason: 'referenced node is not connected upstream of this node',
        });
      }
    }
  }
  return issues;
}

export function checkRequiredFields(
  workflow: Pick<Workflow, 'nodes' | 'edges'>,
  startNodeId: string,
  definitionByType: ReadonlyMap<string, { properties?: NodeProperty[] }>,
) {
  const reachableNodes = findReachableNodes(workflow, startNodeId);
  if (!reachableNodes) return { success: false as const, message: `Start node not found: ${startNodeId}` };

  const missing: MissingRequiredField[] = [];
  const variableDependencyIssues = checkVariableDependencies(workflow, reachableNodes);
  for (const node of reachableNodes) {
    const definition = definitionByType.get(node.type);
    if (!definition?.properties?.length) continue;
    const data = asRecord(node.data);
    for (const property of definition.properties) {
      if (!property.required || !isPropertyVisible(property, data)) continue;
      const value = data[property.key];
      if (isRequiredValueMissing(value)) {
        missing.push({
          nodeId: node.id,
          nodeLabel: node.label,
          nodeType: node.type,
          field: property.key,
          label: property.label,
          type: property.type,
          reason: 'required field is empty',
        });
        continue;
      }
      addMissingArrayItemFields(missing, node, property, value);
    }
  }

  return {
    success: true as const,
    passed: missing.length === 0 && variableDependencyIssues.length === 0,
    checked_node_count: reachableNodes.length,
    checked_node_ids: reachableNodes.map((node) => node.id),
    missing_required_fields: missing,
    variable_dependency_issues: variableDependencyIssues,
  };
}

export function getOutputFieldKey(field: unknown): string | undefined {
  if (!field || typeof field !== 'object' || Array.isArray(field)) return undefined;
  const key = (field as Record<string, unknown>).key;
  return typeof key === 'string' && key.trim() ? key : undefined;
}

export function isOutputFieldRequired(field: unknown): boolean {
  return Boolean(field && typeof field === 'object' && !Array.isArray(field) && (field as Record<string, unknown>).required === true);
}

export function getRequiredInputKeys(node: WorkflowNode | undefined): string[] {
  if (!node || !Array.isArray(node.data?.inputFields)) return [];
  return node.data.inputFields
    .filter(isOutputFieldRequired)
    .map(getOutputFieldKey)
    .filter((key): key is string => Boolean(key));
}

export function missingRequiredKeys(keys: string[], value: unknown): string[] {
  const record = asRecord(value);
  return keys.filter((key) => isRequiredValueMissing(record[key]));
}
