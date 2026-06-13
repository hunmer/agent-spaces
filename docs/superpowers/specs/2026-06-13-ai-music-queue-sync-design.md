# AI音乐：数据同步改造 + 右下角生成队列

- **项目**：`wui_1781192646059_cb4df369`（AI音乐）
- **日期**：2026-06-13
- **参考项目**：`wui_1781296097221_fcce9ebb`（ai_creator_tool-master）
- **目标**：①客户端不碰 `write`/`readConfig`；②右下角生成队列展示

## 1. 背景与现状

AI音乐是一个 Apple Music 风格深色主题的 MiniMax 音乐播放器 mini-app。当前两个问题：

### 1.1 客户端直接读写配置（多端覆盖风险）

| 位置 | 违规调用 |
|------|----------|
| `src/index.jsx` `loadPlaylist` | `readConfigJson('music-history.json')` |
| `src/index.jsx` `handleGenerate` | `readConfigJson` 读 + `writeConfigJson` 写 |
| `src/index.jsx` `handleRemove` | `writeConfigJson` 删除 |
| `src/components/PlaylistPopover.jsx` `loadItems` | `readConfigJson('music-history.json')` |

多个预览实例各自读写 `music-history.json`，存在「后写覆盖整文件」的并发风险。

### 1.2 缺少生成队列

当前仅有一个右上角单一 `generatingAlert` 提示，不支持并发生成、不追踪任务状态、无 executorId 过滤、刷新即丢失生成态。

### 1.3 两条生成路径

- **客户端 UI 路径**：`MusicGenerator.jsx` → `callPluginTool('workflow.minimax', 'minimax_music_generation', …)` → `onGenerate` 回调 → `index.jsx` `handleGenerate` 落库。**本路径纳入队列。**
- **Agent 路径**：`src/api.js` 的 `generate_music` → 服务端 `ctx.callPluginTool` → 广播 `miniApp.musicGenerated` → 客户端 `onTaskEvent` 监听 → 落库。该路径在服务端执行，**不经过前端 execute 路由的任务编排**，无客户端 `executorId` 可归属，**不纳入队列**，但结果仍进历史。

> 关键事实：`src/api.js` 位于 `src/`（非 `src/services/`），是 **Agent 的 API tools 定义**，由音乐管家 Agent 调用；其 ctx（含 `callPluginTool`/`readConfig`/`broadcast`）由 Agent 运行时注入，与本次新建的 `src/services/`（前端 RPC 写入方，ctx 由 `mini-app-services.ts` 注入，**无 callPluginTool**）是两套独立系统。

## 2. 设计

移植参考项目的「服务端单一写入方 + WS 任务事件驱动队列」模式。

### 2.1 数据流

```
配置历史（全局共享）                  生成队列（按 executorId 私有）
────────────────────────              ────────────────────────────────
客户端 invokeService('add_results')   客户端 callPluginTool(..., {taskId, meta})
        │                                       │
   services/history.js                    后端 execute 路由登记任务
        │ ctx.updateConfig                 广播 taskStarted/Finished/Failed
        ↓ broadcast configChanged                │
   所有客户端 onConfigChanged ←─────      客户端 onTaskEvent（按 executorId 过滤）
   （getConfig 拿初始快照）               只显示自己发起的任务
```

- **配置写入收敛到服务端**：`src/services/` 是 `music-history.json` 唯一写入方，`updateConfig`/`writeConfig` 后自动广播 `configChanged`。
- **客户端不碰 read/writeConfig**：读走 `getConfig` + `onConfigChanged`；写走 `invokeService`。
- **客户端生成纳入队列**：`callPluginTool` 第 4 参 `{ taskId, meta }` 触发后端任务编排；`taskFinished` 解析结果 → `invokeService('add_results')` 落库。
- **Agent 路径不动**：`api.js` 保持服务端调用 + 广播 `musicGenerated`；客户端收到后改走 `invokeService('add_results')` 落库（不再 `writeConfigJson`）。

### 2.2 队列交互（已确认决策）

