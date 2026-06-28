
# Bot Agent

Bot Agent 是一种特殊的 Agent 预设（`role === 'bot'`），通过外部聊天渠道（飞书 / 企业微信）与用户交互。它是通知中心（Notification Hub）的一部分，把聊天平台消息转发到 Agent Spaces 后端执行，并把结果回复给用户。

## 工作机制

Bot Agent 的执行链路：

1. 用户在飞书 / 企微中向 Bot 发送消息
2. 对应的通知适配器（`lark-adapter` / `wechat-adapter`）接收消息
3. 若消息以 `/` 开头，按内置斜杠命令处理（见下文）
4. 否则调用 `runBotAgent(workspaceId, preset, message)`，使用预设的运行时执行
5. 执行结果格式化后回复给用户

Bot Agent 支持任意一种 Agent 运行时（Claude Code / Codex / LangChain / Hermes / Oh-My-Pi / Open Agent SDK），`maxTurns` 默认 20，使用预设配置的模型、MCP、Skills、沙箱目录与输出风格。执行期间会自动注入持久化 Agent 上下文（`persistent-agent-context`）。

## 内置斜杠命令

Bot 收到 `/` 开头的消息时，不走 Agent 执行，直接由内置命令处理器响应。支持的命令：

| 命令 | 说明 |
|------|------|
| `/workspace [id/name]` | 查看或切换当前会话绑定的 Workspace（`/workspac` 为其别名） |
| `/workspaces` | 列出所有可用 Workspace |
| `/agents` | 列出当前 Workspace 的 Agent 预设 |
| `/issues` | 列出当前 Workspace 的 Issue |
| `/issue <id>` | 查看指定 Issue 的详情 |
| `/task` | 查看当前 Issue 的任务列表（自动绑定到 Bot Agent） |
| `/comment <content>` | 给当前 Issue 添加评论 |
| `/comments` | 查看当前 Issue 的评论 |
| `/changes` | 查看当前 Workspace 的 Git 改动状态 |
| `/commit [desc/auto]` | 提交 Git 改动（`auto` 自动生成提交信息） |
| `/push` | 推送到远程 Git 仓库 |
| `/pull` | 拉取远程 Git 仓库 |
| `/markdown [on/off]` | 开关 Bot 回复的 Markdown 渲染 |
| `/help` | 列出全部可用命令 |

斜杠命令的执行上下文按会话（`conversationId`）缓存，切换 Workspace 后该会话内后续命令都在新 Workspace 下执行。

## 配置 Bot Agent

1. 创建一个 Agent 预设，角色设为「Bot」
2. 配置运行时、模型、MCP 与 Skills
3. 在 Workspace 的通知配置中绑定飞书 / 企微应用（参见 [通知中心](/docs/features/notifications)）
4. 在 Workspace 设置的 `notificationSettings.botAgentId` 中关联上述 Bot 预设
5. 系统通过 `getConfiguredBotAgent(workspaceId)` 解析出启用中的 Bot Agent（`role === 'bot'` 且 `enabled !== false`）

通知渠道使用 Robot Account（`type: 'lark' | 'wechat'`）或全局企业微信扫码登录凭证，详情参见 [通知中心](/docs/features/notifications)。

## 使用 Bot

配置完成后，在飞书或企业微信中找到你的 Bot 应用：

- 直接发送文本消息与 Bot 对话（触发 Agent 执行）
- 使用 `/` 斜杠命令执行特定操作（不走 Agent）
- Bot 会把执行结果或命令响应以消息形式返回

## 安全注意

Bot Agent 通过外部渠道暴露了系统操作能力（包括 Git 提交 / 推送、Issue / Task 操作），建议：

- 为 Bot Agent 配置较低的权限模式
- 限制 Bot Agent 可执行的操作范围与沙箱目录
- 为飞书 / 企微应用配置可信的访问来源
- 定期检查 Bot 的执行日志与 Agent 会话历史
