# Chat 组件架构（components/chat/）

> `packages/web/src/components/chat/`（43 文件）—— 频道聊天、Agent 交互、消息渲染的核心 UI 子系统。

## 整体架构

```
ChatPanel（频道主面板）
  ├── 顶部：频道信息 + 成员头像组
  ├── 中部：MessageNavigator → MessageItem → MessageParts
  ├── 底部：ChatInput（ChatComposerInput + ChatInputAgentBar + ChatInputInfoBar）
  └── 侧边：ChatRightPanel（目录/Agent 信息）
```

另有 `InlineChatPanel`（Agent 专属内联聊天，用于 Issue/工作流节点）与 `ChannelList`（频道列表入口）两条独立链路。

## 核心组件

### 主面板链路

| 组件 | 文件 | 职责 |
|---|---|---|
| `ChatPanel` | `chat-panel.tsx` | 频道主面板，管理 WS 连接、消息收发、Agent 激活、MiniApp 上下文、右侧面板切换。接收 `workspaceId/channelId/miniAppContext` |
| `MessageNavigator` | `message-navigator.tsx` | 消息导航（版本切换、跳转） |
| `MessageItem` | `message-item.tsx` | 单条消息渲染，分流 user/agent，调用 MessageParts |
| `MessageParts` | `message-parts.tsx` | **消息内容渲染核心**：按 MessagePart 类型分发（text/reasoning/chain/terminal/error/confirmation/task/commit 等） |
| `ChatInput` | `chat-input.tsx` | 输入区容器，forwardRef 暴露 `ChatInputHandle`（setContent）。组合 composer + agentBar + infoBar + attachments |
| `ChatComposerInput` | `chat-composer-input.tsx` | TipTap 富文本编辑器，管理 `ChatComposerInputState`（mentionedAgentIds/activeAgent/activeMcps/skills/tools/workflowIds） |
| `ChatInputAgentBar` | `chat-input-agent-bar.tsx` | 输入区上方的 Agent 栏（显示当前激活 Agent + 切换） |
| `ChatInputInfoBar` | `chat-input-info-bar.tsx` | 输入区信息栏（上下文长度/模型/工具统计） |

### 消息渲染子系统

`MessageParts` 是消息内容的统一渲染入口，按 part.type 分发：

| part.type | 渲染组件 | 说明 |
|---|---|---|
| `text` | `Markdown` | 文本内容 |
| `reasoning` | `ChainOfThought` | 思维链（streaming/completed） |
| `chain` | `ChainOfThought` + `ToolStep`/`AiMessageStep` | 工具调用链（多步折叠） |
| `terminal` | `Terminal` | 终端输出 |
| `error` | `Alert` | 错误提示 |
| `confirmation` | `Confirmation` | 人机交互确认（approve/reject） |
| `task` | `Task` | 任务展示 |
| `commit` | `Commit` | Git 提交展示 |
| `user_message` | `UserReplyPart` | 用户回复引用 |

辅助组件：
- `chain-of-thought.tsx`：`ChainOfThought` / `ChainOfThoughtHeader` / `ChainOfThoughtStep` / `ChainOfThoughtContent` 等（memo 优化）。
- `chat-tool-timeline.tsx`：`normalizeChatTimeline` + `ChatToolTimeline`，工具调用时间线。
- `message-tool-step.tsx`：单步工具调用渲染。
- `readonly-code-block.tsx`：只读代码块。
- `ask-user-question.tsx`：Agent 向用户提问。
- `confirmation.tsx`：确认对话框。

### 消息列表

`ChatMessageList<TMessage>`（`chat-message-list.tsx`）是**通用泛型消息列表**，供 ChatPanel 和 InlineChatPanel 共用：
- 泛型约束 `TMessage extends DisplayChatMessage`。
- 支持：动画进出场、typing indicator、版本切换（`versionInfo`）、重新生成（`onRegenerateMessage`）、工具重跑（`onRerunTool`）、会话详情查看（`sessionRecordForMessage`/`sessionDetailForMessage`）。
- `extractThinkingContent`：从 `<think>...</think>` 提取思维链。
- `getMessageTimeline`：从 `timeline` 或 `toolCalls` 构建时间线。

