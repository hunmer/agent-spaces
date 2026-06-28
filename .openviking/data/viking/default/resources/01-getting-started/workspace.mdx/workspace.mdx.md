
# 工作空间管理

工作空间是 Agent Spaces 的核心概念，每个工作空间对应一个本地代码项目。

## 工作空间列表

主页展示所有已创建的工作空间。每个工作空间卡片显示基本信息和最近活动状态。

支持的操作：
- **创建** — 新建工作空间并绑定代码目录
- **进入** — 点击卡片进入 IDE 界面
- **删除** — 移除工作空间（不会删除本地代码）

## 绑定代码目录

创建工作空间时，需要绑定一个本地代码目录。支持两种方式：

### 浏览文件夹

点击文件夹图标，在弹出的文件夹浏览器中选择目标目录。浏览器以树形结构展示本地文件系统，方便快速定位。

### Git Clone

输入远程仓库 URL，Agent Spaces 会通过流式输出（SSE）实时显示克隆进度。克隆完成后自动绑定到新目录。

## 工作空间元数据

绑定目录后，系统自动在 `boundDirs[0]` 下创建 `.agentspace` 隐藏目录，用于存储项目级数据：

- 知识库（`claude.md`）
- 技能库（`skills/`）
- Agent 配置与工作目录（`agents/{agentId}/`）

建议将 `.agentspace` 加入 `.gitignore`，避免提交到远程仓库。

工作空间的运行时业务数据则集中存储在全局数据目录 `~/.agent-spaces-data/workspaces/{workspaceId}/` 下：

- `workspace.json` — Workspace 详情（`agentspaceDir` 指向上面 `.agentspace` 的绝对路径）
- `prompt.md` — 工作空间 Prompt
- `notifications.json` — 应用内通知
- `code-favorites.json` — 代码收藏
- `hooks/{name}.hook.json` — Hook 配置
- `workflows/` — Workflow 模板
- `channels/{channelId}/` — 频道消息（`messages.json`）和工具详情（`tool-details.json`）
- `issues/` — 议题与评论
- `tasks/` — 任务
- `commands/` — 快捷命令

## Worktree 子工作空间

通过 Worktree 创建的并行开发分支会作为子工作空间存在：

- 子工作空间的 `isWorktree` 字段为 `true`
- 通过 `parentWorkspaceId` 关联到父工作空间
- 子工作空间拥有独立的分支和文件状态
- 在 Worktree 面板中管理所有子工作空间

详见 [Worktree 并行开发](/docs/features/worktree)。
