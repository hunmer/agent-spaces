# Workflow UI 状态同步 — WS 频道方案计划


## 3. 现有可复用的基础设施

| 能力 | 位置 | 用法 |
|------|------|------|
| 按 workspace 广播 | `packages/server/src/ws/connection-manager.ts` `broadcastToWorkspace(workspaceId, event, data)` | workspaceId = projectId，直接用作频道 |
| 连接生命周期回调 | 同文件 `onClientConnected(cb)` / `getConnectionsByWorkspace` | 客户端连入时推送快照 |
| clientId 分配 | 同文件 `addConnection` 返回 clientId | 用作 executorId（需回传前端，见 §6） |
| 单连接推送 | 同文件 `sendToClient(clientId, data)` | 推送快照给单个客户端 |
| 前端 WS 单例 | `packages/web/src/lib/ws.ts` `getWS(workspaceId).on(event, h)` | 客户端订阅频道事件 |
| execute 路由 | `packages/server/src/routes/plugin.ts` `POST /:pluginId/tools/execute` | 编排任务的入口 |

## 4. 后端设计

### 4.1 任务 cache
新建 `packages/server/src/services/mini-app-tasks.ts`：进程内 `Map<projectId, Task[]>`。

```ts
interface Task {
  taskId: string;
  projectId: string;
  pluginId: string;
  toolName: string;
  executorId: string;        // 发起方的 WS clientId
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  finishedAt?: number;
  result?: unknown;          // 工具返回（completed 时）
  error?: string;            // 失败信息
}
```

操作：`startTask / finishTask / failTask / listTasks(projectId) / prune`（清理过期终态）。

### 4.2 execute 路由编排
`POST /api/plugins/:pluginId/tools/execute` body 扩展可选字段 `{ workspaceId?, executorId?, taskId? }`：

1. `workspaceId`（= projectId）、`executorId`（= clientId）、`taskId`（前端预生成，见 §5.3）缺失则后端生成。
2. `startTask` → 广播 `miniApp.taskStarted`。
3. 执行 `executePluginTool`（**不动 service 签名**，编排留在路由层）。
4. 成功 → `finishTask(result)` + 广播 `miniApp.taskFinished`；失败 → `failTask(err)` + 广播 `miniApp.taskFailed`。
5. 响应体不变（`{ success, result }`），发起方照常拿结果。

> 视频生成节点（内部轮询）同样是一次 execute，会自然触发 `taskFinished`，无需特判。

### 4.3 加入频道即拿现状（断线/刷新恢复）
在 `onClientConnected` 回调里，按该连接的 workspaceId 调 `sendToClient(clientId, {event:'miniApp.taskSnapshot', data:{tasks: listTasks(workspaceId)}})`。
重连/新标签连入即拿到当前所有 running/最近终态任务，重建视图。

## 5. 前端设计

### 5.1 host api（`use-mini-app-host-api.ts`）
- `callPluginTool` 调用时附带 `executorId`（自身 clientId）与 `workspaceId`（projectId），其余 args 不变。

### 5.2 useGeneration 改造
- **改为**：订阅 WS 事件维护队列视图：
  - `taskSnapshot` → setTaskQueue(snapshot)
  - `taskStarted` → 追加 running 项
  - `taskFinished` / `taskFailed` → 更新对应 taskId 状态（延迟移除）
- results（历史）仍走 `readConfigJson/writeConfigJson` 落盘，不变。
- `taskFinished` 时若 `executorId === 自身 clientId`，把结果解析后并入 results 历史（发起者落库）；非发起者仅更新队列视图。

### 5.3 taskId 对齐
前端 generate 时本地预生成 `taskId`，通过 execute body 传给后端，后端 cache 沿用同一 taskId → 广播事件里的 taskId 与前端 UI 项天然匹配，无需额外映射。

## 6. clientId 回传（必做的小改）

当前 `connection-manager.addConnection` 生成了 clientId 但没发给前端。需在 WS 握手后由后端 push：

```
{ event: 'miniApp.hello', data: { clientId } }
```

或在 `ws.ts` 的 `on('connected')` 之外新增。前端 host api 缓存该 clientId 作为 executorId。

> 备选：前端生成临时 executorId（uuid）随 execute 发送，后端原样广播——完全不依赖 clientId 回传，更简单。**建议先这么做**，clientId 回传作为后续优化。

## 7. 事件清单

| 事件 | 方向 | payload |
|------|------|---------|
| `miniApp.taskSnapshot` | S→C | `{ tasks: Task[] }`（连入时推送） |
| `miniApp.taskStarted` | S→C | `{ taskId, executorId, pluginId, toolName }` |
| `miniApp.taskFinished` | S→C | `{ taskId, executorId, result }` |
| `miniApp.taskFailed` | S→C | `{ taskId, executorId, error }` |

## 8. 待决策点（建议先定）

1. **历史是否全局共享**：建议共享——results 本就是 `configs/generation-history.json` 项目级。则 `taskFinished` 时所有客户端都把结果并入历史（不区分 executor）；executor 验证仅用于「完成通知 toast 只弹给发起者」。
2. **进度粒度**：execute 是单次 Promise，中间无进度回调。`taskSnapshot` 只能反映 running/completed/failed 状态机；视频轮询期间一直 running。可接受？
3. **cache 终态保留时长**：建议 completed/failed 保留 N 分钟（如 10min）后 prune，供晚加入的客户端看到最近完成；running 永久（直到终态）。
4. **executorId 来源**：前端临时 uuid（简单，推荐）vs clientId 回传（精确，多一次握手）。

## 9. 实施顺序（建议）

1. 后端 `mini-app-tasks.ts`（cache + 操作）
2. execute 路由编排 + 4 个广播事件
3. `onClientConnected` 推送 taskSnapshot
4. 前端 host api：callPluginTool 带 executorId/workspaceId/taskId
5. useGeneration 改为事件驱动
6. 改造 minimax_tts 项目验证（多标签 + 刷新 + 断线）
