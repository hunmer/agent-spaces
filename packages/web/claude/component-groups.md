# 组件目录索引

按功能域组织的 React 组件目录。

## 组件目录

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `components/sidebar/` | 56 | 侧边栏（Agent 配置/LLM 管理/技能/通知/设置等，分组见下） |
| `components/chat/` | 30+ | 聊天组件（消息/频道/成员/Chat 独立页） |
| `components/workflow/` | 86 | Workflow DAG 编辑器（hook/utils/types/节点视图/对话框/属性面板/画布，分组见下） |
| `components/editor/` | 15+ | Monaco 编辑器（文件树/Tabs/搜索/收藏） |
| `components/git/` | 20+ | Git 面板（状态/Diff/提交/远程/高级操作） |
| `components/issue/` | 10+ | 议题管理（详情/评论/任务面板） |
| `components/database/` | 15+ | 文档数据库（树形导航/双编辑器/搜索） |
| `components/mini-apps/` | 8+ | Workflow UI 编辑器 |
| `components/terminal/` | 5+ | 终端（多 tab/虚拟键盘/命令侧边栏） |
| `components/kanban/` | 6 | Kanban 看板 |
| `components/worktree/` | 3 | Worktree 面板 |
| `components/composer/` | 6 | Composer 编辑器（slash/mention/文件搜索） |
| `components/common/` | 5+ | 通用组件（浮动面板/浮球/iframe） |
| `components/forgeui/` | 2 | ForgeUI 风格组件 |
| `components/ui/` | 20+ | shadcn/ui 基础组件 |
| `components/home/` | 4 | 首页组件（Dashboard/订阅/登录） |
| `components/settings/` | 3 | 设置页组件 |
| `components/workspaces/` | 1 | 工作空间列表页 |
| `components/decorations/` | 4 | 装饰性组件 |
| `components/shadcn-space/` | 1 | shadcn 扩展组件 |

## `components/sidebar/` 56 文件展开（2026-06-23 补全）

侧边栏按"骨架 + 对话框 + 设置面板 + 技能 + Agent 编辑器"五组组织：

### 骨架与导航（8 文件）

| 文件 | 职责 |
|------|------|
| `index.tsx` | SidebarProvider + DashboardSidebar 入口（默认导出 `Sidebar03`） |
| `app-sidebar.tsx` | 主侧边栏壳（`DashboardSidebar`） |
| `logo.tsx` | Logo |
| `nav-main.tsx` | 主导航菜单 |
| `nav-notifications.tsx` | 通知入口 |
| `server-switcher.tsx` | 多 Server 切换 |
| `sidebar-dashboard-routes.tsx` | Dashboard 路由跳转 |
| `sidebar-dialog-group.tsx` | 对话框分组容器 |

### 对话框（与资源 CRUD 对应，18 文件）

| 文件 | 资源 |
|------|------|
| `agent-dialog.tsx` + `agent-dialog-header.tsx` + `agent-dialog-data.ts` | Agent 配置弹窗 |
| `agent-commands-dialog.tsx` | Agent 命令管理 |
| `agent-editor.tsx` / `agent-detail.tsx` / `agent-list.tsx` / `agent-shared.tsx` | Agent 编辑/详情/列表/共享 |
| `hooks-dialog.tsx` | Hook 配置 |
| `layout-manager-dialog.tsx` | 布局管理 |
| `mcps-dialog.tsx` | MCP 服务器 |
| `models-dialog.tsx` | LLM 模型 |
| `notification-center-dialog.tsx` | 通知中心 |
| `output-styles-dialog.tsx` | Output Style |
| `prompts-dialog.tsx` | Prompt 模板 |
| `providers-dialog.tsx` | LLM 供应商 |
| `server-form-dialog.tsx` + `server-manager-dialog.tsx` | Server 管理 |
| `settings-dialog.tsx` | 设置入口 |
| `skills-dialog.tsx` | Skill 入口 |
| `tools-dialog.tsx` | 工具管理 |

### Settings 子面板（14 文件）

`settings/` 子目录：

| 文件 | 标签页 |
|------|--------|
| `about-tab.tsx` | 关于 |
| `account-tab.tsx` | 账号 |
| `appearance-tab.tsx` | 外观 |
| `avatar-picker.tsx` | 头像选择 |
| `custom-font-dialog.tsx` | 自定义字体 |
| `data-tab.tsx` | 数据 |
| `language-tab.tsx` | 语言 |
| `npm-settings-tab.tsx` | npm 设置 |
| `robot-accounts-tab.tsx` | 机器人账号 |
| `security-tab.tsx` | 安全 |
| `shortcuts-tab.tsx` | 快捷键 |
| `speech-settings-tab.tsx` | 语音设置 |
| `startup-tab.tsx` | 启动项 |
| `agent-store-tab.tsx` | Agent 商店 |

