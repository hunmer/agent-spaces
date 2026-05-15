// packages/server/src/services/workflow.ts
// NOTE: All storage functions are synchronous (matching json-store pattern).
//       Service functions are also synchronous where they only call sync storage.
//       Route handlers wrap in async for Express compatibility.

import { v4 as uuid } from 'uuid';
import type { WorkflowTemplate, WorkflowNode, WorkflowEdge, AgentConfig } from '@agent-spaces/shared';
import * as workflowStore from '../storage/workflow-store.js';
import { getWorkspace } from '../storage/workspace-store.js';
import { listTemplates } from './agent.js';

// --- DAG Validation ---

function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] | null {
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adj.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    adj.get(edge.source)!.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(id);
    for (const neighbor of adj.get(id) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return result.length === nodes.length ? result : null;
}

function hasDuplicateEdges(edges: WorkflowEdge[]): boolean {
  const seen = new Set<string>();
  for (const e of edges) {
    const key = `${e.source}->${e.target}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function hasSelfLoops(edges: WorkflowEdge[]): boolean {
  return edges.some(e => e.source === e.target);
}

export function validateDAG(template: Pick<WorkflowTemplate, 'nodes' | 'edges'>): string | null {
  if (template.nodes.length === 0) return 'Workflow must have at least one node';
  if (hasSelfLoops(template.edges)) return 'Self-loops are not allowed';
  if (hasDuplicateEdges(template.edges)) return 'Duplicate edges are not allowed';

  const allNodeIds = new Set(template.nodes.map(n => n.id));
  for (const e of template.edges) {
    if (!allNodeIds.has(e.source)) return `Edge references unknown source node: ${e.source}`;
    if (!allNodeIds.has(e.target)) return `Edge references unknown target node: ${e.target}`;
  }

  if (topologicalSort(template.nodes, template.edges) === null) {
    return 'Workflow contains a cycle';
  }

  return null;
}

// --- Role Staleness Resolution ---

function resolveStaleRoles(nodes: WorkflowNode[]): { nodes: WorkflowNode[]; invalidIds: string[] } {
  const agentMap = new Map(listTemplates().map(a => [a.id, a]));
  const invalidIds: string[] = [];

  const resolved = nodes.map(node => {
    const agent = agentMap.get(node.data.agentConfigId);
    if (!agent) {
      invalidIds.push(node.id);
      return node;
    }
    return {
      ...node,
      data: {
        ...node.data,
        role: agent.role,
        avatarUrl: agent.avatarUrl,
        modelId: agent.modelId,
      },
    };
  });

  return { nodes: resolved, invalidIds };
}

// --- CRUD (synchronous) ---

export function listWorkflows(): WorkflowTemplate[] {
  return workflowStore.listWorkflows();
}

export function getWorkflow(workflowId: string): WorkflowTemplate | null {
  return workflowStore.getWorkflow(workflowId);
}

export function createWorkflow(
  input: { name: string; description?: string; nodes?: WorkflowNode[]; edges?: WorkflowEdge[]; viewport?: WorkflowTemplate['viewport'] }
): WorkflowTemplate {
  const now = new Date().toISOString();
  const nodes = input.nodes ?? [];
  const edges = input.edges ?? [];

  const { nodes: resolvedNodes, invalidIds } = resolveStaleRoles(nodes);
  if (invalidIds.length > 0) {
    throw new Error(`Invalid agent references in nodes: ${invalidIds.join(', ')}`);
  }

  const template: WorkflowTemplate = {
    id: uuid(),
    name: input.name,
    description: input.description,
    nodes: resolvedNodes,
    edges,
    viewport: input.viewport,
    createdAt: now,
    updatedAt: now,
  };

  const error = validateDAG(template);
  if (error) throw new Error(error);

  workflowStore.createWorkflow(template);
  return template;
}

export function updateWorkflow(
  workflowId: string,
  updates: Partial<Pick<WorkflowTemplate, 'name' | 'description' | 'nodes' | 'edges' | 'viewport'>>
): WorkflowTemplate {
  const existing = workflowStore.getWorkflow(workflowId);
  if (!existing) throw new Error('Workflow not found');

  let nodes = updates.nodes ?? existing.nodes;

  if (updates.nodes) {
    const resolved = resolveStaleRoles(updates.nodes);
    if (resolved.invalidIds.length > 0) {
      throw new Error(`Invalid agent references in nodes: ${resolved.invalidIds.join(', ')}`);
    }
    nodes = resolved.nodes;
  }

  const updated: WorkflowTemplate = {
    ...existing,
    ...updates,
    nodes,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  if (updates.nodes || updates.edges) {
    const error = validateDAG(updated);
    if (error) throw new Error(error);
  }

  workflowStore.updateWorkflow(updated);
  return updated;
}

export function deleteWorkflow(workflowId: string): void {
  const existing = workflowStore.getWorkflow(workflowId);
  if (!existing) throw new Error('Workflow not found');
  workflowStore.deleteWorkflow(workflowId);
}

export function duplicateWorkflow(workflowId: string): WorkflowTemplate {
  const existing = workflowStore.getWorkflow(workflowId);
  if (!existing) throw new Error('Workflow not found');

  const now = new Date().toISOString();
  const duplicated: WorkflowTemplate = {
    ...existing,
    id: uuid(),
    name: `${existing.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
  };

  workflowStore.createWorkflow(duplicated);
  return duplicated;
}

// --- Task Mapping ---

export interface TaskDraftForWorkflow {
  key: string;
  title: string;
  description: string;
  agentConfigId?: string;
  dependsOnKeys?: string[];
  sandboxDirs?: string[];
}

export function mapWorkflowToTaskDrafts(template: WorkflowTemplate): TaskDraftForWorkflow[] {
  const dependsOn = new Map<string, string[]>();
  for (const node of template.nodes) {
    dependsOn.set(node.id, []);
  }
  for (const edge of template.edges) {
    dependsOn.get(edge.target)?.push(edge.source);
  }

  return template.nodes.map(node => ({
    key: node.id,
    title: node.data.taskTitleTemplate || node.data.label,
    description: node.data.taskDescriptionTemplate || `Task assigned to ${node.data.label} (${node.data.role})`,
    agentConfigId: node.data.agentConfigId,
    dependsOnKeys: dependsOn.get(node.id)?.length ? dependsOn.get(node.id) : undefined,
    sandboxDirs: undefined,
  }));
}

// --- Run-time Validation ---

export function validateWorkflowForRun(_workspaceId: string, template: WorkflowTemplate, memberAgentIds: Set<string>): string | null {
  const agentMap = new Map(listTemplates().map((a) => [a.id, a]));

  for (const node of template.nodes) {
    const agent = agentMap.get(node.data.agentConfigId);
    if (!agent) return `Agent "${node.data.label}" (${node.data.agentConfigId}) no longer exists`;
    if (!agent.enabled) return `Agent "${agent.name}" is disabled`;
    if (!memberAgentIds.has(node.data.agentConfigId)) return `Agent "${agent.name}" is not in the issue channel members`;
  }

  return null;
}
