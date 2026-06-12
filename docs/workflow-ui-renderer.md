# Workflow UI 渲染器与多文件支持

本文档说明 Workflow UI 渲染器的工作原理、多文件项目支持、模块解析机制和推荐文件布局。

## 渲染器架构

Workflow UI 渲染器 (`workflow-ui-renderer.tsx`) 在浏览器端编译和运行用户编写的 React/HTML 代码，无需服务端构建。

### React 模式运行流程

```
用户源码 (JSX)
  → Babel standalone 编译 (presets: react, plugins: transform-modules-commonjs)
  → CommonJS 代码
  → new Function('React', 'ReactDOM', 'exports', 'require', compiled)
  → moduleExports.default 作为组件
  → ReactDOM.createRoot().render()
```

### 关键设计

- **无构建步骤**：使用 `@babel/standalone` 在浏览器端实时编译，支持 JSX 和 ES module 语法。
- **全局 UI 组件与图标**：宿主应用通过 `window.AgentSpacesUI` 注入 shadcn/ui 组件（Button、Card、Slider 等）和 lucide-react 图标（Search、Loader2 等），用户代码通过解构使用，无需 import。
- **插件工具调用**：`window.AgentSpaces.callPluginTool(pluginId, toolName, args, options?)` 调用插件 tool；消费返回值前应按工具详情里的输出结构取字段，若收到 `{ success, result }` 包装结构则使用内层 `result`。可选第 4 参 `options: { taskId?, meta? }` —— 附带后该次执行会被登记为 WS 频道任务并广播 `workflowUi.*` 事件（见下文「WS 任务事件与多端同步」）；`meta` 是前端自定义上下文（如 mode/provider/prompt），后端原样存取并随事件回传。
- **任务事件订阅**：`window.AgentSpaces.onTaskEvent((event, data) => {...})` 订阅 `workflowUi.taskSnapshot / taskStarted / taskFinished / taskFailed` 事件，返回取消订阅函数；`window.AgentSpaces.getExecutorId()` 返回当前客户端的会话级 executorId，用于识别自己发起的任务。
- **服务端 Services（配置唯一写入方）**：`window.AgentSpaces.invokeService(name, payload)` 调用项目 `src/services/*.js` 中登记的 handler（服务端 Node 执行），handler 通过 `ctx.writeConfig / updateConfig` 落盘并自动广播 `workflowUi.configChanged`，让所有客户端同步。多客户端共享同一写入方，杜绝互相覆盖（详见「项目 Services」）。
- **配置读取（内存缓存）**：UI 不直接读文件。`window.AgentSpaces.getConfig(path)` 读内存快照、`onConfigChanged((path, value) => {})` 订阅变更；客户端连入时服务端推 `workflowUi.configSnapshot` 建立缓存。
- **配置/数据助手（兼容）**：`readConfigJson` / `writeConfigJson` 仍保留供简单项目，但新项目应优先走 Services + config 事件以避免多端写覆盖；`saveDataFile` / `downloadFile` 操作 `data/` 目录。
- **SQLite 数据库**：`window.AgentSpaces.db(name)` 返回具名库句柄（`all` / `get` / `run` / `exec` / `transaction`），适合结构化、需查询/聚合/事务的数据；文件落盘 `data/db/<name>.sqlite`，详见「SQLite 数据库」。

## 多文件项目支持

渲染器支持 ES module 语法在本地文件之间导入，允许将大型项目拆分为多个文件。

### 模块解析机制

1. **入口文件**：由 `manifest.json` 的 `mainFile` 字段决定（默认 `index.jsx`），必须 `export default` 一个 React 组件。
2. **import 转换**：Babel `transform-modules-commonjs` 将 `import Foo from './components/Foo'` 转为 `require('./components/Foo')`。
3. **外部模块映射**：渲染器先处理宿主允许的外部模块：
   - `react`
   - `react-dom` / `react-dom/client`
   - `embla-carousel-react`
   - `@agent-spaces/ui`（宿主 UI 导出）
