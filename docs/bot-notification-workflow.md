# Bot 与 Workspace 通知流程

本文档说明当前 workspace 消息通知、bot agent、飞书适配器之间的关系，以及如何扩展命令和接入其他机器人平台。

## 核心关系

每个 workspace 可以配置一组通知设置，字段定义在：

```text
packages/shared/src/types/workspace.ts
```

关键字段：

```ts
notificationSettings?: {
  enabled: boolean;
  provider: 'lark' | 'wechat';
  events: Array<'issue_started' | 'issue_completed' | 'issue_task_completed'>;
  serviceRunning?: boolean;
  botAgentId?: string;
  lark?: {
    appId?: string;
    appSecret?: string;
    chatIds?: string[];
  };
}
```

关系如下：

```text
Workspace
  -> notificationSettings
    -> provider: 当前机器人平台
    -> serviceRunning: 后端重启后是否自动恢复服务
    -> events: 哪些 issue/task 事件需要主动推送
    -> botAgentId: 普通用户消息交给哪个 bot agent 处理
    -> lark.chatIds: 已和飞书 bot 交互过的会话，用于后续推送

Workspace.agents
  -> role === 'bot' 的 agent preset
    -> 被 notificationSettings.botAgentId 引用
```

`bot` 是一个普通 agent preset 角色，类型定义在：

```text
packages/shared/src/types/workspace.ts
packages/shared/src/types/agent.ts
```

创建和编辑入口在：

```text
packages/web/src/components/sidebar/agent-dialog.tsx
```

项目设置面板只展示 bot 类型 agent：

```text
packages/web/src/components/settings/project-settings-panel.tsx
```

## 后端入口

通知服务主要实现位置：

```text
packages/server/src/services/notification-hub.ts
```

后端路由：

```text
POST /api/workspaces/:id/notifications/start
POST /api/workspaces/:id/notifications/stop
POST /api/workspaces/:id/notifications/test
```

路由定义：

```text
packages/server/src/routes/workspace.ts
```

服务启动恢复入口：

```text
packages/server/src/app.ts
```

`app.ts` 启动时会调用 `startPersistedNotificationServices()`，扫描所有 workspace：

```text
notificationSettings.enabled === true
notificationSettings.serviceRunning === true
```

满足条件的 workspace 会自动恢复对应平台的长连接。

## 主动事件推送流程

现有 WebSocket 广播入口在：

```text
packages/server/src/ws/connection-manager.ts
```

每次 `broadcastToWorkspace(workspaceId, event, data)` 后，会调用：

```ts
publishWorkspaceEvent(workspaceId, event, data)
```

`notification-hub.ts` 会把内部 WS 事件映射成外部通知事件。

当前支持：

```text
issue.status_changed -> issuse_status_change
task.status_changed running -> issue_task_start
task.status_changed done/failed/cancelled -> issue_task_done
```

注意：`issuse_status_change` 是当前实现中的兼容事件名，拼写保留了历史 typo。需要改名时要确认下游是否依赖。

当前不会推送：

```text
task.output
agent.output
tool_call / tool_result
```

原因是这些会导致飞书收到大量中间消息。外部平台只接收状态类消息和 task 最终结果。

## 飞书消息接收流程

飞书适配器类：

```text
LarkNotificationAdapter
```

它注册飞书长连接事件：

```ts
'im.message.receive_v1'
```

收到消息后的处理顺序：

1. 读取 `chat_id`，没有则忽略。
2. 用 `message_id` 或 `chat_id + create_time + content` 做 5 分钟内去重。
3. 只处理 `sender_type === 'user'` 的消息。
4. 只处理 `message_type === 'text'` 的消息。
5. 持久化 `chat_id` 到 `notificationSettings.lark.chatIds`。
6. 解析文本内容。
7. 如果是 slash command，走内置命令。
8. 如果不是命令：
   - 没有配置 `botAgentId`：回复 `请先设置agent`
   - 已配置 bot agent：先回复 `xx working...`，再执行 agent，最后发送 final reply

