# MCP 模块 — 对外接口

## MCP Tools（反射生成）

运行时由 `registry.ts` 遍历 SDK 实例自动注册，命名规则 `模块_方法`（如 `workspace_list`、`git_commit`）。

- 当前覆盖：SDK 全部 39 模块、200+ 方法（方法数随 SDK 增长自动同步）。
- 参数：调用方传 `{ arg0, arg1, ... }`，按序 spread。
- 仅 `arg0` 必填，`arg1+` 可选。

## 特殊 override

| Tool | 处理方式 | 原因 |
|---|---|---|
| `workflow_execute` | 走 `workflow-executor.ts` WS 适配器 | SDK 的 `workflow.execute` 打到不存在的 REST 路由，真实入口是 WS `workflow:execute` 事件 |

## Transport

| Transport | 用途 | 启动 |
|---|---|---|
| stdio（默认） | Claude Desktop / Cursor 本地集成 | `agent-spaces-mcp --baseUrl ... --token ...` |
| http | 远程接入 | `--transport http --port 3101` |

## 鉴权

- `verifyToken` 比对 `getSecret()`。
- **secret 未设置时空 token 即可通过**（开发态便利）。
- token 可通过 CLI `--token` 或环境变量 `AGENT_SPACES_TOKEN` 提供。
