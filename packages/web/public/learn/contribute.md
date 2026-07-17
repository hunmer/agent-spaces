# 参与开发

欢迎参与 Agent Spaces 开发。本文给出代码结构、运行方式与贡献流程的快速指引。

## 仓库结构

```text
agent_spaces/
├── packages/
│   ├── web/         # Next.js 前端（Web + Electron 共用）
│   ├── server/      # Node.js 后端
│   ├── shared/      # 前后端共享类型与常量
│   ├── sdk/         # @agent-spaces/sdk（前端调用后端的封装）
│   ├── electron/    # Electron 桌面端
│   ├── flutter/     # Flutter 移动端
│   └── templates/   # MiniApp / Agent / 插件模板
├── documents/
│   └── docs/        # 产品文档（本学习中心的内容来源）
└── .agents/         # 仓库级 Agent 配置与技能
```

## 前端（packages/web）

- 框架：Next.js（App Router）+ React + TypeScript
- 状态：Zustand
- UI：Tailwind + 自有组件库（`src/components/ui/`）
- 编辑器：Monaco + TypeScript LSP
- 工作流：@xyflow/react（DAG）+ @dagrejs/dagre（布局）
- i18n：next-intl（中英文）

关键目录：

| 目录 | 说明 |
|------|------|
| `src/app/` | 路由页面（learn、chat、settings、mini-apps 等） |
| `src/components/ui/` | 基础 UI 组件 |
| `src/stores/` | Zustand store |
| `src/lib/` | 工具函数 |

前端调用后端统一走 `@agent-spaces/sdk`，不要在组件里手拼 `/api/...` URL。

## 后端（packages/server）

- 框架：Fastify
- 持久化：JSON 文件 + SQLite（better-sqlite3）
- 实时：WebSocket（频道、工作流执行、终端）
- AI 运行时适配：`src/adapters/` + `createAgentRuntime()` 工厂

全局数据目录：`~/.agent-spaces-data/`（`workspaces/` / `llm/` / `mini-apps/` / `team/` 等）。

## 本地运行

```bash
# 安装依赖
pnpm install

# 启动开发服务（前后端）
pnpm dev
```

Electron 桌面端：

```bash
pnpm --filter @agent-spaces/electron dev
```

## 共享类型（packages/shared）

前后端共用的类型定义和常量集中在这里，改类型时优先更新此包，再让前后端分别引用，避免类型漂移。

## 贡献流程

1. Fork 仓库并拉到本地
2. 从 `main` 切出功能分支：`git checkout -b feat/xxx`
3. 本地开发，保持每个 commit 聚焦
4. 如涉及用户可见行为，更新 `documents/docs/` 下对应文档
5. 提交 PR，描述清楚动机、改动范围、测试方式

## 文档贡献

`documents/docs/` 是产品文档主源，按 `getting-started` / `features` / `advanced` / `research` 分类，每个 `.mdx` 文件头部用 frontmatter 声明 `sidebar_position` 与 `slug`。

写文档时：

- 先结论，后展开
- 用表格整理字段、事件、节点清单
- 标注限制与已知问题
- 给出最小可运行示例

## 代码风格

- TypeScript 优先，避免 any
- 工具规则：路径始终加双引号，优先使用 `/`
- 前端 UI 统一走 `src/components/ui/`，不引入额外 UI 库
- 后端 REST 路由集中在 `src/routes/`，按域分文件
