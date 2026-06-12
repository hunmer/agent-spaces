# Workflow UI Agent 能力说明

本文档说明当前 Workflow UI 编辑器内 Agent 聊天能力的实现范围、运行链路、工作目录规则和已知边界。

## 目标

Workflow UI Agent 用于在自定义页面编辑器中辅助开发 Workflow UI 项目。它复用主聊天系统的 Agent Runtime 和 `ChatPanel`，而不是旧的轻量 `FloatingChatPanel` / 手写 SSE toolcall UI。

当前能力面向以下场景：

- 在 Workflow UI 编辑页右下角打开 Agent 聊天面板。
- 选择一个已有 Agent Preset 作为当前 Workflow UI 项目的助手。
- 将当前 Workflow UI 项目上下文传给 Agent。
- 让 Agent 在 Workflow UI 项目目录内运行、读写和执行工具。
- 复用主聊天系统的消息流、结构化消息、停止运行、追问、工具调用展示和历史上下文。

## 前端能力

入口组件：

- `packages/web/src/components/mini-apps/mini-app-chat.tsx`
- 由 `packages/web/src/components/mini-apps/mini-app-editor.tsx` 集成。

当前 UI 行为：

- 编辑页右下角显示聊天浮动按钮。
- 打开后展示一个固定尺寸的浮层面板。
- 浮层内部渲染 `packages/web/src/components/chat/chat-panel.tsx`。
- 首次使用时可选择 Agent。
- 选择结果写回 `MiniAppProject.agentConfigId`，后续打开该项目会优先使用已选 Agent。
- 每个 `projectId + agentId` 组合会复用一个 Workflow UI 专属 channel，channel id 存储在浏览器 `localStorage`。

发送消息时，前端会携带 `miniAppContext`：

```ts
{
  projectId: project.id,
  activeFilePath,
  projectType: project.type,
  fileContent,
}
```

该上下文会通过 `useChannelStore.sendMessage()` 进入 WebSocket `channel.message` 事件。

## 后端运行链路

运行链路如下：

```text
MiniAppChat
  -> ChatPanel
  -> useChannelStore.sendMessage()
  -> WebSocket channel.message
  -> packages/server/src/ws/handler.ts
  -> runMentionedAgent()
  -> selected Agent Runtime
```

涉及后端文件：

- `packages/server/src/ws/handler.ts`
- `packages/server/src/ws/agent-runner.ts`
- `packages/server/src/services/mini-app.ts`
- `packages/server/src/storage/mini-app-store.ts`
- `packages/server/src/services/builtin-tools/mini-app-tools.ts`

## 工作目录规则

这是 Workflow UI Agent 和普通 workspace Agent 的关键差异。

普通 channel Agent 默认使用 workspace 的 `boundDirs[0]` 或 Agent Preset 的 `workingDir`。

Workflow UI Agent 检测到 `miniAppContext.projectId` 后，会将运行目录覆盖为 Workflow UI 项目的真实存储目录：

```text
{AGENT_SPACES_DATA_DIR or ~/.agent-spaces-data}/mini-apps/{projectId}
```

例如：

```text
C:\Users\Administrator\.agent-spaces-data\mini-apps\wui_1780895925999_0b9a6a9a
```

同时：

- `workingDir` 使用该 Workflow UI 项目目录。
- `boundDirs` 设置为该项目目录。
- `sandboxDirs` 设置为该项目目录。
- 消息里的工具路径摘要也按该目录裁剪。
- 普通 workspace id 仍用于查找 Agent Preset、会话、channel 和广播事件。

预期 runtime 日志应类似：

```text
[claude-code] starting | cwd=C:\Users\Administrator\.agent-spaces-data\mini-apps\wui_xxx ...
sandboxDirs=C:\Users\Administrator\.agent-spaces-data\mini-apps\wui_xxx
```

## 可用工具能力

Workflow UI Agent 复用普通 channel Agent 的运行时能力，包括：

- 当前 Agent runtime 支持的原生工具，例如 Claude Code 的 `Read`、`Write`、`Edit`、`MultiEdit`、`Bash`、`Grep`、`Glob`、`TodoWrite` 等。
- Agent Preset 配置的 MCP、skills、模型和 runtime 参数。
- Agent Spaces 内置 function tools，例如 issue、command、database、kanban、workflow execution 相关工具。
- Workflow UI 专属插件工具。

当存在 Workflow UI 上下文时，后端会额外注册 `createMiniAppFunctionTools()` 提供的工具：

| 工具 | 能力 |
| --- | --- |
| `list_agent_spaces_ui_components` | 按分类列出 `window.AgentSpacesUI` 当前暴露的 React UI 组件，Agent 在 React 模式编写 UI 前应优先查询。 |
| `list_plugin_tools` | 列出当前 Workflow UI 项目已启用插件注册的 tools。 |
| `get_plugin_tool_detail` | 查看指定插件 tool 的完整参数 schema 和描述。 |
| `execute_plugin_tool` | 执行指定插件 tool 并返回结果。 |

插件工具的可见范围来自项目的 `enabledPlugins`。

## AgentSpacesUI 使用规则