4. **本地文件解析**：外部模块未命中时，渲染器解析本地相对路径：
   - 相对路径归一化（处理 `./` 和 `../`）
   - 扩展名自动补全：`.jsx` → `.js` → `.tsx` → `.ts`
   - 目录索引：`./utils` → `./utils/index.jsx` → `./utils/index.js`
5. **模块缓存**：每个文件只编译一次，循环依赖时返回部分填充的 exports（与 Node.js CommonJS 行为一致）。

### 外部依赖兼容规则

Workflow UI 项目里的源码运行在 renderer 的 `new Function()` 沙箱中，不经过 Next.js/Vite/Webpack 等常规打包器。因此 bare import（例如 `import useEmblaCarousel from 'embla-carousel-react'`）只有在 renderer 的外部模块映射中登记后才能工作。

兼容问题必须收敛在宿主层，避免每个 workflow 项目复制一份 shim：

- 宿主已有 UI 组件或图标时，优先通过 `packages/web/src/lib/ui-exports.ts` 暴露到 `window.AgentSpacesUI` 或 `@agent-spaces/ui`。
- 宿主已有第三方依赖但 workflow 需要直接 import 时，在 `workflow-ui-renderer.tsx` 的外部模块映射中添加明确 allowlist。
- 不要在 workflow 项目内复制 `useEmblaCarousel`、日期库、图表库等宿主依赖的兼容实现。这样会导致行为分叉，也会让 renderer 的运行时约束泄漏到业务项目。
- 新增外部模块映射时，保持返回值与 Babel CommonJS transform 兼容。默认导入模块建议返回 `{ __esModule: true, default: value }`。

当前 `embla-carousel-react` 已由 renderer 映射；轮播 UI 也可以直接使用 `AgentSpacesUI` 暴露的 `Carousel`、`CarouselContent`、`CarouselItem`、`CarouselPrevious`、`CarouselNext`。

动态增删 Embla slide 时，需要在 React 提交 DOM 更新后调用 `emblaApi.reInit()`，再执行 `scrollTo()` 或读取 `canScrollPrev()` / `canScrollNext()`。否则 Embla 可能沿用初始化时的 slide 列表，表现为只能停留在第一张或导航按钮状态不更新。

### 编辑器行为

- 编辑器初始化时加载所有 `src/` 下的文件内容到内存缓存。
- 用户编辑任意文件时，缓存同步更新。
- 预览始终以主入口文件（`mainFile`）为渲染起点，通过 `files` map 解析本地 import。
- 非入口文件的修改也会触发预览刷新（因为主入口会 import 这些文件）。

### 推荐文件布局

```
project/
  manifest.json        # 项目元数据
  configs/
    config.json        # 运行时配置（readConfigJson/writeConfigJson）
  src/
    index.jsx          # 入口：组合各子组件，export default App
    components/
      Header.jsx       # 头部组件
      VoiceSelector.jsx
      AudioPlayer.jsx
      ParameterPanel.jsx
    hooks/
      useTTS.js        # 自定义 Hook（共享状态逻辑）
    utils/
      providers.js     # Provider 定义、常量
      styles.js        # 样式对象
      config.js        # 配置读写辅助函数
```

### 拆分原则

- 单文件超过 ~200 行就应该考虑拆分。
- 每个文件单一职责。
- 不要创建 barrel re-export 文件（`index.jsx` 只做 re-export），直接 import 目标文件。
- `window.AgentSpacesUI`、`window.AgentSpaces`、`window.AgentSpacesAPI` 是全局变量，不需要通过 import 传递。
- 宿主 UI 和图标也可以通过 `import { Button, Search } from '@agent-spaces/ui'` 获取；不要从 `@/components/...` 导入宿主内部路径。
- 第三方 bare import 只能使用 renderer allowlist 中的模块。未登记依赖不要在 workflow 项目内自行写 shim，先补 renderer 或 `ui-exports.ts`。
- 共享状态逻辑提取到 `hooks/`，纯函数和常量提取到 `utils/`。

