## 客户端 RPC

Mini-app 支持服务端向项目内预览客户端发起请求-响应 RPC，由 `packages/server/src/services/mini-app-client-rpc.ts` 实现：

- 服务端通过 `requestMiniAppClient(projectId, type, payload, timeoutMs=5000)` 发起请求，生成随机 `requestId`，向该 projectId 频道广播 `miniApp.clientRequest` 事件（携带 requestId / type / payload）。
- 客户端处理后将结果通过 WebSocket `miniApp.clientResponse` 事件回传（携带 requestId / ok / result / error），由 `handleMiniAppClientResponse()` 配对解决或拒绝 Promise。
- 超时默认 5 秒，超时则 reject。

Agent 的 `api.js` 方法可通过 `ApiCtx.requestClient()` 复用这条 RPC 通道向预览客户端要数据。

## SQLite 数据持久化

每个 Mini-app 可拥有多个命名 SQLite 数据库，由 `packages/server/src/storage/mini-app-db.ts` 管理（better-sqlite3）：

- 数据库文件位于 `~/.agent-spaces-data/mini-apps/{projectId}/data/db/{dbName}.sqlite`。
- 连接按 `projectId/dbName` 复用（连接池），首次打开设置 `journal_mode = WAL` 与 `busy_timeout = 5000`。
- 项目删除时 `closeProjectDbs()` 关闭并清理该项目所有连接。

REST 路由：

- `POST /api/mini-apps/:id/db/:dbName` — 单条语句执行，body 为 `{ sql, params?, mode }`，`mode` 取值 `all|get|run|exec`。
- `POST /api/mini-apps/:id/db/:dbName/transaction` — 批量语句原子执行（`statements: [{sql, params?}]`），任一抛错则整个事务回滚。

所有 SQL 经 `checkSql` 安全校验，参数通过 `bindArgs` 绑定，`all` 模式结果超过 `MAX_ROWS` 上限会抛错。`writeDataFile`（`PUT /api/mini-apps/:id/data/content`）则用于将文本或 base64 二进制写入 `data/` 目录。

## 任务缓存

Mini-app 维护一份进程内任务状态缓存（`packages/server/src/services/mini-app-tasks.ts`），按 `projectId` 维护任务列表，供多客户端通过 WS 频道同步任务状态。`startTask()` 登记 running 任务（同 taskId 已为 running 时幂等保留），`finishTask()` / `failTask()` 标记终态；终态任务保留 TTL（10 分钟）后由 `listTasks()` 触发清理，running 任务永不清理。

## WebSocket 事件

Mini-app 相关事件遵循 `domain.action` 命名约定：

- `miniApp.configChanged` — 沙箱服务写入 configs 后广播（含 path / value）。
- `miniApp.clientRequest` — 服务端向客户端发起 RPC 请求（含 requestId / type / payload）。
- `miniApp.clientResponse` — 客户端回传 RPC 响应（含 requestId / ok / result / error）。
- `miniApp.taskSnapshot` — 客户端连入时推送当前任务快照（断线/刷新/新标签恢复视图用）。
- `miniApp.configSnapshot` — 客户端连入时推送配置全量快照（UI 据此建立内存缓存，不再直接 readConfig）。

## 配置与任务宿主 API

预览侧宿主 API 在 `use-mini-app-host-api.tsx` 中挂到全局对象，核心能力分两层：

- **推荐路径**：`invokeService()` + `getConfig()` + `onConfigChanged()`。这是多端同步场景下的主路径，配置由服务端单点写入，客户端只读内存快照和变更事件。
- **兼容路径**：`readConfigJson()` / `writeConfigJson()`。仍可直接读写 `configs/`，但更适合简单场景，不适合作为多端并发写入模型。

同一套宿主 API 还暴露 `callPluginTool()`、`onTaskEvent()`、`respondClientRequest()`、`getExecutorId()` 和 `db(name)`，分别对应插件调用、任务事件订阅、客户端 RPC 回包、当前标签页执行者标识以及具名 SQLite 句柄。

## 样式限制与建议

Mini-app 里的 JSX/HTML 会复用宿主站点已经编译好的样式资源；它不会为项目源码单独跑 Tailwind 扫描。因此：

- 常见基础 utility class 往往可用，但这只是“碰巧命中宿主已编译样式”。
- 任意值类（如 `w-[320px]`、`max-h-[calc(...)]`）和冷门组合类不应假定可用。
- 需要稳定效果时，优先用内联 `style`，或者注入带项目私有前缀的 `<style>`。
- 能复用 `window.AgentSpacesUI` / `@agent-spaces/ui` 组件时，优先复用宿主组件，少直接依赖项目内 Tailwind class 命中情况。

## 模板

平台内置少量 Mini-app 模板（位于 `packages/templates/mini-app/`，含 `minimax_tts` 等），通过模板索引 `index.json` 注册。模板含 `manifest.json`、`src/index.jsx` 与可选 `avatar.png`，可用于快速创建带预设功能（如语音合成）的项目。

## 相关链接

- 关于 Issue 自动化与 Workflow 调度：[议题管理](/docs/features/issue-management)、[Workflow 编辑器](/docs/features/workflow)
- 关于插件系统与可注入的工具：[插件](/docs/features/plugins)