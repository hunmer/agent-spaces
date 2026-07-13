# MCP 模块 — 文件索引

```
packages/mcp/
├── src/
│   ├── index.ts              # CLI 入口（参数解析 + transport 启动）
│   ├── registry.ts           # 核心：SDK → MCP tools 反射 + 特殊方法分流
│   ├── server.ts             # MCP Server + tools/list、tools/call handler + override 注入
│   ├── workflow-executor.ts  # WS 适配器（补 workflow.execute 死路由）
│   └── transport/
│       ├── stdio.ts          # stdio transport 包装
│       └── http.ts           # http transport 包装
├── tests/
│   └── redlight.test.ts      # 红绿灯测试（GREEN/YELLOW/RED 三层）
├── scripts/
│   ├── fix-esm-extensions.mjs  # postbuild：补 dist 相对 import 的 .js 后缀
│   └── run-redlight.mjs        # 测试彩色报告 runner
├── package.json
└── tsconfig.json
```
