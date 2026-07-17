# SkyOffice 后端迁移为纯 TS/ESM 计划

## 背景与可行性（已验证）
handoff 的核心约束「colyseus 0.15 是纯 CJS，ESM 具名 import 不可行，必须 CJS 隔离编译」**已被证伪**：
- `@colyseus/schema@2.0.37` 有完整 `exports`（`import → .mjs`），具名 import 直接可用 ✅
- `colyseus@0.15.57` / `@colyseus/{monitor,ws-transport,command}` 无 `exports`，但 **default import + 解构** 在 Node ESM 下全部可用 ✅
- `@colyseus/schema` 的 `@type` 装饰器在 `experimentalDecorators` + `emitDecoratorMetadata` + ESM + bundler resolution 下**编译运行完全正常**（产物含 `__metadata("design:type",...)`，node 原生执行通过）✅

CJS 隔离方案是 dev 死锁（tsx 的 ESM/CJS 互操作死锁 + ERR_REQUIRE_CYCLE_MODULE）的根本原因。迁移为纯 ESM 后，dev 和 prod 走完全相同的静态 import 路径，死锁消失。

## 改动一览

### 1. 主后端 tsconfig（开启装饰器，纳入 skyoffice）
`packages/server/tsconfig.json`：
- `compilerOptions` 增加：`"experimentalDecorators": true`、`"emitDecoratorMetadata": true`
- 删除 `"exclude": ["src/skyoffice/**/*"]`
- 删除 `"references": [{ "path": "./src/skyoffice" }]`

> 影响评估：experimentalDecorators/emitDecoratorMetadata 是允许性开关，开启后只让装饰器语法合法，不影响现有非装饰器代码。主后端目前无装饰器使用，零副作用。

### 2. 删除 skyoffice 独立构建配置
- 删除 `packages/server/src/skyoffice/tsconfig.json`（不再需要独立编译）
- 删除 `packages/server/src/skyoffice/package.json`（不再需要 `"type":"commonjs"` 覆盖）
- 删除 `packages/server/dist/skyoffice/`（旧 CJS 产物）

### 3. package.json build 脚本简化
`packages/server/package.json`：
- `"build"`：从 `tsc -p src/skyoffice/tsconfig.json && cp package.json && tsc` → 单步 `tsc`
- 删除 `"build:skyoffice"` 脚本
- `"dev"`：从 `pnpm build:skyoffice && tsx watch src/app.ts` → `tsx watch src/app.ts`（回归简单，无需预编译）

### 4. app.ts 改回静态 import（核心简化）
`packages/server/src/app.ts`：
- 删除当前的 `await import('./skyoffice/index.js')` + createRequire + 动态加载类型块（约 20 行）
- 改为最简单的静态 import：
  ```ts
  import { attachSkyOffice, mountSkyOfficeRoutes, getColyseusUpgradeHandler, broadcastServer as skyofficeBroadcast } from './skyoffice/index.js';
  ```
- 顶部 `import 'reflect-metadata'` **保留**（装饰器元数据仍需全局 polyfill，放最顶部）
- 之前调试加的 `console.log('[skyoffice] module loaded...')` 删除

### 5. colyseus import 转换（7 个文件）
**`@colyseus/schema`（有 exports）—— 不改**：
- `IOfficeState.ts`、`IAgent.ts`、`OfficeState.ts` 保持 `import { Schema, ... } from '@colyseus/schema'`

**`colyseus`（无 exports）—— 改 default import + 解构**：
| 文件 | 原 | 改为 |
|---|---|---|
| `index.ts` | `import { Server } from 'colyseus'` | `import colyseus from 'colyseus'; const { Server } = colyseus` |
| `rooms/SkyOffice.ts` | `import { Room, Client } from 'colyseus'` | `import colyseus from 'colyseus'; const { Room, Client } = colyseus` |
| `api/roomRoutes.ts` | `import { matchMaker } from 'colyseus'` | `import colyseus from 'colyseus'; const { matchMaker } = colyseus` |
| `broadcast/Bridge.ts` | `import { matchMaker, Room } from 'colyseus'` | `import colyseus from 'colyseus'; const { matchMaker, Room } = colyseus` |
| `rooms/commands/{PlayerUpdate,PlayerUpdateName,ChatMessageUpdate}Command.ts` | `import { Client } from 'colyseus'` | `import colyseus from 'colyseus'; const { Client } = colyseus` |

**`@colyseus/{monitor,ws-transport,command}`（无 exports）—— 改 default import + 解构**：
| 文件 | 原 | 改为 |
|---|---|---|
| `index.ts` | `import { monitor } from '@colyseus/monitor'` | `import monitorPkg from '@colyseus/monitor'; const { monitor } = monitorPkg` |
| `index.ts` | `import { WebSocketTransport } from '@colyseus/ws-transport'` | `import wsTransportPkg from '@colyseus/ws-transport'; const { WebSocketTransport } = wsTransportPkg` |
| `rooms/SkyOffice.ts` | `import { Dispatcher } from '@colyseus/command'` | `import commandPkg from '@colyseus/command'; const { Dispatcher } = commandPkg` |
| `rooms/commands/*Command.ts` (3个) | `import { Command } from '@colyseus/command'` | `import commandPkg from '@colyseus/command'; const { Command } = commandPkg` |

> 同文件多个 colyseus 系 import 合并（如 SkyOffice.ts 的 Room/Client + Dispatcher 可共用，但为最小改动保持各自的 default import 别名不冲突即可，或合并为一个 colyseus default + command default）。

### 6. 不改的部分
- `.js` 扩展名 import 全部保留（主后端 prod 走 Node 原生 ESM，要求扩展名；skyoffice 现有 `.js` 扩展名正好符合）
- 前端 Network.ts 端口/API 前缀改动（原计划步骤 3）保持，纳入本次
- reflect-metadata 依赖保留

## 验证
1. `cd packages/server && npx tsc --noEmit` —— 主后端类型检查（含 skyoffice）零新增错误（oh-my-pi 遗留错误属无关问题，不处理）
2. `pnpm build` —— 单步 tsc，产物 `dist/skyoffice/*.js` 为 ESM
3. `node dist/app.js` —— prod 启动，日志含 `[skyoffice] realtime attached`，curl rooms/health 正常
4. `pnpm dev` —— dev 启动（tsx watch 直接跑源码，静态 import），不再死锁，curl 正常
5. 前端 `cd packages/skyoffice-web && pnpm dev` 联调

## 风险与回滚
- 改动集中在 ~12 个文件，git 可整体回滚
- 主 tsconfig 开装饰器是唯一全局影响点，若引发问题可单独回退该文件
- 迁移后 dev/prod 路径统一，反而比 CJS 桥接更简单可靠