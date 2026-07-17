# SkyOffice-Web 完整迁移到主前端（shadcn UI）计划

## 目标
把 skyoffice-web（Vite+React18+Phaser3+Redux+MUI+styled-components）完整迁移进 packages/web（Next.js+React19+Zustand+shadcn/Tailwind），作为 `/skyoffice` 独立路由页面。无 iframe，UI 全用 shadcn。

## 用户决策（已确认）
- 状态：Redux → **Zustand** 重写
- 范围：**完整迁移**全部功能（3 场景 + 9 组件 + Network + 资源）
- 路由：**独立 `/skyoffice`**
- 类型：抽到 **shared 包**前后端共用
- 摇杆：**保留 react-joystick-component**
- Toast：**加 sonner**

## 目录结构（目标）

```
packages/shared/src/types/skyoffice/        ← 新建，前后端共用类型（8 文件从 server 迁入）
  IAgent.ts IOfficeState.ts Messages.ts Rooms.ts Items.ts
  BackgroundMode.ts PlayerBehavior.ts KeyboardState.ts
  pathfinding.ts（前端寻路用）
packages/web/src/
  app/skyoffice/page.tsx                     ← 新路由入口（"use client" + dynamic ssr:false）
  features/skyoffice/                        ← 新功能目录
    types.ts                                 ← pathfinding 等前端专用
    PhaserGame.ts                            ← 改为 export 工厂函数（不再模块顶层 new）
    EventCenter.ts                           ← phaserEvents 单例（保留 Phaser EventEmitter）
    SkyOfficeApp.tsx                         ← 顶层容器（替代 App.tsx，动态加载 Phaser）
    scenes/{Bootstrap,Background,Game}.ts    ← 原样迁移，修 import 路径
    characters/{Player,MyPlayer,OtherPlayer,AgentSprite,PlayerSelector}.ts
    items/{Item,Chair,VendingMachine}.ts
    anims/CharacterAnims.ts
    services/Network.ts                       ← 改环境变量 + Zustand 调用
    stores/                                   ← 4 个 Zustand store（user/chat/room/agentDebug）
    components/                               ← 9 个组件，MUI/styled → shadcn/Tailwind
    index.scss 内容 → globals 局部样式或 Tailwind
    util.ts
  public/assets/skyoffice/                   ← 静态资源（Bootstrap.ts load 路径前缀调整）
```

## 实施步骤（按依赖顺序）

### 阶段 1：类型抽到 shared 包（地基）
1. 新建 `packages/shared/src/types/skyoffice/`，把 server 的 8 个类型文件迁入
2. `IAgent.ts`/`IOfficeState.ts` 的 `extends Schema` 改为普通 interface（前端无需 Schema 基类；后端 OfficeState.ts 仍 extends Schema，与 interface 结构兼容）
3. server 的 `import './types/IAgent.js'` 改为 `import '@agent-spaces/shared/types/skyoffice/IAgent.js'`（或配 paths）
4. web package.json 加 `"@agent-spaces/shared": "workspace:*"` 依赖
5. shared build 验证

### 阶段 2：依赖安装
web package.json 新增：
- `phaser` ^3.55.2
- `colyseus.js` ^0.14.13
- `react-joystick-component` ^6.0.0
- `sonner` ^1.5.0
- `@agent-spaces/shared` workspace:*
（不加 @mui/redux/styled-components/emotion/swiper/sass）

### 阶段 3：状态层 Redux → Zustand（4 store）
按探索报告平移，副作用外移：
- `stores/user-store.ts`：backgroundMode/sessionId/loggedIn/playerNameMap(用 Map→可改 Record)/showJoystick。toggleBackgroundMode 先 set 再调 phaser scene（在组件或 action 里取 `window.game.scene.keys.bootstrap`）
- `stores/chat-store.ts`：chatMessages/focused/showChat。setFocused 先 set 再调 `window.game.scene.keys.game.disableKeys/enableKeys`
- `stores/room-store.ts`：纯 state，直接平移
- `stores/agent-debug-store.ts`：agents/humans Record，纯 state 平移
- 删除 hooks.ts（TypedUseSelectorHook 废弃），组件改用 `useXxxStore((s)=>...)`

### 阶段 4：网络层 Network.ts 迁移
- 环境变量：`getHttpHost`/`getWsEndpoint` 改用 `NEXT_PUBLIC_SERVER_URL`（复用主 web 约定，默认 localhost:3100）
- 所有 `dispatch(...)` → 对应 Zustand store 的 set 调用
- 其余 Colyseus 逻辑（joinOrCreate/joinById/onAdd/onMessage/send）原样保留
- 加 SSR 守卫：构造函数访问 window 的部分保持（Network 只在 client useEffect 里 new）

