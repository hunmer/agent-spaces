# MCP 模块 — 测试与质量

## 红绿灯测试

`tests/redlight.test.ts` 三层质量门禁，`node:test` 零依赖：

| 灯 | 层级 | 验证内容 |
|---|---|---|
| 🟢 GREEN | 注册完整性 | 全部 tool 已注册，无遗漏无重复 |
| 🟡 YELLOW | 调用链路 | mock HTTP server 验证各动词转发 |
| 🔴 RED | 错误处理 | 未知 tool / 缺参 / 4xx-5xx |

## 命令

```
pnpm --filter @agent-spaces/mcp test
```

跑 `scripts/run-redlight.mjs` 输出彩色报告。**改 registry 后必须重跑**。

## 覆盖情况

- SDK 全部模块/方法反射注册由 GREEN 层保证。
- workflow_execute override 由 YELLOW/RED 层验证 WS 适配。
- 无单元测试框架依赖，纯 `node:test`。
