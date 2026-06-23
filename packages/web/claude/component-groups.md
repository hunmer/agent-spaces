# 组件目录索引

按功能域组织的 React 组件目录。

## 组件目录

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `components/sidebar/` | 56 | 侧边栏（Agent 配置/LLM 管理/技能/通知/设置等，分组见下） |
| `components/chat/` | 30+ | 聊天组件（消息/频道/成员/Chat 独立页） |
| `components/workflow/` | 30+ | Workflow DAG 编辑器 |
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