## WS 任务事件与多端同步

同一 workflow-ui 项目的多个预览实例（编辑器 iframe、独立预览页、多标签）连接同一个 workspace WS 频道（`workspaceId = projectId`）。宿主在 `window.AgentSpaces` 上暴露任务事件订阅能力，使任务事件在所有客户端之间实时同步。**任务队列按发起者（executorId）过滤**——每个客户端只显示自己发起的任务（初始化时调 `invokeService('get_queue')` 主动拉取 running 任务，按 `executorId === getExecutorId()` 过滤；`taskSnapshot`/`taskStarted` 等事件同样过滤）；**生成结果（configs 历史）全局共享**，所有客户端都能看到。

### callPluginTool 的任务编排

`callPluginTool` 第 4 个参数 `options?: { taskId?, meta? }` 触发后端任务编排：

- 后端把这次执行登记为 running 任务（进程内 cache，按 projectId 分组，位于 `workflow-ui-tasks.ts`），广播 `workflowUi.taskStarted`。
- 执行完成广播 `workflowUi.taskFinished`（带 result），抛错广播 `workflowUi.taskFailed`（带 error）。
- `taskId` 由前端预生成并对齐（见下），`meta` 是前端自定义上下文，后端原样存取并随每个事件回传 —— 其他未发起调用的客户端需要靠 `meta` 才能渲染队列项（mode/provider/label）与解析结果。
- 响应体不变（`{ success, result }`），发起方照常拿结果。不带 `options` 时行为与普通 execute 完全一致（向后兼容）。

### 事件清单

| 事件 | 触发时机 | payload |
|------|----------|---------|
| `workflowUi.taskSnapshot` | 客户端连入/重连时由服务端推送 | `{ tasks: WorkflowUiTask[] }`（当前所有 running + 最近终态，终态保留 10min） |
| `workflowUi.taskStarted` | execute 开始 | `{ taskId, executorId, pluginId, toolName, meta }` |
| `workflowUi.taskFinished` | execute 成功 | `{ taskId, executorId, pluginId, toolName, meta, result }` |
| `workflowUi.taskFailed` | execute 抛错 | `{ taskId, executorId, pluginId, toolName, meta, error }` |

订阅：

```js
const unsubscribe = window.AgentSpaces.onTaskEvent((event, data) => {
  if (event === 'workflowUi.taskSnapshot') { /* 用 data.tasks 重建队列视图 */ }
  else if (event === 'workflowUi.taskStarted') { /* 追加/更新 running 项 */ }
  else if (event === 'workflowUi.taskFinished') { /* 解析 data.result 落库 */ }
  else if (event === 'workflowUi.taskFailed') { /* 标记失败 */ }
});
```

### 设计要点

- **taskId 对齐**：发起方本地预生成 `taskId`，通过 `options.taskId` 传入；后端 cache 沿用同一 id，广播事件里的 taskId 与前端 UI 项天然匹配，无需额外映射。
- **executorId**：宿主为每个客户端生成 uuid 并存入 `sessionStorage`（标签级持久，`getExecutorId()` 返回），随 execute 上报；用于识别「自己发起的任务」。同标签刷新/重连 executorId 不变，可认领自己之前发起的 running 任务；不同标签各自独立。
- **幂等与异步轮询**：同 `taskId` 的 `startTask` 幂等（running 时保持，已终态时重置为 running）。MiniMax 异步视频的「生成 + 轮询」两次 execute 复用同一 `taskId` 与 `meta`，队列只显示一项，轮询覆盖生成阶段。
- **断线/刷新恢复**：客户端（重）连入时，服务端 `onClientConnected` 推送 `taskSnapshot`，视图自动重建 running 与最近终态任务。
- **历史全局共享**：`taskFinished` 事件驱动结果落库（`writeConfigJson`），所有客户端都并入历史；非发起者仅更新队列视图，不重复弹通知。
- **收敛在宿主层**：任务 cache、事件广播、snapshot 推送都在 server 宿主层完成；workflow-ui 项目代码只负责「订阅事件 + 传 taskId/meta」，不要在项目内自行实现跨标签同步、轮询状态机或任务队列持久化。

