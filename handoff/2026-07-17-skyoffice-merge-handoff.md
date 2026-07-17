# SkyOffice 迁移与合并 Handoff

## 目标

继续推进 SkyOffice（`D:\SkyOffice-master`）迁移到 `G:\agent_spaces` 后的收尾工作。当前已完成「文件迁移」和「后端深度合并进主后端单进程」，下一步聚焦 dev 模式打通、生产部署细节、前端联调。

## 背景：已完成的两个阶段

### 阶段 1：文件迁移（上一会话）
- `D:\SkyOffice-master\client` → `packages/skyoffice-web/`（新 workspace 子包，Vite+React+Phaser，已排除 node_modules/dist）
- `D:\SkyOffice-master\server` → `packages/server/src/skyoffice/`
- `types/` `examples/` → `packages/server/src/skyoffice/{types,examples}`
- `skills/` → `packages/skyoffice-web/skills`
- 原 `D:\SkyOffice-master` 保留未动

### 阶段 2：后端深度合并（本会话）
SkyOffice（Colyseus 房间服务）已接入主后端 `@agent-spaces/server` 单进程，HTTP API + Agent WS + Colyseus viewer 全部跑通。

## 核心架构决策（必须理解）

**colyseus 0.15 是纯 CommonJS 包，ESM 具名 import 不可行**。因此 skyoffice 不能并入主后端的 ESM 编译，采用：

```
主后端 app.ts (ESM, "type":"module")
   │ createRequire(import.meta.url) 桥接
   ▼
dist/skyoffice/*.js (CommonJS, 独立 tsconfig)
   │ 天然 require() colyseus (CJS)
   ▼
colyseus 0.15.57 + @colyseus/schema ^2.0.4 + command 0.3.2 + monitor 0.16.7 + ws-transport 0.16.5
```

关键：skyoffice 用 **CJS 隔离编译**，靠 `dist/skyoffice/package.json`（`"type":"commonjs"`）覆盖上层 ESM 声明；主后端用 `createRequire` 加载它。

**三路 upgrade 冲突的解法**：主后端 `app.ts` 的统一 dispatcher 五路分流 —— `/ws` `/ws/speech` `/ws/lsp/typescript` `/agent-ws` + Colyseus 委托（通过 `getColyseusUpgradeHandler()` 拿到 transport 摘出的 handler）。

## 已改文件

### 依赖与构建
- `packages/server/package.json` —— +6 依赖（colyseus 全家桶 + reflect-metadata + regenerator-runtime），build 拆两阶段：`tsc -p src/skyoffice/tsconfig.json && cp package.json && tsc`
- `packages/server/tsconfig.json` —— exclude `src/skyoffice`、加 `references`
- `packages/server/src/skyoffice/tsconfig.json` —— **新建**：CommonJS + experimentalDecorators + emitDecoratorMetadata，编译到 `dist/skyoffice/`
- `packages/server/src/skyoffice/package.json` —— **新建**：`"type":"commonjs"`，build 时复制到 `dist/skyoffice/`

### SkyOffice 源码改动
- `src/skyoffice/index.ts` —— 重构为 `mountSkyOfficeRoutes(app)` + `attachSkyOffice({server})`，transport upgrade handler 摘取法（`getColyseusUpgradeHandler`）
- `src/skyoffice/broadcast/BroadcastServer.ts` —— 去掉 removeAllListeners 劫持法，改被动 `handleUpgrade`
- `src/skyoffice/api/mapRoutes.ts` —— map.json 跨包定位（指向 `packages/skyoffice-web/public/assets/map/map.json`），CJS 兼容
- `src/skyoffice/api/{auth,roomRoutes}.ts` —— Express 5 类型修正（`req.params` 是 `string|string[]`）
- `src/skyoffice/rooms/schema/OfficeState.ts` —— `import type` 适配 isolatedModules + emitDecoratorMetadata
- 全部 skyoffice `.ts` —— 35 处相对 import 补 `.js` 扩展名

