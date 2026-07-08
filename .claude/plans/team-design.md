一份“最小暴露工具集”的 agent tool schema 设计稿。

目标：
- 工具数量尽量少
- 覆盖你提出的全部核心能力
- 保持后端领域模型可扩展
- 适合 Agent 调用，而不是面向人类 UI

我会采用“合并工具”的思路，把能力压缩成 6 个核心 tools。

一、设计目标

最小工具集建议为：

1. team_manage
2. team_membership_manage
3. team_message_send
4. team_inbox_query
5. team_message_update
6. team_message_comment

这 6 个工具可覆盖：
- join team
- leave team
- list teams
- team info
- create team
- dissolve team
- broadcast
- send message
- inbox message
- update message status
- comments message

二、总设计原则

1. 工具合并，但 action 必须显式
每个 tool 内通过 action 字段区分行为，避免一个工具做过多隐式推断。

2. 面向 Agent，而不是面向 UI
返回结果应该结构化、稳定、可程序消费。

3. 所有写操作尽量幂等
建议支持 idempotency_key。

4. 消息状态分两层
不要把“已读/未读”和“已完成/已失败”混为一个字段：
- inbox_status：unread | read | archived
- execution_status：pending | in_progress | done | failed | ignored

5. 广播和定向消息共用一套消息模型
只是在 recipient_scope 上不同。

三、统一约定

1. 通用请求字段

所有 tools 建议都支持以下公共字段：

- actor_agent_id: string
  发起调用的 agent id

- idempotency_key: string, optional
  幂等键，建议写操作使用

- request_context: object, optional
  上下文信息，例如 trace_id、workflow_id、task_id

- dry_run: boolean, optional, default false
  若为 true，仅校验，不落库

2. 通用响应结构

所有 tools 返回统一结构：

- success: boolean
- code: string
- message: string
- data: object, optional
- warnings: array, optional
- audit_ref: string, optional

示例：
- success: true
- code: "OK"
- message: "team created"
- data: {...}

3. 通用错误码建议

- OK
- INVALID_ARGUMENT
- NOT_FOUND
- TEAM_NOT_FOUND
- MESSAGE_NOT_FOUND
- DELIVERY_NOT_FOUND
- COMMENT_NOT_FOUND
- PERMISSION_DENIED
- NOT_TEAM_MEMBER
- ALREADY_JOINED
- ALREADY_LEFT
- TEAM_DISSOLVED
- INVALID_ACTION
- INVALID_STATUS_TRANSITION
- CONFLICT
- RATE_LIMITED
- INTERNAL_ERROR

四、核心实体简化模型

为方便工具 schema 统一，建议响应里使用以下核心对象。

1. Team

- team_id: string
- name: string
- description: string
- purpose: string, optional
- status: "active" | "archived" | "dissolved"
- visibility: "private" | "open"
- created_by: string
- created_at: string
- member_count: integer
- my_role: "owner" | "admin" | "member" | "observer" | null
- metadata: object, optional

2. Membership

- membership_id: string
- team_id: string
- agent_id: string
- role: "owner" | "admin" | "member" | "observer"
- status: "active" | "left" | "removed" | "suspended"
- joined_at: string
- updated_at: string

3. Message

- message_id: string
- team_id: string
- sender_agent_id: string
- message_type: "direct" | "broadcast"
- subject: string
- body: string
- body_format: "plain_text" | "markdown" | "structured_text"
- priority: "low" | "normal" | "high" | "urgent"
- requires_ack: boolean
- requires_action: boolean
- due_at: string | null
- thread_id: string | null
- reply_to_message_id: string | null
- created_at: string
- sent_at: string
- recipient_count: integer
- metadata: object, optional

4. InboxItem

- delivery_id: string
- message_id: string
- team_id: string
- recipient_agent_id: string
- sender_agent_id: string
- subject: string
- preview: string
- message_type: "direct" | "broadcast"
- inbox_status: "unread" | "read" | "archived"
- execution_status: "pending" | "in_progress" | "done" | "failed" | "ignored"
- priority: "low" | "normal" | "high" | "urgent"
- requires_ack: boolean
- requires_action: boolean
- due_at: string | null
- sent_at: string
- read_at: string | null
- completed_at: string | null
- failed_at: string | null
- failure_reason: string | null
- unread_comment_count: integer
- version: integer

5. Comment

- comment_id: string
- message_id: string
- author_agent_id: string
- content: string
- content_format: "plain_text" | "markdown"
- visibility: "team" | "participants" | "private"
- created_at: string
- updated_at: string | null
- deleted_at: string | null