## 项目 Services（服务端单一写入方）

为避免多个预览实例各自 `readConfig/writeConfig` 导致「后写覆盖整文件」，配置写入权收敛到服务端。项目在 `src/services/` 下放置若干 js 文件，登记「事件名 → handler」，handler 在**服务端 Node 环境**执行，是 `configs/` 的唯一写入方。

### 文件格式

每个 `src/services/*.js` 默认导出一个 handler 表，服务端合并所有文件、按 `projectId` 缓存：

```js
export default {
  // (payload, ctx) => result | Promise<result>
  add_results: ({ items, mode }, ctx) => {
    ctx.updateConfig('history.json', (prev) => merge(prev, items));
    return { ok: true };
  },
};
```

- handler 不能 `import` 外部模块（加载时剥离 import 行）；能力通过 `ctx` 注入。
- 项目删除时卸载该 projectId 的 handler 缓存。

### ctx 注入

| 方法 | 说明 |
|------|------|
| `ctx.readConfig(path)` | 读 `configs/<path>`，不广播 |
| `ctx.writeConfig(path, value)` | 写 `configs/<path>`，随后广播 `workflowUi.configChanged { path, value }` |
| `ctx.updateConfig(path, updater)` | 原子读-改-写（`updater(prev) => next`），写回后广播；返回新值 |
| `ctx.broadcast(event, data)` | 向该 projectId 频道广播任意事件 |
| `ctx.listRunningTasks()` | 当前 running 任务列表（每项含 `executorId`），供 `get_queue` 等 handler 让客户端按发起者过滤队列 |
| `ctx.projectId` | 当前项目 id |

`updateConfig` 在服务端单线程内同步读-改-写，多个 handler 串行不交错 —— 这是消除并发覆盖的关键。

### UI 调用

```js
// RPC：调用 service handler，await 拿返回值
const ret = await window.AgentSpaces.invokeService('add_results', { items, mode });

// 读配置：内存缓存（由 configSnapshot 建立），不读文件
const history = window.AgentSpaces.getConfig('history.json');

// 订阅变更：handler 写盘后自动触发，所有客户端同步
const unsub = window.AgentSpaces.onConfigChanged((path, value) => {
  if (path === 'history.json') setHistory(value);
});
```

UI 不再直接 `readConfigJson/writeConfigJson`：落库走 `invokeService`，读取走 `getConfig`/`onConfigChanged`。REST 入口：`POST /api/workflows-ui/:id/services/invoke`，body `{ name, payload }` → `{ ok, result }`。

## 内置路由（项目内多视图）

复杂项目常需多个视图（生成 / 历史 / 设置 / 详情）。宿主提供**公共路由接口**，收敛地址栏同步、参数序列化、刷新与分享链接恢复逻辑——项目代码零同步代码。

### 用法

通过 `@agent-spaces/ui` 或 `window.AgentSpacesUI` 获取 `Router`、`useRouter`、`Link`：

```jsx
import { Router, useRouter, Link } from '@agent-spaces/ui';

export default function App() {
  return (
    <Router>
      <Nav />
      <Views />
    </Router>
  );
}

function Nav() {
  return <Link to="history" query={{ filter: 'done' }}>历史</Link>;
}

function Views() {
  const { path, query } = useRouter();
  if (path[0] === 'history') return <History filter={query.filter} />;
  if (path[0] === 'detail' && path[1]) return <Detail id={path[1]} />;
  return <Generate />;
}
```

### API

