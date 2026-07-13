# Web 模块 — 组件与状态

## 组件目录 (src/components/)

| 目录 | 职责 |
|---|---|
| `chat/` | 聊天界面（消息列表、输入框、Agent 面板） |
| `teams/` | Team 多 Agent 协作（create-team-dialog / team-card / team-chat-panel / team-inbox-dialog / team-management-page / member-select-panel / team-member-list / team-member-row / team-detail-panel / team-hover-card / team-list-panel / team-selector / team-management-utils） |
| `composer/` | 消息编辑器（TipTap 富文本） |
| `editor/` | Monaco 代码编辑器、文件树、标签页 |
| `workflow/` | Workflow 可视化编辑器（ReactFlow 节点） |
| `workflows/` | Workflow 列表管理 |
| `terminal/` | xterm.js 终端组件 |
| `settings/` | 设置页面各子模块 |
| `sidebar/` | 侧边栏导航 |
| `layout/` | 布局组件（面板、分割） |
| `ui/` | 基础 UI 组件（shadcn/ui） |
| `shadcn-space/` | shadcn/ui 扩展组件 |
| `reui/` | REUI 组件 |
| `forgeui/` | Forge UI 组件 |
| `common/` | 通用组件 |
| `home/` | 首页组件 |
| `git/` | Git 操作组件 |
| `issue/` | Issue 管理组件 |
| `workspace/` | 工作区组件 |
| `workspaces/` | 工作区列表组件 |
| `worktree/` | Worktree 组件 |
| `mini-apps/` | Mini Apps 组件 |
| `table/` | 表格组件（TanStack Table） |
| `timeline/` | 时间线组件 |
| `viewers/` | 文件查看器（图片、Markdown 等） |
| `decorations/` | 编辑器装饰 |

## Zustand Stores (src/stores/)

44 个文件（含子目录），分三层：

**顶层 store（25 个）**：

| Store | 职责 |
|---|---|
| `agent.ts` | Agent 状态 |
| `chat.ts` | 聊天会话/消息 |
| `editor.ts` / `editor-send.ts` | 编辑器状态 |
| `llm.ts` | LLM 配置 |
| `terminal.ts` | 终端 |
| `git.ts` | Git 状态 |
| `issue.ts` | Issue |
| `command.ts` / `command-palette.ts` | 命令 / 命令面板 |
| `channel.ts` | 频道 |
| `notification.ts` | 通知 |
| `mobile-panel.ts` | 移动端面板 |
| `keyboard-shortcuts.ts` | 快捷键 |
| `workflow.ts` / `workspace.ts` / `worktree.ts` | 工作流/工作区/Worktree |
| `activity-log.ts` | 活动日志 |
| `code-favorites.ts` | 代码收藏 |
| `confirm.ts` | 全局确认对话框 |
| `content-usage-report.ts` | 用量报告 |
| `custom-shortcuts.ts` | 自定义快捷键 |
| `hooks.ts` | Hook 状态 |
| `inspector-history.ts` | Inspector 历史 |

**`workflow-editor/` 子目录（12 文件）**：crud / edit / execution / execution-logs / groups / interaction / staging / types / undo-redo / validation / versions / index

**`search-commands/` 子目录（7 文件）**：channel-search / file-search / issue-search / server-search / workflow-search / workspace-search / index + types

## lib 工具 (src/lib/)

| 文件 | 职责 |
|---|---|
| `sdk.ts` | SDK 实例初始化 |
| `auth.ts` | 认证逻辑 |
| `routes.ts` | 路由常量 |
| `monaco-*.ts` | Monaco 编辑器配置（4个文件） |
| `server.ts` | Server 连接配置 |
| `commands.ts` | 命令注册 |
| `terminal-registry.ts` | 终端注册 |
| `layout-templates.ts` | 布局模板 |
