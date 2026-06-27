# Web 模块 — 入口与启动

## 启动命令

```bash
pnpm --filter @agent-spaces/web dev      # 开发 :3000
pnpm --filter @agent-spaces/web build     # 构建
pnpm --filter @agent-spaces/web lint      # ESLint
```

## 关键入口文件

| 文件 | 说明 |
|---|---|
| `server.mjs` | 自定义 HTTP server，dev 模式启用 react-dev-inspector 中间件 |
| `next.config.ts` | Next.js 配置：rewrites 代理 API/WS 到 Server，静态导出开关，Monaco 缓存策略 |
| `src/app/layout.tsx` | 根布局 |
| `src/i18n/request.ts` | next-intl 配置入口 |

## API 代理（next.config.ts rewrites）

| 源路径 | 目标 |
|---|---|
| `/api/:path*` | `${SERVER_URL}/api/:path*` |
| `/ws` | `${SERVER_URL}/ws` |
| `/ws/speech` | `${SERVER_URL}/ws/speech` |
| `/public/:path*` | `${SERVER_URL}/public/:path*` |
| `/static/:path*` | `${SERVER_URL}/public/:path*` |
