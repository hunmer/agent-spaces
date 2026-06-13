# 常见问题 (FAQ)

## 开发环境

**Q: 如何启动开发环境？**
A: `pnpm install && pnpm dev`。server 运行在 3100 端口，web 运行在 3000 端口。

**Q: 构建顺序是什么？**
A: shared -> sdk -> server -> web -> copy。`pnpm build` 已按正确顺序编排。

**Q: node-pty 编译失败怎么办？**
A: 运行 `npx node-gyp rebuild --directory=node_modules/node-pty`，需要编译工具链。pnpm 配置了 `onlyBuiltDependencies` 包含 node-pty。

**Q: 如何部署 Docker？**
A: `pnpm build:docker` 构建，`pnpm up` 启动 docker compose。

## 认证

**Q: Secret Key 在哪里设置？**
A: 首次访问登录页时输入，存储在 `~/.agent-spaces-data/auth.json`。默认为空（无需认证）。

**Q: WebSocket 如何认证？**
A: 连接时通过 `token` 查询参数验证。

## Agent 运行时

**Q: 有哪些 Agent 运行时？**
A: 6 种 -- open-agent-sdk（默认）、claude-code、codex、langchain、hermes、oh-my-pi。

**Q: 如何选择运行时？**
A: 在 Agent Preset 中设置 `runtimeKind` 字段。

**Q: Anthropic Bridge 是什么？**
A: ClaudeCodeRuntime 内置的协议中转层，让 Claude Code SDK 调用 OpenAI API。详见 `docs/anthropic-bridge.md`。

**Q: thinking 模式如何配置？**
A: `llm-model-config.ts` 的 `getThinkingRuntimeConfig` 根据 modelId 查找模型的 `thinkingEnabled` / `thinkingEffort`，默认 medium。

**Q: 标题是如何自动生成的？**
A: `title-generator-agent.ts` 将用户消息作为惰性源文本，生成场景标题（名词短语），不执行指令。`generated-title.ts` 调度频道/Issue 标题生成。

## Workflow

**Q: Workflow 如何与 Issue 关联？**
A: Issue 的 `workflowId` 字段绑定 Workflow 模板。详见 `docs/workflow-system.md`。

**Q: Workflow 执行引擎在哪？**
A: `packages/server/src/services/execution-manager.ts`，支持 DAG 遍历/循环/分支/变量/断点/恢复。

**Q: Workflow 编辑器 Store 为什么拆成 12 个文件？**
A: `stores/workflow-editor/` 按 crud/edit/execution/execution-logs/groups/interaction/staging/undo-redo/validation/versions 拆分，降低单文件复杂度。

## Mini-app

**Q: Mini-app 是什么？**
A: 用户可在平台内创建 React/HTML 沙箱项目，编写 UI + 服务 + API，通过 Agent 辅助开发。支持插件启用、SQLite 数据库、客户端 RPC。

**Q: Mini-app 服务如何执行？**
A: `mini-app-services.ts` 编译 `src/services/*.js`（剥离 import + ESM->CJS），在 `new Function` 沙箱求值。服务通过 `configs/` 读写配置，写后广播 `miniApp.configChanged`。

**Q: Mini-app Agent 如何工作？**
A: `mini-app-agent.ts` 创建 Agent 运行时，注入 mini-app 专属工具（`mini-app-tools.ts` 暴露 9 类 UI 组件清单），支持客户端 RPC（`requestMiniAppClient`）。

**Q: Mini-app 数据库安全吗？**
A: `mini-app-db.ts` 使用 better-sqlite3 连接池，`checkSql` 禁止 ATTACH/DETACH，`validateDbName` 限制 64 字符，`dbFilePath` 越界保护，`MAX_ROWS` 限制 10000 行。

## 数据存储

**Q: 数据存在哪里？**
A: 默认 `~/.agent-spaces-data/`。Agent Session/Usage 和 Mini-app DB 使用 SQLite，其余为 JSON 文件。

**Q: 如何修改数据目录？**
A: 设置 `AGENT_SPACES_DATA_DIR` 环境变量。

**Q: 启动时 running 任务怎么处理？**
A: `issue-retry.ts` 的 `recoverRunningWorkOnStartup` 标记 running 任务为 failed（"Server restarted while task was running"），in_progress issue 标记为 error。

## 前端

**Q: Next.js 16 有什么不同？**
A: 详见 `packages/web/AGENTS.md`，API 和文件结构可能有 Breaking Changes。

**Q: API 请求为什么不需要完整 URL？**
A: `next.config.ts` 中配置了 rewrites，将 `/api/*` 代理到后端。

**Q: FlexLayout 布局如何自定义？**
A: 修改 `workspace-shell.tsx` 中的默认配置，或使用 Layout Manager Dialog 保存/加载模板。

**Q: Command Palette 如何扩展？**
A: `stores/search-commands/` 下按类型添加搜索器（file-search/server-search/channel-search/issue-search/workspace-search/workflow-search），注册到 index.ts。

## i18n

**Q: 如何切换中英文？**
A: Settings 对话框中选择 Language。翻译文件在 `src/locales/{en,zh}/`，按 34 个命名空间拆分。

**Q: 如何添加新的翻译键？**
A: 在对应命名空间的 JSON 文件中添加，组件通过 `useTranslations('namespace')` 获取。命名空间在 `locales/{en,zh}/index.ts` 注册。
