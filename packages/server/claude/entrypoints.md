# Server 模块 — 入口与启动

## 启动命令

```bash
pnpm --filter @agent-spaces/server dev      # 开发 :3100
pnpm --filter @agent-spaces/server build     # tsc 编译
pnpm --filter @agent-spaces/server start     # 生产启动
pnpm --filter @agent-spaces/server test      # 测试
```

## app.ts 启动流程

1. `dotenv` 加载环境变量
2. 创建 Express app，配置 CORS / JSON body parser / multer
3. 注册 SSE 路由（无认证）
4. 注册 Inspector 跟踪端点（无认证）
5. 挂载 auth 中间件
6. 注册静态文件服务（public/ + agents-store/）
7. 注册 30+ REST 路由模块
8. 初始化 Workflow 执行基础设施（InteractionManager / ClientNodeManager / ExecutionManager / TriggerService）
9. 注册 WebSocket 服务器（/ws, /ws/speech, /ws/lsp/typescript）
10. 启动 HTTP 监听
11. 后台初始化：确保 Agent 模板、重建 Mini App 索引、恢复运行中任务、启动通知/调度服务

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | 3100 | 服务端口 |
| `HOST` | 0.0.0.0 | 监听地址 |
| `AGENT_SPACES_DATA_DIR` | ~/.agent-spaces-data | 数据目录 |
| `CORS_ORIGIN` | * | CORS 允许源 |
