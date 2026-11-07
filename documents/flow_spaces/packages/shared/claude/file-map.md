# 文件地图

## 源码结构

```
packages/shared/
  package.json                      # 包配置（名称、版本、构建脚本、exports）
  tsconfig.json                     # TypeScript 配置（继承 tsconfig.base.json）
  src/
    index.ts                        # 包入口：export * from './types/index.js'
    types/
      index.ts                      # 类型汇总入口：27 个子模块的 export *
      workspace.ts                  # Workspace + AgentConfig + 通知设置 + RobotAccount
      issue.ts                      # Issue + IssueStatus + IssueComment + CreateIssueInput
      task.ts                       # Task + TaskStatus + TaskResult
      agent.ts                      # AgentSession + AgentUsage + BUILTIN_AGENT_IDS + isBuiltinAgent()
      channel.ts                    # Channel + Message + MessagePart(11种) + TodoItem + 附件
      file.ts                       # FileNode（递归文件树）
      git.ts                        # GitFileStatus + GitStatusResult + GitLogEntry + GitDiffResult + GitBranch + GitOperationEntry
      events.ts                     # WSEvent + ClientEventMap(13事件) + ServerEventMap(35+事件)
      llm.ts                        # LLMModel + LLMProvider + LLMModelCost + LLMThinkingEffort
      tool.ts                       # BUILT_IN_AGENT_TOOLS(35工具) + BuiltInAgentToolName
      workflow.ts                   # Workflow 核心：节点/边/分组/触发器/文件夹/版本/执行日志/快照/旧版兼容
      workflow-execution.ts         # 执行事件体系：11通道 + 事件映射 + 恢复/快照/控制/调试请求
      workflow-errors.ts            # 错误码(16种) + ErrorShape + createErrorShape()
      workflow-plugin.ts            # 插件系统：元信息/配置/入口解析/本地桥接节点(delay)
      workflow-composite.ts         # 复合节点：循环常量 + 树遍历 + 作用域锚定 + 嵌入式 Workflow 工厂
      workflow-shortcut.ts          # 快捷键：8种动作 + 分组 + 合并函数
      workflow-ws.ts                # WebSocket 协议：消息类型 + 交互(10种) + 握手 + ChannelMap(50+契约)
      command.ts                    # QuickCommand + CommandProcess + CommandProcessEvent
      subscription.ts               # SubscriptionConfig + SubscriptionQuota + SubscriptionLimit
      search.ts                     # CodeSearchResult + FileSearchResult + SearchCodeOptions
      notification.ts               # NotificationType(5种) + AppNotification
      speech.ts                     # SpeechRecognitionConfig + SpeechRecognitionResult + TencentSpeechCredentials
      code-favorites.ts             # CodeFavorite
      hooks.ts                      # HookConfig + HookRule + ClaudeHookEventName(21种)
      database.ts                   # DatabaseMeta + DocNode + DatabaseNodeVersion + 向量搜索 + PRESET_COVERS
      kanban.ts                     # KanbanBoard + KanbanColumn + KanbanTask + KanbanPriority + KanbanLayoutMode
      worktree.ts                   # WorktreeInfo + WorktreeStatus + CreateWorktreeInput
  dist/                             # 编译产物（不纳入版本控制）
    index.js / index.d.ts           # 包入口编译产物
    types/                          # 各子模块编译产物 + source maps
```

## 文件统计

| 类别 | 文件数 | 说明 |
|------|--------|------|
| 配置文件 | 2 | `package.json`, `tsconfig.json` |
| 入口文件 | 1 | `src/index.ts` |
| 类型汇总 | 1 | `src/types/index.ts` |
| 类型定义 | 27 | `src/types/*.ts` |
| **源码总计** | **29** | |
| 编译产物 | ~58 | `dist/` 下的 `.js` + `.d.ts` + source maps |

## 按领域分类

| 领域 | 文件 | 数量 |
|------|------|------|
| 核心业务 | workspace, issue, task, agent, channel, file, git | 7 |
| 基础设施 | events, llm, tool | 3 |
| Workflow | workflow, workflow-execution, workflow-errors, workflow-plugin, workflow-composite, workflow-shortcut, workflow-ws | 7 |
| 辅助功能 | command, subscription, search, notification, speech, code-favorites, hooks, database, kanban, worktree | 10 |