- **形态**：右下角折叠徽标（显示 running 计数）+ 点击展开面板，列出每个任务的 prompt/进度/错误。
- **并发**：支持。提交即关弹窗，可立即再开；`taskId = task-{ts}-{rand}` 预生成。
- **Agent 路径**：不纳入队列，结果进历史。

## 3. 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/services/history.js` | **新增** | `add_results`(按 audioUrl 去重追加)/`remove_result`/`clear_results`，写 `music-history.json` 并广播 |
| `src/services/queue.js` | **新增** | `get_queue` → `ctx.listRunningTasks()` |
| `src/hooks/useGenerationQueue.js` | **新增** | 队列+历史状态管理 Hook（移植参考项目 `useGeneration`，适配音乐） |
| `src/components/GenerationQueue.jsx` | **新增** | 右下角折叠徽标 + 展开面板 |
| `src/index.jsx` | **改** | 接入 `useGenerationQueue`，删除全部 `readConfigJson/writeConfigJson`，渲染 `<GenerationQueue>` |
| `src/components/MusicGenerator.jsx` | **改** | `callPluginTool` 加 `{taskId, meta}`，落库交给队列的 `taskFinished` |
| `src/components/PlaylistPopover.jsx` | **改** | 删 `readConfigJson`，`playlist` 由上层 `index.jsx` 传入 |
| `src/CLAUDE.md` | **改** | 同步文档（数据持久化、队列相关条目） |

## 4. 详细设计

### 4.1 `src/services/history.js`

服务端唯一写入方。`music-history.json` 结构兼容现有数据：

```json
[{ "id", "audioUrl", "title", "artist", "prompt", "lyrics", "createdAt" }]
```

```js
const HISTORY_PATH = 'music-history.json';

export default {
  // payload: { items: [{ url, title, prompt, lyrics }], artist }
  add_results: ({ items, artist }, ctx) => {
    ctx.updateConfig(HISTORY_PATH, (prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const existing = new Set(list.map((r) => r.audioUrl));
      const timestamp = Date.now();
      const fresh = (items || [])
        .filter((it) => it && it.url && !existing.has(it.url))
        .map((it, i) => ({
          id: `${timestamp}-${i}`,
          audioUrl: it.url,
          title: it.title || '未命名',
          artist: artist || 'MiniMax Music AI',
          prompt: it.prompt || '',
          lyrics: it.lyrics || '',
          createdAt: new Date().toISOString(),
        }));
      return fresh.length ? [...fresh, ...list] : list;
    });
    return { ok: true };
  },
  clear_results: (_p, ctx) => { ctx.writeConfig(HISTORY_PATH, []); return { ok: true }; },
  remove_result: ({ id }, ctx) => {
    ctx.updateConfig(HISTORY_PATH, (prev) =>
      (Array.isArray(prev) ? prev : []).filter((r) => r.id !== id));
    return { ok: true };
  },
};
```

### 4.2 `src/services/queue.js`

```js
export default {
  get_queue: (_payload, ctx) => ctx.listRunningTasks(),
};
```

### 4.3 `src/hooks/useGenerationQueue.js`

移植参考项目 `useGeneration.js`，适配音乐：

- **状态**：`results`（历史，configChanged 驱动）、`taskQueue`（队列，task 事件驱动）。
- **派生**：`generating`（队列是否有 running）、`runningCount`。
- **初始化**（`useEffect`，幂等）：`getExecutorId()` → `getConfig` 取初始历史 → `onConfigChanged` 订阅 → `invokeService('get_queue')` 拉取 running 并按 executorId 过滤 → `onTaskEvent` 订阅四个事件。
- **事件处理**（均先判 `data.executorId === myId`）：
  - `taskSnapshot`：合并后端权威 status，保留本地更丰富字段。
  - `taskStarted`：乐观插入 running 项。
  - `taskFinished`：解析 audioHex → `invokeService('add_results')` 落库；标记 completed → 3s 移除。
  - `taskFailed`：标记 failed → 3s 移除。
