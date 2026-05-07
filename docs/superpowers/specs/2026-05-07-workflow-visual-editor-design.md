# Workflow Visual Editor Design

> Agent Spaces Issue Workflow Visual Orchestration System
> Date: 2026-05-07
> Status: Draft

## 1. Problem Statement

Agent Spaces currently uses a hardcoded agent orchestration pipeline for Issue automation: `scheduler -> planner -> task creator -> executor -> reviewer -> commit`. This pipeline is fixed in code -- users cannot customize which agents participate, in what order, or with what topology. Every issue goes through the same linear flow regardless of its nature.

The goal is to replace this hardcoded pipeline with a **visual workflow editor** powered by xyflow (React Flow), allowing users to:

1. Create reusable workflow templates by visually arranging agent nodes on a canvas
2. Define DAG (Directed Acyclic Graph) topologies with branching and joining
3. Save templates as JSON presets for reuse across issues
4. Select a template when creating/editing an issue to quickly apply a team configuration

This breaks the system free from programming-only agent patterns -- any sequence of agent roles can be composed.

## 2. Design Decisions

| Dimension | Decision | Rationale |
|-----------|----------|-----------|
| Orchestration granularity | Specific Agent Preset binding | Each node binds to a concrete agent preset, not an abstract role |
| Scope | Issue automation only | Replace hardcoded pipeline for issues; not a generic workflow engine |
| Frontend entry | Independent template manager | Separate management page for creating/editing templates, plus selection in issue dialogs |
| Topology | DAG (Directed Acyclic Graph) | Supports branching and joining; aligns with existing task dependency model |
| Node definition | Node = Agent | One node per agent preset; edges define execution order |
| Execution model | Map to existing Task model | Workflow template is a task creation template; no new execution engine |

## 3. Data Model

### 3.1 WorkflowTemplate

```typescript
// packages/shared/src/types/workflow.ts

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
  id: string;                          // xyflow node id (uuid)
  type: 'agent';                       // reserved for future node types
  position: { x: number; y: number };  // canvas position
  data: {
    label: string;                     // display name
    agentConfigId: string;             // bound agent preset ID
    role: AgentConfig['role'];         // redundant storage for validation
    taskTitleTemplate?: string;        // optional: task title template
    taskDescriptionTemplate?: string;  // optional: task description template
  };
}

export interface WorkflowEdge {
  id: string;       // xyflow edge id (uuid)
  source: string;   // source node id
  target: string;   // target node id
}
```

### 3.2 Issue Extension

```typescript
// packages/shared/src/types/issue.ts - Add to Issue interface
interface Issue {
  // ...existing fields
  workflowId?: string;  // associated workflow template ID
}

// packages/shared/src/types/issue.ts - Add to CreateIssueInput
interface CreateIssueInput {
  // ...existing fields
  workflowId?: string;
}

// packages/web/src/stores/issue.ts - UpdateIssueInput
interface UpdateIssueInput {
  // ...existing fields
  workflowId?: string | null;  // null to clear association
}
```

### 3.3 Storage

Following the existing dual-file pattern (same as issue-store.ts: `index.json` stores full objects for list views, individual files for detail views):

```
~/.agent-spaces-data/workspaces/{workspaceId}/workflows/
  index.json              # WorkflowTemplate[] (full objects, used for list display)
  {workflowId}.json       # WorkflowTemplate (individual file for detail/edit)
```

`index.json` stores complete `WorkflowTemplate[]` to match the issue-store pattern and avoid extra reads when listing templates with mini-preview data.

### 3.4 Serialization Format

The xyflow canvas state maps directly to WorkflowTemplate:

