// packages/server/src/services/workflow.ts

import { v4 as uuid } from 'uuid';
import nodeCron from 'node-cron';
import { CronExpressionParser } from 'cron-parser';
import type {
  Workflow, WorkflowTemplate, WorkflowNode, WorkflowEdge, AgentConfig,
  WorkflowFolder, WorkflowVersion, ExecutionLog, StagedNode, OperationEntry,
  WorkflowTrigger, WorkflowAgentChatMessage,
} from '@agent-spaces/shared';
import { isRuntimeWorkflowEdge } from '@agent-spaces/shared';
import * as store from '../storage/workflow-store.js';
import { listTemplates } from './agent.js';

// ---- Legacy node data helpers ----

interface LegacyAgentData {
  label: string;
  agentConfigId: string;
  role: string;
  avatarUrl?: string;
  modelId?: string;
  taskTitleTemplate?: string;
  taskDescriptionTemplate?: string;
}

function getAgentData(node: WorkflowNode): LegacyAgentData | null {
  if (node.type !== 'agent') return null;
  return node.data as unknown as LegacyAgentData;
}

function getLabel(node: WorkflowNode): string {
  return (node.data as Record<string, unknown>).label as string || node.label;
}

// ---- DAG Validation ----

function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] | null {
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adj.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    const source = edge.source;
    const target = edge.target;
    adj.get(source)!.push(target);
    inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
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
    const sourceHandle = e.sourceHandle ?? '';
    const targetHandle = e.targetHandle ?? '';
    const key = `${e.edgeKind ?? 'runtime'}:${e.source}:${sourceHandle}->${e.target}:${targetHandle}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function hasSelfLoops(edges: WorkflowEdge[]): boolean {
  return edges.some(e => e.source === e.target);
}

export function validateDAG(template: Pick<Workflow, 'nodes' | 'edges'>): string | null {
  if (template.nodes.length === 0) return 'Workflow must have at least one node';
  const runtimeEdges = template.edges.filter(isRuntimeWorkflowEdge);
  if (hasSelfLoops(runtimeEdges)) return 'Self-loops are not allowed';
  if (hasDuplicateEdges(template.edges)) return 'Duplicate edges are not allowed';

  const allNodeIds = new Set(template.nodes.map(n => n.id));
  for (const e of template.edges) {
    if (!allNodeIds.has(e.source)) return `Edge references unknown source node: ${e.source}`;
    if (!allNodeIds.has(e.target)) return `Edge references unknown target node: ${e.target}`;
  }

  if (topologicalSort(template.nodes, runtimeEdges) === null) {
    return 'Workflow contains a cycle';
  }

  return null;
}

// ---- Role Staleness Resolution ----

function resolveStaleRoles(nodes: WorkflowNode[]): { nodes: WorkflowNode[]; invalidIds: string[] } {
  const agentMap = new Map(listTemplates().map(a => [a.id, a]));
  const invalidIds: string[] = [];

  const resolved = nodes.map(node => {
    if (node.type === 'command') return node;
    const agentData = getAgentData(node);
    if (!agentData) return node;
    const agent = agentMap.get(agentData.agentConfigId);
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

function sanitizeWorkflowAgentValue(value: unknown): unknown {
  let normalized = value;
  if (typeof normalized === 'string' && normalized.trim()) {
    try {
      const parsed = JSON.parse(normalized);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) normalized = parsed;
    } catch {
      return value;
    }
  }
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return normalized;
  const agent = normalized as Record<string, unknown>;
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    description: agent.description,
    runtimeKind: agent.runtimeKind,
    modelProvider: agent.modelProvider,
    providerId: agent.providerId,
    modelId: agent.modelId,
    apiBase: agent.apiBase,
    workingDir: agent.workingDir,
    mcps: sanitizeWorkflowAgentMcps(agent.mcps),
    skills: sanitizeWorkflowAgentSkills(agent.skills),
    tools: sanitizeWorkflowAgentTools(agent.tools),
    systemPrompt: agent.systemPrompt,
    outputStyle: agent.outputStyle,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    sandboxDirs: agent.sandboxDirs,
    avatarUrl: agent.avatarUrl,
    icon: agent.icon,
    enabled: agent.enabled,
  };
}

function sanitizeWorkflowAgentMcps(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function sanitizeWorkflowAgentSkills(value: unknown): string[] | undefined {
  const skills = normalizeStringArray(value);
  return skills.length ? skills : undefined;
}

function sanitizeWorkflowAgentTools(value: unknown): string[] | undefined {
  const tools = normalizeStringArray(value);
  return tools.length ? tools : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function sanitizeAgentRunNodes(nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes.map((node) => {
    if (node.type !== 'agent_run') return node;
    return {
      ...node,
      data: {
        ...node.data,
        agent: sanitizeWorkflowAgentValue(node.data.agent),
      },
    };
  });
}

// ---- Workflow CRUD ----

export function listWorkflows(folderId?: string | null): Workflow[] {
  return store.listWorkflows(folderId);
}

export function getWorkflow(workflowId: string): Workflow | null {
  return store.getWorkflow(workflowId);
}

export function createWorkflow(
  input: { name: string; type?: 'normal' | 'workspace'; description?: string; folderId?: string | null; icon?: string; tags?: string[]; nodes?: WorkflowNode[]; edges?: WorkflowEdge[]; triggers?: WorkflowTrigger[]; groups?: any[]; published?: boolean }
): Workflow {
  const now = Date.now();
  const nodes = input.nodes ?? [];
  const edges = input.edges ?? [];

  const { nodes: staleRoleResolvedNodes, invalidIds } = resolveStaleRoles(nodes);
  if (invalidIds.length > 0) {
    throw new Error(`Invalid agent references in nodes: ${invalidIds.join(', ')}`);
  }
  const resolvedNodes = sanitizeAgentRunNodes(staleRoleResolvedNodes);

  const workflow: Workflow = {
    id: uuid(),
    name: input.name,
    type: input.type ?? 'normal',
    folderId: input.folderId ?? null,
    icon: input.icon,
    description: input.description,
    tags: input.tags,
    nodes: resolvedNodes,
    edges,
    createdAt: now,
    updatedAt: now,
    triggers: input.triggers,
    groups: input.groups,
    // 默认不发布；仅当显式传入 true 时才标记为已发布
    published: input.published === true,
  };

  const error = validateDAG(workflow);
  if (error) throw new Error(error);

  store.createWorkflow(workflow);
  return workflow;
}

export function updateWorkflow(
  workflowId: string,
  updates: Partial<Pick<Workflow, 'name' | 'type' | 'description' | 'folderId' | 'icon' | 'tags' | 'nodes' | 'edges' | 'triggers' | 'groups' | 'enabledPlugins' | 'pluginConfigSchemes' | 'agentConfig' | 'layoutSnapshot' | 'published'>>
): Workflow {
  const existing = store.getWorkflow(workflowId);
  if (!existing) throw new Error('Workflow not found');

  let nodes = updates.nodes ?? existing.nodes;

  if (updates.nodes) {
    const resolved = resolveStaleRoles(updates.nodes);
    if (resolved.invalidIds.length > 0) {
      throw new Error(`Invalid agent references in nodes: ${resolved.invalidIds.join(', ')}`);
    }
    nodes = resolved.nodes;
  }
  nodes = sanitizeAgentRunNodes(nodes);

  const updated: Workflow = {
    ...existing,
    ...updates,
    nodes,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };

  if (updates.nodes || updates.edges) {
    const error = validateDAG(updated);
    if (error) throw new Error(error);
  }

  store.updateWorkflow(updated);
  return updated;
}

/** 记录工作流被打开（进入编辑器）的时间，不影响其他字段。 */
export function recordWorkflowOpen(workflowId: string): Workflow {
  const existing = store.getWorkflow(workflowId);
  if (!existing) throw new Error('Workflow not found');
  const updated: Workflow = { ...existing, lastOpenedAt: Date.now() };
  store.updateWorkflow(updated);
  return updated;
}

export function deleteWorkflow(workflowId: string): void {
  const existing = store.getWorkflow(workflowId);
  if (!existing) throw new Error('Workflow not found');
  store.deleteWorkflow(workflowId);
}

export function duplicateWorkflow(workflowId: string): Workflow {
  const existing = store.getWorkflow(workflowId);
  if (!existing) throw new Error('Workflow not found');

  const now = Date.now();
  const duplicated: Workflow = {
    ...existing,
    id: uuid(),
    name: `${existing.name} (Copy)`,
    nodes: sanitizeAgentRunNodes(existing.nodes),
    createdAt: now,
    updatedAt: now,
    // 复制副本默认不发布，避免误开放访问
    published: false,
  };

  store.createWorkflow(duplicated);
  return duplicated;
}

// ---- Folder CRUD ----

export function listFolders(): WorkflowFolder[] {
  return store.listWorkflowFolders();
}

export function createFolder(input: { name: string; parentId?: string | null }): WorkflowFolder {
  const folders = store.listWorkflowFolders();
  const siblings = folders.filter(f => f.parentId === (input.parentId ?? null));
  const folder: WorkflowFolder = {
    id: uuid(),
    name: input.name,
    parentId: input.parentId ?? null,
    order: siblings.length > 0 ? Math.max(...siblings.map(f => f.order)) + 1 : 0,
    createdAt: Date.now(),
  };
  store.createWorkflowFolder(folder);
  return folder;
}

export function updateFolder(id: string, updates: Partial<Pick<WorkflowFolder, 'name' | 'parentId' | 'order'>>): void {
  store.updateWorkflowFolder(id, updates);
}

export function deleteFolder(id: string): void {
  store.deleteWorkflowFolder(id);
}

// ---- Version CRUD ----

export function listVersions(workflowId: string): WorkflowVersion[] {
  return store.listVersions(workflowId);
}

export function createVersion(
  workflowId: string,
  input?: { name?: string; nodes?: WorkflowNode[]; edges?: WorkflowEdge[] },
): WorkflowVersion {
  const workflow = store.getWorkflow(workflowId);
  if (!workflow) throw new Error('Workflow not found');
  const nodes = input?.nodes ?? workflow.nodes;
  const edges = input?.edges ?? workflow.edges;

  const version: WorkflowVersion = {
    id: uuid(),
    workflowId,
    name: input?.name || `v${store.listVersions(workflowId).length + 1}`,
    snapshot: {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    },
    createdAt: Date.now(),
  };

  store.addVersion(workflowId, version);
  return version;
}

export function getVersion(workflowId: string, versionId: string): WorkflowVersion | null {
  return store.getVersion(workflowId, versionId) as WorkflowVersion | null;
}

export function deleteVersion(workflowId: string, versionId: string): void {
  store.deleteVersion(workflowId, versionId);
}

export function clearVersions(workflowId: string): void {
  store.clearVersions(workflowId);
}

// ---- Execution Log CRUD ----

export function listExecutionLogs(workflowId: string): ExecutionLog[] {
  return store.listExecutionLogs(workflowId);
}

export function listAllExecutionLogs(limit?: number) {
  return store.listAllExecutionLogs(limit);
}

export function getExecutionLog(workflowId: string, logId: string): ExecutionLog | null {
  return store.getExecutionLog(workflowId, logId) as ExecutionLog | null;
}

export function getExecutionLogPath(workflowId: string, logId: string): string {
  return store.getExecutionLogPath(workflowId, logId);
}

export function getWorkflowPath(workflowId: string): string {
  return store.getWorkflowPath(workflowId);
}

export function deleteExecutionLog(workflowId: string, logId: string): void {
  store.deleteExecutionLog(workflowId, logId);
}

export function clearExecutionLogs(workflowId: string): void {
  store.clearExecutionLogs(workflowId);
}

// ---- Staging ----

export function loadStaging(workflowId: string): StagedNode[] {
  return store.loadStaging(workflowId);
}

export function saveStaging(workflowId: string, nodes: StagedNode[]): void {
  store.saveStaging(workflowId, nodes);
}

export function clearStaging(workflowId: string): void {
  store.clearStaging(workflowId);
}

// ---- Operation History ----

export function loadOperationHistory(workflowId: string): OperationEntry[] {
  return store.loadOperationHistory(workflowId);
}

export function saveOperationHistory(workflowId: string, entries: OperationEntry[]): void {
  store.saveOperationHistory(workflowId, entries);
}

export function clearOperationHistory(workflowId: string): void {
  store.clearOperationHistory(workflowId);
}

// ---- Workflow Agent Chat ----

export function loadChat(workflowId: string): WorkflowAgentChatMessage[] {
  return store.loadChat(workflowId) as WorkflowAgentChatMessage[];
}

export function saveChat(workflowId: string, messages: WorkflowAgentChatMessage[]): void {
  store.saveChat(workflowId, messages);
}

export function clearChat(workflowId: string): void {
  store.clearChat(workflowId);
}

// ---- Plugin Config Schemes ----

export function listPluginSchemes(workflowId: string, pluginId: string): string[] {
  return store.listPluginSchemes(workflowId, pluginId);
}

export function readPluginScheme(workflowId: string, pluginId: string, schemeName: string): Record<string, string> {
  return store.readPluginScheme(workflowId, pluginId, schemeName);
}

export function createPluginScheme(workflowId: string, pluginId: string, schemeName: string): void {
  store.savePluginScheme(workflowId, pluginId, schemeName, {});
}

export function savePluginScheme(workflowId: string, pluginId: string, schemeName: string, data: Record<string, string>): void {
  store.savePluginScheme(workflowId, pluginId, schemeName, data);
}

export function deletePluginScheme(workflowId: string, pluginId: string, schemeName: string): void {
  store.deletePluginScheme(workflowId, pluginId, schemeName);
}

// ---- Task Mapping (legacy Issue automation) ----

export interface TaskDraftForWorkflow {
  key: string;
  title: string;
  description: string;
  agentConfigId?: string;
  dependsOnKeys?: string[];
  sandboxDirs?: string[];
  commandNode?: WorkflowNode;
}

export function mapWorkflowToTaskDrafts(template: Workflow): TaskDraftForWorkflow[] {
  const dependsOn = new Map<string, string[]>();
  for (const node of template.nodes) {
    dependsOn.set(node.id, []);
  }
  for (const edge of template.edges) {
    dependsOn.get(edge.target)?.push(edge.source);
  }

  return template.nodes.map(node => {
    const label = getLabel(node);
    if (node.type === 'command') {
      return {
        key: node.id,
        title: label,
        description: `Run command: ${label}`,
        agentConfigId: undefined,
        dependsOnKeys: dependsOn.get(node.id)?.length ? dependsOn.get(node.id) : undefined,
        sandboxDirs: undefined,
        commandNode: node,
      };
    }
    const agentData = getAgentData(node);
    const taskTitle = (agentData?.taskTitleTemplate || label) as string;
    const taskDesc = agentData?.taskDescriptionTemplate || `Task assigned to ${label} (${agentData?.role || 'unknown'})`;
    return {
      key: node.id,
      title: taskTitle,
      description: taskDesc as string,
      agentConfigId: agentData?.agentConfigId,
      dependsOnKeys: dependsOn.get(node.id)?.length ? dependsOn.get(node.id) : undefined,
      sandboxDirs: undefined,
    };
  });
}

// ---- Run-time Validation ----

export function validateWorkflowForRun(_workspaceId: string, template: Workflow, memberAgentIds: Set<string>): string | null {
  const agentMap = new Map(listTemplates().map((a) => [a.id, a]));

  for (const node of template.nodes) {
    if (node.type === 'command') continue;
    const agentData = getAgentData(node);
    if (!agentData) continue;
    const label = getLabel(node);
    const agent = agentMap.get(agentData.agentConfigId);
    if (!agent) return `Agent "${label}" (${agentData.agentConfigId}) no longer exists`;
    if (!agent.enabled) return `Agent "${agent.name}" is disabled`;
    if (!memberAgentIds.has(agentData.agentConfigId)) return `Agent "${agent.name}" is not in the issue channel members`;
  }

  return null;
}

// ---- Cron Validation ----

export function validateCron(cronExpr: string): { valid: boolean; nextRuns: string[]; error?: string } {
  try {
    if (!nodeCron.validate(cronExpr)) {
      return { valid: false, nextRuns: [], error: 'Invalid cron expression' };
    }
  } catch {
    // If node-cron validate fails to load, continue with cron-parser
  }

  try {
    const interval = CronExpressionParser.parse(cronExpr);
    const nextRuns: string[] = [];
    for (let i = 0; i < 5; i++) {
      const iso = interval.next().toISOString();
      if (iso) nextRuns.push(iso);
    }
    return { valid: true, nextRuns };
  } catch (err: any) {
    return { valid: false, nextRuns: [], error: err.message };
  }
}
