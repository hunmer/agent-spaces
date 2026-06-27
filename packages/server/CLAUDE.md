# packages/server (`@agent-spaces/server`)

Express 5 后端服务，REST API + WebSocket，SQLite 存储。核心能力：多 AI Agent 运行时适配（Claude Code/Codex/LangChain/Hermes/Oh-My-Pi/Open Agent SDK）、Workflow 可视化执行引擎、实时通信（聊天/终端/LSP）、知识库 + 向量嵌入、Git 操作、MCP 工具集成、通知推送（微信/飞书）。

## 约定

- 入口 `src/app.ts`，所有路由在此注册。
- 存储层在 `src/storage/`，业务逻辑在 `src/services/`。
- AI 运行时适配器在 `src/adapters/`，新增运行时需实现统一接口。
- WebSocket 处理在 `src/ws/`。
- 运行时数据目录 `agent-spaces-data/` 勿手动修改。
- 路由前缀 `/api/`，`/api/inspector/track` 为唯一无认证端点。

## 文件索引

| 文件 | 用途 | 何时阅读 |
|---|---|---|
| [架构总览](claude/overview.md) | 架构、运行时形态 | 首次接触 |
| [入口与启动](claude/entrypoints.md) | app.ts 入口、启动流程 | 需要启动/理解初始化 |
| [对外接口](claude/public-interfaces.md) | REST API、WebSocket 端点 | 需要调用/新增接口 |
| [模块职责](claude/module-responsibilities.md) | 路由/服务/存储/适配器分类 | 需要定位功能 |
| [AI 运行时适配器](claude/ai-adapters.md) | 各 Agent SDK 适配详情 | 需要新增/修改运行时 |
| [数据模型](claude/data-model.md) | Storage 层、领域模型 | 需要改数据结构 |
| [测试与质量](claude/testing-and-quality.md) | 测试覆盖 | 需要运行/补充测试 |
| [文件索引](claude/file-map.md) | 完整目录结构 | 需要找文件 |
| [变更记录](claude/changelog.md) | 更新历史 | 了解变更 |

## 扫描状态

- **更新时间**: 2026-06-27
- **已扫描**: package.json、app.ts、路由/服务/存储/适配器/ws/agents 目录
- **跳过**: node_modules, dist, agent-spaces-data, public
