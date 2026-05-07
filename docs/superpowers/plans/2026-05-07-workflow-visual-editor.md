# Workflow Visual Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visual workflow editor using xyflow that allows users to create reusable agent team templates as DAG graphs, and select them when creating/editing issues.

**Architecture:** WorkflowTemplate is a JSON-serializable DAG of agent preset nodes. On issue start, the template maps to existing Task/TaskDraft structures -- no new execution engine. Frontend gets an independent management page with xyflow canvas editor, plus workflow template selection in issue dialogs.

**Tech Stack:** @xyflow/react v12, @dagrejs/dagre, Express routes, Zustand store, shadcn/ui, TailwindCSS 4

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/shared/src/types/workflow.ts` | WorkflowTemplate, WorkflowNode, WorkflowEdge type definitions |
| `packages/server/src/storage/workflow-store.ts` | JSON dual-file CRUD for workflow templates |
| `packages/server/src/services/workflow.ts` | Business logic: DAG validation, agent resolution, task mapping |
| `packages/server/src/routes/workflow.ts` | REST API: CRUD + duplicate |
| `packages/web/src/stores/workflow.ts` | Zustand store for workflow state |
| `packages/web/src/components/workflow/workflow-list.tsx` | Template list page (card grid) |
| `packages/web/src/components/workflow/workflow-editor.tsx` | Editor page (palette + canvas + toolbar) |
| `packages/web/src/components/workflow/workflow-canvas.tsx` | xyflow canvas with custom node types |
| `packages/web/src/components/workflow/workflow-agent-node.tsx` | Custom xyflow node for agent presets |
| `packages/web/src/components/workflow/workflow-agent-palette.tsx` | Left panel: draggable agent cards |
| `packages/web/src/components/workflow/workflow-toolbar.tsx` | Bottom toolbar (save, layout, delete, export) |
| `packages/web/src/components/workflow/workflow-mini-preview.tsx` | Mini read-only preview for list cards |

### Modified Files

| File | Change |
|------|--------|
| `packages/shared/src/types/issue.ts` | Add `workflowId?: string` to `Issue` and `CreateIssueInput` |
| `packages/shared/src/types/events.ts` | Add `workflow.*` events to `ServerEventMap` |
| `packages/shared/src/types/index.ts` | Re-export workflow types |
| `packages/server/src/agents/issue-agent-runner.ts` | Add workflow branch in `runIssueAutomation()` |
| `packages/server/src/agents/issue-task-controller.ts` | Add `createTasksFromWorkflow()` function |
| `packages/server/src/app.ts` | Register workflow routes |
| `packages/web/src/components/issue/create-issue-dialog.tsx` | Add workflow template selector |
| `packages/web/src/components/issue/edit-issue-dialog.tsx` | Add workflow template display/change |
| `packages/web/src/components/layout/workspace-shell.tsx` | Add Workflows tab to FlexLayout |

---

## Phase 1: Shared Types + Backend Storage & API

### Task 1: Create workflow type definitions

**Files:**
- Create: `packages/shared/src/types/workflow.ts`
- Modify: `packages/shared/src/types/index.ts`
- Modify: `packages/shared/src/types/issue.ts`
- Modify: `packages/shared/src/types/events.ts`

- [ ] **Step 1: Create workflow.ts type definitions**

```typescript
// packages/shared/src/types/workflow.ts

import type { AgentConfig } from './workspace.js';