| 符号 | 说明 |
|------|------|
| `<Router>` | 路由 Provider，必须在顶层包裹。从地址栏恢复初始路由。 |
| `useRouter()` | 返回 `{ path, query, push, replace, back }`。未包裹时抛 `useRouter must be used within <Router>`。 |
| `<Link to query replace>` | 声明式导航，封装 `push`/`replace`。 |
| `push(path, query?)` | 路径段 + query，入历史栈。`path` 接受字符串（按 `/` 拆）或数组。 |
| `replace(path, query?)` | 替换当前项，不入栈。 |
| `back()` | 浏览器回退。 |

### URL 编码

路由状态序列化为单个 `route` 参数：path 段用 `/` 拼接，query 用 `URLSearchParams` 拼到后面。如 `{ path: ['history'], query: { filter: 'done' } }` → `/history?filter=done` → URL 中 `?route=%2Fhistory%3Ffilter%3Ddone`。

### 同步机制

- **iframe hash**：`Router` 操作预览 iframe 自身 `location.hash`（`#/history?filter=done`），刷新 iframe 即可恢复。
- **宿主页 URL**：iframe 经 `postMessage` 把 route 透传给宿主编辑器，写入宿主页 URL 的 `route` 参数。手动刷新预览（iframe reload 丢 hash）时，宿主在 iframe load 后重发当前 route。
- **分享链接**：分享按钮生成的链接携带 `route`，独立打开时 `Router` 从 `?route=` 恢复初始视图。

### 注意

- query 值仅 `string`，传非 string 会被 `String()` 强转。
- 路径段建议传数组而非含 `/` 的字符串，避免歧义。
- 非法 `route` 值（手改 URL）会 fallback 到根路由，不报错。
- 路由是纯客户端状态，不落盘、不进 SQLite / config，与 Services 正交。

## SQLite 数据库

对于需要条件查询、聚合、索引、事务的结构化数据（JSON 配置和 `data/` 文件不够用时），宿主提供基于 better-sqlite3 的 SQLite 能力。每个**具名库**对应一个文件 `data/db/<name>.sqlite`，按 projectId 隔离。

### 用法

```js
const db = window.AgentSpaces.db('logs');   // 返回句柄，每次方法调用各发一次 REST

await db.exec(`CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, ts INTEGER, msg TEXT)`);

const { changes, lastInsertRowid } = await db.run(
  `INSERT INTO events(ts, msg) VALUES(?, ?)`,
  [Date.now(), 'hello'],
);

const one  = await db.get(`SELECT * FROM events WHERE id = ?`, [1]);   // 无结果返回 null
const rows = await db.all(`SELECT * FROM events WHERE msg LIKE ? LIMIT 100`, ['%ello%']);
```

### 方法

| 方法 | 说明 |
|------|------|
| `db.exec(sql)` | 执行无返回语句（建表、索引），不支持参数 |
| `db.run(sql, params?)` | 写操作，返回 `{ changes, lastInsertRowid }` |
| `db.get(sql, params?)` | 返回首行，无结果返回 `null` |
| `db.all(sql, params?)` | 返回行数组（上限 10000 行） |
| `db.transaction(statements)` | 语句数组原子提交，任一失败整体回滚 |

`params` 为数组时按位置绑定；为对象时作命名占位符（`:name` / `@name` / `$name`）。强制参数化以防止 SQL 注入。

### 事务

事务以**语句数组**形式一次请求提交（REST 无状态模型），后端在单个 better-sqlite3 transaction 内顺序执行：

```js
await db.transaction([
  { sql: `INSERT INTO orders(uid, total) VALUES(?, ?)`, params: [uid, 99] },
  { sql: `UPDATE users SET balance = balance - ? WHERE id = ?`, params: [99, uid] },
]);
// 任一语句失败 → 整体回滚，前端 throw 含 SQL 错误信息
```

不支持事务内「先查再据结果决定后续语句」的会话式语义（那需要跨请求维持事务句柄）。

### 安全约束

