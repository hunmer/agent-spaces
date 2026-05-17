# 频道通知开关功能

## Context

用户希望在频道聊天输入区域右侧添加一个开关，开启后当该频道的 AI Agent 完成消息回复时，自动触发后端通知（走工作空间的默认通知渠道：飞书/企微/Native）。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `packages/shared/src/types/channel.ts` | Channel 接口加 `notifyOnComplete?: boolean` |
| `packages/shared/src/types/notification.ts` | NotificationType 加 `'channel_agent_completed'` |
| `packages/server/src/services/channel.ts:49-66` | updateChannel Pick 加 `notifyOnComplete` |
| `packages/server/src/ws/agent-runner.ts:460-512` | Agent 完成后检查 channel.notifyOnComplete，触发通知 |
| `packages/server/src/services/notification-hub/events.ts` | `buildNotificationEnvelope` 加 `agent.completed` 事件处理 |
| `packages/server/src/services/notification-hub/events.ts` | `persistInAppNotification` 加 `agent.completed` 持久化 |
| `packages/web/src/components/chat/chat-input.tsx:576-631` | 右侧加通知开关 Switch |
| `packages/web/src/stores/channel.ts:15` | updateChannel 类型加 `notifyOnComplete` |
| `packages/web/src/locales/zh.json` | 加翻译 key |
| `packages/web/src/locales/en.json` | 加翻译 key |

## 实现步骤

### 1. shared 类型 — Channel 加字段

`packages/shared/src/types/channel.ts` Channel 接口：
```ts
notifyOnComplete?: boolean;
```

### 2. shared 类型 — NotificationType 扩展

`packages/shared/src/types/notification.ts`：
```ts
export type NotificationType = 'issue_completed' | 'issue_failed' | 'task_completed' | 'task_failed' | 'channel_agent_completed';
```

### 3. server — channel service 支持持久化

`packages/server/src/services/channel.ts` updateChannel：
- Pick 类型加 `'notifyOnComplete'`
- 函数体加 `if (Object.hasOwn(data, 'notifyOnComplete')) channels[idx].notifyOnComplete = data.notifyOnComplete;`

### 4. server — notification-hub 处理 agent.completed 事件

`packages/server/src/services/notification-hub/events.ts`：

在 `buildNotificationEnvelope` 中加 `agent.completed` 事件：
- 检查 channel.notifyOnComplete === true
- 构建 envelope，包含 agentName、channelId、summary 等

在 `persistInAppNotification` 中加 `agent.completed` 处理：
- 创建 `channel_agent_completed` 类型的应用内通知

### 5. server — agent-runner 触发通知

`packages/server/src/ws/agent-runner.ts`：

在 agent 成功完成后（约 L470 `broadcastToWorkspace(workspaceId, 'agent.completed', ...)` 之后），检查 `channel.notifyOnComplete`，如果为 true 则调用 `publishWorkspaceEvent` 或让 `broadcastToWorkspace` 自动走通知链（需要让 notification-hub 识别 agent.completed 事件）。

注意：`broadcastToWorkspace` 已经调用了 `publishWorkspaceEvent`，所以只要 `buildNotificationEnvelope` 能处理 `agent.completed` 事件即可。但需要传递 channel 信息。查看当前 agent.completed 的 data 结构，需要确保包含 channelId。

查看 L470 的 data：
```ts
{ agentId, result: { success, summary, artifacts, error }, error }
```
没有 channelId。但 `publishWorkspaceEvent` 在 `broadcastToWorkspace` 中被调用时，workspaceId 是已知的。

**方案**：在 `buildNotificationEnvelope` 中，当收到 `agent.completed` 时，从 data 中获取 agentId，通过 agentService 查找 session 获取 channelId（或直接在 agent.completed data 中附加 channelId）。

**确认方案**：在 agent-runner.ts L470 的 `broadcastToWorkspace(workspaceId, 'agent.completed', { ... })` data 中加 `channelId` 字段（闭包已有 channelId 变量），然后在 events.ts 中根据 channelId 查 channel 检查 notifyOnComplete。仅当 channel.notifyOnComplete === true 且 result.success 时发送通知。

### 6. 前端 — chat-input 加开关

`packages/web/src/components/chat/chat-input.tsx`：

在 agent quick bar 区域右侧（L630 `</div>` 之后，`</div>` 之前）加一个 Switch 组件：
- 读取 `activeChannel?.notifyOnComplete`
- 切换时调用 `updateChannel(workspaceId, channelId, { notifyOnComplete: !current })`
- 使用 shadcn Switch 组件
- 加 Bell 图标

### 7. 前端 — i18n

`zh.json` 加：`"input.notifyOnComplete": "完成通知"`
`en.json` 加：`"input.notifyOnComplete": "Notify on complete"`

## 验证

1. 前端切换开关，刷新后状态保持
2. 开启开关后 @agent 发消息，等 Agent 完成后检查是否收到通知
3. 关闭开关后 Agent 完成不触发通知