export interface WorkflowTemplate {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  viewport?: { x: number; y: number; zoom: number };
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowNode {
  id: string;
  type: 'agent';
  position: { x: number; y: number };
  data: {
    label: string;
    agentConfigId: string;
    role: AgentConfig['role'];
    avatarUrl?: string;
    modelId?: string;
    taskTitleTemplate?: string;
    taskDescriptionTemplate?: string;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}
```

- [ ] **Step 2: Add workflowId to Issue and CreateIssueInput in issue.ts**

In `packages/shared/src/types/issue.ts`:
- Add `workflowId?: string` to the `Issue` interface (after `members` field)
- Add `workflowId?: string` to `CreateIssueInput` interface

In `packages/web/src/stores/issue.ts`:
- Add `workflowId?: string | null` to the `UpdateIssueInput` interface (matching the `onSave` prop shape from `edit-issue-dialog.tsx`)

- [ ] **Step 3: Add workflow events to ServerEventMap in events.ts**

In `packages/shared/src/types/events.ts`, add inside `ServerEventMap`:

```typescript
'workflow.created': { workspaceId: string; workflow: WorkflowTemplate };
'workflow.updated': { workspaceId: string; workflow: WorkflowTemplate };
'workflow.deleted': { workspaceId: string; workflowId: string };
```

Add import at top: `import type { WorkflowTemplate } from './workflow.js';`

- [ ] **Step 4: Re-export workflow types from index.ts**

In `packages/shared/src/types/index.ts`, add to the re-export list:

```typescript
export * from './workflow.js';
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types/
git commit -m "feat(workflow): add WorkflowTemplate type definitions and Issue extension"
```

---

### Task 2: Create workflow storage layer

**Files:**
- Create: `packages/server/src/storage/workflow-store.ts`

- [ ] **Step 1: Create workflow-store.ts following issue-store.ts pattern**

```typescript
// packages/server/src/storage/workflow-store.ts
// NOTE: All functions are synchronous to match json-store.ts and issue-store.ts patterns

import type { WorkflowTemplate } from '@agent-spaces/shared';
import { ensureDir, readJsonFile, writeJsonFile, deleteFile, getDataDir } from './json-store.js';
import path from 'node:path';

function workflowsDir(workspaceId: string) {
  return path.join(getDataDir(), 'workspaces', workspaceId, 'workflows');
}

function workflowsIndex(workspaceId: string) {
  return path.join(workflowsDir(workspaceId), 'index.json');
}

function workflowFile(workspaceId: string, workflowId: string) {
  return path.join(workflowsDir(workspaceId), `${workflowId}.json`);
}

export function listWorkflows(workspaceId: string): WorkflowTemplate[] {
  return readJsonFile<WorkflowTemplate[]>(workflowsIndex(workspaceId)) ?? [];
}

export function getWorkflow(workspaceId: string, workflowId: string): WorkflowTemplate | null {
  return readJsonFile<WorkflowTemplate>(workflowFile(workspaceId, workflowId));
}

export function createWorkflow(workspaceId: string, workflow: WorkflowTemplate): void {
  ensureDir(workflowsDir(workspaceId));
  writeJsonFile(workflowFile(workspaceId, workflow.id), workflow);
  const index = listWorkflows(workspaceId);
  index.push(workflow);
  writeJsonFile(workflowsIndex(workspaceId), index);
}

export function updateWorkflow(workspaceId: string, workflow: WorkflowTemplate): void {
  writeJsonFile(workflowFile(workspaceId, workflow.id), workflow);
  const index = listWorkflows(workspaceId);
  const idx = index.findIndex(w => w.id === workflow.id);
  if (idx !== -1) index[idx] = workflow;
  writeJsonFile(workflowsIndex(workspaceId), index);
}

export function deleteWorkflow(workspaceId: string, workflowId: string): void {
  deleteFile(workflowFile(workspaceId, workflowId));
  const index = listWorkflows(workspaceId);
  writeJsonFile(workflowsIndex(workspaceId), index.filter(w => w.id !== workflowId));
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/storage/workflow-store.ts
git commit -m "feat(workflow): add workflow JSON storage layer"
```

---

### Task 3: Create workflow service (business logic)

**Files:**
- Create: `packages/server/src/services/workflow.ts`

- [ ] **Step 1: Create workflow service with DAG validation and agent resolution**

```typescript
// packages/server/src/services/workflow.ts
// NOTE: All storage functions are synchronous (matching json-store pattern).
//       Service functions are also synchronous where they only call sync storage.
//       Route handlers wrap in async for Express compatibility.

import { v4 as uuid } from 'uuid';
import type { WorkflowTemplate, WorkflowNode, WorkflowEdge, AgentConfig } from '@agent-spaces/shared';
import * as workflowStore from '../storage/workflow-store.js';
import { getWorkspace } from '../storage/workspace-store.js';

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

  return null; // valid
}

// --- Role Staleness Resolution ---

function resolveStaleRoles(workspaceId: string, nodes: WorkflowNode[]): { nodes: WorkflowNode[]; invalidIds: string[] } {
  const workspace = getWorkspace(workspaceId);
  const agentMap = new Map(workspace?.agents.map(a => [a.id, a]) ?? []);
  const invalidIds: string[] = [];

  const resolved = nodes.map(node => {
    const agent = agentMap.get(node.data.agentConfigId);
    if (!agent) {
      invalidIds.push(node.id);
      return node;
    }
    // Re-resolve role, avatarUrl, modelId from current preset
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

export function listWorkflows(workspaceId: string): WorkflowTemplate[] {
  return workflowStore.listWorkflows(workspaceId);
}

export function getWorkflow(workspaceId: string, workflowId: string): WorkflowTemplate | null {
  return workflowStore.getWorkflow(workspaceId, workflowId);
}

export function createWorkflow(
  workspaceId: string,
  input: { name: string; description?: string; nodes?: WorkflowNode[]; edges?: WorkflowEdge[]; viewport?: WorkflowTemplate['viewport'] }
): WorkflowTemplate {
  const now = new Date().toISOString();
  const nodes = input.nodes ?? [];
  const edges = input.edges ?? [];

  // Resolve stale roles
  const { nodes: resolvedNodes, invalidIds } = resolveStaleRoles(workspaceId, nodes);
  if (invalidIds.length > 0) {
    throw new Error(`Invalid agent references in nodes: ${invalidIds.join(', ')}`);
  }

  const template: WorkflowTemplate = {
    id: uuid(),
    workspaceId,
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

  workflowStore.createWorkflow(workspaceId, template);
  return template;
}

export function updateWorkflow(
  workspaceId: string,
  workflowId: string,
  updates: Partial<Pick<WorkflowTemplate, 'name' | 'description' | 'nodes' | 'edges' | 'viewport'>>
): WorkflowTemplate {
  const existing = workflowStore.getWorkflow(workspaceId, workflowId);
  if (!existing) throw new Error('Workflow not found');

  let nodes = updates.nodes ?? existing.nodes;

  // Resolve stale roles if nodes are being updated
  if (updates.nodes) {
    const resolved = resolveStaleRoles(workspaceId, updates.nodes);
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
    workspaceId: existing.workspaceId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  if (updates.nodes || updates.edges) {
    const error = validateDAG(updated);
    if (error) throw new Error(error);
  }

  workflowStore.updateWorkflow(workspaceId, updated);
  return updated;
}

export function deleteWorkflow(workspaceId: string, workflowId: string): void {
  const existing = workflowStore.getWorkflow(workspaceId, workflowId);
  if (!existing) throw new Error('Workflow not found');
  workflowStore.deleteWorkflow(workspaceId, workflowId);
}

export function duplicateWorkflow(workspaceId: string, workflowId: string): WorkflowTemplate {
  const existing = workflowStore.getWorkflow(workspaceId, workflowId);
  if (!existing) throw new Error('Workflow not found');

  const now = new Date().toISOString();
  const duplicated: WorkflowTemplate = {
    ...existing,
    id: uuid(),
    name: `${existing.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
  };

  workflowStore.createWorkflow(workspaceId, duplicated);
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
  // Build reverse adjacency: for each node, which nodes point to it (its dependencies)
  const dependsOn = new Map<string, string[]>();
  for (const node of template.nodes) {
    dependsOn.set(node.id, []);
  }
  for (const edge of template.edges) {
    dependsOn.get(edge.target)?.push(edge.source);
  }

  return template.nodes.map(node => ({
    key: node.id,
    title: node.data.taskTitleTemplate || `Execute ${node.data.label}`,
    description: node.data.taskDescriptionTemplate || `Task assigned to ${node.data.label} (${node.data.role})`,
    agentConfigId: node.data.agentConfigId,
    dependsOnKeys: dependsOn.get(node.id)?.length ? dependsOn.get(node.id) : undefined,
    sandboxDirs: undefined,
  }));
}

// --- Run-time Validation ---

export function validateWorkflowForRun(workspaceId: string, template: WorkflowTemplate, memberAgentIds: Set<string>): string | null {
  const workspace = getWorkspace(workspaceId);
  const agentMap = new Map(workspace?.agents.map(a => [a.id, a]) ?? []);

  for (const node of template.nodes) {
    const agent = agentMap.get(node.data.agentConfigId);
    if (!agent) return `Agent "${node.data.label}" (${node.data.agentConfigId}) no longer exists`;
    if (!agent.enabled) return `Agent "${agent.name}" is disabled`;
    if (!memberAgentIds.has(node.data.agentConfigId)) return `Agent "${agent.name}" is not in the issue channel members`;
  }

  return null; // valid
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/services/workflow.ts
git commit -m "feat(workflow): add workflow service with DAG validation and task mapping"
```

---

### Task 4: Create workflow REST API routes

**Files:**
- Create: `packages/server/src/routes/workflow.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Create workflow routes following issue.ts pattern**

```typescript
// packages/server/src/routes/workflow.ts

import { Router } from 'express';
import * as workflowService from '../services/workflow.js';
import { broadcastToWorkspace } from '../ws/handler.js';

const router = Router({ mergeParams: true });

// List workflows
router.get('/', async (req, res) => {
  try {
    const { id: workspaceId } = req.params;
    const workflows = await workflowService.listWorkflows(workspaceId);
    res.json(workflows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get workflow
router.get('/:workflowId', async (req, res) => {
  try {
    const { id: workspaceId, workflowId } = req.params;
    const workflow = await workflowService.getWorkflow(workspaceId, workflowId);
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }
    res.json(workflow);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create workflow
router.post('/', async (req, res) => {
  try {
    const { id: workspaceId } = req.params;
    const workflow = await workflowService.createWorkflow(workspaceId, req.body);
    broadcastToWorkspace(workspaceId, 'workflow.created', { workspaceId, workflow });
    res.status(201).json(workflow);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update workflow
router.put('/:workflowId', async (req, res) => {
  try {
    const { id: workspaceId, workflowId } = req.params;
    const workflow = await workflowService.updateWorkflow(workspaceId, workflowId, req.body);
    broadcastToWorkspace(workspaceId, 'workflow.updated', { workspaceId, workflow });
    res.json(workflow);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Delete workflow
router.delete('/:workflowId', async (req, res) => {
  try {
    const { id: workspaceId, workflowId } = req.params;
    await workflowService.deleteWorkflow(workspaceId, workflowId);
    broadcastToWorkspace(workspaceId, 'workflow.deleted', { workspaceId, workflowId });
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Duplicate workflow
router.post('/:workflowId/duplicate', async (req, res) => {
  try {
    const { id: workspaceId, workflowId } = req.params;
    const workflow = await workflowService.duplicateWorkflow(workspaceId, workflowId);
    broadcastToWorkspace(workspaceId, 'workflow.created', { workspaceId, workflow });
    res.status(201).json(workflow);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
```

- [ ] **Step 2: Register workflow routes in app.ts**

In `packages/server/src/app.ts`:

Add import:
```typescript
import workflowRouter from './routes/workflow.js';
```

Add route (after the existing `app.use('/api/workspaces/:id/issues', issueRouter);` line):
```typescript
app.use('/api/workspaces/:id/workflows', workflowRouter);
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/routes/workflow.ts packages/server/src/app.ts
git commit -m "feat(workflow): add workflow REST API routes"
```

---

## Phase 2: Backend Execution Engine Integration

### Task 5: Add workflow branch to issue-agent-runner

**Files:**
- Modify: `packages/server/src/agents/issue-agent-runner.ts`

- [ ] **Step 1: Add workflow branch in runIssueAutomation**

In `packages/server/src/agents/issue-agent-runner.ts`, modify `runIssueAutomation()`:

Add import at top:
```typescript
import * as workflowService from '../services/workflow.js';
import { createTasksFromWorkflow } from './issue-task-controller.js';
```

Inside `runIssueAutomation()`, at the beginning of the function body (after getting issue and workspace), add the workflow branch BEFORE the existing planner/sync logic:

```typescript
// Workflow template branch
if (issue.workflowId) {
  const template = workflowService.getWorkflow(workspaceId, issue.workflowId);
  if (template) {
    try {
      createTasksFromWorkflow(workspaceId, issueId, template, ctx);
      return;
    } catch (err: any) {
      // Workflow execution failed -- fall back to hardcoded pipeline
      console.warn(`Workflow execution failed for issue ${issueId}: ${err.message}. Falling back to hardcoded pipeline.`);
    }
  } else {
    console.warn(`Workflow template ${issue.workflowId} not found, falling back to hardcoded pipeline`);
  }
}
```

The existing planner/sync logic remains unchanged as the fallback path.

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/agents/issue-agent-runner.ts
git commit -m "feat(workflow): add workflow template branch to issue automation runner"
```

---

### Task 6: Add createTasksFromWorkflow to issue-task-controller

**Files:**
- Modify: `packages/server/src/agents/issue-task-controller.ts`

**IMPORTANT:** The existing `replaceIssueTasksFromDrafts()` is a non-exported function (line 356) with signature `(workspaceId, issueId, ctx: AgentContext, drafts: TaskDraft[]): Task[]`. We must either:
  - **Option A (recommended):** Export `replaceIssueTasksFromDrafts` by adding `export` keyword
  - **Option B:** Inline the logic in `createTasksFromWorkflow`

This plan uses Option A.

- [ ] **Step 1: Export replaceIssueTasksFromDrafts**

In `packages/server/src/agents/issue-task-controller.ts`:
- Change `function replaceIssueTasksFromDrafts(` to `export function replaceIssueTasksFromDrafts(` (line 356)

- [ ] **Step 2: Add createTasksFromWorkflow function**

Add a new exported function after `replaceIssueTasksFromDrafts()`:

```typescript
export function createTasksFromWorkflow(
  workspaceId: string,
  issueId: string,
  template: WorkflowTemplate,
  ctx: AgentContext
): void {
  const { mapWorkflowToTaskDrafts, validateWorkflowForRun } = require('../services/workflow.js') as typeof import('../services/workflow.js');

  // Map template to task drafts (synchronous)
  const drafts = mapWorkflowToTaskDrafts(template);

  // Set issue status to 'planned' briefly
  const issue = requireIssue(workspaceId, issueId);

  // Validate all agents exist, are enabled, and are in channel members
  const channel = channelService.getByIssueId(workspaceId, issueId);
  const memberAgentIds = new Set(channel?.members ?? []);
  const validationError = validateWorkflowForRun(workspaceId, template, memberAgentIds);
  if (validationError) {
    throw new Error(`Workflow validation failed: ${validationError}`);
  }

  issueService.updateStatus(workspaceId, issueId, 'planned');
  ctx.broadcast('issue.status_changed', {
    issueId,
    oldStatus: issue.status,
    newStatus: 'planned',
  });

  // Use existing replaceIssueTasksFromDrafts (now exported) -- note: ctx is 3rd param
  replaceIssueTasksFromDrafts(workspaceId, issueId, ctx, drafts);

  // Set issue status to 'in_progress'
  issueService.updateStatus(workspaceId, issueId, 'in_progress');
  ctx.broadcast('issue.status_changed', {
    issueId,
    oldStatus: 'planned',
    newStatus: 'in_progress',
  });
  ctx.broadcast('issue.updated', issueService.getById(workspaceId, issueId));

  // Start scheduling (synchronous)
  scheduleRunnableIssueTasks(workspaceId, issueId, ctx);
}
```

Add import at top:
```typescript
import type { WorkflowTemplate } from '@agent-spaces/shared';
```

Note: `requireIssue` and `issueService` are already imported in this file. `channelService` may need to be imported if not already available -- check existing imports and add `import * as channelService from '../services/channel.js';` if needed.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/agents/issue-task-controller.ts
git commit -m "feat(workflow): add createTasksFromWorkflow to map templates to tasks"
```

---

### Task 7: Pass workflowId through issue creation

**Files:**
- Modify: `packages/server/src/routes/issue.ts`

- [ ] **Step 1: Add workflowId to issue creation**

In `packages/server/src/routes/issue.ts`, find the `POST /` handler (create issue). When constructing the issue data for `issueService.create()`, pass `workflowId` from `req.body.workflowId`:

Add `workflowId: req.body.workflowId` to the issue creation call.

Also in the `PUT /:issueId` handler, pass `workflowId` from `req.body.workflowId` when calling the issue update.

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/routes/issue.ts
git commit -m "feat(workflow): pass workflowId through issue create/update routes"
```

---

## Phase 3: Frontend Workflow Store + Components

### Task 8: Install xyflow and dagre dependencies

**Files:**
- Modify: `packages/web/package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd packages/web && pnpm add @xyflow/react @dagrejs/dagre
# Note: pnpm-lock.yaml is at the monorepo root, not in packages/web/
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/package.json pnpm-lock.yaml
git commit -m "feat(workflow): add @xyflow/react and @dagrejs/dagre dependencies"
```

---

### Task 9: Create workflow Zustand store

**Files:**
- Create: `packages/web/src/stores/workflow.ts`

- [ ] **Step 1: Create workflow store following issue.ts pattern**

```typescript
// packages/web/src/stores/workflow.ts

import { create } from 'zustand';
import type { WorkflowTemplate, WorkflowNode, WorkflowEdge } from '@agent-spaces/shared';
import { useWorkspaceStore } from './workspace';
import { useSocketStore } from './socket';

interface WorkflowStore {
  workflows: WorkflowTemplate[];
  currentWorkflow: WorkflowTemplate | null;
  isLoading: boolean;

  loadWorkflows: (workspaceId: string) => Promise<void>;
  createWorkflow: (workspaceId: string, data: { name: string; description?: string }) => Promise<WorkflowTemplate>;
  updateWorkflow: (workspaceId: string, id: string, data: Partial<Pick<WorkflowTemplate, 'name' | 'description' | 'nodes' | 'edges' | 'viewport'>>) => Promise<void>;
  deleteWorkflow: (workspaceId: string, id: string) => Promise<void>;
  duplicateWorkflow: (workspaceId: string, id: string) => Promise<void>;
  setCurrentWorkflow: (workflow: WorkflowTemplate | null) => void;

  upsertWorkflow: (workflow: WorkflowTemplate) => void;
  removeWorkflow: (id: string) => void;
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  workflows: [],
  currentWorkflow: null,
  isLoading: false,

  loadWorkflows: async (workspaceId) => {
    set({ isLoading: true });
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/workflows`);
      const workflows: WorkflowTemplate[] = await res.json();
      set({ workflows, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createWorkflow: async (workspaceId, data) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const workflow: WorkflowTemplate = await res.json();
    set(state => ({ workflows: [...state.workflows, workflow] }));
    return workflow;
  },

  updateWorkflow: async (workspaceId, id, data) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/workflows/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const workflow: WorkflowTemplate = await res.json();
    get().upsertWorkflow(workflow);
  },

  deleteWorkflow: async (workspaceId, id) => {
    await fetch(`/api/workspaces/${workspaceId}/workflows/${id}`, { method: 'DELETE' });
    get().removeWorkflow(id);
  },

  duplicateWorkflow: async (workspaceId, id) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/workflows/${id}/duplicate`, {
      method: 'POST',
    });
    const workflow: WorkflowTemplate = await res.json();
    set(state => ({ workflows: [...state.workflows, workflow] }));
  },

  setCurrentWorkflow: (workflow) => set({ currentWorkflow: workflow }),

  upsertWorkflow: (workflow) => {
    set(state => {
      const idx = state.workflows.findIndex(w => w.id === workflow.id);
      if (idx !== -1) {
        const updated = [...state.workflows];
        updated[idx] = workflow;
        return { workflows: updated };
      }
      return { workflows: [...state.workflows, workflow] };
    });
  },

  removeWorkflow: (id) => {
    set(state => ({
      workflows: state.workflows.filter(w => w.id !== id),
      currentWorkflow: state.currentWorkflow?.id === id ? null : state.currentWorkflow,
    }));
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/stores/workflow.ts
git commit -m "feat(workflow): add workflow Zustand store"
```

---

### Task 10: Create custom xyflow Agent node component

**Files:**
- Create: `packages/web/src/components/workflow/workflow-agent-node.tsx`

- [ ] **Step 1: Create the custom node component**

```tsx
// packages/web/src/components/workflow/workflow-agent-node.tsx

'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '@agent-spaces/shared';
import { Badge } from '@/components/ui/badge';
import { AgentIcon } from '@/components/agent-icon';

const ROLE_COLORS: Record<string, string> = {
  scheduler: 'bg-blue-100 text-blue-700 border-blue-200',
  planner: 'bg-purple-100 text-purple-700 border-purple-200',
  executor: 'bg-green-100 text-green-700 border-green-200',
  reviewer: 'bg-orange-100 text-orange-700 border-orange-200',
  commit: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  custom: 'bg-pink-100 text-pink-700 border-pink-200',
  bot: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

function WorkflowAgentNodeComponent({ data, selected }: NodeProps<WorkflowNode>) {
  const roleColor = ROLE_COLORS[data.role] || 'bg-gray-100 text-gray-700 border-gray-200';

  return (
    <div className={`
      rounded-lg border-2 bg-card p-3 shadow-sm min-w-[160px]
      transition-colors duration-150
      ${selected ? 'border-primary ring-2 ring-primary/20' : 'border-border'}
    `}>
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-muted-foreground/40 !border-2 !border-background hover:!bg-primary"
      />

      <div className="flex items-center gap-2.5">
        <AgentIcon
          avatarUrl={data.avatarUrl}
          name={data.label}
          size="sm"
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{data.label}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${roleColor}`}>
              {data.role}
            </Badge>
            {data.modelId && (
              <span className="text-[10px] text-muted-foreground truncate">{data.modelId}</span>
            )}
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-muted-foreground/40 !border-2 !border-background hover:!bg-primary"
      />
    </div>
  );
}

export const WorkflowAgentNode = memo(WorkflowAgentNodeComponent);
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/workflow/workflow-agent-node.tsx
git commit -m "feat(workflow): add custom xyflow agent node component"
```

---

### Task 11: Create workflow agent palette

**Files:**
- Create: `packages/web/src/components/workflow/workflow-agent-palette.tsx`

- [ ] **Step 1: Create the agent palette panel**

```tsx
// packages/web/src/components/workflow/workflow-agent-palette.tsx

'use client';

import { useAgentStore } from '@/stores/agent';
import { useWorkspaceStore } from '@/stores/workspace';
import { AgentIcon } from '@/components/agent-icon';
import type { AgentConfig } from '@agent-spaces/shared';

const ROLE_LABELS: Record<string, string> = {
  planner: 'Planner',
  executor: 'Executor',
  reviewer: 'Reviewer',
  commit: 'Commit',
  custom: 'Custom',
  bot: 'Bot',
  scheduler: 'Scheduler',
};

function groupByRole(agents: AgentConfig[]): Record<string, AgentConfig[]> {
  const groups: Record<string, AgentConfig[]> = {};
  for (const agent of agents) {
    if (!agent.enabled) continue;
    const role = agent.role || 'custom';
    if (!groups[role]) groups[role] = [];
    groups[role].push(agent);
  }
  return groups;
}

export function WorkflowAgentPalette() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId);
  const agents = useAgentStore(s => s.agents);
  const grouped = groupByRole(agents);

  const onDragStart = (event: React.DragEvent, agent: AgentConfig) => {
    event.dataTransfer.setData('application/json', JSON.stringify(agent));
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-56 border-r bg-muted/30 p-3 overflow-y-auto">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">
        Agents
      </h3>

      {Object.entries(grouped).map(([role, roleAgents]) => (
        <div key={role} className="mb-3">
          <div className="text-[10px] font-medium uppercase text-muted-foreground/60 mb-1.5">
            {ROLE_LABELS[role] || role}
          </div>
          {roleAgents.map(agent => (
            <div
              key={agent.id}
              draggable
              onDragStart={(e) => onDragStart(e, agent)}
              className="flex items-center gap-2 p-2 rounded-md bg-card border cursor-grab active:cursor-grabbing hover:bg-accent/50 transition-colors mb-1"
            >
              <AgentIcon avatarUrl={agent.avatarUrl} name={agent.name} size="sm" />
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{agent.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {agent.modelId || agent.runtimeKind || agent.role}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}

      {agents.filter(a => a.enabled).length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No agents configured. Add agents first.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/workflow/workflow-agent-palette.tsx
git commit -m "feat(workflow): add agent palette for drag-and-drop"
```

---

### Task 12: Create workflow toolbar

**Files:**
- Create: `packages/web/src/components/workflow/workflow-toolbar.tsx`

- [ ] **Step 1: Create the toolbar component**

```tsx
// packages/web/src/components/workflow/workflow-toolbar.tsx

'use client';

import { Button } from '@/components/ui/button';
import { Download, LayoutGrid, Save, Trash2, Copy } from 'lucide-react';

interface WorkflowToolbarProps {
  onSave: () => void;
  onAutoLayout: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onExport: () => void;
  isDirty: boolean;
  isSaving: boolean;
}

export function WorkflowToolbar({
  onSave,
  onAutoLayout,
  onDelete,
  onDuplicate,
  onExport,
  isDirty,
  isSaving,
}: WorkflowToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-t bg-card px-4 py-2">
      <Button
        variant="outline"
        size="sm"
        onClick={onAutoLayout}
        title="Auto Layout"
      >
        <LayoutGrid className="h-4 w-4 mr-1" />
        Auto Layout
      </Button>

      <div className="flex-1" />

      {onDuplicate && (
        <Button variant="ghost" size="sm" onClick={onDuplicate} title="Duplicate">
          <Copy className="h-4 w-4" />
        </Button>
      )}

      <Button variant="ghost" size="sm" onClick={onExport} title="Export JSON">
        <Download className="h-4 w-4" />
      </Button>

      {onDelete && (
        <Button variant="ghost" size="sm" onClick={onDelete} title="Delete" className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      )}

      <Button size="sm" onClick={onSave} disabled={!isDirty || isSaving}>
        <Save className="h-4 w-4 mr-1" />
        {isSaving ? 'Saving...' : 'Save'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/workflow/workflow-toolbar.tsx
git commit -m "feat(workflow): add workflow editor toolbar"
```

---

### Task 13: Create xyflow workflow canvas

**Files:**
- Create: `packages/web/src/components/workflow/workflow-canvas.tsx`

- [ ] **Step 1: Create the canvas component with dagre auto-layout and drag-and-drop**

```tsx
// packages/web/src/components/workflow/workflow-canvas.tsx

'use client';

import { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  useReactFlow,
  BackgroundVariant,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Dagre from '@dagrejs/dagre';
import type { WorkflowNode, WorkflowEdge, AgentConfig } from '@agent-spaces/shared';
import { WorkflowAgentNode } from './workflow-agent-node';

const nodeTypes = { agent: WorkflowAgentNode };

interface WorkflowCanvasProps {
  nodes: Node<WorkflowNode['data']>[];
  edges: Edge[];
  onNodesChange: OnNodesChange<Node<WorkflowNode['data']>>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onNodeAdd?: (node: Node<WorkflowNode['data']>) => void;
}

// NOTE: dagre Graph instances are created fresh inside functions to avoid state pollution

export function WorkflowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeAdd,
}: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const agentJson = event.dataTransfer.getData('application/json');
      if (!agentJson) return;

      const agent: AgentConfig = JSON.parse(agentJson);
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node<WorkflowNode['data']> = {
        id: `node-${Date.now()}`,
        type: 'agent',
        position,
        data: {
          label: agent.name,
          agentConfigId: agent.id,
          role: agent.role,
          avatarUrl: agent.avatarUrl,
          modelId: agent.modelId,
        },
      };

      onNodeAdd?.(newNode);
    },
    [screenToFlowPosition, onNodeAdd]
  );

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        deleteKeyCode={['Backspace', 'Delete']}
        connectionLineStyle={{ strokeWidth: 2 }}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
          style: { strokeWidth: 2 },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={15} size={1} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          pannable
          zoomable
          className="!bg-muted"
        />
      </ReactFlow>
    </div>
  );
}

// Auto-layout utility using dagre -- creates fresh Graph each call
export function getAutoLayoutedNodes(
  nodes: Node<WorkflowNode['data'>[],
  edges: Edge[]
): Node<WorkflowNode['data']>[] {
  const g = new Dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 100 });

  for (const node of nodes) {
    g.setNode(node.id, { width: 180, height: 80 });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  Dagre.layout(g);

  return nodes.map(node => {
    const dagreNode = g.node(node.id);
    return {
      ...node,
      position: {
        x: dagreNode.x - 90,
        y: dagreNode.y - 40,
      },
    };
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/workflow/workflow-canvas.tsx
git commit -m "feat(workflow): add xyflow canvas with dagre auto-layout and drag-and-drop"
```

---

### Task 14: Create workflow mini preview component

**Files:**
- Create: `packages/web/src/components/workflow/workflow-mini-preview.tsx`

- [ ] **Step 1: Create the mini preview for list cards**

```tsx
// packages/web/src/components/workflow/workflow-mini-preview.tsx

'use client';

import { memo } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { WorkflowTemplate, WorkflowNode } from '@agent-spaces/shared';
import Dagre from '@dagrejs/dagre';

// Simplified mini node - no interactivity
function MiniNode({ data }: { data: WorkflowNode['data'] }) {
  return (
    <div className="rounded-md border bg-card px-2 py-1 text-[8px] truncate w-full">
      {data.label}
    </div>
  );
}

const miniNodeTypes: NodeTypes = {
  agent: MiniNode,
};


function layoutNodes(template: WorkflowTemplate): { nodes: Node[]; edges: Edge[] } {
  const g = new Dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 20, ranksep: 40 });

  const nodes: Node[] = template.nodes.map(n => ({
    id: n.id,
    type: 'agent',
    position: n.position,
    data: n.data,
  }));

  const edges: Edge[] = template.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
  }));

  for (const node of nodes) {
    g.setNode(node.id, { width: 80, height: 24 });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  Dagre.layout(g);

  const layoutedNodes = nodes.map(node => {
    const dagreNode = g.node(node.id);
    return {
      ...node,
      position: { x: dagreNode.x - 40, y: dagreNode.y - 12 },
    };
  });

  return { nodes: layoutedNodes, edges };
}

interface WorkflowMiniPreviewProps {
  template: WorkflowTemplate;
}

export const WorkflowMiniPreview = memo(function WorkflowMiniPreview({ template }: WorkflowMiniPreviewProps) {
  if (template.nodes.length === 0) {
    return (
      <div className="h-24 flex items-center justify-center text-xs text-muted-foreground bg-muted/30 rounded">
        Empty workflow
      </div>
    );
  }

  const { nodes, edges } = layoutNodes(template);

  return (
    <div className="h-24 w-full pointer-events-none">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={miniNodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        panOnScroll={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={10} size={0.5} />
      </ReactFlow>
    </div>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/workflow/workflow-mini-preview.tsx
git commit -m "feat(workflow): add mini preview for workflow list cards"
```

---

### Task 15: Create workflow editor page

**Files:**
- Create: `packages/web/src/components/workflow/workflow-editor.tsx`

- [ ] **Step 1: Create the main editor page assembling all components**

```tsx
// packages/web/src/components/workflow/workflow-editor.tsx

'use client';

import { useState, useCallback } from 'react';
import {
  ReactFlowProvider,
  useReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import type { WorkflowTemplate, WorkflowNode } from '@agent-spaces/shared';
import { useWorkspaceStore } from '@/stores/workspace';
import { useWorkflowStore } from '@/stores/workflow';
import { WorkflowCanvas, getAutoLayoutedNodes } from './workflow-canvas';
import { WorkflowAgentPalette } from './workflow-agent-palette';
import { WorkflowToolbar } from './workflow-toolbar';
import { Input } from '@/components/ui/input';

type WorkflowNodeData = WorkflowNode['data'];

function WorkflowEditorInner({ template, onBack }: { template: WorkflowTemplate | null; onBack: () => void }) {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId);
  const { updateWorkflow, createWorkflow } = useWorkflowStore();

  const [name, setName] = useState(template?.name ?? 'New Workflow');
  const [description, setDescription] = useState(template?.description ?? '');
  const [nodes, setNodes] = useState<Node<WorkflowNodeData>[]>(
    () => template?.nodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data })) ?? []
  );
  const [edges, setEdges] = useState<Edge[]>(
    () => template?.edges.map(e => ({ id: e.id, source: e.source, target: e.target, type: 'smoothstep' as const })) ?? []
  );
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const templateId = template?.id;

  const markDirty = useCallback(() => setIsDirty(true), []);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<WorkflowNodeData>>[]) => {
      setNodes(nds => applyNodeChanges(changes, nds));
      markDirty();
    },
    [markDirty]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges(eds => applyEdgeChanges(changes, eds));
      markDirty();
    },
    [markDirty]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges(eds => addEdge({ ...connection, type: 'smoothstep' }, eds));
      markDirty();
    },
    [markDirty]
  );

  const onNodeAdd = useCallback(
    (node: Node<WorkflowNodeData>) => {
      setNodes(nds => [...nds, node]);
      markDirty();
    },
    [markDirty]
  );

  const handleAutoLayout = useCallback(() => {
    setNodes(nds => getAutoLayoutedNodes(nds, edges));
    markDirty();
  }, [edges, markDirty]);

  const handleSave = useCallback(async () => {
    if (!workspaceId) return;
    setIsSaving(true);
    try {
      const workflowNodes: WorkflowNode[] = nodes.map(n => ({
        id: n.id,
        type: 'agent',
        position: n.position,
        data: n.data,
      }));
      const workflowEdges = edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
      }));

      if (templateId) {
        await updateWorkflow(workspaceId, templateId, {
          name,
          description: description || undefined,
          nodes: workflowNodes,
          edges: workflowEdges,
        });
      } else {
        const created = await createWorkflow(workspaceId, {
          name,
          description: description || undefined,
          nodes: workflowNodes,
          edges: workflowEdges,
        });
        // After creating new, we could navigate to edit mode
      }
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  }, [workspaceId, templateId, name, description, nodes, edges, updateWorkflow, createWorkflow]);

  const handleExport = useCallback(() => {
    const data = {
      name,
      description,
      nodes: nodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
      edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [name, description, nodes, edges]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back
        </button>
        <Input
          value={name}
          onChange={(e) => { setName(e.target.value); markDirty(); }}
          className="h-8 text-sm font-medium border-0 shadow-none focus-visible:ring-0 px-1"
          placeholder="Workflow name"
        />
        <span className="text-xs text-muted-foreground">
          {nodes.length} agent{nodes.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Body: palette + canvas */}
      <div className="flex flex-1 min-h-0">
        <WorkflowAgentPalette />
        <WorkflowCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeAdd={onNodeAdd}
        />
      </div>

      {/* Toolbar */}
      <WorkflowToolbar
        onSave={handleSave}
        onAutoLayout={handleAutoLayout}
        onDelete={templateId ? () => { /* TODO: confirm delete */ } : undefined}
        onDuplicate={templateId ? () => { /* TODO: duplicate */ } : undefined}
        onExport={handleExport}
        isDirty={isDirty}
        isSaving={isSaving}
      />
    </div>
  );
}

export function WorkflowEditor({ template, onBack }: { template: WorkflowTemplate | null; onBack: () => void }) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner template={template} onBack={onBack} />
    </ReactFlowProvider>
  );
}
```

**Note:** The import order in this file needs cleanup during implementation -- the `applyNodeChanges`, `applyEdgeChanges`, `addEdge` and type imports should be consolidated with the other `@xyflow/react` imports at the top of the file.

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/workflow/workflow-editor.tsx
git commit -m "feat(workflow): add workflow editor page"
```

---

### Task 16: Create workflow list page

**Files:**
- Create: `packages/web/src/components/workflow/workflow-list.tsx`

- [ ] **Step 1: Create the workflow list page with card grid**

```tsx
// packages/web/src/components/workflow/workflow-list.tsx

'use client';

import { useEffect, useState } from 'react';
import type { WorkflowTemplate } from '@agent-spaces/shared';
import { useWorkspaceStore } from '@/stores/workspace';
import { useWorkflowStore } from '@/stores/workflow';
import { WorkflowMiniPreview } from './workflow-mini-preview';
import { WorkflowEditor } from './workflow-editor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Plus, Pencil, Copy, Trash2 } from 'lucide-react';

export function WorkflowList() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId);
  const { workflows, loadWorkflows, deleteWorkflow, duplicateWorkflow, setCurrentWorkflow } = useWorkflowStore();
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowTemplate | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  useEffect(() => {
    if (workspaceId) loadWorkflows(workspaceId);
  }, [workspaceId, loadWorkflows]);

  if (editingWorkflow || creatingNew) {
    return (
      <WorkflowEditor
        template={editingWorkflow}
        onBack={() => { setEditingWorkflow(null); setCreatingNew(false); }}
      />
    );
  }

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Workflow Templates</h2>
          <p className="text-sm text-muted-foreground">
            Create reusable agent team workflows for issue automation
          </p>
        </div>
        <Button onClick={() => setCreatingNew(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Workflow
        </Button>
      </div>

      {workflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p className="text-sm mb-2">No workflow templates yet</p>
          <Button variant="outline" onClick={() => setCreatingNew(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Create your first workflow
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map(workflow => (
            <Card key={workflow.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <WorkflowMiniPreview template={workflow} />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{workflow.name}</CardTitle>
                {workflow.description && (
                  <CardDescription className="text-xs">{workflow.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {workflow.nodes.length} agent{workflow.nodes.length !== 1 ? 's' : ''}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditingWorkflow(workflow)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => workspaceId && duplicateWorkflow(workspaceId, workflow.id)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => workspaceId && deleteWorkflow(workspaceId, workflow.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/workflow/workflow-list.tsx
git commit -m "feat(workflow): add workflow list page with card grid"
```

---

## Phase 4: Frontend Issue Dialog Integration

### Task 17: Add workflow template selector to CreateIssueDialog

**Files:**
- Modify: `packages/web/src/components/issue/create-issue-dialog.tsx`

- [ ] **Step 1: Add workflow template dropdown to create issue dialog**

In `packages/web/src/components/issue/create-issue-dialog.tsx`:

1. Add imports:
```typescript
import { useWorkflowStore } from '@/stores/workflow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
```

2. Inside the component, add:
```typescript
const { workflows, loadWorkflows } = useWorkflowStore();
const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');

useEffect(() => {
  if (open && workspaceId) loadWorkflows(workspaceId);
}, [open, workspaceId]);
```

3. Add a workflow template select BEFORE the members section:
```tsx
<div className="space-y-2">
  <label className="text-sm font-medium">Workflow Template</label>
  <Select value={selectedWorkflowId} onValueChange={(value) => {
    setSelectedWorkflowId(value);
    if (value) {
      const template = workflows.find(w => w.id === value);
      if (template) {
        // Auto-select template agents as members
        const agentIds = template.nodes.map(n => n.data.agentConfigId);
        setMembers(prev => {
          const set = new Set([...prev, ...agentIds]);
          return Array.from(set);
        });
      }
    }
  }}>
    <SelectTrigger>
      <SelectValue placeholder="None (use default pipeline)" />
    </SelectTrigger>
    <SelectContent>
      {workflows.map(w => (
        <SelectItem key={w.id} value={w.id}>
          {w.name} ({w.nodes.length} agents)
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

4. Update `onSubmit` to include `workflowId`:
```typescript
onSubmit({ title, description, members, workflowId: selectedWorkflowId || undefined });
```

5. Reset `selectedWorkflowId` in the close handler.

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/issue/create-issue-dialog.tsx
git commit -m "feat(workflow): add workflow template selector to create issue dialog"
```

---

### Task 18: Add workflow template display to EditIssueDialog

**Files:**
- Modify: `packages/web/src/components/issue/edit-issue-dialog.tsx`

- [ ] **Step 1: Add workflow template display/change to edit issue dialog**

In `packages/web/src/components/issue/edit-issue-dialog.tsx`:

1. Add imports:
```typescript
import { useWorkflowStore } from '@/stores/workflow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
```

2. Inside the component, add:
```typescript
const { workflows, loadWorkflows } = useWorkflowStore();
const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(issue.workflowId ?? '');

useEffect(() => {
  if (open && workspaceId) loadWorkflows(workspaceId);
}, [open, workspaceId]);
```

3. Add workflow template select (similar to create dialog):
```tsx
<div className="space-y-2">
  <label className="text-sm font-medium">Workflow Template</label>
  <Select value={selectedWorkflowId} onValueChange={setSelectedWorkflowId}>
    <SelectTrigger>
      <SelectValue placeholder="None (use default pipeline)" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="__none__">None (use default pipeline)</SelectItem>
      {workflows.map(w => (
        <SelectItem key={w.id} value={w.id}>
          {w.name} ({w.nodes.length} agents)
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

4. Update `onSave` to include `workflowId`:
```typescript
onSave({
  title, description, status, members,
  workflowId: selectedWorkflowId === '__none__' ? null : (selectedWorkflowId || null)
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/issue/edit-issue-dialog.tsx
git commit -m "feat(workflow): add workflow template display to edit issue dialog"
```

---

## Phase 5: Frontend Layout Integration

### Task 19: Add Workflows tab to FlexLayout

**Files:**
- Modify: `packages/web/src/components/layout/workspace-shell.tsx`

- [ ] **Step 1: Add workflow tab to FlexLayout model and factory**

In `packages/web/src/components/layout/workspace-shell.tsx`:

1. Add import:
```typescript
import { WorkflowList } from '@/components/workflow/workflow-list';
```

2. In the `defaultJson` model, add a `workflows` tab to the left tabset:
```json
{
  "type": "tab",
  "name": "workflows",
  "component": "workflows"
}
```

3. In the `factory` callback switch, add:
```typescript
case 'workflows':
  return <WorkflowList />;
```

4. In the `tabIcons` mapping, add:
```typescript
workflows: GitBranch,  // or Share2, Workflow, Network icons from lucide
```

5. If the project has a mobile tab bar component (check for mobile-specific layout code), add a "Workflows" entry there as well, matching the existing mobile tab pattern.

- [ ] **Step 2: Add i18n translation keys**

Add translation keys for workflow-related labels. Check existing translation files (e.g., `messages/zh.json`, `messages/en.json` or wherever `useTranslations` keys are defined). Add:

```json
{
  "workflow": {
    "title": "Workflow Templates",
    "new": "New Workflow",
    "empty": "No workflow templates yet",
    "createFirst": "Create your first workflow",
    "agents": "agents",
    "templateLabel": "Workflow Template",
    "none": "None (use default pipeline)"
  }
}
```

Then update Task 17/18 dialogs to use `t('workflow.templateLabel')` instead of hardcoded "Workflow Template".

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/layout/workspace-shell.tsx
git commit -m "feat(workflow): add Workflows tab to FlexLayout"
```

---

### Task 20: Final integration testing and cleanup

**Files:**
- All workflow files

- [ ] **Step 1: Build and verify no type errors**

```bash
cd G:/agent_spaces && pnpm build
```

Fix any TypeScript errors.

- [ ] **Step 2: Manual smoke test**

1. Start dev server: `pnpm dev`
2. Open web UI
3. Verify Workflows tab appears in sidebar
4. Create a new workflow template
5. Drag agents onto canvas
6. Connect nodes with edges
7. Save the template
8. Create an issue and select the workflow template
9. Start the issue and verify tasks are created from the workflow

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(workflow): visual workflow editor integration complete"
```