## Bot Agent 执行流程

普通用户消息由：

```text
runBotAgent(workspaceId, preset, message)
```

执行步骤：

1. 通过 `agentService.getOrCreateSessionForConfig()` 创建或复用 agent session。
2. 用 agent preset 创建 runtime：
   - `runtimeKind`
   - `modelProvider`
   - `modelId`
   - `apiBase`
   - `apiKey`
3. 解析 workspace working dir。
4. 调用 runtime：

```ts
runtime.execute(buildBotPrompt(message), workingDir, {
  maxTurns: 20,
  mcpServers,
  skills,
  configDir,
  sandboxDirs,
  systemPrompt,
})
```

5. 记录 agent completion。
6. 返回 final reply。

final reply 的选择规则：

```text
result.output
  -> trim
  -> 过滤空行
  -> 过滤 [usage] tokens=... / [Usage] ...
  -> 取最后一条
  -> fallback 到 result.summary
```

这样可以避免把 usage 统计当成最终回复发给用户。

## 如何创建命令

命令判断入口：

```text
isBuiltInCommand(text)
```

当前策略：

```ts
const command = text.trim().split(/\s+/, 1)[0];
return command.startsWith('/');
```

也就是说，只要以 `/` 开头，都会被视为命令，不会进入 bot agent。

命令响应入口：

```text
buildCommandResponse(workspaceId, text)
```

当前命令：

```text
/workspace
/workspaces
/workspac [id]
/issues
/issue
/issue [id]
/issue new [title] [desc]
/issue start
/issue close
/task
/comment [msg]
/comments
/help
/changes
/commit [desc/auto]
/push
/pull
```

命令说明：

| 命令 | 说明 |
| --- | --- |
| `/workspace` | 查看当前 workspace 信息。 |
| `/workspaces` | 查看所有 workspace 的简略信息。 |
| `/workspac [id]` | 切换到指定 workspace。 |
| `/issues` | 查看当前 workspace 的所有 issues。 |
| `/issue` | 查看当前 issue 信息，包括标题、注释、状态、tasks、成员等。 |
| `/issue [id]` | 进入指定 issue。 |
| `/issue new [title] [desc]` | 创建新的 issue。 |
| `/issue start` | 将当前 issue 切换为立即开始。 |
| `/issue close` | 将当前 issue 设置为失败或关闭状态。 |
| `/task` | 查看当前 agent 的 task。 |
| `/comment [msg]` | 在当前 issue 发表评论。 |
| `/comments` | 查看当前 issue 的 comments。 |
| `/help` | 查看帮助。 |
| `/changes` | 查看当前 diff 文件列表。 |
| `/commit [desc/auto]` | 提交 commit；参数为 `auto` 时走 commit-agent 自动提交。 |
| `/push` | 推送到远程 git。 |
| `/pull` | 从远程 git 拉取。 |

需要维护会话上下文的命令，例如 `/workspac [id]`、`/issue [id]` 和 `/task`，应记录用户当前所在 workspace、issue 和 agent/task 选择，避免每条命令都要求重复传参。

新增命令建议步骤：

1. 在 `buildCommandResponse()` 或 command registry 中明确列出支持的命令，未知 slash command 返回 `/help` 引导。
2. 在 `buildCommandResponse()` 中添加分支。
3. 如果命令需要写操作，不要直接拼字符串改数据，优先调用现有 service：
   - `issueService`
   - `taskService`
   - `channelService`
   - `agentService`
4. 对写操作命令增加参数校验和明确返回文案。
5. 如果命令会启动长期任务，先回复已接收，再后台执行。

建议把复杂命令逐步抽成独立 command registry，例如：

```ts
interface BotCommand {
  name: string;
  aliases?: string[];
  description: string;
  execute(input: { workspaceId: string; text: string; chatId: string }): Promise<string>;
}
```

目前还没有 registry，命令集中写在 `notification-hub.ts`。

## 如何接入其他平台

当前抽象接口：

