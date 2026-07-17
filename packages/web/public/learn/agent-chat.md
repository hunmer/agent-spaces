# Agent Chat

频道是工作空间内的沟通中心，你可以在这里与 Agent 对话。频道类型包括 `general` / `issue` / `agent` / `mini-apps`。

## 频道与消息

每个工作空间包含多个频道，支持发送消息、@mention Agent。频道还支持草稿、待办列表、`notifyOnComplete`（控制 Agent 回复完成是否触发通知）。

### 富文本编辑

基于 TipTap，支持：

- **Markdown 格式** — 代码块、加粗、列表等
- **@mention** — 输入 `@` 触发 Agent 选择器
- **代码块** — 支持语法高亮

### 语音识别输入

点击麦克风按钮 → WebSocket 实时传输音频到后端 → 识别结果实时回显（基于腾讯语音实时识别服务，需在设置页配置凭证）。

## @mention 触发 Agent

输入 `@` 触发 Agent 选择器，选择后：

1. 发送消息，被 mention 的 Agent 自动唤醒
2. Agent 根据消息内容执行相应操作
3. 执行结果在频道中实时展示

适合快速给 Agent 下达指令，不需要创建正式议题。

### Agent 提问交互

Agent 执行过程中可向你提问（AskUserQuestion）：发送包含选项的问题 → 你选择答案 → Agent 继续执行。

## AI 消息渲染

Agent 回复采用结构化渲染，后端把 runtime 实时输出累加为 `parts`，节流广播（约 120ms）：

| 类型 | 说明 |
|------|------|
| `text` | 最终结论文本 |
| `reasoning` | 思考过程 |
| `chain` | 工具调用链容器（含 AI 中间消息 + 工具调用 step） |
| `terminal` | 命令和终端输出 |
| `confirmation` | 工具权限确认请求 |
| `context` | 上下文窗口与 token 使用 |
| `subagent` | Agent 自主调用的子 agent |
| `ask_user_question` | Agent 向用户提问 |

工具详情懒加载：chain item 只保存 `detailId`，展开时再查询。Edit/MultiEdit 用 diff-viewer 渲染，JSON 详情用只读 Monaco 渲染。

## 回复 AI 消息

回复时系统不是简单再发一条新消息，而是挂到父消息下并继续追加新一轮 Agent 输出：

- 用户回复写进父消息的 `replies`，不出现在主时间线
- 父消息主体继续追加新的 user_message、reasoning、tool calls、最终文本
- 若 runtime 支持（claude-code / codex），优先恢复原 session/thread，复用工具上下文

## 消息状态语义

`pending`（已创建未产出）→ `streaming`（运行中持续更新 parts）→ `waiting_for_user`（等待 AskUserQuestion 回复）→ `completed` / `error`。