### 主后端接入
- `packages/server/src/app.ts`：
  - 顶部 `import 'reflect-metadata'`（必须在 colyseus schema 加载前）
  - `createRequire(import.meta.url)` 桥接加载 skyoffice
  - authMiddleware 前调用 `mountSkyOfficeRoutes(app)`（skyoffice 自管 per-room token 鉴权）
  - createServer 后、主 dispatcher 前调用 `attachSkyOffice({app, server})`
  - upgrade dispatcher 扩展为五路（+`/agent-ws` +Colyseus 委托）
  - `SKYOFFICE_ENABLED=false` 可关闭

## 当前状态

✅ `npm run build` 零错误
✅ `node dist/app.js` 启动正常，日志见 `[skyoffice] realtime attached to main server`
✅ `curl /api/skyoffice/rooms` → `{"rooms":[]}`
✅ `curl /api/skyoffice/map/chairs` → 返回椅子数据
✅ `curl /api/health` → 200（主后端未受影响）
✅ 三路 WS（主/agent-ws/colyseus）共用 3100 端口

## 待办（按优先级）

### 高：dev 模式打通
当前 `pnpm dev`（`tsx watch src/app.ts`）**跑不通 skyoffice**：tsx 直接 transpile 源码，不会加载 CJS 产物，且 `require('./skyoffice/index.js')` 在 dev 下指向不存在的产物。
- 方案：app.ts 里加环境判断，dev 用 tsx 动态 import 源码（`.ts`），prod 用 createRequire 加载 CJS 产物
- 或：dev 脚本改为先 build:skyoffice 再 tsx watch

### 中：SkyOffice 房间 API 联调
- 创建房间：`POST /api/skyoffice/rooms`（body: name/description）→ 返回 roomId + token
- Agent 推送：`ws://localhost:3100/agent-ws?roomId=...&token=...`，消息格式见 `examples/README.md`
- Viewer 连接：Colyseus client 连 `ws://localhost:3100/<colyseusRoomId>`
- 参考 `packages/server/src/skyoffice/examples/agent-client.ts`（需改端口为 3100、API 前缀加 `/skyoffice`）

### 中：前端联调
- `packages/skyoffice-web` 是 Vite 项目，需独立 `pnpm install` + `pnpm dev`（端口默认 5173）
- 前端的 colyseus.js client 连接地址需指向主后端 3100
- 前端 package.json 已改名 `@agent-spaces/skyoffice-web`，但未验证能否构建

### 低：生产部署细节
- Colyseus monitor 挂在 `/skyoffice/colyseus`，**无鉴权**，生产需加
- map.json 写回路径是 `packages/skyoffice-web/public/...`，生产部署需确保可写或改数据目录
- 房间状态纯内存，进程重启即丢（与原项目一致）

## 关键约束（踩过的坑）

1. **不要把 skyoffice 并入主 tsc**：装饰器（TS1256）+ ESM/CJS 冲突，必须独立 tsconfig
2. **不要升级 colyseus 到 0.16+**：会强制 schema 1.x→3.x，24 个装饰器要重写，超范围
3. **@colyseus/schema 必须是 2.x**：core 0.15 要 schema `^2.0.4`，1.x 会 `context.has is not a function`
4. **dist/skyoffice/package.json 不可少**：否则 `.js` 被上层 `"type":"module"` 当 ESM，`exports` 未定义
5. **reflect-metadata 必须在 app.ts 最顶部**：装饰器元数据依赖全局 polyfill

## Suggested Skills

- 继续后端工作 → `diagnose`（排查 dev 模式 tsx 加载问题）、`tdd`（为房间 API 写回归）
- 前端联调 → 先 `pnpm --filter @agent-spaces/skyoffice-web install`，参考 `reorganize-by-imports` 整理前端结构
- 迁移/整理 → `planning-with-files`（拆解 dev 打通的多步骤任务）

## 参考路径

- 迁移原始计划：本会话的 ExitPlanMode 计划（已在对话历史）
- SkyOffice 架构说明：`packages/server/src/skyoffice/examples/README.md`（已更新端口/API 前缀）
- 主后端架构约定：`packages/server/CLAUDE.md`
- Colyseus 0.15 文档：https://0-15-x.docs.colyseus.io/server/
