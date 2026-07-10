# Team 技术接手文档

## 1. 这块功能现在是什么

`team` 是一个**全局协作模块**，不再绑定 workspace。

当前包含 3 类能力：

- team 基础管理：创建、列表、详情、编辑、解散
- team membership：加入、邀请、离开
- team message/inbox：团队消息、收件箱、评论

前端入口是 team 管理页/弹窗；后端按 manage / membership / message / inbox / runtime 拆分 service，`team.ts` 仅作为统一导出入口。

## 2. 关键结论

- team 定义存储在全局目录 `.agent-spaces-data/team/`，会话数据按 UUID `session_id` 隔离
- team API 是全局路由，不再带 `/workspaces/:id/...`
- team 可包含 3 类成员来源：`agent`、`chat`、`custom`
- workflow 导入 team 成员时，必须取 `agent_run.data.agentConfigId`，不能取 `agent_run.data.agent.id`
- **前端调用 team 接口一律走 `sdk.team.*`，禁止在组件里手拼 `/api/teams...` URL**
- team 接口返回 `{ success, code, message, data }` 信封，与 SDK 其他模块不同；解包逻辑收敛在 `sdk.team` 内部（`unwrap`），调用方直接拿到 `data`
- **`owner/admin` 是 team 内角色，不是平台级身份**（详见第 6 节）；前端管理页 actor 可能是任意 agent，不一定是 team 成员
- **team 列表查询已移除所有可见性/关键词过滤**，只按 `archived` 区分活跃/归档，管理页展示全部 team
- **runtime/chat 的人工用户固定为 `admin`**：消息保留 `admin -> owner/member` 的真实方向，owner/member 回复另存为反向消息
- **team 会话以 UUID `session_id` 唯一标识**：runtime、message、inbox、日志和前端消息卡必须透传同一个 ID；不再使用 `runtime_id/runtimeId`
- team 聊天标题栏可通过 session Select 切换历史会话；频道中的 team 消息卡通过 `metadata.sessionId` 打开对应会话
- **agent handoff 必须等待下游 agent 完成**：工具调用不能 fire-and-forget，否则父 LangChain stream 会提前关闭

## 3. 核心文件入口

### 后端

- `packages/server/src/services/team.ts`
  - team service 统一导出入口
- `packages/server/src/services/team-runtime.ts`
  - session 列表、runtime 加载、消息执行和 agent handoff
- `packages/server/src/ws/html-utils.ts`
  - 频道 mention 解析与清理；team 消息发送前移除 `@team` span
- `packages/server/src/routes/team.ts`
  - HTTP 路由装配
- `packages/server/src/services/builtin-tools/team-tools.ts`
  - 内置工具 schema，给 agent/tool 调用 team 能力用
- `packages/server/src/services/agent.ts`
  - agent preset 查询
- `packages/server/src/services/chat.ts`
  - chat agent 查询

### 前端

- `packages/web/src/components/teams/team-management-page.tsx`
  - team 页面主体
  - 通过 `sdk.team.*` 调用 team 接口（不再外部拼 URL）
- `packages/web/src/components/teams/team-chat-panel.tsx`
  - team runtime 聊天面板
  - 通过 `sdk.team.listSessions / getRuntime / sendRuntimeMessage / clearMessages / deleteMessage` 调用
  - 右侧 Select 切换当前 `session_id`
- `packages/web/src/components/chat/message-item.tsx`
  - 频道 team 消息卡
  - 从 `message.metadata.sessionId` 定位并打开对应 team 会话
- `packages/web/src/components/teams/team-member-list.tsx`
  - 成员列表与增删改
  - 通过 `sdk.team.invite / setRole / remove` 调用
- `packages/web/src/components/teams/create-team-dialog.tsx`
  - 创建/编辑 team 对话框
- `packages/web/src/components/teams/team-management-dialog.tsx`
  - team 弹窗入口
  - workflow 导入 team 默认成员的逻辑在这里
- `packages/web/src/app/teams/page.tsx`
  - `/teams` 页面入口

### SDK（team API 唯一出口）

- `packages/sdk/src/modules/team.ts`
  - **前端所有 team 接口调用的唯一出口**
  - 封装了 team 管理 / membership / runtime / 消息 全部方法
  - 内部统一解包 `{ success, code, message, data }` 信封
  - 视图类型（`TeamView / TeamDetail / TeamRuntimeResponse` 等）在此定义并从 SDK 导出

