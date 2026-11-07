# Server 模块 — 架构总览

## 架构分层

```
src/app.ts（入口）
  ├── routes/（30+ REST 路由）
  ├── services/（90+ 业务逻辑）
  │   ├── builtin-tools/（内置 Agent 工具）
  │   ├── notification-hub/（通知中心）
  │   ├── speech-recognition/（语音识别）
  │   └── subscription/（订阅）
  ├── ws/（WebSocket 处理）
  ├── agents/（Agent 运行时编排）
  ├── adapters/（AI SDK 适配器）
  ├── storage/（SQLite + JSON 存储）
  ├── middleware/（auth 中间件）
  └── hooks/（Hook 引擎）
```

## 运行时形态

1. **开发模式**: `tsx watch src/app.ts`，自动重载。
2. **生产模式**: `node dist/app.js`，内置 Web 静态文件服务（SPA fallback）。
3. **Docker**: 单容器，Server + Web 前端 + SQLite 数据卷。

## 核心流程

- **启动**: 加载 dotenv → 创建 Express → 注册路由 → 初始化 WebSocket → 启动监听 → 确保 Agent 模板 → 恢复运行中任务 → 启动通知/调度服务。
- **WebSocket upgrade**: `/ws`（主连接）、`/ws/speech`（语音）、`/ws/lsp/typescript`（LSP）。
- **Workflow 执行**: 触发（HTTP/Webhook/Cron）→ ExecutionManager → 节点执行 → InteractionManager → ClientNodeManager。

## 设计取舍

- 所有路由在 `app.ts` 中集中注册（非自动发现），便于看到完整 API 全貌。
- SQLite 而非 PostgreSQL，降低部署复杂度，但限制并发写入。
- 多运行时适配器模式增加灵活性，但适配器维护成本较高。
- Server 在生产模式下直接服务 Web 静态文件，简化部署。
