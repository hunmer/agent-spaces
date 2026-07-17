# 团队模式（Team）

Team 是**全局协作模块**，不绑定工作空间。把多个 Agent 组织成一个团队，由 owner 统一编排，member 各自完成分工，通过会话、任务、收件箱协同完成完整目标。

适用于多 Agent 分工协作的复杂任务，例如「前端 Agent 出页面 + 后端 Agent 出接口 + 文档 Agent 写说明」。

## 核心概念

| 概念 | 说明 |
|------|------|
| **Team** | 一组 Agent 的集合，全局存在 |
| **Membership** | 成员关系（角色 + 状态） |
| **Session** | Team 的一次协作会话（UUID 标识，按 session 隔离） |
| **Task** | owner 分配给 member 的子任务（`pending` / `running` / `completed` / `failed`） |
| **Runtime** | 当前 session 运行状态（记录真实 Agent Session ID） |
| **Inbox** | 成员间的消息投递收件箱 |

## 角色系统（Team 内角色，非平台身份）

| 角色 | 权限 |
|------|------|
| `owner` | 全部操作，可转移 owner |
| `admin` | invite / set-role / remove / update |
| `member` | 参与 runtime / chat，完成分配的 task |
| `observer` | 只读 |

关键规则：

- 系统中不存在「平台级 admin」，`admin` 只是 Team 内角色
- 转移 owner 时，新 owner 上位，其它 active owner 自动降级 admin
- 一个 Team 至少保留一个 owner

## 成员来源

- `agent` — 来自 Agent 预设
- `chat` — 来自频道 Chat Agent
- `custom` — 直接挂一份 Agent 配置对象，无需预先存在

## 创建 Team

1. 进入「Teams」管理页
2. 点击「创建 Team」
3. 填写基础信息（名称、描述）
4. 添加初始成员
5. 保存后系统创建 owner 成员关系

**从 Workflow 导入**：扫描 Workflow 中 `agent_run` 节点的 `agentConfigId`，去重后作为默认成员填入表单。

## Task 调度

典型多 Agent 协作流程：

1. owner 先一次性创建所有已知 task（task 只能分配给非 owner 成员）
2. owner handoff 给 member 时，member 的首个 `pending` task 自动进入 `running`
3. member 执行完毕**必须**调用 `team_task_manage(action=complete)` 标记完成
4. member 未 complete 就返回 → task `failed`，Team runtime `error`
5. 全部完成后，owner 调用 `team_task_complete`，其 `output` 作为最终交付

> owner 首次 handoff 前必须先创建 task list，否则返回 `TASK_LIST_REQUIRED` 拒绝执行。

## Agent 协作工具

| 工具 | 作用 |
|------|------|
| `team_manage` | Team 基础管理（create / get / update / dissolve） |
| `team_membership_manage` | 成员管理（join / invite / leave） |
| `team_message_send` | 向另一个成员发消息并唤起下游 Agent |
| `team_inbox_query` | 查询当前收件箱 |
| `team_task_manage` | 任务管理（create / list / complete） |
| `team_task_complete` | owner 标记整个 Team 任务完成 |
| `team_agent_session_list` | 查询成员运行产生的真实 Agent Session ID |

### Handoff 规则

`team_message_send` 唤起下游 Agent 时**必须等待完成**，不能 fire-and-forget，否则父 stream 提前关闭导致下游 token 写入已关闭的 controller。

> **禁止猜测 Agent Session ID**：Task `id`、Team `session_id`、Agent `session_id` 是三类完全不同的 ID。