### 类型

- `packages/shared/src/types/team.ts`
  - team 共享类型定义

### 测试

- `packages/server/test/team-membership.test.ts`
  - 本轮新增回归测试

## 4. 数据存储结构

team 数据目录：

```text
.agent-spaces-data/team/
  teams.json
  {team_id}/
    info.json
    memberships.json
    {session_id}/
      messages.json
      deliveries.json
      comments.json
      runtimes.json
      logs/team.log
```

含义：

- `teams.json`
  - team id 索引数组
- `{team_id}/info.json`
  - team 基础信息
- `{team_id}/memberships.json`
  - 成员关系
- `{team_id}/{session_id}/messages.json`
  - 发送过的 team 消息
- `{team_id}/{session_id}/deliveries.json`
  - inbox 投递记录
- `{team_id}/{session_id}/comments.json`
  - 消息评论

`session_id` 是 team 会话唯一 UUID。前端打开 team 聊天时生成并在 runtime、消息、inbox 请求中持续透传；API 和消息字段统一使用 `session_id/sessionId`，不再使用 `runtime_id/runtimeId`。

## 5. memberships.json 当前结构

当前 membership 关键字段：

```json
{
  "id": "uuid",
  "teamId": "team-id",
  "agentId": "agent-id-or-chat-id-or-custom-id",
  "agentStore": "agent | chat | custom",
  "agent": {
    "id": "custom-agent-id",
    "name": "Custom Agent"
  },
  "role": "owner | admin | member | observer",
  "status": "active | left | removed | suspended",
  "joinedAt": "ISO",
  "updatedAt": "ISO"
}
```

说明：

- `agentStore`
  - `agent`：来自 agent preset
  - `chat`：来自 chat agent store
  - `custom`：直接把 agent 配置对象挂在 membership 上
- `agent`
  - 仅 `custom` 场景必需
  - 其他场景可为空

兼容逻辑：

- 旧 membership 没有 `agentStore` 时，后端读取时会尝试自动推断
- 推断规则：
  - 先查 agent preset
  - 再查 chat agent
  - 都查不到时，默认回退为 `agent`

注意：

- 这是**读取时补语义**，不是批量迁移脚本
- 如果后续要做数据修复或导出工具，最好单独做迁移

## 6. owner / admin 概念辨析（易混淆）

> **这是最容易踩坑的点，接手前务必读一遍。**

### 6.1 role 是 team 内角色，不是平台身份

`membership.role` 的取值：

| role | 含义 | 权限 |
| --- | --- | --- |
| `owner` | 团队创建者/最高权限 | 全部操作 |
| `admin` | 团队管理员 | invite / set-role / remove / update |
| `member` | 普通成员 | 参与 runtime/chat |
| `observer` | 观察者 | 只读 |

**关键区分：**

- ❌ **不存在「平台级 admin」**：系统中没有全局超管概念。`admin` 只是某个 team 内的角色。
- ❌ **前端 `selectedActorId` 不是身份声明**：它是管理页顶部选的「当前操作 agent」，可能是任意 agent（包括非任何 team 成员的 `agent-generator`）。它不携带任何权限语义。
- ✅ **owner 唯一性**：转移 owner 时（`set_role` 新角色为 owner），其它 active owner 自动降级为 admin。
- ✅ **remove 是硬删除**：`action=remove` 直接从 `memberships.json` 过滤掉成员，**不保留** `status: removed` 记录（已改，见第 10 节）。

### 6.2 list 查询不过滤（管理视角）

team 列表查询（`GET /api/teams`）已**移除所有过滤器**：

- ❌ 不再有 `scope=visible/mine/all`
- ❌ 不再有 `keyword` / `status_filter` 过滤
- ✅ 只按 `archived` 参数区分活跃/归档数据源
- ✅ 不要求 `actor_agent_id`（list action 免 actor 校验）

无论 actor 是否为成员、team 是否 open，列表都返回全部 team。

### 6.3 runtime/chat 人工用户与 owner 唤起机制

`team-chat-panel.tsx` 使用固定人工身份 `admin` 加载和发送 runtime 消息。`admin` 不是 team role，也不是 membership；它表示用户在管理页手动触发。

```
用户手动发送
  └─ admin -> owner（或用户 @ 的 active member）
       └─ 唤起目标 agent 执行
            └─ target agent -> admin（完成回复）
```

