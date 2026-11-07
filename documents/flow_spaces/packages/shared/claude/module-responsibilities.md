# 模块职责

`packages/shared` 本身是一个单一模块（纯类型包），内部按 `src/types/` 下的文件划分为 27 个子模块。每个子模块职责如下：

## 核心业务模型

| 子模块 | 文件 | 职责 |
|--------|------|------|
| workspace | `workspace.ts` | 工作空间模型、Agent 配置（含 role 体系、6 种运行时、模型供应商）、通知设置（飞书/企微/Native）、Robot Account、创建输入 |
| issue | `issue.ts` | 议题模型（9 种状态）、评论模型（含 agent_progress 来源和 metadata）、创建输入（含 workflowId 绑定） |
| task | `task.ts` | 任务模型（8 种状态）、任务结果（success/summary/artifacts/error）、依赖关系 |
| agent | `agent.ts` | Agent 会话模型（5 种状态）、内置 Agent ID 集合、`isBuiltinAgent()` 判断函数、用量记录、Dashboard 聚合 |
| channel | `channel.ts` | 频道模型（4 种类型）、消息模型（含结构化 Parts/回复/引用）、TodoItem、11 种 MessagePart 类型、Agent 上下文与输出项 |

## 基础设施模型

| 子模块 | 文件 | 职责 |
|--------|------|------|
| events | `events.ts` | WebSocket 事件契约：`WSEvent<T>` 基础结构、`ClientEventMap`（13 个客户端事件）、`ServerEventMap`（35+ 个服务端事件） |
| file | `file.ts` | 文件树节点（递归结构） |
| git | `git.ts` | Git 操作结果类型（状态、日志、差异、分支、操作历史） |
| llm | `llm.ts` | LLM 模型定义（含成本/思考模式/视觉/推理/嵌入能力标记）、供应商配置 |
| tool | `tool.ts` | 内置 Agent 工具声明（35 个工具：Issue 操作、终端输出、快捷命令、数据库 CRUD、Kanban 操作、文件操作、Workflow 操作） |

## Workflow 子系统

| 子模块 | 文件 | 职责 |
|--------|------|------|
| workflow | `workflow.ts` | Workflow DAG 核心模型：节点/边/分组/触发器/文件夹/版本/执行日志/快照/Agent 配置/节点类型定义/复合节点定义/旧版兼容 |
| workflow-execution | `workflow-execution.ts` | Workflow 执行事件体系：11 种执行通道、节点级事件、恢复/快照/控制请求/调试请求 |
| workflow-errors | `workflow-errors.ts` | Workflow 错误码体系（16 种错误码）、错误信封、`createErrorShape()` 工厂函数 |
| workflow-plugin | `workflow-plugin.ts` | Workflow 插件系统：插件元信息/运行时类型/配置字段、Agent 工具定义、插件入口解析函数、本地桥接节点（delay） |
| workflow-composite | `workflow-composite.ts` | Workflow 复合节点工具函数：循环节点常量、复合树遍历、作用域锚定、嵌入式 Workflow 工厂 |
| workflow-shortcut | `workflow-shortcut.ts` | Workflow 快捷键类型：8 种快捷动作（标签页/导航/视图/工具/窗口）、快捷键合并函数 |
| workflow-ws | `workflow-ws.ts` | Workflow WebSocket 协议：消息类型、交互类型（10 种）、握手协议、50+ 个 Channel Contract（CRUD/版本/日志/插件/Dashboard/暂存/触发器） |

## 辅助功能模型

| 子模块 | 文件 | 职责 |
|--------|------|------|
| command | `command.ts` | 快捷命令定义、运行进程状态、进程生命周期事件 |
| subscription | `subscription.ts` | 订阅管理（3 种供应商：智谱/MiniMax/AICode）、配额查询 |
| search | `search.ts` | 代码搜索结果和查询选项 |
| notification | `notification.ts` | 应用内通知类型（5 种通知类型）和模型 |
| speech | `speech.ts` | 语音识别配置（腾讯语音）和结果 |
| code-favorites | `code-favorites.ts` | 代码收藏（位置范围 + 标签 + 代码片段） |
| hooks | `hooks.ts` | Hook 配置系统（21 种 Claude Hook 事件名、3 种动作类型） |
| database | `database.ts` | 文档数据库：元信息、向量搜索、Notion 风格文档节点、版本历史（增量补丁）、预设封面 |
| kanban | `kanban.ts` | Kanban 看板系统：Board/Column/Task/优先级/布局模式 |
| worktree | `worktree.ts` | Git Worktree 并行开发（关联分支/Agent/Issue/Task/PR） |
