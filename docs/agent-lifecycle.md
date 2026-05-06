# Agent 生命周期

本文档描述 Agent Preset 的创建、更新、工作空间导入以及运行时工作目录的行为。

## 存储布局

Agent 数据分为全局应用数据和工作空间数据两部分。

全局应用数据：

```text
~/.agent-spaces-data/
  agent-templates/
    {agentId}/
      agent.json
      mcp.json
      skills/
        *.md
```

工作空间数据：

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

工作空间记录也会在 `workspace.agents` 中存储 Agent Preset。

## Agent Config 结构

`AgentConfig.mcps` 是 JSON 对象，不是字符串数组。MCP 配置的预期结构为：

```json
{
  "mcpServers": {
    "server-name": {}
  }
}
```

`AgentConfig.skills` 在工作空间 JSON 中存储的是 Markdown 技能文件名列表。通过 Web UI 创建/更新时，上传的 Markdown 文件以包含 `name` 和 `content` 的对象形式发送；服务端将它们写入磁盘，在 Preset 中只存储标准化后的文件名。

## 创建 Agent Preset

UI 入口：

- `packages/web/src/components/sidebar/agent-dialog.tsx`
- API：`POST /api/workspaces/:id/agents/presets`
- 服务端：`packages/server/src/services/agent.ts` 中的 `createPreset()`

创建流程：

1. UI 收集 Agent 元数据、MCP JSON、上传的技能 Markdown 文件、模型配置以及可选的 `workingDir`。
2. 服务端创建新的 `AgentConfig` ID。
3. 服务端在 `~/.agent-spaces-data/agent-templates/{agentId}` 下写入全局模板：
   - `agent.json`
   - `mcp.json`
   - `skills/*.md`
4. 如果 `workingDir` 为空，服务端同时将模板复制到工作空间作为配置存储：
   - `{workspace.agentspaceDir}/agents/{agentId}`
5. 当 `workingDir` 为空时，保存在 `workspace.agents` 中的 Preset 保持 `workingDir` 为空。
6. 上传的技能 Markdown 文件也会被复制到：
   - `{workspace.agentspaceDir}/skills`

如果提供了 `workingDir`，服务端保留该显式路径。运行时配置文件和技能仍然从工作空间的 Agent 配置副本中读取。

## 更新 Agent Preset

UI 入口：

- `packages/web/src/components/sidebar/agent-dialog.tsx`
- API：`PUT /api/workspaces/:id/agents/presets/:presetId`
- 服务端：`packages/server/src/services/agent.ts` 中的 `updatePreset()`

更新流程：

1. 服务端将更新合并到现有工作空间 Preset 中。
2. MCP 配置被标准化为 JSON 对象。
3. 技能上传数据被标准化为 Markdown 文件名。
4. `~/.agent-spaces-data/agent-templates/{agentId}` 下的全局模板被重写。
5. `workspace.agents` 中的工作空间 Preset 被更新。

当前行为：更新现有 Preset 会刷新全局模板。除非更新路径显式写入工作空间副本，否则不会自动将完整模板文件夹重新复制到每个工作空间。

## 将全局 Agent 模板添加到工作空间

UI 入口：

- `packages/web/src/components/workspace/workspace-dialog.tsx`
- 使用 `packages/web/src/components/chat/add-member-dialog.tsx`

API：

- `GET /api/workspaces/:id/agent-templates`
- `POST /api/workspaces/:id/agents/from-templates`

服务端流程：

1. `GET /agent-templates` 从 `~/.agent-spaces-data/agent-templates` 读取全局模板。
2. 已存在于 `workspace.agents` 中的模板被过滤掉。
3. `POST /agents/from-templates` 接收 `{ agentIds: string[] }`。
4. 对于每个选中的模板：
   - 全局模板文件夹被复制到 `{workspace.agentspaceDir}/agents/{agentId}`。
   - 工作空间副本中的 `agent.json` 被重写，使 `workingDir` 指向 `{workspace.agentspaceDir}/agents/{agentId}`。
   - 工作空间 Preset 被添加到 `workspace.agents`。
   - Markdown 技能被复制到 `{workspace.agentspaceDir}/skills`。

这意味着全局模板可以保留自己的源元数据，而工作空间副本始终将运行时执行指向工作空间本地的 Agent 文件夹。

## 运行时工作目录

运行时入口：

- `packages/server/src/ws/handler.ts` 中的 `runMentionedAgent()`
- 工作目录解析器：`packages/server/src/services/agent.ts` 中的 `resolveWorkingDir()`

运行时行为：

1. 如果 `preset.workingDir` 已设置，运行时使用该值。
2. 如果 `preset.workingDir` 为空，运行时解析为：
   - `workspace.boundDirs[0]`
3. 如果找不到工作空间，运行时回退到 `process.cwd()`。

这样默认将编码 Agent 保持在实际的项目目录中。Agent 配置、MCP 文件和技能仍然存储在 `.agentspace` 下。

## MCP 运行时工具选择

运行时从 MCP JSON 配置中读取允许的工具列表：

```ts
Object.keys(mcps.mcpServers)
```

如果 `mcpServers` 缺失或无效，不会生成显式的允许工具列表。

## 内置议题工具

议题频道有两个内置工具能力，在聊天 UI 和 Agent 运行时上下文中暴露：

- `CreateCurrentChannelIssue`
- `ViewCurrentChannelIssue`

这些工具的作用域限定为绑定到当前频道的议题。创建议题时同时会创建议题频道，频道存储相同的 `issueId`，因此后续的创建/查看操作使用绑定的议题 ID，而非任意议题 ID。

对于已有频道 ID 但频道缺少 `issueId` 的遗留议题，读取议题列表或议题详情时会修复频道绑定。
