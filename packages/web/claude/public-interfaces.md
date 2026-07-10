# Web 模块 — 页面路由

## 页面路由

| 路由文件 | URL 路径 | 用途 |
|---|---|---|
| `src/app/page.tsx` | `/` | 首页 |
| `src/app/login/page.tsx` | `/login` | 登录 |
| `src/app/chat/page.tsx` | `/chat` | 聊天 |
| `src/app/workspace/[id]/page.tsx` | `/workspace/:id` | 工作区详情 |
| `src/app/workspaces/page.tsx` | `/workspaces` | 工作区列表 |
| `src/app/workflows/page.tsx` | `/workflows` | 工作流列表 |
| `src/app/workflows/[id]/page.tsx` | `/workflows/:id` | 工作流编辑器 |
| `src/app/workflows/share/page.tsx` | `/workflows/share` | 工作流分享 |
| `src/app/mini-apps/page.tsx` | `/mini-apps` | Mini Apps |
| `src/app/mini-apps/[id]/page.tsx` | `/mini-apps/:id` | Mini App 详情 |
| `src/app/mini-apps-preview/[id]/page.tsx` | `/mini-apps-preview/:id` | Mini App 预览 |
| `src/app/notifications/page.tsx` | `/notifications` | 全局通知中心 |
| `src/app/teams/page.tsx` | `/teams` | Team 多 Agent 协作（团队管理/成员/聊天/收件箱） |
| `src/app/settings/page.tsx` | `/settings` | 设置主页 |
| `src/app/settings/agents/page.tsx` | `/settings/agents` | Agent 配置 |
| `src/app/settings/providers/page.tsx` | `/settings/providers` | LLM 提供商 |
| `src/app/settings/mcps/page.tsx` | `/settings/mcps` | MCP 服务器 |
| `src/app/settings/skills/page.tsx` | `/settings/skills` | 技能 |
| `src/app/settings/tools/page.tsx` | `/settings/tools` | 工具 |
| `src/app/settings/prompts/page.tsx` | `/settings/prompts` | Prompt 模板 |
| `src/app/settings/output-styles/page.tsx` | `/settings/output-styles` | 输出样式 |
| `src/app/settings/data-files/page.tsx` | `/settings/data-files` | 数据文件 |
| `src/app/settings/models/page.tsx` | `/settings/models` | 模型管理 |