关键约束：

- `postTeamRuntimeMessage` 必须保留传入的 `actorAgentId`，禁止替换成 owner
- `getTeamRuntime` 必须同时使用同一个 actor 和 `session_id` 加载会话
- `session_id` 必须是 UUID；服务端会校验，防止非法目录路径
- `team-chat-panel.tsx` 的 `initialSessionId` 用于消息卡定位；不传时才创建新 UUID
- session Select 的列表来自 `GET /api/teams/:teamId/sessions`，按 `updated_at` 倒序
- 非成员 sender/recipient 的豁免只通过 `handleTeamMessageSend` 的服务端内部 options 开启，HTTP body 不能伪造
- `deliveries.json` 的人工输入应为 `senderAgentId=admin`、`recipientAgentId=<目标 agent>`

`listParticipants` 仍用请求 actor 过滤：

- 成员视角：actor 在成员列表中 → 正常排除自己，agent bar 不显示自己
- `admin` 视角：不在成员列表 → 返回全部成员（含 owner）

这是为了让管理视角的 agent bar 能展示 owner。**修改 participants 过滤逻辑时务必同时考虑这两个视角。**

### 6.4 转移 owner 的正确流程

前端 `confirmRemoveOwner`（`team-member-list.tsx`）执行两步：

1. `sdk.team.setRole(teamId, actor, newOwnerId, "owner")` — 新 owner 上位，旧 owner 自动降 admin
2. `sdk.team.remove(teamId, actor, oldOwnerId)` — 旧 owner 从 members 硬删除

注意：第 2 步之前旧 owner 已是 admin（非唯一 owner），所以 `last owner cannot be removed` 校验不会拦截。

## 7. HTTP 路由

当前 team 路由：

- `GET /api/teams`
  - list teams
- `POST /api/teams`
  - create team
- `GET /api/teams/:teamId`
  - get team detail
- `PATCH /api/teams/:teamId`
  - update team
- `POST /api/teams/:teamId/join`
  - join team
- `POST /api/teams/:teamId/invite`
  - invite member
- `POST /api/teams/:teamId/leave`
  - leave team
- `POST /api/teams/:teamId/dissolve`
  - dissolve team
- `POST /api/teams/:teamId/messages`
  - send team message
- `GET /api/teams/:teamId/sessions`
  - list team sessions
- `GET /api/teams/:teamId/runtime?session_id=<uuid>`
  - load one team session
- `POST /api/teams/:teamId/runtime/messages`
  - send message in one team session（body 必须带 `session_id`）

收件箱/评论：

- `GET /api/team-inbox`
- `GET /api/team-inbox/:deliveryId`
- `PATCH /api/team-inbox/:deliveryId`
- `GET /api/team-messages/:messageId/comments`
- `POST /api/team-messages/:messageId/comments`
- `DELETE /api/team-messages/comments/:commentId`

### 7.1 前端调用约定

上述路由中，**已被 `sdk.team` 封装的部分，前端必须走 SDK，不允许在组件里手拼 URL**。

`sdk.team` 当前覆盖（见 `packages/sdk/src/modules/team.ts`）：

| SDK 方法 | 对应路由 |
| --- | --- |
| `sdk.team.list` | `GET /api/teams` |
| `sdk.team.get` | `GET /api/teams/:teamId` |
| `sdk.team.create` | `POST /api/teams` |
| `sdk.team.update` | `PATCH /api/teams/:teamId` |
| `sdk.team.dissolve` | `POST /api/teams/:teamId/dissolve` |
| `sdk.team.deleteArchive` | `POST /api/teams/archive/delete` |
| `sdk.team.clearArchives` | `POST /api/teams/archive/clear` |
| `sdk.team.invite` | `POST /api/teams/:teamId/invite` |
| `sdk.team.setRole` | `POST /api/teams/:teamId/set-role` |
| `sdk.team.remove` | `POST /api/teams/:teamId/remove` |
| `sdk.team.listSessions` | `GET /api/teams/:teamId/sessions` |
| `sdk.team.getRuntime` | `GET /api/teams/:teamId/runtime` |
| `sdk.team.sendRuntimeMessage` | `POST /api/teams/:teamId/runtime/messages` |
| `sdk.team.clearMessages` | `DELETE /api/teams/:teamId/messages` |
| `sdk.team.deleteMessage` | `DELETE /api/team-messages/:messageId` |

