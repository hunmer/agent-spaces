# Server 模块 — SkyOffice 房间架构

> 多 Agent 可视化办公空间（Colyseus 0.15 房间服务）。源码位于 `src/skyoffice/`。
> 集成方式（CJS 隔离编译、upgrade dispatcher、API 挂载）见 [CLAUDE.md 约定](../CLAUDE.md) 与 [public-interfaces.md](public-interfaces.md)。

## 双源实体模型（核心设计）

房间同时承载两类实体，分别走不同通道：

| 实体 | schema | key | 进入方式 | 控制方式 |
|---|---|---|---|---|
| 人类玩家 | `Player` | Colyseus `sessionId` | `client.joinById` / `joinOrCreate` | 浏览器键盘 WASD，`Message.UPDATE_PLAYER` 上报 |
| 外部 Agent | `Agent` | 业务 `agentId`（外部自定义） | `Bridge` 直接写 `state.agents`，**无 Colyseus client 连接** | HTTP/WS 推送到 `/agent-ws` → `Bridge.dispatch` |

关键：**Agent 不占用 Colyseus 会话**，一条 WS 连接可驱动任意数量的 Agent。`agentId` 由外部系统自定义，与 Colyseus sessionId 解耦。

## 状态 Schema (`rooms/schema/OfficeState.ts`)

`@colyseus/schema` 装饰器定义，自动 diff + 增量推送 viewer。

```
OfficeState
├─ players:  MapSchema<Player>    // key = sessionId
├─ agents:   MapSchema<Agent>     // key = agentId
└─ chatMessages: ArraySchema<ChatMessage>  // 上限 100 条（FIFO）
```

- `Player`：`name` / `x` / `y` / `anim`（默认 `adam_idle_down`）
- `Agent`：在 Player 基础上扩展 `id` / `texture` / `text` / `textUntil` / `action` / `activity` / `targetX/Y/Dir` / `chairKey`
- `ChatMessage`：`author` / `createdAt` / `content`（复用为通用事件流项，驱动 UI AgentFeed 面板）

## 房间生命周期 (`rooms/SkyOffice.ts`)

| 钩子 | 行为 |
|---|---|
| `onCreate` | 设 metadata（name/description/bizRoomId）、`setState(new OfficeState())`、注册 5 类 message handler |
| `onJoin` | `state.players.set(sessionId, new Player())` + 向该 client 单播 `SEND_ROOM_DATA` |
| `onLeave` | `state.players.delete(sessionId)` |
| `onDispose` | `bridge.clearRoom(bizRoomId)`（释放椅子占用表）+ `dispatcher.stop()` |

### Message handler（`onCreate` 注册）

| Message | 触发 | 处理 |
|---|---|---|
| `UPDATE_PLAYER` | 人类玩家移动 | `PlayerUpdateCommand` 改 x/y/anim |
| `UPDATE_PLAYER_NAME` | 人类玩家改名 | `PlayerUpdateNameCommand` |
| `ADD_CHAT_MESSAGE` | 玩家聊天（保留通道） | `ChatMessageUpdateCommand` + broadcast 给其他 client |
| `DELEGATE_AGENT_ACTIVITY` | viewer 调试面板切换 agent activity | 转发 `bridge.agentActivity`（异步读 map.json），**无需 Agent token** |
| `DELEGATE_AGENT_TALK` | viewer 调试面板测试 agent 说话 | 转发 `bridge.agentTalk` |

`@colyseus/command` 的 `Dispatcher` 模式：handler 只 dispatch 命令对象，命令类内含 `execute(data)` 改 state。隔离副作用，便于测试。

## Bridge：Agent 广播 → 房间状态 (`broadcast/Bridge.ts`)

核心枢纽。Agent 的 HTTP/WS 推送经 `BroadcastServer` 收敛后，全部由 `bridge.dispatch(roomId, payload)` 路由。

### 路由表（`dispatch` switch on `payload.type`）

