# MCP 模块 — 开发约定

## 命令

| 任务 | 命令 |
|---|---|
| 构建 | `pnpm --filter @agent-spaces/mcp build` |
| 测试（红绿灯） | `pnpm --filter @agent-spaces/mcp test` |
| stdio 启动 | `agent-spaces-mcp --baseUrl http://localhost:3100 --token <token>` |
| http 启动 | `agent-spaces-mcp --transport http --port 3101 --baseUrl http://localhost:3100 --token <token>` |

token 也可用环境变量 `AGENT_SPACES_TOKEN`。

## 代码风格

- **纯 ESM**：tsconfig 用 `moduleResolution: bundler`，build 后必须跑 `scripts/fix-esm-extensions.mjs` 补 `.js` 后缀，否则 Node ESM 报错。
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