尚未封装（无前端调用点，用到时补）：`join`、`leave`、消息评论系列。

## 8. 内置工具

`packages/server/src/services/builtin-tools/team-tools.ts` 当前主要暴露：

- `team_manage`
- `team_membership_manage`
- `team_message_send`
- `team_inbox_query`
- `team_message_update`
- `team_message_comment`

其中 `team_membership_manage` 现在支持：

- `action=join`
- `action=invite`
- `action=leave`

`invite` 相关入参重点：

- `team_id`
- `actor_agent_id`
- `target_agent_id` 或 `agent_id`
- `agent_store`
- `agent`
- `role`

### 8.1 runtime 内的 team 工具上下文

team runtime 创建内置工具时会绑定当前 `teamId` 和当前 agent id：

- 覆盖模型传入的 `team_id` / `actor_agent_id`，避免把 recipient agent id 误当成 team id
- prompt 同时写入当前 `team_id`、当前 `actor_agent_id`
- prompt 包含全部 active members 的简要信息：agent id、名称、team role
- agent 完成后，结果至少通知人工发起者；member 完成时同时通知 owner，收件人自动去重

### 8.2 agent handoff 生命周期

`team_message_send` 从一个 agent 唤起下一个 agent 时，走 `handleTeamMessageSendAndRun`：

- agent 工具入口必须 `await dispatchTeamReply`，直到下游 agent 完成后才返回 tool result
- UI 的 `postTeamRuntimeMessage` 仍立即返回，后台执行 agent，不阻塞 HTTP 请求
- 禁止恢复 `void (async () => ...)()` 式 handoff；父 LangChain runtime 会先结束并关闭 stream，导致下游 token 写入已关闭 controller

## 9. 当前关键流程

### 9.1 创建 team

入口：

- 前端 `team-management-page.tsx`
- 后端 `handleTeamManage(action=create)`

流程：

1. 前端提交 team 基础信息和 `initial_members`
2. 后端创建 owner membership
3. 后端遍历 `initial_members`
4. 每个成员都走统一的 membership agent 解析逻辑
5. 写入 `info.json`、`memberships.json`、空消息文件

### 9.2 workflow 导入 team 默认成员

入口：

- `packages/web/src/components/teams/team-management-dialog.tsx`

当前正确逻辑：

1. 扫描 workflow 的 `agent_run` 节点
2. 读取 `node.data.agentConfigId`
3. 去重
4. 作为 create dialog 的默认 `members`

不要再用：

- `node.data.agent.id`

原因：

- `node.data.agent` 里可能是运行时 agent 配置片段
- 里面的 `id` 可能是 `default` 这类值，不是 preset id

### 9.3 invite member

入口：

- HTTP：`POST /api/teams/:teamId/invite`
- tool：`team_membership_manage(action=invite)`
- 后端：`handleTeamMembershipManage`

流程：

1. 检查邀请人是 `owner/admin`
2. 检查 team 状态为 `active`
3. 解析目标成员来源
4. 按来源查存在性
5. 已存在且 active 则返回 `ALREADY_JOINED`
6. 不存在则新建 membership；存在但非 active 则复用并恢复 active
7. 更新 team member count

存在性校验规则：

- `agentStore=agent`
  - 查 `agent.ts` 的 preset
- `agentStore=chat`
  - 查 `chat.ts` 的 chat agent
- `agentStore=custom`
  - 必须传 `agent` 对象

找不到返回：

- `AGENT_NOT_FOUND`

### 9.4 join team

入口：

- `POST /api/teams/:teamId/join`
- `handleTeamMembershipManage(action=join)`

规则：

- open team 可直接 join
- private team 只有已在 team 中的成员才能继续走 join
- join 时会补 `agentStore/agent` 语义

## 10. 最近已修复的问题

### 已修复 1：workflow 导入时 agent-id 变成 `default`

根因：

- 读取了 `agent_run.data.agent.id`

修复：

- 改为读取 `agent_run.data.agentConfigId`

### 已修复 2：membership 缺少区分 chat / agent store 的标识

修复：

- 增加 `agentStore`

### 已修复 3：邀请成员时不校验 agent 是否存在

修复：

- `invite` 时统一做存在性校验
- 查不到直接报 `AGENT_NOT_FOUND`

### 已修复 4：membership 不支持自定义 agent 配置

修复：

