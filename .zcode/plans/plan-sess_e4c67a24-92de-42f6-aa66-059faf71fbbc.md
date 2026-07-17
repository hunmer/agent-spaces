# SkyOffice 后端深度合并进主后端单进程 —— 实施计划

## 目标
把 `packages/server/src/skyoffice`（Colyseus 房间服务）接入主后端 `packages/server/src/app.ts` 单进程：HTTP API 挂到 `/api/skyoffice/*`、Agent WS 挂到 `/agent-ws`、Colyseus 房间 WS 与主后端 `/ws` `/ws/speech` `/ws/lsp/typescript` 共用同一 http server 的 upgrade 事件，互不冲突。采用 **Project References 隔离编译** + **统一 dispatcher 五路分流**。

---

## 改动清单（按执行顺序）

### 1. 补依赖（packages/server/package.json）
向 dependencies 追加（版本与 SkyOffice 原 package.json 对齐，ws/cors/express 主后端已有不动）：
- `colyseus ^0.15.0`（0.14 已停维护，0.15 是同代最后一个稳定版，API 兼容；需 ws-transport）
- `@colyseus/ws-transport ^3.0.0`（0.15 必需）
- `@colyseus/command ^0.1.7`
- `@colyseus/monitor ^0.14.0`
- `@colyseus/schema ^1.0.28`
- `reflect-metadata ^0.2.2`
- `regenerator-runtime ^0.13.7`

devDependencies 追加：`@types/ws`（若版本不够）。express 维持主后端 5.1.0（已确认 SkyOffice 用法兼容）。

执行 `pnpm install`。

### 2. Project References 隔离编译（核心，避免装饰器阻断）
**新建** `packages/server/src/skyoffice/tsconfig.json`（替换原 `tsconfig.server.json`，或并存）：
```jsonc
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,                    // project references 必需
    "outDir": "../../dist/skyoffice",     // 输出到主 dist 子目录
    "rootDir": ".",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "experimentalDecorators": true,       // 保留，仅此子项目生效
    "emitDecoratorMetadata": true,
    "strictNullChecks": false,            // 沿用原配置，避免逐个修
    "declaration": true,
    "declarationMap": true,
    "types": ["node"]
  },
  "include": ["**/*.ts"],
  "exclude": ["examples/**/*.ts", "examples/**/*.js"]   // pathfinding-test.ts 断链，排除
}
```

**修改** `packages/server/tsconfig.json`：
- `include: ["src"]` → `include: ["src", ...]` 但 **exclude** `src/skyoffice/**`（从主 build 摘除，交给 references）
- 追加 `"references": [{ "path": "./src/skyoffice" }]`

构建脚本调整（packages/server/package.json scripts）：
- 新增 `"build:skyoffice": "tsc -p src/skyoffice/tsconfig.json"`
- `build` 改为 `tsc && tsc -p src/skyoffice/tsconfig.json`（或 `tsc -b` 触发 references）
- `dev` 维持 `tsx watch src/app.ts`，但需确保 skyoffice 已构建产物存在（tsx 走源码，skyoffice 改为运行时 import 产物；见第 4 步）

### 3. 重构 SkyOffice 入口，导出 attach 函数（去掉自启动）
**修改** `src/skyoffice/index.ts`：把当前的顶层启动逻辑（createServer/gameServer.listen）封装为 `export async function attachSkyOffice(opts: { app, server })`：
- 不再自建 http server、不再 cors/json（由主 app 提供）
- `gameServer = new Server({ transport: new WebSocketTransport({ server: opts.server }) })` —— 但**先不立即 attach transport**（见第 5 步冲突解决），改用 noServer 模式的自定义注入
- 注册 PUBLIC/CUSTOM 房间（define 不变）
- `app.use('/api/skyoffice', roomRoutes)` + `/api/skyoffice/map`（mapRoutes）
- `app.use('/skyoffice/colyseus', monitor())`（避免和主 `/colyseus` 冲突，加前缀）
- 保留 `export { broadcastServer }`

顶层 side-effect 代码全部移入函数体（避免 import 即启动）。

### 4. 主进程接入（packages/server/src/app.ts）
在文件**最顶部**（所有 import 之前）加：
```ts
import 'reflect-metadata';
```
在路由注册区（`app.ts:164-368` 一片，SPA fallback 之前）加：
```ts
// 动态 import 已构建的 skyoffice 产物（ESM）
const skyoffice = await import('./skyoffice/index.js');
await skyoffice.attachSkyOffice({ app, server });
```
（app.ts 当前是同步顶层；需把这段放在 `server.listen` 之前的某个 async IIFE，或把启动重构为 async main。最小改动：用一个 `;(async () => { ... })()` 包裹 listen 部分。）

端口：SkyOffice 不再自设 PORT，复用主后端 PORT（默认 3100）；移除 SkyOffice 的 `PORT || 2567` 逻辑。环境变量 `.env.example` 补 `SKYOFFICE_ENABLED`（默认 true，可关）。

