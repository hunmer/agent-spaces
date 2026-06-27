# SDK 模块 — 文件索引

```
packages/sdk/
├── CLAUDE.md
├── claude/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # createSDK 工厂 + 全部导出
│   ├── client.ts             # HttpClient 实现
│   ├── types.ts              # SDKConfig, RequestOptions, ApiError
│   └── modules/              # 35+ API 模块
│       ├── workspace.ts, agent.ts, channel.ts, issue.ts ...
│       ├── workflow.ts, chat.ts, mini-apps.ts, sqlite.ts ...
│       └── ...
├── demo/                     # Demo 代码
└── scripts/
    └── fix-esm-extensions.mjs
```