后端会把 `miniAppContext.projectType` 注入 Agent 提示词：

- React 模式：优先按分类调用 `list_agent_spaces_ui_components` 查询可用宿主组件，并优先通过 `window.AgentSpacesUI` 解构使用，例如 `const { Button, Card, CardContent, Search, Loader2 } = window.AgentSpacesUI;`。lucide-react 图标也按标准图标名暴露在 `window.AgentSpacesUI` 上；不要从宿主源码路径 import 这些组件或图标。
- 插件工具：预览代码中优先使用 `window.AgentSpaces.callPluginTool(pluginId, toolName, args)` 执行已启用插件工具；消费返回值前应先按工具详情里的输出结构取字段，不要假设业务数据在顶层 `success` 包装上。若收到 `{ success, result }` 包装结构，则使用内层 `result` 里的插件输出；`window.AgentSpacesAPI.callPluginTool` 和 `window.AgentSpacesAPI.executePluginTool` 是兼容别名。
- JSON 配置：预览代码可使用异步 helper `await window.AgentSpacesUI.readConfigJson(path)` 和 `await window.AgentSpacesUI.writeConfigJson(path, value)` 读写当前 Workflow UI 项目根目录下的 `configs/`。例如上一次提交选择建议使用 `await window.AgentSpacesUI.readLastSelection()` 和 `await window.AgentSpacesUI.writeLastSelection(value)`，对应 `configs/last-selection.json`。
- 数据文件：预览代码可使用 `await window.AgentSpacesUI.saveDataFile(path, content)` 将文本或二进制内容保存到当前 Workflow UI 项目根目录下的 `data/`，也可使用 `await window.AgentSpacesUI.downloadFile(url, path?)` 下载远程文件并保存到 `data/`。
- 兼容别名：配置和数据文件 helper 同时挂载在 `window.AgentSpaces` 与 `window.AgentSpacesAPI` 上。
- HTML 模式：可使用普通 HTML/CSS/JS；`window.AgentSpacesUI` 和 `window.AgentSpaces` 仍可用，但 React 组件主要面向 React 模式。

## 上下文注入

首次创建 Workflow UI 专属 channel 时，前端会发送一条初始化消息，包含：

- Workflow UI 项目名称。
- Workflow UI 项目 id。
- 当前活动文件路径。
- 当前文件内容，长度会裁剪。

之后每次通过 `ChatPanel` 发送消息，仍会携带最新的 `miniAppContext`，后端据此保持正确工作目录。

当前实现中，`fileContent` 主要用于前端初始化提示和后端识别 Workflow UI 场景；Agent 对最新文件内容的读取应优先通过运行目录内的真实文件操作完成。

## 持久化与会话

Workflow UI 项目数据存储在：

```text
~/.agent-spaces-data/mini-apps/{projectId}
```

目录结构由 `mini-app-store.ts` 管理，典型内容包括：

```text
manifest.json
src/
```

聊天 channel 仍属于当前普通 workspace 的 channel 系统。这是为了复用现有聊天、消息、Agent session 和 WebSocket 广播能力。

换句话说：

- channel 属于当前 workspace。
- Agent Preset 属于当前 workspace。
- Agent 的实际 `cwd` 是 Workflow UI 项目目录。

## 当前边界

当前实现有以下边界：

- Workflow UI Agent 不是独立 workspace，它仍复用当前 workspace 的 Agent Preset 和 channel 系统。
- Workflow UI 专属 channel id 存在浏览器 `localStorage`，不是服务端项目 manifest 的一部分。
- 已存在的旧 Workflow UI channel 如果创建时没有 `miniAppContext`，需要从当前新版 UI 再次发送消息，才能触发正确 cwd 覆盖。
- 当前不会自动把编辑器未保存内容写入磁盘；Agent 读取文件时看到的是 Workflow UI 存储目录中的文件状态。
- `ChatPanel` 是通用组件，Workflow UI 只通过 `channelId` 和 `miniAppContext` 做薄适配。
- `workspaceId` 仍必须存在，因为后端需要通过 workspace 查找 Agent Preset、会话和 channel。

## 排查建议

如果 Agent 仍然跑到普通 workspace 目录，优先检查：

1. 前端发送的 `channel.message` 是否包含 `miniAppContext.projectId`。
2. `projectId` 对应目录是否存在于 `~/.agent-spaces-data/mini-apps/{projectId}`。
3. 后端日志中 `cwd=` 是否为 Workflow UI 项目目录。
4. 是否通过旧页面实例或旧 channel 消息触发了运行，建议刷新页面后重新发送。
5. 选择的 Agent Preset 是否启用，且当前 workspace 能够查询到该 Agent。

## 相关代码

- `packages/web/src/components/mini-apps/mini-app-chat.tsx`
- `packages/web/src/components/chat/chat-panel.tsx`
- `packages/web/src/stores/channel.ts`
- `packages/server/src/ws/handler.ts`
- `packages/server/src/ws/agent-runner.ts`
- `packages/server/src/services/mini-app.ts`
- `packages/server/src/storage/mini-app-store.ts`
- `packages/server/src/services/builtin-tools/mini-app-tools.ts`
- `packages/shared/src/types/events.ts`