### 阶段 5：Phaser 层迁移（场景/角色/物品/动画）
- `PhaserGame.ts`：改为 `export function createPhaserGame(parent: HTMLElement): Phaser.Game`，config 的 parent 改为传入的 DOM 元素，scale 用容器尺寸而非 window。`window.game` 保留（组件调试用）
- `scenes/Bootstrap.ts`：preload 里所有 `assets/xxx` 路径改为 `/assets/skyoffice/xxx`（Next.js public 目录）。`init` 里 new Network 保留。launchGame 里 `setRoomJoined` 改 Zustand
- `scenes/Game.ts`、`Background.ts`、characters/*、items/*、anims/*：原样迁移，仅修 import 路径（类型从 @agent-spaces/shared，内部相对路径调整）。Game.ts 的寻路 findGridPath 从 shared 引入
- `EventCenter.ts`：保留 `Phaser.Events.EventEmitter` 单例（phaser 已是依赖）

### 阶段 6：UI 组件 MUI/styled → shadcn/Tailwind（9 个）
通用映射：
- MUI Button/Fab/IconButton → shadcn Button（variant/size）+ rounded-full 模拟 Fab
- MUI TextField → Input + Label
- MUI Tooltip → shadcn Tooltip（Provider/Trigger/Content）
- MUI Avatar → shadcn Avatar
- MUI LinearProgress → shadcn Progress
- MUI Snackbar/Alert → sonner toast
- MUI icons → lucide-react
- styled-components → Tailwind className
- 深色卡片 `#222639` → 抽 `bg-[#222639]` 或 CSS 变量

逐组件：
1. **App.tsx → SkyOfficeApp.tsx**：Backdrop 的 pointer-events 模式用 Tailwind `[pointer-events:none] [&>*]:pointer-events-auto`。三态切换读 Zustand
2. **RoomSelectionDialog.tsx**：Card+Button+Input+Alert→shadcn，Snackbar→sonner toast.error，LinearProgress→Progress
3. **LoginDialog.tsx**：Swiper→shadcn Carousel(embla)，TextField→Input+Label，Avatar→shadcn Avatar，ArrowRightIcon→lucide ArrowRight
4. **AgentFeed.tsx**：Tooltip→shadcn Tooltip，IconButton→Button ghost，Fab→Button icon rounded-full，FeedBox→ScrollArea，GroupsIcon/CloseIcon→Users/X
5. **HelperButtonGroup.tsx**：Fab/IconButton/Avatar/Tooltip→shadcn，icons→lucide（Sun/Moon/Gamepad2/CircleHelp/Share/X/ArrowRight）
6. **MobileVirtualJoystick.tsx**：styled div→Tailwind，isSmallScreen hook 保留，调 window.game
7. **Joystick.tsx**：保留 react-joystick-component，angleToDirections 原样
8. **DebugPanel.tsx**：Fab/Tooltip/IconButton→shadcn，ListWrap→ScrollArea，ActButton/TalkButton 动态色保留 style 注入，copy-button 现成可用，icons→lucide（Bug/Bot/User/Copy/X）
9. **ChairZoneMenu.tsx**：保留自定义 MenuWrap（坐标定位），styled→Tailwind。**必须保留** `game.input.enabled` 切换 + mousedown swallowEvent 防穿透逻辑

### 阶段 7：路由入口
`packages/web/src/app/skyoffice/page.tsx`：
```tsx
"use client";
import dynamic from "next/dynamic";
const SkyOfficeApp = dynamic(() => import("@/features/skyoffice/SkyOfficeApp").then(m=>m.SkyOfficeApp), { ssr: false });
export default function Page() { return <SkyOfficeApp />; }
```
SkyOfficeApp 内部：useEffect 里动态 import Phaser 创建 game，挂 `<Toaster/>`，渲染 Backdrop + 各组件按 Zustand 三态切换。

### 阶段 8：playground 集成调整
`playground-page.tsx` 的 skyoffice tab：从 iframe 改为链接跳转（`<a href="/skyoffice">` 或 router.push），或保留一个按钮"在新页面打开 SkyOffice"。

### 阶段 9：静态资源
`packages/skyoffice-web/public/assets/` → `packages/web/public/assets/skyoffice/`（background/character/items/map/tileset 全部）。Bootstrap.ts 的 load 路径同步改前缀。

### 阶段 10：验证
1. `pnpm --filter @agent-spaces/shared build` 零错误
2. `pnpm --filter @agent-spaces/web build` 零错误（或仅 oh-my-pi 无关错误）
3. 启动后端 `node dist/app.js`（3100）
4. 启动 web `pnpm dev`，访问 `/skyoffice`
5. 验证流程：选房间（Join Public Lobby）→ 选头像登录 → 看到 Phaser 场景 → 用 agent-client 推送 agent → AgentFeed 显示事件、Agent sprite 走动 → DebugPanel 控制活动/说话 → 椅子右键 zone 菜单
6. `pnpm tsc --noEmit` skyoffice 相关零错误

## 关键约束（必须遵守）
1. **Phaser SSR 安全**：所有 Phaser 代码在 dynamic ssr:false 包裹，不在模块顶层访问 window/document
2. **pointer-events 模式**：App Backdrop 必须 `pointer-events:none` + 子元素 `auto`，否则 UI 挡住 Phaser 点击
3. **ChairZoneMenu 防穿透**：`game.input.enabled` 切换 + mousedown swallowEvent 不能丢（已修复的 bug）
4. **colyseus.js 固定 0.14**：Network 用了 0.14 API（state.players.onAdd），不能升级
5. **handleAgentUpdated 跳过逻辑**：activity 切换时跳过 x/y/anim 的 apply（防瞬移），走路交给 handleAgentActivity
6. **兜底 spawn**：Game.create 注册监听器后扫一遍 state.agents/players 补 spawn（Colyseus 时序）
7. **类型 IAgent/IOfficeState extends Schema → 普通 interface**：前端不用 Schema 基类，结构兼容后端

## 风险与回滚
- 大型迁移，改动 30+ 文件，集中在 `features/skyoffice/` 新目录，git 可整体回滚
- React 19 + Phaser 3 + react-joystick-component + colyseus.js 0.14 兼容性需验证（阶段 10）
- 若 Phaser/React 19 有问题，可退回 iframe 方案（playground-page.tsx 的 SkyOfficeComponent 保留备份）
- 分阶段提交，每阶段可独立验证