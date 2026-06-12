# 组件目录索引

按功能域组织的 React 组件目录。

## 组件目录

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `components/sidebar/` | 50+ | 侧边栏（Agent 配置/LLM 管理/技能/通知/设置等） |
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