五、最小工具集 Schema 设计

1. team_manage

用途：
统一处理团队级操作：
- create team
- list teams
- get team info
- dissolve team

1.1 输入 Schema

tool_name:
- team_manage

input:
- action: "create" | "list" | "get" | "dissolve"
- actor_agent_id: string
- idempotency_key: string, optional
- dry_run: boolean, optional
- request_context: object, optional

按 action 分支参数：

A. action = "create"
- name: string
- description: string, optional
- purpose: string, optional
- visibility: "private" | "open", optional, default "private"
- initial_members: array, optional
  - agent_id: string
  - role: "admin" | "member" | "observer"
- metadata: object, optional

B. action = "list"
- scope: "mine" | "visible", optional, default "mine"
- status_filter: array, optional
  - "active" | "archived" | "dissolved"
- keyword: string, optional
- page_size: integer, optional, default 20
- page_token: string, optional

C. action = "get"
- team_id: string
- include_members_preview: boolean, optional, default false

D. action = "dissolve"
- team_id: string
- reason: string, optional
- confirm: boolean

1.2 行为约束

- create：创建者自动成为 owner
- list：默认只返回当前 agent 有权限可见的团队
- get：当前 agent 必须对 team 可见
- dissolve：仅 owner 可执行，confirm 必须为 true

1.3 输出 Schema

A. create
data:
- team: Team
- memberships_created: array of Membership

B. list
data:
- teams: array of Team
- next_page_token: string | null

C. get
data:
- team: Team
- members_preview: array of Membership, optional
- stats:
  - unread_count: integer
  - active_member_count: integer
  - last_activity_at: string | null

D. dissolve
data:
- team_id: string
- status: "dissolved"
- dissolved_at: string

2. team_membership_manage

用途：
统一处理成员关系：
- join team
- leave team

为了最小集，这里先不暴露 add/remove member 等管理能力。

2.1 输入 Schema

tool_name:
- team_membership_manage

input:
- action: "join" | "leave"
- actor_agent_id: string
- team_id: string
- idempotency_key: string, optional
- dry_run: boolean, optional
- request_context: object, optional

按 action 分支参数：

A. action = "join"
- join_reason: string, optional

B. action = "leave"
- reason: string, optional

2.2 行为约束

- join：仅支持可加入团队，或团队策略允许时加入
- join：重复加入返回 success=true + code=ALREADY_JOINED 也可以，建议幂等成功
- leave：最后一个 owner 不允许直接离开
- leave：重复离开返回 success=true + code=ALREADY_LEFT

2.3 输出 Schema

A. join
data:
- membership: Membership
- team_summary:
  - team_id: string
  - name: string
  - status: string

B. leave
data:
- membership:
  - membership_id: string
  - team_id: string
  - agent_id: string
  - status: "left"
  - updated_at: string

3. team_message_send

用途：
统一处理：
- broadcast
- send messages

3.1 输入 Schema

tool_name:
- team_message_send

input:
- action: "send"
- actor_agent_id: string
- team_id: string
- idempotency_key: string, optional
- dry_run: boolean, optional
- request_context: object, optional

消息主体字段：
- mode: "direct" | "broadcast"
- recipient_agent_ids: array of string, optional
- recipient_roles: array of "owner" | "admin" | "member" | "observer", optional
- include_sender: boolean, optional, default false
- subject: string
- body: string
- body_format: "plain_text" | "markdown" | "structured_text", optional, default "plain_text"
- priority: "low" | "normal" | "high" | "urgent", optional, default "normal"
- requires_ack: boolean, optional, default false
- requires_action: boolean, optional, default false
- due_at: string, optional
- thread_id: string, optional
- reply_to_message_id: string, optional
- metadata: object, optional

3.2 recipient 规则

A. mode = "direct"
必须提供：
- recipient_agent_ids

限制：
- recipient_agent_ids 至少 1 个
- 所有 recipient 必须是 team active member

B. mode = "broadcast"
可选提供：
- recipient_roles
- recipient_agent_ids

解释：
- 如果 recipient_roles 和 recipient_agent_ids 都不提供，则发给全体 active members
- 如果提供 recipient_roles，则发给指定角色成员
- 如果提供 recipient_agent_ids，则发给指定成员集合
- 两者都提供时，按交集或并集必须定规则

建议 v1 规则：
- 两者都提供时按并集处理

3.3 行为约束

- sender 必须是 team active member
- team status 必须为 active
- mode=direct 视为定向消息
- mode=broadcast 视为公告
- 发送成功后创建：
  - 1 条 Message
  - N 条 InboxItem/Delivery

