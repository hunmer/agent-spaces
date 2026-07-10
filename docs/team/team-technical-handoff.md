# Team 技术接手文档

## 1. 这块功能现在是什么

`team` 是一个**全局协作模块**，不再绑定 workspace。

当前包含 3 类能力：

- team 基础管理：创建、列表、详情、编辑、解散
- team membership：加入、邀请、离开
- team message/inbox：团队消息、收件箱、评论

前端入口是 team 管理页/弹窗；后端核心都收敛在一个 service 文件里。

## 2. 关键结论

- team 数据存储在全局目录 `.agent-spaces-data/team/`
- team API 是全局路由，不再带 `/workspaces/:id/...`
- team 可包含 3 类成员来源：`agent`、`chat`、`custom`
- workflow 导入 team 成员时，必须取 `agent_run.data.agentConfigId`，不能取 `agent_run.data.agent.id`
- **前端调用 team 接口一律走 `sdk.team.*`，禁止在组件里手拼 `/api/teams...` URL**
- team 接口返回 `{ success, code, message, data }` 信封，与 SDK 其他模块不同；解包逻辑收敛在 `sdk.team` 内部（`unwrap`），调用方直接拿到 `data`
- **`owner/admin` 是 team 内角色，不是平台级身份**（详见第 6 节）；前端管理页 actor 可能是任意 agent，不一定是 team 成员
- **team 列表查询已移除所有可见性/关键词过滤**，只按 `archived` 区分活跃/归档，管理页展示全部 team
- **runtime/chat 支持非成员（管理视角）访问**：非成员 actor 自动回退用 team owner 身份读写，不报权限错误

## 3. 核心文件入口

### 后端

- `packages/server/src/services/team.ts`
  - team 主服务
  - 包含 team / membership / message / inbox / comment 全部核心逻辑
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
  - 通过 `sdk.team.getRuntime / sendRuntimeMessage / clearMessages / deleteMessage` 调用
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
    messages.json
    deliveries.json
    comments.json
```

含义：

- `teams.json`
  - team id 索引数组
- `{team_id}/info.json`
  - team 基础信息
- `{team_id}/memberships.json`
  - 成员关系
- `{team_id}/messages.json`
  - 发送过的 team 消息
- `{team_id}/deliveries.json`
  - inbox 投递记录
- `{team_id}/comments.json`
  - 消息评论

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

### 6.3 runtime/chat 非成员回退机制

`getTeamRuntime` / `postTeamRuntimeMessage` 的成员校验已放开：

```
传入 actorAgentId
  ├─ 是 active 成员 → 用自己作为 effectiveActorId
  └─ 非成员（管理视角）→ 回退用 team owner（无 owner 则首个 active 成员）
```

后续所有读写（runtime 加载、消息发送、广播）都用 `effectiveActorId`，使非成员能查看和参与任意 team 的协作。

**但 `listParticipants` 用原始 `actorAgentId` 过滤**（排除「自己」）：

- 成员视角：actor 在成员列表中 → 正常排除自己，agent bar 不显示自己
- 非成员视角：actor 不在成员列表 → 等于不过滤，返回全部成员（含 owner）

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
| `sdk.team.getRuntime` | `GET /api/teams/:teamId/runtime` |
| `sdk.team.sendRuntimeMessage` | `POST /api/teams/:teamId/runtime/messages` |
| `sdk.team.clearMessages` | `DELETE /api/teams/:teamId/messages` |
| `sdk.team.deleteMessage` | `DELETE /api/team-messages/:messageId` |

尚未封装（无前端调用点，用到时补）：`join`、`leave`、`team-inbox` 系列、消息评论系列。

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

### 已修复 7：非成员打开 team 报 "sender is not an active team member"

根因：

- `getTeamRuntime` / `postTeamRuntimeMessage` 强制要求 actor 是 active 成员
- list 放开过滤后，会打开 actor 非成员的 team，runtime 直接报错

修复：

- 非成员 actor 自动回退用 team owner 身份（`effectiveActorId`）读写 runtime
- `listParticipants` 用原始 `actorAgentId` 过滤，保证管理视角 agent bar 展示全部成员含 owner

## 11. 当前已知限制

- team 编辑模式现在支持完整成员增删改 UI（invite / set-role / remove），通过 `sdk.team` 调用
  - PATCH 本身仍只改 team 基础字段；成员变更走独立 membership 接口
- workflow 导入只是导入 agent ids
  - 不会直接导入更复杂的 team 成员配置
- 旧 membership 数据没有独立迁移命令
  - 只是读取时兜底推断
- `createTeamFunctionTools(workspaceId, allowedTools?)` 里的 `workspaceId`
  - 仍是历史残留参数
  - handler 已经不再依赖它
- `sdk.team` 目前未封装 team inbox（`/api/team-inbox`）和消息评论接口
  - 原因：当前无前端调用点
  - 后续用到时补到同一模块即可

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
- runtime/chat 报 "sender is not an active team member" 属历史问题，现已对非成员回退 owner（见第 6.3 节）

如果 `sdk.team.*` 报错（如信封解析失败），看：

- `packages/sdk/src/modules/team.ts` 的 `unwrap` 逻辑
- 服务端 `sendResult` 返回的 `success` 是否为 `true`
- 接口路径是否与 `packages/server/src/routes/team.ts` 一致

## 15. 一句话总结

这块现在的核心不是 UI，而是：**team 已经是全局模型，membership 已经支持 `agent/chat/custom` 三类成员来源，后续接手时优先围绕 membership 读写和 invite/manage UI 往下做。**
