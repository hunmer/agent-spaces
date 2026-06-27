# packages/mcp (`@agent-spaces/mcp`)

把 [`@agent-spaces/sdk`](../sdk) 的全部能力（36 模块 / 339 方法）自动暴露为 [MCP（Model Context Protocol）](https://modelcontextprotocol.io) 服务。支持 stdio（Claude Desktop / Cursor）与 http 双 transport。

## 核心机制（改前必读）

### 1. 反射覆盖，零维护
`src/registry.ts` 在运行时遍历 SDK 实例，把每个 `模块.方法` 注册为 tool `模块_方法`（如 `workspace_list`、`git_commit`）。**SDK 增删方法时本包无需改动**——这是「覆盖所有功能」的唯一可靠方式，不要退化成手写 339 个声明。

- 参数序列化：调用方传 `{ arg0, arg1, ... }`，按序 spread 成 `fn(arg0, arg1, ...)`。
- object 参数（如 `task.create(wsId, {title})`）传 JSON 字符串会自动解析。
- `required` 策略：**仅 `arg0` 必填**（主键），`arg1+` 可选。原因：SDK 有大量可选尾部参数，运行时无法区分。

### 2. ⚠️ SDK/server 契约缺口 —— workflow_execute 的特殊处理
SDK 的 `workflow.execute(id)` 打到路由 `POST /api/workflows/:id/execute`，**但服务器没实现这个路由**（会被 Next.js 兜底返回 HTML 首页）。服务器真实执行入口是 WebSocket `workflow:execute` 事件。

因此 `workflow_execute` tool **不走 SDK 反射**，而是通过 `server.ts` 的 `overrides` 注入 `src/workflow-executor.ts` 的 WS 适配器。

- **workspaceId 与工作流执行无关**——它只是 WS 连接握手的要求（服务器 `/ws` 端点校验），不要误以为工作流绑定 workspace。
- 鉴权：`verifyToken` 比对 `getSecret()`；**secret 未设置时空 token 即可通过**。
- 完成判定：等 `workflow:completed` 事件，**不是** `workflow:execute:result`（后者在 `status=running` 时就发）。
- 入参：`arg0=workflowId`，`arg1=input 对象`（直接传 `{prompt, model}`，适配器会包装）。

### 3. 红绿灯测试
`tests/redlight.test.ts` 三层质量门禁，`node:test` 零依赖：
- 🟢 GREEN 注册完整性（339 tool 全注册，无遗漏无重复）
- 🟡 YELLOW 调用链路（mock HTTP server 验证各动词转发）
- 🔴 RED 错误处理（未知 tool / 缺参 / 4xx-5xx）

`pnpm test` 跑 `scripts/run-redlight.mjs` 输出彩色报告。改 registry 后必须重跑。

## 文件索引

| 文件 | 用途 | 何时阅读 |
|---|---|---|
| `src/registry.ts` | 核心：SDK → MCP tools 反射 + 特殊方法分流 | 改 tool 注册逻辑 |
| `src/server.ts` | MCP Server + tools/list、tools/call handler + workflow override 注入 | 改 handler / 加 override |
| `src/workflow-executor.ts` | WS 适配器（补 workflow.execute 死路由） | 工作流执行相关问题 |
| `src/index.ts` | CLI 入口（参数解析 + transport 启动） | 改启动参数 / transport |
| `src/transport/stdio.ts` · `http.ts` | 双 transport 包装 | transport 问题 |
| `tests/redlight.test.ts` | 红绿灯测试 | 验证改动 |
| `scripts/fix-esm-extensions.mjs` | postbuild：补 dist 相对 import 的 `.js` 后缀 | 改构建 |
| `scripts/run-redlight.mjs` | 测试彩色报告 runner | — |

## 约定

- **纯 ESM**：tsconfig 用 `moduleResolution: bundler`，build 后必须跑 `fix-esm-extensions.mjs` 补 `.js` 后缀，否则 Node ESM 报错。
- 依赖在 `package.json` 自己声明（pnpm 隔离模式不跨包共享 node_modules）：`@modelcontextprotocol/sdk@1.29.0`、`@agent-spaces/sdk@workspace:*`、`ws@^8.18.0`。
- MCP Server 用法照抄 `packages/server/src/adapters/codex-function-tool-bridge.ts`（同版本，已验证）。
- 输出目录：`dist/src/`（rootDir 为 `.`，含 src+tests），`bin` 指向 `dist/src/index.js`。
- 日志走 stderr（stdio 模式 stdout 是 MCP 消息通道，不能污染）。

## 常见任务

### 新增一个 tool 的特殊处理（override）
在 `server.ts` 的 `createMcpServer` 里往 `overrides` 加条目，key 为 `模块_方法`。只有 SDK 方法打不到正确路由时才需要。

### SDK 新增了模块/方法
**什么都不用做**。反射会自动覆盖。但建议重跑红绿灯测试，并在 `tests/redlight.test.ts` 的 arity 抽查用例里补一条。

### 更新 MCP SDK 版本
改 `package.json` 的 `@modelcontextprotocol/sdk` 版本，`pnpm install`，核对 Server/transport API 是否变化（参考 server 包的同名依赖）。

## 扫描状态

- **更新时间**: 2026-06-27
- **已扫描**: package.json、tsconfig、src/ 全部、tests/、scripts/
- **SDK 方法数**: 339（36 模块），全覆盖