```json
{
  "id": "wf-uuid-1",
  "workspaceId": "ws-uuid-1",
  "name": "Programming Workflow",
  "nodes": [
    {
      "id": "node-1",
      "type": "agent",
      "position": { "x": 250, "y": 0 },
      "data": {
        "label": "Claude Planner",
        "agentConfigId": "agent-uuid-planner",
        "role": "planner"
      }
    },
    {
      "id": "node-2",
      "type": "agent",
      "position": { "x": 100, "y": 150 },
      "data": {
        "label": "GPT-4o Executor",
        "agentConfigId": "agent-uuid-executor-1",
        "role": "executor"
      }
    },
    {
      "id": "node-3",
      "type": "agent",
      "position": { "x": 400, "y": 150 },
      "data": {
        "label": "Claude Executor",
        "agentConfigId": "agent-uuid-executor-2",
        "role": "executor"
      }
    },
    {
      "id": "node-4",
      "type": "agent",
      "position": { "x": 250, "y": 300 },
      "data": {
        "label": "Claude Reviewer",
        "agentConfigId": "agent-uuid-reviewer",
        "role": "reviewer"
      }
    },
    {
      "id": "node-5",
      "type": "agent",
      "position": { "x": 250, "y": 450 },
      "data": {
        "label": "Git Commit Agent",
        "agentConfigId": "agent-uuid-commit",
        "role": "commit"
      }
    }
  ],
  "edges": [
    { "id": "e1-2", "source": "node-1", "target": "node-2" },
    { "id": "e1-3", "source": "node-1", "target": "node-3" },
    { "id": "e2-4", "source": "node-2", "target": "node-4" },
    { "id": "e3-4", "source": "node-3", "target": "node-4" },
    { "id": "e4-5", "source": "node-4", "target": "node-5" }
  ]
}
```

## 4. Backend Architecture

### 4.1 New Files

| File | Responsibility |
|------|---------------|
| `shared/src/types/workflow.ts` | Workflow type definitions |
| `server/src/storage/workflow-store.ts` | JSON persistence (CRUD) |
| `server/src/services/workflow.ts` | Business logic: validation, DAG check, agent resolution |
| `server/src/routes/workflow.ts` | REST API endpoints |

### 4.2 Modified Files

| File | Change |
|------|--------|
| `shared/src/types/workspace.ts` | Issue type adds `workflowId?: string` |
| `shared/src/types/issue.ts` | `CreateIssueInput` adds `workflowId?: string` |
| `shared/src/types/events.ts` | Add `workflow.*` events to `ServerEventMap` |
| `server/src/agents/issue-agent-runner.ts` | `runIssueAutomation()` adds workflow branch |
| `server/src/agents/issue-task-controller.ts` | New `createTasksFromWorkflow()` function (reuses existing `TaskDraft` interface with `key` + `dependsOnKeys`) |
| `server/src/app.ts` | Register workflow routes |

### 4.3 API Design

```
GET    /api/workspaces/:id/workflows              # List all templates
POST   /api/workspaces/:id/workflows              # Create template
GET    /api/workspaces/:id/workflows/:wid         # Get template detail
PUT    /api/workspaces/:id/workflows/:wid         # Update template
DELETE /api/workspaces/:id/workflows/:wid         # Delete template
POST   /api/workspaces/:id/workflows/:wid/duplicate  # Duplicate template
```

### 4.3.1 WebSocket Events

Following the existing event naming pattern (`domain.action`):

```typescript
// Add to ServerEventMap in packages/shared/src/types/events.ts
'workflow.created': { workspaceId: string; workflow: WorkflowTemplate };
'workflow.updated': { workspaceId: string; workflow: WorkflowTemplate };
'workflow.deleted': { workspaceId: string; workflowId: string };
```

These events enable real-time sync across multiple browser tabs/sessions. The frontend WorkflowStore subscribes to these events to update its local state without manual reload.

### 4.4 Execution Flow

