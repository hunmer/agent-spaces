# Server 模块 — 文件索引

```
packages/server/
├── CLAUDE.md
├── claude/
├── package.json
├── tsconfig.json
├── src/
│   ├── app.ts                    # 主入口
│   ├── routes/                   # 30+ REST 路由
│   │   ├── workspace.ts, file.ts, channel.ts, issue.ts ...
│   │   └── workflow.ts, workflow-hook.ts
│   ├── services/                 # 90+ 业务逻辑
│   │   ├── builtin-tools/        # 内置工具（15 文件）
│   │   │   └── workflow-editor/  # Workflow 编辑器工具（10 文件）
│   │   ├── notification-hub/      # 通知中心（11 文件）
│   │   ├── speech-recognition/   # 语音识别（3 文件）
│   │   ├── subscription/         # 订阅管理（5 文件）
│   │   └── ...                   # 更多服务
│   ├── ws/                       # WebSocket（9 文件）
│   ├── agents/                  # Agent 运行时（10 文件）
│   ├── adapters/                # AI 适配器
│   │   ├── claude-code-runtime/  # Claude Code（6 文件）
│   │   ├── agent-runtime.ts      # 统一接口
│   │   └── ...                   # 各 SDK 适配器
│   ├── storage/                 # 存储（20+ store）
│   ├── middleware/               # 中间件（auth）
│   ├── hooks/                   # Hook 引擎
│   ├── types/                   # 类型定义
│   └── dev/                     # 开发工具
├── test/                         # 测试（20+ 文件）
├── agent-spaces-data/            # 运行时数据（非源码）
└── public/                        # 静态资源
```