### 频道管理

| 组件 | 职责 |
|---|---|
| `ChannelList` | 频道列表（workspaceId 入口） |
| `ChannelDialog` | 创建/编辑频道（含初始消息、成员选择） |
| `ChannelInfoPanel` | 频道信息侧栏（成员/设置/删除） |

### Agent 管理

| 组件 | 职责 |
|---|---|
| `ChatAgentList` | 频道内 Agent 列表 |
| `AddChatAgentDialog` | 添加 Agent 到频道 |
| `ChatAgentPickerDialog` | Agent 选择器 |
| `AddMemberDialog` | 添加成员 |
| `MemberCard` / `MemberHoverCard` / `MemberInfoCard` / `MemberInfoDialog` | 成员展示（卡片/悬浮/详情） |

### 内联聊天（InlineChatPanel）

`inline-chat-panel.tsx` —— Agent 专属聊天面板，用于 Issue 详情/工作流节点等场景：
- 单 Agent 会话（接收 `agentId/agentName/agentSystemPrompt` 等）。
- `groupMessageVersions` 消息版本分组。
- `buildInlineSessionRecord` / `buildInlineSessionDetail` 构建会话记录供用量查看。
- 流式渲染（`streamingContent`/`streamingThinking`/`streamingTimeline`）。
- 复用 `ChatMessageList` + `ChatComposerInput`。

### Team 消息

`team-message-card.tsx`：聊天中渲染 Team 协作消息卡片（与 `packages/web/src/components/teams/` 配合）。

### 上下文与工具

| 文件 | 职责 |
|---|---|
| `context.tsx` | 聊天上下文 Provider |
| `message-context-panel.tsx` | 消息上下文面板（systemPrompt/fullPrompt 查看） |
| `message-context-to-chat.tsx` | 上下文跳转回聊天 |
| `message-context-usage.tsx` | 消息用量查看 |
| `chat-input-utils.ts` | 输入工具函数（MentionedAgent 类型等） |
| `chat-input-attachments.ts` | 输入附件处理 |
| `attachments.tsx` | 附件组件群（Attachment/AttachmentPreview/AttachmentHoverCard 等） |
| `chat-file-viewer.tsx` | 聊天内文件查看 |

### Agent 会话查看

`agent-session-messages-view.tsx`：Agent 历史会话消息查看器，展示某个 agentSession 的完整对话。

## 数据流

### 消息收发（ChatPanel）

1. `ChatPanel` 通过 `getWS()` 建立 WS 连接，监听消息事件。
2. 用户在 `ChatInput` 输入 → `ChatComposerInput` 解析 @mention/工具/MCP → `onSend(content, mentions, attachments, contextLength)`。
3. `ChatPanel` 调 `sdk.channel.sendMessage` 或 WS 发送。
4. Agent 回复通过 WS 流式推送 → 更新 `useChannelStore` → `MessageItem` 渲染 `MessageParts`。
5. 流式 parts 实时更新（reasoning/tool_use/tool_result）。

### Store 依赖

| Store | 用途 |
|---|---|
| `useChannelStore` | 频道/消息状态 |
| `useAgentStore` | Agent 列表/预设 |
| `useChatStore` | 聊天 Agent 配置 |
| `useIssueStore` | Issue 关联 |
| `useMobilePanelStore` | 移动端面板 |

## 设计要点

- **泛型消息列表**：`ChatMessageList<TMessage>` 让频道聊天与内联聊天复用同一渲染逻辑。
- **parts 优先**：消息有 `parts` 时按 parts 渲染，无 parts 回退到 `content`（`shouldRenderLegacyContent`）。
- **memo 优化**：`ChainOfThought` 系列组件用 `memo` 包裹，避免流式更新导致全量重渲染。
- **forwardRef**：`ChatInput` / `ChatComposerInput` 用 forwardRef 暴露 imperative handle（setContent），供外部编程式设置输入。
- **TipTap 富文本**：输入区用 TipTap + mention 扩展，@mention 直接触发 Agent。