3.4 输出 Schema

data:
- message:
  - message_id: string
  - team_id: string
  - sender_agent_id: string
  - message_type: "direct" | "broadcast"
  - subject: string
  - body_format: string
  - priority: string
  - requires_ack: boolean
  - requires_action: boolean
  - due_at: string | null
  - sent_at: string
  - recipient_count: integer
- recipients:
  - included_agent_ids: array of string
  - excluded_agent_ids: array of string, optional
  - exclusion_reasons: array, optional
- delivery_summary:
  - created_count: integer
  - skipped_count: integer

4. team_inbox_query

用途：
统一处理：
- inbox message（未读/全部）
- message detail
- team 下消息查看的最小查询能力

4.1 输入 Schema

tool_name:
- team_inbox_query

input:
- action: "list" | "get"
- actor_agent_id: string
- request_context: object, optional

按 action 分支参数：

A. action = "list"
- unread_only: boolean, optional, default false
- team_id: string, optional
- sender_agent_id: string, optional
- message_type: "direct" | "broadcast", optional
- priority: "low" | "normal" | "high" | "urgent", optional
- requires_action: boolean, optional
- inbox_status: "unread" | "read" | "archived", optional
- execution_status: "pending" | "in_progress" | "done" | "failed" | "ignored", optional
- due_before: string, optional
- page_size: integer, optional, default 20
- page_token: string, optional

B. action = "get"
- delivery_id: string, optional
- message_id: string, optional

规则：
- get 时必须提供 delivery_id 或 message_id 二选一
- 如果只提供 message_id，则返回当前 agent 对应的 inbox item
- 若 message 为 broadcast，则应取当前 agent 的 delivery 视角

4.2 输出 Schema

A. list
data:
- inbox_items: array of InboxItem
- next_page_token: string | null
- summary:
  - total_returned: integer
  - unread_count_estimate: integer, optional

B. get
data:
- inbox_item: InboxItem
- message:
  - message_id: string
  - team_id: string
  - sender_agent_id: string
  - message_type: "direct" | "broadcast"
  - subject: string
  - body: string
  - body_format: string
  - priority: string
  - requires_ack: boolean
  - requires_action: boolean
  - due_at: string | null
  - thread_id: string | null
  - reply_to_message_id: string | null
  - sent_at: string
  - metadata: object, optional

5. team_message_update

用途：
统一处理消息收件状态更新：
- 已读
- 未读
- 已完成
- 已失败
- 处理中
- 忽略
- 归档

这是“update message”需求的最小正确抽象。

5.1 输入 Schema

tool_name:
- team_message_update

input:
- action: "update_status"
- actor_agent_id: string
- delivery_id: string
- idempotency_key: string, optional
- request_context: object, optional

状态更新字段：
- inbox_status: "unread" | "read" | "archived", optional
- execution_status: "pending" | "in_progress" | "done" | "failed" | "ignored", optional
- failure_reason: string, optional
- note: string, optional
- expected_version: integer, optional

5.2 状态规则

建议规则：

阅读状态：
- unread -> read
- read -> unread
- read -> archived
- archived -> read 可选，v1 可以允许

执行状态：
- pending -> in_progress
- pending -> done
- pending -> failed
- pending -> ignored
- in_progress -> done
- in_progress -> failed
- in_progress -> ignored
- failed -> in_progress
- done -> in_progress 可选，不建议默认禁止，Agent 任务重开场景可能需要
- ignored -> in_progress 可选

建议 v1：
- 允许 done/failed/ignored 回到 in_progress
- 所有非法跃迁返回 INVALID_STATUS_TRANSITION

5.3 权限约束

- 仅 recipient 自己可更新自己的 delivery
- actor_agent_id 必须等于 delivery.recipient_agent_id
- 管理员 override 能力先不暴露在最小工具集里

5.4 输出 Schema

data:
- inbox_item: InboxItem
- update_result:
  - changed_fields: array of string
  - version: integer
  - updated_at: string

6. team_message_comment

用途：
统一处理：
- 添加评论
- 删除评论
- 查看评论

6.1 输入 Schema

tool_name:
- team_message_comment

input:
- action: "add" | "list" | "delete"
- actor_agent_id: string
- request_context: object, optional

按 action 分支参数：

A. action = "add"
- message_id: string
- content: string
- content_format: "plain_text" | "markdown", optional, default "plain_text"
- visibility: "team" | "participants" | "private", optional, default "team"

