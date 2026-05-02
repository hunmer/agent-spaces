# Agent Lifecycle

This document describes the current agent preset creation, update, workspace import, and runtime working directory behavior.

## Storage Layout

Agent data is split between global application data and each workspace.

Global application data:

```text
~/.agent-spaces-data/
  agent-templates/
    {agentId}/
      agent.json
      mcp.json
      skills/
        *.md
```

Workspace data:

```text
{workspace.boundDirs[0]}/.agentspace/
  agents/
    {agentId}/
      agent.json
      mcp.json
      skills/
        *.md
  skills/
    *.md
```

The workspace record also stores agent presets in `workspace.agents`.

## Agent Config Shape

`AgentConfig.mcps` is a JSON object, not a string array. The expected MCP config shape is:

```json
{
  "mcpServers": {
    "server-name": {}
  }
}
```

`AgentConfig.skills` stored in workspace JSON is a list of markdown skill filenames. During creation/update from the web UI, uploaded markdown files are sent as objects with `name` and `content`; the server writes them to disk and stores only normalized names in the preset.

## Creating An Agent Preset

UI entry point:

- `packages/web/src/components/sidebar/agent-dialog.tsx`
- API: `POST /api/workspaces/:id/agents/presets`
- Server: `createPreset()` in `packages/server/src/services/agent.ts`

Creation flow:

1. The UI collects agent metadata, MCP JSON, uploaded skill markdown files, model config, and optional `workingDir`.
2. The server creates a new `AgentConfig` id.
3. The server writes the global template under `~/.agent-spaces-data/agent-templates/{agentId}`:
   - `agent.json`
   - `mcp.json`
   - `skills/*.md`
4. If `workingDir` is empty, the server also copies the template into the workspace:
   - `{workspace.agentspaceDir}/agents/{agentId}`
5. For empty `workingDir`, the preset saved in `workspace.agents` uses:
   - `{workspace.agentspaceDir}/agents/{agentId}`
6. Uploaded skill markdown files are also copied into:
   - `{workspace.agentspaceDir}/skills`

If `workingDir` is provided, the server preserves that explicit path and does not replace it with the workspace agent directory.

## Updating An Agent Preset

UI entry point:

- `packages/web/src/components/sidebar/agent-dialog.tsx`
- API: `PUT /api/workspaces/:id/agents/presets/:presetId`
- Server: `updatePreset()` in `packages/server/src/services/agent.ts`

Update flow:

1. The server merges the update into the existing workspace preset.
2. MCP config is normalized as a JSON object.
3. Skill upload payloads are normalized to markdown filenames.
4. The global template under `~/.agent-spaces-data/agent-templates/{agentId}` is rewritten.
5. The workspace preset in `workspace.agents` is updated.

Current behavior: updating an existing preset refreshes the global template. It does not automatically recopy the full template folder into every workspace unless the update path explicitly writes a workspace copy.

## Adding A Global Agent Template To A Workspace

UI entry point:

- `packages/web/src/components/workspace/workspace-dialog.tsx`
- Uses `packages/web/src/components/chat/add-member-dialog.tsx`

APIs:

- `GET /api/workspaces/:id/agent-templates`
- `POST /api/workspaces/:id/agents/from-templates`

Server flow:

1. `GET /agent-templates` reads global templates from `~/.agent-spaces-data/agent-templates`.
2. Templates already present in `workspace.agents` are filtered out.
3. `POST /agents/from-templates` accepts `{ agentIds: string[] }`.
4. For each selected template:
   - The global template folder is copied to `{workspace.agentspaceDir}/agents/{agentId}`.
   - The workspace copy of `agent.json` is rewritten so `workingDir` points to `{workspace.agentspaceDir}/agents/{agentId}`.
   - The workspace preset is added to `workspace.agents`.
   - Markdown skills are copied into `{workspace.agentspaceDir}/skills`.

This means a global template can keep its own source metadata, while the workspace copy always points runtime execution at the workspace-local agent folder.

## Runtime Working Directory

Runtime entry point:

- `runMentionedAgent()` in `packages/server/src/ws/handler.ts`
- Working dir resolver: `resolveWorkingDir()` in `packages/server/src/services/agent.ts`

Runtime behavior:

1. If `preset.workingDir` is set, runtime uses it.
2. If `preset.workingDir` is empty, runtime resolves to:
   - `{workspace.agentspaceDir}/agents/{agentId}`
3. If the workspace cannot be found, runtime falls back to `process.cwd()`.

This prevents empty `workingDir` presets from accidentally running in the server package directory during normal workspace execution.

## MCP Runtime Tool Selection

Runtime reads allowed tools from the MCP JSON config:

```ts
Object.keys(mcps.mcpServers)
```

If `mcpServers` is missing or invalid, no explicit allowed tools list is produced.
