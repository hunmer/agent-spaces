# packages/mcp (`@agent-spaces/mcp`)

把 [`@agent-spaces/sdk`](../sdk) 的全部能力自动暴露为 [MCP（Model Context Protocol）](https://modelcontextprotocol.io) 服务，支持 stdio（Claude Desktop / Cursor）与 http 双 transport。核心是**反射覆盖**：运行时遍历 SDK 实例，把每个 `模块.方法` 注册为 tool `模块_方法`，SDK 增删方法时本包零维护。

## 约定

- **纯 ESM**，build 后必须跑 `fix-esm-extensions.mjs` 补 `.js` 后缀。
- 改 `registry.ts` 后必须重跑红绿灯测试：`pnpm test`。
- `workflow_execute` 不走 SDK 反射，走 `workflow-executor.ts` WS 适配器（SDK 的 REST 路由是死路由）。
- 日志走 stderr（stdio 模式 stdout 是 MCP 消息通道，不能污染）。
- 详情放 `claude/*.md`，本文件只做索引。

## 文件索引

| 文件 | 用途 | 何时阅读 |
|---|---|---|
| [架构总览](claude/overview.md) | 反射机制、workflow 契约缺口、设计取舍 | 首次接触 / 改 registry |
| [开发约定](claude/conventions.md) | 命令、ESM 风格、常见任务 | 开始开发前 |
| [入口与启动](claude/entrypoints.md) | CLI 入口、启动流程、构建 | 需要启动/构建 |
| [对外接口](claude/public-interfaces.md) | MCP tools、transport、鉴权 | 需要调用/新增 tool |
| [测试与质量](claude/testing-and-quality.md) | 红绿灯测试 | 改动后验证 |
| [文件索引](claude/file-map.md) | 目录结构 | 需要找文件 |
| [FAQ](claude/faq.md) | 常见问题 | 遇到问题时 |
| [变更记录](claude/changelog.md) | 更新历史 | 了解变更 |

## 扫描状态

- **更新时间**: 2026-07-13
- **已扫描**: package.json、tsconfig、src/ 全部、tests/、scripts/
- **SDK 覆盖**: 反射自动同步当前 SDK 全部 39 模块、200+ 方法
- **跳过**: node_modules, dist