B. action = "list"
- message_id: string
- include_deleted: boolean, optional, default false
- page_size: integer, optional, default 50
- page_token: string, optional

C. action = "delete"
- comment_id: string
- reason: string, optional

6.2 权限约束

- add：actor 必须是该 message 所属 team 的可见参与者
- list：actor 必须有权限查看该 message
- delete：仅评论作者自己可删；如果你要放宽，可允许 team owner/admin 删除
- delete 建议软删除

6.3 输出 Schema

A. add
data:
- comment: Comment

B. list
data:
- comments: array of Comment
- next_page_token: string | null

C. delete
data:
- comment_id: string
- deleted_at: string
- status: "deleted"

六、最小工具集与原始需求映射

你的原始需求 -> 最小工具集映射如下：

1. join team
- team_membership_manage
- action="join"

2. leave team
- team_membership_manage
- action="leave"

3. list teams
- team_manage
- action="list"

4. team info
- team_manage
- action="get"

5. create team
- team_manage
- action="create"

6. dissolve team
- team_manage
- action="dissolve"

7. broadcast
- team_message_send
- mode="broadcast"

8. send messages
- team_message_send
- mode="direct"

9. inbox message
- team_inbox_query
- action="list"

10. update message
- team_message_update
- action="update_status"

11. comments message
- team_message_comment
- action="add" | "list" | "delete"

七、推荐的 JSON 风格示例

下面给你一版更接近真实 agent tool 注册时可使用的 schema 风格。

1. team_manage

{
  "name": "team_manage",
  "description": "Create, list, get, or dissolve teams.",
  "input_schema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["create", "list", "get", "dissolve"]
      },
      "actor_agent_id": {
        "type": "string"
      },
      "idempotency_key": {
        "type": "string"
      },
      "dry_run": {
        "type": "boolean"
      },
      "request_context": {
        "type": "object"
      },
      "team_id": {
        "type": "string"
      },
      "name": {
        "type": "string"
      },
      "description": {
        "type": "string"
      },
      "purpose": {
        "type": "string"
      },
      "visibility": {
        "type": "string",
        "enum": ["private", "open"]
      },
      "initial_members": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "agent_id": { "type": "string" },
            "role": {
              "type": "string",
              "enum": ["admin", "member", "observer"]
            }
          },
          "required": ["agent_id", "role"]
        }
      },
      "scope": {
        "type": "string",
        "enum": ["mine", "visible"]
      },
      "status_filter": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["active", "archived", "dissolved"]
        }
      },
      "keyword": {
        "type": "string"
      },
      "page_size": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      },
      "page_token": {
        "type": "string"
      },
      "include_members_preview": {
        "type": "boolean"
      },
      "reason": {
        "type": "string"
      },
      "confirm": {
        "type": "boolean"
      },
      "metadata": {
        "type": "object"
      }
    },
    "required": ["action", "actor_agent_id"]
  }
}

2. team_membership_manage

{
  "name": "team_membership_manage",
  "description": "Join or leave a team.",
  "input_schema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["join", "leave"]
      },
      "actor_agent_id": {
        "type": "string"
      },
      "team_id": {
        "type": "string"
      },
      "idempotency_key": {
        "type": "string"
      },
      "dry_run": {
        "type": "boolean"
      },
      "request_context": {
        "type": "object"
      },
      "join_reason": {
        "type": "string"
      },
      "reason": {
        "type": "string"
      }
    },
    "required": ["action", "actor_agent_id", "team_id"]
  }
}

3. team_message_send

{
  "name": "team_message_send",
  "description": "Send a direct team message or broadcast announcement.",
  "input_schema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["send"]
      },
      "actor_agent_id": {
        "type": "string"
      },
      "team_id": {
        "type": "string"
      },
      "idempotency_key": {
        "type": "string"
      },
      "dry_run": {
        "type": "boolean"
      },
      "request_context": {
        "type": "object"
      },
      "mode": {
        "type": "string",
        "enum": ["direct", "broadcast"]
      },
      "recipient_agent_ids": {
        "type": "array",
        "items": { "type": "string" }
      },
      "recipient_roles": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["owner", "admin", "member", "observer"]
        }
      },
      "include_sender": {
        "type": "boolean"
      },
      "subject": {
        "type": "string"
      },
      "body": {
        "type": "string"
      },
      "body_format": {
        "type": "string",
        "enum": ["plain_text", "markdown", "structured_text"]
      },
      "priority": {
        "type": "string",
        "enum": ["low", "normal", "high", "urgent"]
      },
      "requires_ack": {
        "type": "boolean"
      },
      "requires_action": {
        "type": "boolean"
      },
      "due_at": {
        "type": "string"
      },
      "thread_id": {
        "type": "string"
      },
      "reply_to_message_id": {
        "type": "string"
      },
      "metadata": {
        "type": "object"
      }
    },
    "required": ["action", "actor_agent_id", "team_id", "mode", "subject", "body"]
  }
}

