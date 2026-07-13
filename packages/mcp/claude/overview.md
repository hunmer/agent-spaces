# MCP 模块 — 架构总览

## 定位

把 [`@agent-spaces/sdk`](../../sdk) 的全部能力自动暴露为 [MCP（Model Context Protocol）](https://modelcontextprotocol.io) 服务。支持 stdio（Claude Desktop / Cursor）与 http 双 transport。

## 核心机制：反射覆盖，零维护

`src/registry.ts` 在运行时遍历 SDK 实例，把每个 `模块.方法` 注册为 tool `模块_方法`（如 `workspace_list`、`git_commit`）。**SDK 增删方法时本包无需改动**——这是「覆盖所有功能」的唯一可靠方式，不要退化成手写声明。

- 参数序列化：调用方传 `{ arg0, arg1, ... }`，按序 spread 成 `fn(arg0, arg1, ...)`。
- object 参数（如 `task.create(wsId, {title})`）传 JSON 字符串会自动解析。
- `required` 策略：**仅 `arg0` 必填**（主键），`arg1+` 可选。原因：SDK 有大量可选尾部参数，运行时无法区分。

## ⚠️ SDK/server 契约缺口 —— workflow_execute 的特殊处理

SDK 的 `workflow.execute(id)` 打到路由 `POST /api/workflows/:id/execute`，**但服务器没实现这个路由**（会被 Next.js 兜底返回 HTML 首页）。服务器真实执行入口是 WebSocket `workflow:execute` 事件。

因此 `workflow_execute` tool **不走 SDK 反射**，而是通过 `server.ts` 的 `overrides` 注入 `src/workflow-executor.ts` 的 WS 适配器。

- **workspaceId 与工作流执行无关**——它只是 WS 连接握手的要求（服务器 `/ws` 端点校验），不要误以为工作流绑定 workspace。
- 鉴权：`verifyToken` 比对 `getSecret()`；**secret 未设置时空 token 即可通过**。
- 完成判定：等 `workflow:completed` 事件，**不是** `workflow:execute:result`（后者在 `status=running` 时就发）。
- 入参：`arg0=workflowId`，`arg1=input 对象`（直接传 `{prompt, model}`，适配器会包装）。

## 设计取舍

- 反射优先于手写声明，保证 SDK 与 MCP 零维护同步。
- 纯 ESM，build 后必须跑 `fix-esm-extensions.mjs` 补 `.js` 后缀。
- 日志走 stderr（stdio 模式 stdout 是 MCP 消息通道，不能污染）。