- **库名**：必须匹配 `/^[a-zA-Z0-9_-]{1,64}$/`（前端 `db(name)` 与后端各校验一次）。
- **路径越界**：文件路径解析带 `resolve` + 父目录前缀校验，禁止 `..` 逃逸。
- **危险语句**：`ATTACH` / `DETACH` 被拦截（禁止挂载项目外的数据库文件）；属保守策略，含这些词的字面量 SQL 也会被拒。
- **结果上限**：`all` 单次最多 10000 行，超出报错。
- **并发**：连接以 `projectId/dbName` 为键池化复用；WAL 模式 + `busy_timeout = 5000`。

SQL 本身不做语法白名单——预览代码可在自己的库内执行任意 DDL/DML（建表、删表、写数据），边界是「限于本项目自己的 db 文件」。

### REST 与落盘

- `POST /api/workflows-ui/:id/db/:dbName`，body `{ sql, params?, mode: 'all'|'get'|'run'|'exec' }` → `{ ok, result }`。
- `POST /api/workflows-ui/:id/db/:dbName/transaction`，body `{ statements: [{ sql, params? }] }` → `{ ok }`。
- 错误：`{ ok: false, error: { code, message } }`，HTTP 400（SQL 错误、库名非法、越界、ATTACH 拦截、行数超限等）。
- 文件位置：`~/.agent-spaces-data/workflows-ui/<projectId>/data/db/<name>.sqlite`。
- 项目删除时先关闭并清理该项目所有缓存连接，再递归删目录（避免 Windows 文件占用）。

## 相关代码

| 文件 | 说明 |
|------|------|
| `packages/web/src/components/workflows-ui/workflow-ui-renderer.tsx` | 渲染器核心，包含 Babel 编译和本地模块解析 |
| `packages/web/src/components/workflows-ui/workflow-ui-preview.tsx` | 预览容器，透传 files/mainFile 给渲染器 |
| `packages/web/src/components/workflows-ui/workflow-ui-editor.tsx` | 编辑器，加载所有文件并管理预览（预览以 iframe 加载独立预览页） |
| `packages/web/src/app/workflows-ui-preview/[id]/preview-page-client.tsx` | 独立预览页面，挂载宿主 API（`useWorkflowUiHostApi`） |
| `packages/web/src/components/workflows-ui/use-workflow-ui-host-api.ts` | 宿主 API 注入：UI 组件、`callPluginTool(options)`、`onTaskEvent`、`getExecutorId`、配置/数据助手、`db(name)` SQLite 句柄 |
| `packages/web/src/lib/ws.ts` | 前端 WS 单例，`onTaskEvent` 内部基于它按 projectId 订阅 |
| `packages/server/src/ws/agent-prompt.ts` | Agent 提示词中的多文件布局规则 |
| `packages/server/src/services/workflow-ui.ts` | 后端 CRUD、文件操作、`executeDb` / `executeDbTransaction` 转发 |
| `packages/server/src/storage/workflow-ui-store.ts` | 存储层（JSON 文件 + 文件系统） |
| `packages/server/src/storage/workflow-ui-db.ts` | SQLite 层：better-sqlite3 连接池、`executeDb` / `executeDbTransaction` / `closeProjectDbs`、库名校验与 ATTACH 拦截 |
| `packages/server/src/services/workflow-ui-tasks.ts` | WS 任务状态 cache（`startTask`/`finishTask`/`failTask`/`listTasks`/`prune`） |
| `packages/server/src/services/workflow-ui-services.ts` | 项目 services 加载器：编译 `src/services/*.js`、按 projectId 缓存、`invokeService`、注入 ctx |
| `packages/server/src/routes/plugin.ts` | execute 路由，任务编排与 `workflowUi.*` 广播 |
| `packages/server/src/ws/handler.ts` | `onClientConnected` 推送 `taskSnapshot` |
| `packages/shared/src/types/events.ts` | `WorkflowUiTask` 类型与 4 个 `workflowUi.*` 事件契约 |