### 5. 统一 dispatcher 五路分流（解决三路 upgrade 冲突）
**修改** `src/skyoffice/broadcast/BroadcastServer.ts`：**删除 `attach` 的 removeAllListeners 劫持法**，改为：
```ts
// 不再劫持，提供被动 handleUpgrade 供主 dispatcher 调用
getWss() { return this.wss }
handleUpgrade(req, socket, head) {
  this.wss?.handleUpgrade(req, socket, head, (ws) => this.wss!.emit('connection', ws, req))
}
attach(server: http.Server) { this.wss = new WebSocketServer({ noServer: true }); this.wss.on('connection', ...) }
```
（attach 只创建 wss + 注册 connection handler，**不碰 server.on('upgrade')**）

**修改** `app.ts:473` 的 dispatcher，扩展为五路：
```ts
server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url || '/', base);
  if (pathname === '/ws') { wss.handleUpgrade(...); return; }
  if (pathname === '/ws/speech') { speechWss.handleUpgrade(...); return; }
  if (pathname === '/ws/lsp/typescript') { typescriptLspWss.handleUpgrade(...); return; }
  if (pathname === '/agent-ws') { broadcastServer.handleUpgrade(req, socket, head); return; }
  // Colyseus 房间路径：委托给 colyseus transport 的 upgrade
  colyseusTransport?.upgrade?.(req, socket, head) ?? socket.destroy();
});
```
**Colyseus transport 的接入**（关键）：不使用 `WebSocketTransport({ server })`（它会自注册 upgrade listener 与主 dispatcher 抢），改为在 `attachSkyOffice` 内创建 transport 时**抢先抓取**：
- 方案：用 `new WebSocketTransport({ server })` 创建后，立即 `const ct = server.listeners('upgrade').pop(); server.removeListener('upgrade', ct)` 把 transport 自己注册的 listener 拿出来存为 `colyseusTransport`，让主 dispatcher 在第五路调用它。等效于 BroadcastServer 原来的"抓 handler"思路，但由主 dispatcher 统一调度，三个 listener 归一。

### 6. 修复 examples 失效引用
- `src/skyoffice/examples/pathfinding-test.ts`：引用 `../client/src/utils/pathfinding` 已断（client 现为独立包）。改为**删除该文件**或改写为本地 stub。因 examples 已在 tsconfig 中 exclude，不影响 build；但为消除悬空引用，改为删除该测试文件（保留其余 examples，它们是运行时连接测试脚本，依赖运行中的服务）。
- 在 `examples/README.md` 顶部追加说明：examples 需连接 `ws://localhost:3100`（主后端端口），不再是 2567。

### 7. 鉴权对接说明（不改代码，记录在 CLAUDE.md）
- 主后端 `/api/*` 全局 Bearer token；SkyOffice `/api/skyoffice/rooms` 用 per-room token（`requireRoomToken`）。挂载位置**必须在主 authMiddleware 之前**（`app.ts:148` 之前），或为 `/api/skyoffice` 豁免主鉴权改用 SkyOffice 自己的 `requireRoomToken`。计划：挂在 `/api/skyoffice` 且在 `app.use('/api', authMiddleware)` **之前**注册，让 SkyOffice 自管鉴权。

---

## 验收标准
1. `pnpm --filter @agent-spaces/server build` 通过：主 tsc 不报装饰器错，skyoffice 子项目独立编译到 `dist/skyoffice/`
2. `pnpm --filter @agent-spaces/server dev` 启动后：
   - `curl http://localhost:3100/api/skyoffice/rooms` 返回 SkyOffice 房间列表（非主后端 401）
   - `ws://localhost:3100/agent-ws?roomId=...&token=...` 可连
   - `ws://localhost:3100/ws?workspaceId=...&token=...` 主后端 WS 仍正常（未因合并失效）
   - Colyseus viewer `ws://localhost:3100/<roomId>` 可连
3. 无 upgrade 事件冲突日志，三路 WS（主/agent-ws/colyseus）同时可用

## 风险与回退
- Colyseus 0.15 transport 的 upgrade handler 抓取法若不稳定 → 回退方案：fork 一个轻量 Transport，或 skyoffice 退回独立进程（首选项 A）。当前计划假设抓取法可行（与 BroadcastServer 原逻辑同源，已被验证过）。
- `strictNullChecks:false` 仅 skyoffice 子项目生效，不影响主后端。
- reflect-metadata 全局 polyfill 在 app.ts 顶部 import，对主后端无副作用（只是挂全局 Reflect 元数据接口）。

## 不做的事
- 不升级 SkyOffice 到 Colyseus 0.17（避免 breaking changes 扩大范围）
- 不改 examples 的 .js/.py 脚本（非编译目标）
- 不动 `packages/skyoffice-web`（前端独立子项目，本轮只整合后端）