### Skills Dialog 子目录（10 文件）

`skills-dialog/` 子目录：`index`（由 `skills-dialog.tsx` 引用）、`skill-sync-dialog`、`skill-import-dialog`、`skill-git-import-dialog`、`skill-list`、`skill-filter-sidebar`、`skill-card-grid`、`skill-bind-dialog`、`skill-edit-dialog`、`use-skill-import`、`use-skills-data`、`types`。

### Hooks（行为层，4 文件）

| 文件 | 职责 |
|------|------|
| `use-sidebar-dialogs.ts` | 对话框开关状态聚合 |
| `use-sidebar-events.ts` | 事件订阅 |
| `use-sidebar-commands.ts` | 命令调用 |

## `components/workflow/` 86 文件分组（2026-06-24 补全）

Workflow DAG 编辑器（基于 `@xyflow/react`），按职责分为 7 组。所有 `use-workflow-*` hook 与 `workflow-canvas-*` utils 共同支撑画布行为，受 `workflow-editor/` store（12 slice）驱动。

### Hooks 行为层（11 文件）

| 文件 | 职责 |
|------|------|
| `use-workflow-editor-canvas.ts` | 画布顶层编排：聚合 nodeOps/edgeOps/groupOps；workflowId 变化时 `ensureLoopBodyBoundaryNodes` + `syncAllScopeBoundaryLayouts` 修正节点布局 |
| `use-workflow-canvas-data.ts` | 派生执行数据：从 ExecutionStep 聚合节点状态 + scope 迭代步骤合成（`createScopeIterationSteps`）；z-index 分层（LOOP_BODY=-100 / DEFAULT=1 / SCOPED_CHILD=1000 / ACTIVE=2000） |
| `use-workflow-canvas-debug.ts` | 断点/单步调试逻辑 |
| `use-workflow-canvas-dom-events.ts` | 画布 DOM 事件绑定（拖拽/resize/绘制） |
| `use-workflow-canvas-export.ts` | 画布导出（PNG/SVG/JSON） |
| `use-workflow-editor-agent-chat.ts` | Workflow 内嵌 Agent 对话 |
| `use-workflow-group-operations.ts` | Group 节点创建/解散/子节点管理 |
| `use-workflow-edge-operations.ts` | 边连接/断开/重连 |
| `use-workflow-node-actions.ts` | 节点 CustomEvent dispatch（`workflow:update-node-data` / `workflow:delete-node`），受 `isCanvasLocked`/`isExecutionBusy`/`isDeleteDisabled` 门控 |
| `use-workflow-node-operations.ts` | 节点 CRUD（增删改克隆） |
| `workflow-logs-collapsed-context.ts` | 折叠日志的 React Context |

### Utils 工具层（6 文件）

| 文件 | 职责 |
|------|------|
| `workflow-canvas-utils.ts` | 节点克隆 + Loop body 边界节点保证 + scope 布局同步；re-export `getCompositeParentId/getCompositeRootId/isScopeBoundaryWorkflowNode` |
| `workflow-canvas-helpers.ts` | 几何与 DOM 工具：`isPointInPolygon`（套索选择）、`isConnectionEndOnCanvasNode`（连接落点判断）、`isPositionNodeChange` 类型守卫 |
| `workflow-canvas-theme.ts` | 画布主题色 |
| `workflow-node-size.ts` | 节点尺寸常量 + `getWorkflowNodeSize` |
| `workflow-node-memo.ts` | 节点 memoize |
| `workflow-variable-scope.ts` | 变量作用域解析 |
| `workflow-editor-agent-utils.ts` | Workflow Agent 工具方法 |
| `workflow-dynamic-options.ts` | 动态选项 |
| `workflow-drag-types.ts` | 拖拽类型常量 |

### Types（5 文件）

| 文件 | 内容 |
|------|------|
| `workflow-canvas-types.ts` | `DragPreview` / `LocalPoint` / `LocalRect` / `LoopBodyDragEventDetail` / `WorkflowNodeResizePreviewEventDetail`；常量 `GROUP_DRAG_PREVIEW_BACKGROUND` / `LOOP_BODY_DRAG_PREVIEW_BACKGROUND` |
| `workflow-node-types.ts` | `NODE_COLOR_MAP` / `HandlePositionMode` / `WorkflowLogPanelLayout` |
| `workflow-editor-types.ts` | 编辑器内部类型 |
| `workflow-drag-types.ts` | 拖拽类型常量（同上） |
| `display-node-views/index.ts` | DisplayNode 视图注册表 |