- membership 增加可选 `agent` 对象
- `agentStore=custom` 时允许直接写入配置

### 已修复 5：转移 owner 后列表变空（scope=visible 过滤）

根因：

- list 查询用 `scope=visible` 按 actor 做成员可见性过滤
- 转移 owner 后旧 owner（actor）非成员 → 全部 team 被过滤掉

修复：

- **list 查询移除所有过滤器**（scope / keyword / status_filter），只按 `archived` 区分数据源
- list action 免 `actor_agent_id` 校验

### 已修复 6：remove 成员残留 removed 记录

根因：

- `action=remove` 是软删除，标记 `status: removed` 并保留记录
- 残留记录导致数据不干净

修复：

- 改为**硬删除**，直接从 `memberships.json` 过滤掉成员，不再保留 removed 记录

### 已修复 7：人工用户消息被改成 owner 发送

根因：

- `postTeamRuntimeMessage` 把非成员 actor 回退为 owner
- 随后目标解析排除 sender，导致消息方向变成 `owner -> 其他 member`

修复：

- team chat 人工身份固定为 `admin`
- runtime 保留原始 actor，消息正确落盘为 `admin -> 目标 agent`
- owner/member 回复单独落盘为 `目标 agent -> admin`

### 已修复 8：team 工具调用 `TEAM_NOT_FOUND`

- 根因：模型把 recipient agent id 填进 `team_id`
- 修复：runtime 工具在服务端绑定真实 `team_id` / `actor_agent_id`，prompt 也明确注入这两个值

### 已修复 9：reply 的 `<think>` 污染 inbox

- 根因：MiniMax 的推理文本被 `formatAgentReply` 原样保存到 message/delivery
- 修复：reply 落盘前剥离 `<think>...</think>`，delivery 的 subject/preview 只取最终回复

### 已修复 10：member 完成后没有通知 owner

- 修复：完成回复收件人合并人工发起者和 active owner，并通过 `Set` 去重

### 已修复 11：agent 不知道当前 team members

- 修复：prompt 加入全部 active members 的 agent id、名称、membership role；role 不再取 AgentConfig 的通用 `agent` 值

### 已修复 12：handoff 报 `Controller is already closed`

- 根因：`team_message_send` fire-and-forget 启动下游 agent，父 LangChain runtime 先结束并关闭 stream
- 修复：agent 工具入口等待下游 `dispatchTeamReply` 完整结束；UI 发送路径继续异步
- 回归测试用延迟 gate 验证下游未结束前 tool Promise 不会 resolve

### 已修复 13：不同 team 会话共享消息

- 根因：消息、投递、runtime 和日志都直接写在 `{team_id}` 目录
- 修复：创建 UUID `session_id`，会话数据写入 `{team_id}/{session_id}/`
- API、SDK、消息 metadata 和 websocket event 统一使用 `session_id/sessionId`，移除 team 范围的 `runtime_id/runtimeId`

### 已修复 14：team 消息卡打开了错误会话

- 根因：消息卡只传 `teamId`，`TeamChatPanel` 自动生成了新 UUID
- 修复：频道消息卡保存 `metadata.sessionId`，打开时通过 `initialSessionId` 传给聊天面板
- 聊天面板右侧 session Select 可切换该 team 已存在的会话

### 已修复 15：发送内容残留 `@team`

- 根因：`stripMentionIds` 只匹配空 mention span，无法清理 `<span ...>@Team</span>`
- 修复：mention 清理支持 span 内文本；仅移除本次识别出的 team mention，不影响普通 agent mention

## 11. 当前已知限制

- team 编辑模式现在支持完整成员增删改 UI（invite / set-role / remove），通过 `sdk.team` 调用
  - PATCH 本身仍只改 team 基础字段；成员变更走独立 membership 接口
- workflow 导入只是导入 agent ids
  - 不会直接导入更复杂的 team 成员配置
- 旧 membership 数据没有独立迁移命令
  - 只是读取时兜底推断
- 旧的 `{team_id}/messages.json` 等全局会话文件不会自动迁移到某个 session
  - 新会话只读取 `{team_id}/{session_id}/`，需要保留旧消息时单独做一次性迁移
- `createTeamFunctionTools(workspaceId, allowedTools?)` 里的 `workspaceId`
  - 仍是历史残留参数
  - handler 已经不再依赖它
