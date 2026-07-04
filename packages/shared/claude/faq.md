# 常见问题

## 通用

**Q: 为什么用 `workspace:*` 引用？**
A: pnpm monorepo 内部包引用方式，指向本地 workspace 中的同名包。运行时解析为实际包路径。

**Q: 修改类型后需要做什么？**
A: 运行 `pnpm --filter @agent-spaces/shared build` 重新编译，server/web 在下次编译时会自动获得新类型。如果使用 `pnpm dev`，监听模式会自动重新编译。

**Q: 为什么导出路径用 `.js` 后缀？**
A: ESM 规范要求。TypeScript 的 `moduleResolution: bundler` 模式下，导入路径需要与运行时实际文件路径匹配，编译后是 `.js` 文件。

**Q: 这个包有运行时代码吗？**
A: 有少量。除了纯类型定义外，还导出了常量（如 `BUILT_IN_AGENT_TOOLS`、`PRESET_COVERS`、`BUILTIN_AGENT_IDS`）和纯函数（如 `isBuiltinAgent()`、`findWorkflowNode()`、`createErrorShape()`、`resolvePluginEntryFile()`、`getMergedBindings()`）。这些函数均为无副作用的纯函数。

## AgentConfig

**Q: runtimeKind 有哪些选项？**
A: `open-agent-sdk`（默认）、`claude-code`、`codex`、`langchain`、`hermes`、`oh-my-pi` 六种运行时。

**Q: modelProvider 带 `to-anthropic-messages` 是什么？**
A: 表示通过 Anthropic Bridge 中转，将 OpenAI Chat/Responses 请求转为 Anthropic Messages 协议，供 ClaudeCodeRuntime 使用。有 `openai-responses-to-anthropic-messages` 和 `openai-chat-completions-to-anthropic-messages` 两种。

**Q: AgentConfig role 有哪些选项？**
A: 内置 `agent`（默认通用）、`scheduler`（后台调度）、`task_creator`（任务创建）、`bot`（通知 Bot），以及任意自定义字符串（兼容旧 role 如 planner/executor/reviewer/commit/custom）。

## 时间戳

**Q: 为什么有些模型用 `string` 时间戳，有些用 `number`？**
A: 历史原因。原始 agent-spaces 模型使用 ISO 8601 字符串（`string`），后来整合的 workflow Workflow 引擎使用 Unix 毫秒（`number`）。

## Workflow

**Q: WorkflowTemplate 和 Workflow 的关系？**
A: `WorkflowTemplate` 是 `Workflow` 的类型别名（`type WorkflowTemplate = Workflow`），标记为 `@deprecated`，保留向后兼容。

**Q: WorkflowNode 的 data 为什么是 Record<string, unknown>？**
A: 宽松耦合设计。通过 `type` 字段区分节点类型，具体数据结构由各节点类型的属性定义（`NodeTypeDefinition`）描述。旧版使用判别联合类型，新版使用松散 Record。

**Q: 复合节点（composite）是什么？**
A: 支持节点嵌套的元数据系统。循环节点（loop）包含循环体（loop_body）和循环中断（loop_break）子节点，通过 composite.rootId/parentId/role 维护树形关系。

## 通知

**Q: WorkspaceNotificationSettings 支持哪些平台？**
A: 当前支持 `lark`（飞书）、`wechat`（企业微信）和 `native`（Tauri/Browser Notification）。

## 订阅

**Q: SubscriptionProvider 支持哪些供应商？**
A: `zhipu`（智谱）、`minimax`（MiniMax）、`aicode`（AI Code）。

## 语音

**Q: SpeechRecognitionProvider 支持哪些供应商？**
A: 当前仅 `tencent`（腾讯语音），通过 `SpeechRecognitionProvider` 类型抽象可扩展。

## Hook

**Q: HookConfig 的 matcher 支持哪些格式？**
A: `*` 匹配所有工具、`/regex/` 正则表达式匹配、精确字符串匹配工具名。遵循 Claude Code `hooks.json` 格式约定。

**Q: ClaudeHookEventName 有哪些事件？**
A: 21 种，包括 SessionStart、PreToolUse、PostToolUse、Notification、SubagentStart/Stop、TaskCreated/Completed、Stop 等。

## 数据库

**Q: DatabaseMeta 和 DocNode 的关系？**
A: DatabaseMeta 是数据库的元信息（名称、描述、Embedding 模型），DocNode 是数据库内的文档节点，通过 databaseId 关联。DocNode 通过 parentId 实现树形文档结构。

**Q: DatabaseNodeVersion 的 patch 字段含义？**
A: 增量补丁（start 位置、删除文本、插入文本），用于版本差异对比和回滚。

## Worktree

**Q: WorktreeInfo 的 prUrl 有什么用？**
A: 记录 Worktree 创建的 Pull Request URL，用于追踪 PR 状态。

## 工具

**Q: 内置工具有多少个？**
A: 35 个。包括 Issue 操作 3 个、终端输出 1 个、快捷命令 3 个、数据库 CRUD 10 个、Kanban 操作 5 个、文件操作 5 个、Workflow 操作 5 个。
