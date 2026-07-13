# MCP 模块 — FAQ

## Q: SDK 新增了方法，MCP 需要改吗？
不需要。`registry.ts` 运行时反射会自动覆盖。建议重跑红绿灯测试确认。

## Q: workflow_execute 报错或卡住？
检查三点：
1. workspaceId 是否有效（WS 握手要求，与工作流执行本身无关）。
2. secret/token 鉴权（secret 未设置时空 token 可过）。
3. 完成判定等 `workflow:completed` 事件，不是 `workflow:execute:result`。

## Q: stdio 模式下日志看不到？
日志走 stderr。stdio 模式 stdout 是 MCP 消息通道，不能污染。看 stderr 输出。

## Q: 构建后运行报 ESM 找不到模块？
postbuild 的 `fix-esm-extensions.mjs` 没跑或失败。手动跑 `node scripts/fix-esm-extensions.mjs` 补 `.js` 后缀。

## Q: 如何新增一个不走 SDK 反射的 tool？
在 `server.ts` 的 `createMcpServer` 里往 `overrides` 加条目，key 为 `模块_方法`。只有 SDK 方法打不到正确路由时才需要（参考 workflow_execute）。