- `sdk.team` 目前未封装消息评论接口
  - 后续有前端调用点时补到同一模块即可

## 12. 下个 agent 接手建议

如果要继续做成员管理，优先按下面顺序看：

1. `packages/server/src/services/team.ts`
2. `packages/server/src/routes/team.ts`
3. `packages/server/src/services/builtin-tools/team-tools.ts`
4. `packages/sdk/src/modules/team.ts`
5. `packages/web/src/components/teams/team-management-page.tsx`
6. `packages/web/src/components/teams/team-member-list.tsx`
7. `packages/web/src/components/teams/team-chat-panel.tsx`
8. `packages/shared/src/types/team.ts`

推荐先确认的问题：

- 是只补前端 invite/member manage UI，还是还要扩数据模型
- custom agent 是只允许一次性静态配置，还是后续允许在 team 内编辑
- workflow 导入后，是否要支持导入 `custom agent` 配置而不只是 preset id

## 13. 快速验收命令

类型检查：

```powershell
pnpm exec tsc --noEmit -p "packages/server/tsconfig.json"
pnpm exec tsc --noEmit -p "packages/shared/tsconfig.json"
pnpm exec tsc --noEmit -p "packages/web/tsconfig.json"
```

回归测试：

```powershell
pnpm exec tsx --test "packages/server/test/team-membership.test.ts"
pnpm exec tsx --test "packages/server/test/channel-team.test.ts"
```

## 14. 快速排查指南

如果 team 创建后成员不对，看：

- `team-management-dialog.tsx` 是否仍在取错 workflow 字段
- `team-management-page.tsx` 提交的 `initial_members` 内容
- `{team_id}/memberships.json` 实际落盘

如果 invite 报错或没生效，看：

- `agent_store` 传值是否正确
- `target_agent_id` / `agent_id` 是否真的存在
- `handleTeamMembershipManage(action=invite)` 分支

如果 UI 看不到 team，看：

- list 查询现已**移除所有过滤**，只按 `archived` 区分；正常情况应返回全部 team
- 若仍为空，检查 `teams.json` 索引和 `{team_id}/info.json` 是否存在
- 人工输入应在 `{team_id}/{session_id}/messages.json` / `deliveries.json` 中显示为 `admin -> 目标 agent`；如果变成 owner 发送，检查是否重新引入了 actor 回退

如果 session Select 缺少会话或切换后消息不对，看：

- `{team_id}/{session_id}/runtimes.json` 是否存在；sessions 接口只列出有效 UUID 目录及其中的 runtime
- `sdk.team.listSessions(teamId)` 是否返回目标 UUID
- `TeamChatPanel` 当前 `sessionId` 是否同时传给 `getRuntime / sendRuntimeMessage / listInbox / clearMessages / deleteMessage`
- 从频道 team 消息卡打开时，`message.metadata.sessionId` 是否传入 `initialSessionId`

如果发送给 team 的正文仍包含 `@team`，看：

- `handler.ts` 是否先用 `stripMentionIds(content, teamMentionIds)` 生成 `messageContent`
- `html-utils.ts` 的 mention 正则是否仍允许 span 内包含文本
- 运行 `packages/server/test/channel-team.test.ts` 确认带文本 mention span 能被清理

如果 agent handoff 报 `Controller is already closed`，看：

- `handleTeamMessageSendAndRun` 是否仍等待 `postTeamRuntimeMessage(..., true)`
- `dispatchTeamReply` 是否返回 Promise，不能 fire-and-forget
- 日志中父 `langchain:N` 是否在子 `langchain:N+1` 完成前出现 `runtime reset`

如果 inbox 出现 `<think>` 或 team 工具报 `TEAM_NOT_FOUND`，看：

- `formatAgentReply` 是否仍剥离 `<think>...</think>`
- `createTeamFunctionTools` 是否传入并绑定当前 team/agent context

如果 `sdk.team.*` 报错（如信封解析失败），看：

- `packages/sdk/src/modules/team.ts` 的 `unwrap` 逻辑
- 服务端 `sendResult` 返回的 `success` 是否为 `true`
- 接口路径是否与 `packages/server/src/routes/team.ts` 一致

## 15. 一句话总结

这块现在的核心是：**team 定义全局共享，membership 支持 `agent/chat/custom`，聊天数据按 UUID `session_id` 隔离；所有 runtime、消息、inbox、消息卡和工具调用必须透传同一个 session。**