```ts
interface BotAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(envelope: BroadcastEnvelope): Promise<void>;
  hasRecipients(): boolean;
}
```

新平台接入步骤：

1. 扩展 shared 类型：

```text
packages/shared/src/types/workspace.ts
```

例如：

```ts
export type NotificationProvider = 'lark' | 'wechat' | 'slack';

notificationSettings?: {
  provider: NotificationProvider;
  slack?: {
    botToken?: string;
    channelIds?: string[];
  };
}
```

2. 在前端设置页添加配置表单：

```text
packages/web/src/components/settings/project-settings-panel.tsx
```

3. 在 `notification-hub.ts` 新增 adapter：

```ts
class SlackNotificationAdapter implements BotAdapter {
  async start() {}
  async stop() {}
  async send(envelope: BroadcastEnvelope) {}
  hasRecipients() {}
}
```

4. 在 `startWorkspaceNotificationService()` 里分发：

```ts
if (settings.provider === 'slack') {
  const adapter = new SlackNotificationAdapter(workspace, settings);
  await adapter.start();
  adapters.set(workspaceId, adapter);
  persistServiceRunning(workspaceId, true);
  return { started: true, provider: 'slack' };
}
```

5. 将平台消息事件规范化为当前通用流程：

```text
platform event
  -> chat/conversation id
  -> sender type
  -> text
  -> dedupe key
  -> command or bot agent
```

6. 复用以下逻辑：

```text
isBuiltInCommand()
buildCommandResponse()
getConfiguredBotAgent()
runBotAgent()
formatBotFinalMessage()
```

7. 平台适配器只负责平台 I/O，不要把 issue/task/agent 业务逻辑写进 adapter。

## 事件推送格式

内部通知 envelope：

```ts
interface BroadcastEnvelope {
  event: 'issuse_status_change' | 'issue_status_change' | 'issue_task_start' | 'issue_task_done';
  workspaceId: string;
  timestamp: string;
  data: Record<string, unknown>;
}
```

飞书当前格式化为 message card：

```text
title: formatLarkTitle(envelope)
content: formatLarkContent(envelope)
```

默认内容包括：

```text
Event
Workspace
Issue
Task
Status
Message
Task result success/summary/error
```

不再默认附带 slash commands，避免每条通知污染用户会话。

## 前端配置流程

设置面板位置：

```text
packages/web/src/components/settings/project-settings-panel.tsx
```

用户流程：

1. 打开 project settings。
2. 开启 Message Notifications。
3. 选择平台：
   - Feishu
   - WeChat(todo)
4. 输入平台配置。
5. 选择通知事件。
6. 选择 Bot Agent。
7. Start Service。
8. 在飞书里给 bot 发任意消息，后端会记录 `chat_id`。
9. Test Send 验证主动推送。

Bot Agent 管理复用了：

```text
packages/web/src/components/sidebar/agent-dialog.tsx
```

该组件支持：

```tsx
<AgentDialog roleFilter="bot" />
```

这样设置页只展示和创建 bot agent。

## 常见问题

### 后端重启后为什么没有推送？

检查：

```text
notificationSettings.enabled === true
notificationSettings.serviceRunning === true
notificationSettings.lark.chatIds.length > 0
```

如果 `chatIds` 为空，需要先在飞书里给 bot 发一条消息。

### 为什么普通消息没有进入 agent？

检查：

```text
notificationSettings.botAgentId
workspace.agents 中存在该 id
agent.role === 'bot'
agent.enabled !== false
```

如果未配置，会返回：

```text
请先设置agent
```

### 为什么 slash command 不进 agent？

当前设计是所有 `/` 开头文本都走内置命令，以避免命令被模型误处理。

### 为什么不推送 agent 的每条输出？

`task.output` 和 `agent.output` 会包含大量 tool call、tool result、usage、debug output。当前只推 issue/task 状态和 task done 结果，避免刷屏。

### 为什么会出现重复执行？

飞书长连接可能重复投递同一事件。当前用 message id 或 `chat_id + create_time + content` 做 5 分钟去重。