### 节点视图（节点类型渲染）

- 节点：`workflow-agent-node.tsx`、`workflow-command-node.tsx`、`workflow-group-node.tsx`、`loop-body-view.tsx`、`markdown-node-view.tsx`、`sticky-note-view.tsx`
- DisplayNode 渲染（`display-node-views/`）：`code-render-view`、`file-display-view`、`gallery-preview-view`、`music-player-view`、`table-display-view` + `utils.ts` + `index.ts`
- 节点辅助：`workflow-node-icon.tsx`、`workflow-node-handles.tsx`、`workflow-node-sidebar.tsx`、`workflow-node-list-panel.tsx`、`workflow-node-execution-result.tsx`、`workflow-node-execution-log.tsx`、`workflow-node-context-menu.tsx`、`workflow-node-select-dialog.tsx`、`workflow-mini-preview.tsx`
- 插件节点：`workflow-plugin-card.tsx`、`workflow-plugin-icon.tsx`、`work-plugin-icon.tsx`、`plugin-tool-dialog.tsx`、`plugin-detail-dialog.tsx`、`plugin-workflow-custom-view.tsx`、`workflow-plugin-picker-dialog.tsx`、`workflow-plugin-config-dialog.tsx`

### 对话框

`workflow-trigger-dialog.tsx`（触发器）、`workflow-list-dialog.tsx` + `workflow-list.tsx`（列表）、`workflow-interaction-dialog.tsx`（交互）、`workflow-save-preset-dialog.tsx`（预设保存）、`workflow-properties-import-dialog.tsx`（属性导入）、`workflow-properties-preset-dialog.tsx`（属性预设）、`workflow-execution-node-dialog.tsx`（执行节点）、`workflow-execution-input-dialog.tsx`（执行输入）、`workflow-info-dialog.tsx`（信息）、`workflow-code-fullscreen-dialog.tsx`（代码全屏）、`workflow-agent-palette.tsx`（Agent 调色板）、`workflow-embedded-editor.tsx`（嵌入式编辑器）、`workflow-editor-agent-chat-ui.tsx`（Agent 对话 UI）、`workflow-operation-history.tsx`（撤销重做历史）、`sqlite-data-browser-dialog.tsx` + `sqlite-database-list-dialog.tsx`（SQLite 浏览）、`knowledge-base-{list,detail,edit,settings}-dialog.tsx`（知识库）

### 属性面板（Properties）

`workflow-properties-fields.tsx`（字段容器）、`workflow-properties-list.tsx`（属性列表）、`workflow-properties-node-header.tsx`（节点头）、`workflow-properties-preset-dialog.tsx`、`workflow-properties-import-dialog.tsx`、`workflow-fields-debounced.tsx`（防抖字段）、`workflow-fields-agent.tsx`、`workflow-fields-code.tsx`、`workflow-fields-sqlite.tsx`、`workflow-fields-array.tsx`、`workflow-fields-conditions.tsx`、`workflow-fields-knowledge-base.tsx`、`workflow-fields-property.tsx`、`workflow-variables-form.tsx`

### 画布（Canvas）

`workflow-canvas-overlays.tsx`、`workflow-canvas-toolbar.tsx`（注：另有 `workflow-toolbar.tsx`）、`workflow-canvas-context-menu.tsx`、`workflow-canvas-selection-menu.tsx`、`workflow-canvas-selection-tools.tsx`、`workflow-canvas-groups.tsx`、`workflow-canvas-references.tsx`、`workflow-edge.tsx`（边渲染）、`workflow-selection-connection-line.tsx`（连接线）、`workflow-helper-lines.tsx`（辅助线）、`workflow-auto-layout-menu.tsx`（自动布局）、`workflow-staging-panel.tsx`（暂存面板）

> 备注：单文件清单据 Glob 96 条结果整理（含同名/同前缀变体），实际渲染入口收敛于 `app/workflows/[id]/page.tsx` → `WorkflowEditor` → 各 hook + canvas 组件。部分对话框/属性面板内部 JSX 结构未逐一深抽。

## 页面目录

| 目录 | 说明 |
|------|------|
| `app/login/` | 登录页 |
| `app/page.tsx` | 首页（Dashboard） |
| `app/workspaces/` | 工作空间列表 |
| `app/workspace/[id]/` | 工作空间 IDE 页 |
| `app/workflows/` | Workflow 管理 + 编辑器 |
| `app/mini-apps/` | Workflow UI 管理 + 编辑器 |
| `app/chat/` | Chat 独立对话页 |
| `app/settings/` | 设置页（agents/skills/mcps/models/providers/prompts/output-styles/tools） |