```
Issue automation triggered
  |
  +-- issue.workflowId exists?
      |
      +-- YES: Load WorkflowTemplate
      |   |
      |   +-- Skip Planner phase entirely
      |   +-- Set issue status to 'planned' (brief transitional state)
      |   +-- createTasksFromWorkflow():
      |   |   +-- Reuse existing TaskDraft interface (key, dependsOnKeys pattern)
      |   |   +-- For each node, create a TaskDraft:
      |   |   |   - key = node.id
      |   |   |   - agentConfigId = node.data.agentConfigId
      |   |   |   - title = node.data.taskTitleTemplate or "Execute {node.data.label}"
      |   |   |   - description = node.data.taskDescriptionTemplate or auto-generated
      |   |   +-- For each edge, map source node id -> dependsOnKeys on target
      |   |   +-- Validate all agentConfigIds exist and are enabled in channel members
      |   |   +-- Call existing replaceIssueTasks() to persist and set up dependencies
      |   +-- Set issue status to 'in_progress'
      |   +-- Call scheduleRunnableIssueTasks()
      |   +-- Existing dependency scheduler handles the rest
      |
      +-- NO: Existing hardcoded pipeline
          +-- planner -> task creator -> executor -> reviewer
```

### 4.5 Validation Rules

**On save:**
1. **DAG check**: Topological sort must succeed (no cycles)
2. **Agent existence**: All `agentConfigId` values must belong to the workspace
3. **Connectivity**: At least one node (single-node workflows are valid)
4. **No duplicate edges**: Same source-target pair cannot appear twice
5. **No self-loops**: Source and target must differ
6. **Role staleness**: When saving, re-resolve each node's `role` from the current agent preset. If the preset's role has changed since the node was created, update the node's `role` field to match. If the preset no longer exists, reject the save and return the specific node IDs that have invalid references.

**On issue start:**
1. **Agent enabled**: All agent presets must still be enabled
2. **Agent in members**: All agent presets must be in the issue channel's member list
3. **Template exists**: Referenced workflow template must still exist
4. **Graceful fallback**: If any check fails, log warning and fall back to hardcoded pipeline

### 4.6 Error Handling

| Scenario | Behavior |
|----------|----------|
| Agent preset deleted after template created | Reject save with specific invalid node IDs. On run: fall back entirely to hardcoded pipeline with warning log |
| Workflow template deleted while issue references it | Fall back to hardcoded pipeline with warning log |
| Cycle detected in template | Reject save with error message |
| Agent preset disabled between template save and issue run | Log warning, fall back entirely to hardcoded pipeline. Do not skip individual nodes, as partial DAG execution may produce inconsistent results |
| Agent preset role changed after template created | On next template save, node role auto-updates to match preset. On run, role is re-validated |

## 5. Frontend Architecture

### 5.1 Dependencies

```json
{
  "@xyflow/react": "^12.10.0",
  "@dagrejs/dagre": "^1.1.0"
}
```

### 5.2 New Component Tree

```
packages/web/src/components/workflow/
  workflow-list.tsx              # Template list page (card grid)
  workflow-editor.tsx            # Template editor main page
  workflow-canvas.tsx            # xyflow canvas container
  workflow-agent-node.tsx        # Custom Agent node component
  workflow-agent-palette.tsx     # Left panel: agent palette for drag-and-drop
  workflow-toolbar.tsx           # Bottom toolbar (save, layout, export)
  workflow-mini-preview.tsx      # Mini preview for template cards
```

### 5.3 Workflow List Page

Displays saved templates as a card grid. Each card shows:
- Template name and description
- Node count (agent count)
- Mini xyflow preview (read-only, scaled down)
- Edit / Delete / Duplicate actions

Action bar at top: "New Workflow" button.

### 5.4 Workflow Editor Page

Layout: three-panel design.

**Left panel -- Agent Palette:**
- Reads workspace agents from Zustand agent store
- Groups agents by role (planner, executor, reviewer, commit, custom, bot)
- Each agent shown as a draggable card with avatar, name, role badge
- Drag onto canvas to create a node

**Center panel -- xyflow Canvas:**
- Custom `workflow-agent-node` component per node:
  - Agent avatar (from `avatarUrl`)
  - Agent name (bold)
  - Role badge (colored chip)
  - Model identifier (small text, e.g., `claude-sonnet-4-6`)
  - Top Handle (target) and bottom Handle (source)
