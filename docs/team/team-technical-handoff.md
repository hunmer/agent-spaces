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
  - team 页面主体，负责调用 `/api/teams`、`/api/team-inbox`
- `packages/web/src/components/teams/create-team-dialog.tsx`
  - 创建/编辑 team 对话框
- `packages/web/src/components/teams/team-management-dialog.tsx`
  - team 弹窗入口
  - workflow 导入 team 默认成员的逻辑在这里
- `packages/web/src/app/teams/page.tsx`
  - `/teams` 页面入口

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

## 6. HTTP 路由

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

## 7. 内置工具

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

## 8. 当前关键流程

### 8.1 创建 team

入口：

- 前端 `team-management-page.tsx`
- 后端 `handleTeamManage(action=create)`

流程：

1. 前端提交 team 基础信息和 `initial_members`
2. 后端创建 owner membership
3. 后端遍历 `initial_members`
4. 每个成员都走统一的 membership agent 解析逻辑
5. 写入 `info.json`、`memberships.json`、空消息文件

### 8.2 workflow 导入 team 默认成员

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

### 8.3 invite member

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

### 8.4 join team

入口：

- `POST /api/teams/:teamId/join`
- `handleTeamMembershipManage(action=join)`

规则：

- open team 可直接 join
- private team 只有已在 team 中的成员才能继续走 join
- join 时会补 `agentStore/agent` 语义

## 9. 最近已修复的问题

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

## 10. 当前已知限制

- team 编辑模式还**不支持完整成员增删改 UI**
  - 现在 PATCH 主要是 team 基础字段
- workflow 导入只是导入 agent ids
  - 不会直接导入更复杂的 team 成员配置
- 旧 membership 数据没有独立迁移命令
  - 只是读取时兜底推断
- `createTeamFunctionTools(workspaceId, allowedTools?)` 里的 `workspaceId`
  - 仍是历史残留参数
  - handler 已经不再依赖它

## 11. 下个 agent 接手建议

如果要继续做成员管理，优先按下面顺序看：

1. `packages/server/src/services/team.ts`
2. `packages/server/src/routes/team.ts`
3. `packages/server/src/services/builtin-tools/team-tools.ts`
4. `packages/web/src/components/teams/team-management-page.tsx`
5. `packages/web/src/components/teams/team-management-dialog.tsx`
6. `packages/shared/src/types/team.ts`

推荐先确认的问题：

- 是只补前端 invite/member manage UI，还是还要扩数据模型
- custom agent 是只允许一次性静态配置，还是后续允许在 team 内编辑
- workflow 导入后，是否要支持导入 `custom agent` 配置而不只是 preset id

## 12. 快速验收命令

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

## 13. 快速排查指南

如果 team 创建后成员不对，看：

- `team-management-dialog.tsx` 是否仍在取错 workflow 字段
- `team-management-page.tsx` 提交的 `initial_members` 内容
- `{team_id}/memberships.json` 实际落盘

如果 invite 报错或没生效，看：

- `agent_store` 传值是否正确
- `target_agent_id` / `agent_id` 是否真的存在
- `handleTeamMembershipManage(action=invite)` 分支

如果 UI 看不到 team，看：

- `/api/teams?actor_agent_id=...&scope=visible`
- 当前 actor 是否是 active membership
- team `visibility` 是否为 `open`

## 14. 一句话总结

这块现在的核心不是 UI，而是：**team 已经是全局模型，membership 已经支持 `agent/chat/custom` 三类成员来源，后续接手时优先围绕 membership 读写和 invite/manage UI 往下做。**
