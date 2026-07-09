## 团队成员列表组件 实现计划

### 目标
新建独立组件 `TeamMemberList`，接入 `team-management-page.tsx` 详情侧栏，替换现有 Badge 成员预览区。支持：成员职位展示、HoverCard 悬浮（复用 `MemberHoverCard`，已内置在 `AgentIcon.hoverCard`）、逐项删除按钮、右键菜单（设置为 owner / 从团队移除）、右上角添加成员按钮（弹出 `AddMemberDialog`）。

### 后端改动（packages/server）

**1. `services/team.ts` — `handleTeamMembershipManage` 新增两个 action**

在 `leave` 分支之后（约 team.ts:874）、`return fail('invalid action')` 之前，插入：

- **`action: 'set_role'`**（设置/转移 owner）：
  - 权限：actor 必须是当前团队的 active owner 或 admin（沿用 invite 的 `getActiveMembership` + role 校验）。
  - 目标：`agent_id`/`target_agent_id` 指定被操作的成员，必须存在且 active。
  - 逻辑：把目标成员 `role` 改为 `parseRole(input.role)`；若新角色为 `owner`，**把其它 active owner 降级为 `admin`**（唯一 owner 转移语义，用户已确认）。
  - 入参：`actor_agent_id`、`agent_id`/`target_agent_id`、`role`。
  - 返回：`membership`（更新后的）。

- **`action: 'remove'`**（移除成员）：
  - 权限：actor 必须是 active owner 或 admin；不能移除自己（用 leave）；不能移除 owner（需先转移 owner）。
  - 目标：`agent_id`/`target_agent_id`，必须存在且 active。
  - 逻辑：复用 `leave` 的 `ALREADY_LEFT` 风格，把目标成员 `status` 置为 `'removed'`（枚举已存在，team.ts:12），`updatedAt` 刷新；调 `updateTeamMemberCount(team)`。
  - 入参：`actor_agent_id`、`agent_id`/`target_agent_id`。
  - 返回：`membership`（status=removed）。

**2. `routes/team.ts` — 新增两条路由**（与 invite/leave 同级，约 team.ts:70 后）：
- `POST /:teamId/set-role` → `handleTeamMembershipManage({ ...body, action: 'set_role', team_id })`
- `POST /:teamId/remove` → `handleTeamMembershipManage({ ...body, action: 'remove', team_id })`

> 复用现有路由风格，无需新增错误码。`PERMISSION_DENIED`/`AGENT_NOT_FOUND` 等已在 sendResult 映射。

### 前端改动（packages/web）

**3. 新建 `components/teams/team-member-list.tsx`**

Props：
```ts
interface TeamMemberListProps {
  teamId: string;
  actorAgentId: string;
  members: TeamMembershipView[];   // 来自 team-management-page 的 members_preview
  agents: AgentConfig[];           // availableAgents，用于解析头像/名字
  onChange: () => void;            // 成员变动后回调，触发 loadTeamDetail 刷新
}
```

布局：
- **顶部行**：左侧标题「成员」+ 计数；右侧「添加」按钮（`UserPlus` 图标），点击打开 `AddMemberDialog`。
- **成员列表**：竖向列表，每行 = 头像(`AgentIcon` 带 `hoverCard`) + 名称 + 职位 Badge(`owner`/`admin`/`member`，owner 高亮) + 右侧删除按钮(`X`/`Trash2`，owner 行禁用删除)。
- **HoverCard**：直接给 `AgentIcon` 传 `hoverCard` prop，悬浮展示 `MemberInfoCard`（agent 详情）。无需自己写 HoverCard 包装。
- **右键菜单**：用 `ContextMenu`（`@/components/ui/context-menu`）包裹每行，菜单项：
  - 「设置为 owner」— 调 `POST /api/teams/:id/set-role`（role=owner）；owner 行隐藏此项。
  - 「从团队移除」(variant=destructive) — 调 `POST /api/teams/:id/remove`；owner 行隐藏此项。
- **添加成员**：`AddMemberDialog`，candidates 由 `agents` 映射（排除已在团队中的 id），`onAdd` 对每个新成员调 `POST /api/teams/:id/invite`（body: `{ actor_agent_id, agent_id, role:'member' }`），全部成功后 `onChange()` 刷新。

内部状态：`addDialogOpen`、`busy`(防止重复点击)。用页面已有的 `requestTeamApi` 模式（组件内自带一个同构的 `requestTeamApi`，或把请求函数作为 prop 传入——为最小改动，组件内自带，复用 `sdk.http.raw`）。

**4. `team-management-page.tsx` — 接入**

替换 team-management-page.tsx:396-441 的成员预览 `<div>`（标题「成员预览」+ Badge 列表）为：
```tsx
<TeamMemberList
  teamId={selectedTeam.team_id}
  actorAgentId={selectedActorId}
  members={teamDetail.members_preview ?? []}
  agents={availableAgents}
  onChange={() => void loadTeamDetail(selectedTeam.team_id)}
/>
```
保留外层 `rounded-xl border p-3` 容器或让组件自带（组件自带 padding 更内聚）。

**5. i18n 新增 key**

`packages/web/src/locales/zh/teams.json` + `en/teams.json`，在 `detail` 下新增：
- `detail.members` → 改文案为「成员」（原「成员预览」）
- `detail.setOwner` / `detail.removeMember` / `detail.addMember` / `detail.owner`/`admin`/`member`(role 徽章文案) / `detail.removeConfirm`(移除确认) / `detail.cannotRemoveOwner`

英文同步。

### 不改动
- `create-team-dialog.tsx`：按确认结论不加（它是创建表单，无当前成员）。
- `add-member-dialog.tsx`：直接复用，不改。
- `member-picker.tsx`：不改。

### 验收步骤指南
1. `cd packages/web && npm run build`（或 dev）确认无类型错误。
2. 打开团队管理页，选中一个团队，右侧详情侧栏看到成员列表（头像+名字+职位 Badge）。
3. 鼠标悬浮成员头像 → 弹出 MemberInfoCard。
4. 点击某成员行的删除按钮 / 右键「从团队移除」→ 成员消失，刷新后仍消失。
5. 右键非 owner 成员「设置为 owner」→ 该成员变 owner，原 owner 降级为 admin。
6. 点右上角「添加」→ 弹出 AddMemberDialog，勾选后确认 → 新成员出现在列表。

### 后续优化
- 后端可加审计日志记录 owner 转移/移除操作。
- 成员超过 20 时需分页或全量拉取接口（当前 members_preview 限 20）。
- 可加角色批量编辑、成员权限细分。