| `AgentBroadcastType` | 行为 | 备注 |
|---|---|---|
| `AGENT_SPAWN` | `spawnAgent`：不存在则创建 Agent schema，存在则 patch 基础字段 | 自动 append 事件 `spawned` |
| `AGENT_UPDATE` | 若 agent 不存在**自动 spawn**（避免顺序耦合），否则仅改 x/y/anim | 最频繁消息，避免冗余字段写入 |
| `AGENT_TALK` | `agentTalk`：设 `text`+`textUntil`，`room.broadcast(AGENT_TALK)` 立即弹气泡，`setTimeout` 后清空 | durationMs 默认 `AGENT_TALK_DEFAULT_MS` |
| `AGENT_ACTION` | `agentAction`：改 `action` + 可选 x/y/anim | sit/wave/work 等 |
| `AGENT_SIT` | `agentAction('sit', ...)` 的语法糖 | anim 默认 `${texture}_sit_down` |
| `AGENT_ACTIVITY` | `agentActivity`（**异步**，读 map.json）：working/meeting/relaxing 分配椅子，idle 释放 | 不阻塞 ack，错误仅 log |
| `AGENT_DESPAWN` | `despawnAgent`：释放椅子 + `state.agents.delete` + append 事件 `left` | — |

返回 `{ ok, error? }`，ack 给 WS。

### 椅子占用机制（`agentActivity` 专属）

```text
每个业务 roomId 一张占用表：Map<agentId, chairKey>
zoneChairs = loadZoneChairs()   // 从 map.json 读取手动标记的椅子，按 zone 分组
occupied  = 当前房间已占用的 chairKey 集合
available = pool - occupied
candidates = available.length > 0 ? available : pool   // 满了则允许共享
pick = random(candidates)
```

- 切换 activity 前先 `releaseChair`（旧椅子释放）
- `idle`：释放椅子 + `targetX/Y/Dir` 清零 + anim 切回 `${texture}_idle_down`
- 未标记椅子的 zone：agent 保持 idle，记录事件 `no chair marked for ${activity}`
- 写入 `targetX/Y/Dir` + `chairKey`，前端 Phaser tween 走过去坐下；同步更新 `x/y/anim` 保证 state 一致

### 房间定位（`getRoom`）

`roomRegistry.get(bizRoomId)` → `matchMaker.getRoomById(colyseusRoomId)`。业务 roomId（HTTP API 用）与 Colyseus 内部 roomId（viewer joinById 用）通过 `RoomRegistry` 双向映射。

## Agent 广播协议（`/agent-ws`）

外部 Agent 通过 WS 连接 `ws://host:3100/agent-ws?roomId=<bizRoomId>&token=<roomToken>` 推送 JSON 消息，格式：

```jsonc
{ "type": "agent_spawn",   "agentId": "a1", "name": "Coder", "texture": "adam", "x": 700, "y": 500 }
{ "type": "agent_update",  "agentId": "a1", "x": 710, "y": 500, "anim": "adam_run_down" }
{ "type": "agent_talk",    "agentId": "a1", "text": "done", "durationMs": 3000 }
{ "type": "agent_action",  "agentId": "a1", "action": "wave" }
{ "type": "agent_sit",     "agentId": "a1", "x": 800, "y": 600 }
{ "type": "agent_activity","agentId": "a1", "activity": "working" }
{ "type": "agent_despawn", "agentId": "a1" }
```

鉴权：per-room token（由 `POST /api/skyoffice/rooms` 创建房间时返回），**绕开主后端全局 Bearer**。`BroadcastServer.handleUpgrade` 处理连接 + token 校验。详见 `examples/README.md` + `examples/agent-client.{ts,py}`。

## 相对原版 SkyOffice 的裁剪

已移除（合并时）：bcrypt 密码鉴权、WebRTC/视频聊天/屏幕共享、Computer 相关、LobbyRoom（自定义房间走 HTTP API）、Whiteboard（白板 schema/连接消息/用户列表）。鉴权上移到 HTTP API 层（per-room token）。

## 前端集成（非本包，但强相关）

真正的前端在 `packages/web/src/features/skyoffice/`（Phaser + React）：
- `services/Network.ts`：封装 `colyseus.js` Client，`joinCustomById` 先 `GET /api/skyoffice/rooms/:id/join` 拿 colyseusRoomId 再 `joinById`；`initialize()` 注册 state.onAdd/onRemove/onChange，转成 `phaserEvents.emit` + zustand store 更新
- `stores/`：`room-store` / `user-store` / `chat-store` / `agent-debug-store`
- `scenes/`：`Bootstrap`（preload tilemap/spritesheet）→ `Game` → `Background`
- `components/AgentFeed.tsx`：渲染 `chat-store.chatMessages` 的事件流面板

`packages/skyoffice-web/` 是空壳占位（仅 `.gitignore` + 空 `src/`），原 Vite 前端未迁入。