- **`generate(prompt, { lyrics, model, instrumental })`**：预生成 taskId + meta，乐观插入，调 `callPluginTool('workflow.minimax', 'minimax_music_generation', args, { taskId, meta })`。**不在本地直接落库**，统一等 `taskFinished`。
- **结果解析 `extractAudio(result)`**：兼容 `{success, result:{data:{audioHex}}}` 与 `{result:{success, data:{audioHex}}}`，返回 `audioHex`。
- **meta**：`{ prompt, model, instrumental }`。
- **暴露**：`results, taskQueue, generating, runningCount, generate, removeResult, clearResults`。

### 4.4 `src/components/MusicGenerator.jsx`

- `handleGenerate` 改为调用上层传入的 `onGenerate(prompt, { lyrics, model, instrumental })`（即 `useGenerationQueue.generate`），由 Hook 接管 `callPluginTool` + 落库。
- 提交后 **`MusicGenerator` 自行 `onClose()` 关闭弹窗**（不再依赖 `onGenerateStart` 回调），右下角队列接管生成态提示。移除 `onGenerateStart`/`onGenerateEnd` 两个 props。
- Dialog 内 `generating` 局部态仅用于 disable 按钮（乐观插入后立即关弹窗，故通常不可见）。
- 歌词生成（`minimax_lyrics_generation`）保持不变（非生成任务，不进队列）。

### 4.5 `src/components/GenerationQueue.jsx`

- 右下角固定 `fixed bottom-6 right-6 z-40`。
- 折叠态：小徽标 `🎵 {runningCount}`，仅当 `taskQueue` 非空时显示。
- 展开态：卡片面板，列出每项 `{状态图标} {prompt截断} {进度/错误}`；Apple Music 深色风格（`bg-card/95 backdrop-blur-xl border-border`，主题色 `var(--theme-accent)`）。
- 完成/失败项保留 3s 后由 Hook 移除。

### 4.6 `src/index.jsx`

- 删除 `loadPlaylist`、`handleGenerate` 内的 read/writeConfigJson、`handleRemove` 内的 writeConfigJson。
- `results` 来源：`useGenerationQueue().results`（configChanged 驱动），赋给 `playlist`。
- `generate` 来源：`useGenerationQueue().generate`，传给 `MusicGenerator`（替代原 `onGenerate`）；`MusicGenerator` 不再接收 `onGenerateStart`/`onGenerateEnd`。
- `removeResult` 来源：`useGenerationQueue().removeResult`，传给 `PlaylistPopover`。
- `musicGenerated` 事件（Agent 路径）→ `invokeService('add_results', { items:[{url, title, prompt, lyrics}], artist })` 落库 + `player.loadAudio(audioUrl, true)` 自动播放 + 更新 `trackInfo`/`currentLyrics`（**保持原有体验**，不 writeConfigJson）。
- 移除 `generatingAlert`、`handleGenerateStart`、`handleGenerateEnd`（由右下角队列取代）。
- 渲染 `<GenerationQueue taskQueue={taskQueue} />`。

### 4.7 `src/components/PlaylistPopover.jsx`

- 删除 `loadItems`（readConfigJson）。
- `playlist` 由上层 `index.jsx` 传入，`onRemove` 透传 `removeResult`（已走 service）。

## 5. 验证

- **双标签隔离**：A 标签发起生成，B 标签队列不显示 A 的任务（executorId 过滤）；历史两端均同步（configChanged）。
- **并发生成**：连续发起 3 个，右下角队列显示 3 项 running，依次 completed 后淡出。
- **刷新恢复**：生成中刷新页面，`get_queue` + `taskSnapshot` 恢复 running 队列。
- **删除/清空**：`PlaylistPopover` 删除走 `invokeService('remove_result')`，历史 configChanged 回填。
- **Agent 路径**：音乐管家生成 → 结果进历史（全员可见），不进队列。

## 6. 非目标（YAGNI）

- 不改造 `api.js`（Agent tools）本身，仅改客户端对 `musicGenerated` 事件的落库方式。
- 不引入歌词生成的队列（`minimax_lyrics_generation` 保持即时调用）。
- 不做队列持久化（队列是进程内 cache，参考项目已说明）。
- 不改历史数据结构（保持向后兼容）。