4. team_inbox_query

{
  "name": "team_inbox_query",
  "description": "List inbox messages or get message detail for the current agent.",
  "input_schema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["list", "get"]
      },
      "actor_agent_id": {
        "type": "string"
      },
      "request_context": {
        "type": "object"
      },
      "unread_only": {
        "type": "boolean"
      },
      "team_id": {
        "type": "string"
      },
      "sender_agent_id": {
        "type": "string"
      },
      "message_type": {
        "type": "string",
        "enum": ["direct", "broadcast"]
      },
      "priority": {
        "type": "string",
        "enum": ["low", "normal", "high", "urgent"]
      },
      "requires_action": {
        "type": "boolean"
      },
      "inbox_status": {
        "type": "string",
        "enum": ["unread", "read", "archived"]
      },
      "execution_status": {
        "type": "string",
        "enum": ["pending", "in_progress", "done", "failed", "ignored"]
      },
      "due_before": {
        "type": "string"
      },
      "page_size": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      },
      "page_token": {
        "type": "string"
      },
      "delivery_id": {
        "type": "string"
      },
      "message_id": {
        "type": "string"
      }
    },
    "required": ["action", "actor_agent_id"]
  }
}

5. team_message_update

{
  "name": "team_message_update",
  "description": "Update inbox and execution status for a received message.",
  "input_schema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["update_status"]
      },
      "actor_agent_id": {
        "type": "string"
      },
      "delivery_id": {
        "type": "string"
      },
      "idempotency_key": {
        "type": "string"
      },
      "request_context": {
        "type": "object"
      },
      "inbox_status": {
        "type": "string",
        "enum": ["unread", "read", "archived"]
      },
      "execution_status": {
        "type": "string",
        "enum": ["pending", "in_progress", "done", "failed", "ignored"]
      },
      "failure_reason": {
        "type": "string"
      },
      "note": {
        "type": "string"
      },
      "expected_version": {
        "type": "integer"
      }
    },
    "required": ["action", "actor_agent_id", "delivery_id"]
  }
}

6. team_message_comment

{
  "name": "team_message_comment",
  "description": "Add, list, or delete comments on a team message.",
  "input_schema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["add", "list", "delete"]
      },
      "actor_agent_id": {
        "type": "string"
      },
      "request_context": {
        "type": "object"
      },
      "message_id": {
        "type": "string"
      },
      "content": {
        "type": "string"
      },
      "content_format": {
        "type": "string",
        "enum": ["plain_text", "markdown"]
      },
      "visibility": {
        "type": "string",
        "enum": ["team", "participants", "private"]
      },
      "include_deleted": {
        "type": "boolean"
      },
      "page_size": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      },
      "page_token": {
        "type": "string"
      },
      "comment_id": {
        "type": "string"
      },
      "reason": {
        "type": "string"
      }
    },
    "required": ["action", "actor_agent_id"]
  }
}

八、建议补充的服务端校验规则

为了让 schema 真正可落地，建议服务端补这些校验：

1. team_manage
- create 时 name 不能为空
- dissolve 时 confirm=true
- dissolved team 不允许再次 dissolve

2. team_membership_manage
- join 时 team.status 必须 active
- leave 时最后 owner 不可离开

3. team_message_send
- mode=direct 时 recipient_agent_ids 必填
- mode=broadcast 时至少能解析出一个 recipient
- subject/body 长度上限要定义
- due_at 不能早于 sent_at

4. team_inbox_query
- get 时 delivery_id/message_id 至少一个必填
- 只能读取自己的 delivery 视角

5. team_message_update
- 至少有一个状态字段被更新
- failure_reason 仅在 execution_status=failed 时推荐必填
- expected_version 不匹配返回 CONFLICT

6. team_message_comment
- add 时 content 非空
- delete 时只做软删除

九、最小工具集的优点与限制

优点：
- 工具数少，Agent 更容易学会使用
- 已覆盖你当前全部核心需求
- 领域模型没有被压坏，后面还能扩展
- 便于 MCP/tool registry 注册

限制：
- 暂未暴露 add/remove member
- 暂未暴露 update team
- 暂未暴露 list sent messages
- 暂未暴露 thread 查询
- 暂未暴露复杂权限管理