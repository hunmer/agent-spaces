# MCP 模块 — 入口与启动

## 入口文件

| 入口 | 位置 | 职责 |
|---|---|---|
| CLI 入口 | `src/index.ts` | 参数解析 + transport 启动（stdio/http） |
| MCP Server | `src/server.ts` | `createMcpServer()`，tools/list、tools/call handler + workflow override 注入 |
| 反射注册 | `src/registry.ts` | SDK → MCP tools 反射 + 特殊方法分流 |
| WS 适配器 | `src/workflow-executor.ts` | 补 workflow.execute 死路由（走 WS `workflow:execute`） |
| stdio transport | `src/transport/stdio.ts` | stdio 包装（给 Claude Desktop / Cursor） |
| http transport | `src/transport/http.ts` | http 包装（远程） |

## 启动流程

1. `index.ts` 解析 CLI 参数（baseUrl/token/workspaceId/transport/port/host/debug）。
2. `createSDK({ baseUrl, getToken })` 构造 SDK 实例。
3. `createMcpServer(sdk)` 创建 MCP Server，`registry.ts` 反射遍历 SDK 注册全部 tools + 注入 workflow override。
4. 按 transport 启动：`serveStdio(server)` 或 `serveHttp(server, { port, host })`。

## 构建

`tsc` → `dist/src/`，postbuild 跑 `scripts/fix-esm-extensions.mjs` 补 `.js` 后缀。

## 测试

`pnpm test` → `scripts/run-redlight.mjs` 跑 `tests/redlight.test.ts` 红绿灯报告。