- Edge type: `smoothstep` (clear directional flow)
- Connection validation: prevent self-loops and duplicate edges
- Delete nodes/edges via keyboard (Backspace/Delete)
- Right-click context menu for node configuration

**Bottom toolbar:**
- "Auto Layout" button (triggers dagre layout)
- "Save" button (validates DAG, persists)
- "Delete" button (with confirmation)
- "Export JSON" button (downloads template as .json)

### 5.5 Custom Node Component

```tsx
// workflow-agent-node.tsx
function WorkflowAgentNode({ data }: NodeProps<WorkflowNode>) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2">
        <Avatar src={data.avatarUrl} size="sm" />
        <div>
          <div className="font-medium text-sm">{data.label}</div>
          <Badge variant="outline" className="text-xs">{data.role}</Badge>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
```

### 5.6 Issue Dialog Integration

**CreateIssueDialog changes:**
- New "Workflow Template" select dropdown above the existing agent member checkboxes
- Options: workspace workflow templates (name + agent count)
- On template select: auto-check all template agents in the member list
- User can still manually add/remove individual members after template selection
- `workflowId` included in the create issue API call

**EditIssueDialog changes:**
- Display current workflow template name (if associated)
- Allow changing to a different template or clearing it
- Changing template updates `issue.workflowId` via PUT API

### 5.7 State Management

```typescript
// stores/workflow.ts
interface WorkflowStore {
  workflows: WorkflowTemplate[];
  currentWorkflow: WorkflowTemplate | null;
  isLoading: boolean;

  loadWorkflows(workspaceId: string): Promise<void>;
  createWorkflow(workspaceId: string, data: Partial<WorkflowTemplate>): Promise<WorkflowTemplate>;
  updateWorkflow(workspaceId: string, id: string, data: Partial<WorkflowTemplate>): Promise<void>;
  deleteWorkflow(workspaceId: string, id: string): Promise<void>;
  duplicateWorkflow(workspaceId: string, id: string): Promise<void>;
  setCurrentWorkflow(workflow: WorkflowTemplate | null): void;
}
```

### 5.8 Routing

Add a "Workflows" tab to the FlexLayout tab set, alongside existing tabs (Code, Terminal, Issues, etc.). Clicking opens the workflow list page; creating/editing opens the editor.

Also add a "Workflows" entry in the mobile tab bar.

## 6. Scope Boundaries

### In Scope (MVP)
- WorkflowTemplate CRUD (create, read, update, delete, duplicate)
- Visual canvas editor with xyflow
- Agent palette drag-and-drop
- DAG validation (cycle detection)
- Auto-layout with dagre
- Issue dialog workflow template selection
- Backend execution: map template to tasks
- Graceful fallback to hardcoded pipeline

### Out of Scope (Future)
- Conditional edges (e.g., reviewer reject -> back to executor)
- Sub-workflow nesting
- Node-level configuration panels (inline prompt editing)
- Real-time execution state rendering on canvas
- Import/export workflow templates across workspaces
- Workflow versioning
- Custom node types beyond 'agent'

## 7. Testing Strategy

### Backend Tests
- WorkflowStore CRUD operations
- DAG validation (valid graphs, cycles, disconnected nodes)
- createTasksFromWorkflow() mapping correctness
- Agent validation on issue start
- Fallback behavior when template is missing or invalid

### Frontend Tests
- WorkflowStore state transitions
- Canvas node/edge manipulation
- Template save/restore serialization round-trip
- Issue dialog template selection and member auto-fill

### Integration Tests
- Full flow: create template -> create issue with template -> verify tasks created correctly
- Template deletion -> existing issue falls back gracefully
- Agent preset deletion -> template validation catches it

## 8. Migration Path

No data migration needed. This is purely additive:

1. New types in `shared`
2. New storage layer, service, and routes in `server`
3. New components and store in `web`
4. Minimal changes to existing files (Issue type extension, issue-agent-runner branching)

Existing issues without `workflowId` continue using the hardcoded pipeline unchanged.
