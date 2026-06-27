# 入口与启动

## 根级脚本

| 脚本 | 用途 |
|---|---|
| `scripts/copy-package.mjs` | 生成 Server 的 dist/package.json（发布/Docker 用），将 workspace 依赖转为 file: 引用 |
| `scripts/copy-web.mjs` | 将 Web 静态输出复制到 Server/Electron/Flutter/tauri |
| `scripts/test-agent-sse.mjs` | Agent SSE 端点测试脚本 |

## 各模块入口

### packages/web
- **开发**: `node server.mjs` → 自定义 HTTP server → Next.js dev（port 3000）
- **生产**: `next build` → 静态导出（`NEXT_STATIC_EXPORT=1`）或服务端渲染
- **关键文件**: `server.mjs`, `next.config.ts`, `src/app/layout.tsx`

### packages/server
- **开发**: `tsx watch src/app.ts`（port 3100）
- **生产**: `node dist/app.js`（内置 Web 静态服务）
- **关键文件**: `src/app.ts`（Express + WebSocket 入口）
- **Docker**: `Dockerfile.server`, `docker-compose.yml`

### packages/electron
- **开发**: `pnpm build && electron .`（加载 `http://127.0.0.1:3000`）
- **生产**: `pnpm dist` → electron-builder 打包
- **关键文件**: `main.ts`, `preload/`

### packages/sdk
- **开发**: `tsc --watch`
- **构建**: `tsc && node scripts/fix-esm-extensions.mjs`
- **关键文件**: `src/index.ts` → `createSDK()` 工厂

### packages/shared
- **构建**: `tsc`
- **关键文件**: `src/index.ts` → re-export `types/index.js`

### packages/templates
- **构建**: `node pack-mini-apps.mjs && node generate-index.mjs`
- **关键文件**: `generate-index.mjs`, `pack-mini-apps.mjs`

### packages/dom-inspector-hook
- **构建**: `tsup`
- **关键文件**: `src/index.ts`

### documents
- **开发**: `docusaurus start --port 3001`
- **构建**: `docusaurus build`
- **关键文件**: `docusaurus.config.ts`
