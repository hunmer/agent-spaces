# Findings

## 2026-08-02
- 参考 `WorkflowAutoLayoutMenu` 暴露三种布局：`LR`、`TB`、网格布局。
- 网格参数为 `rows`、`columns`、`horizontalGap`、`verticalGap`；默认间距均为 60，行列最少为 1。
- 参考组件只收集参数并调用 `onAutoLayout(direction, options)`，实际算法在调用方。
- mini-app `utils/layout.js` 已有 `autoLayout` 与 `autoLayoutSubset`，需确认分组调用方式。
- `useNodeCrud.handleAutoLayout(direction, options)` 已调用 `autoLayoutSubset`，可按 `options.nodeIds` 只重排指定节点，并支持参考菜单的 grid 参数。
- `GroupOverlays` 已把分组的直接 `childNodeIds` 传给上述回调，现有 UI 已具备组内自动布局。
- 因此无需新增布局算法；最小改动是新增 Agent 工具、API handler、RPC case，并让 RPC 调用现有布局函数或同一 utility。
- 新工具采用 `arrange_group`：`groupId/groupName` 二选一，`direction=LR|TB`，可选 `grid={rows,columns,horizontalGap,verticalGap}`。
- `get_canvas` 当前只返回节点和边；需增加 groups 摘要，Agent 才能稳定发现 groupId、名称和成员。
- RPC hook 当前未接收 `groups`，需加入 ref，并在 `canvas.arrangeGroup` 中按 id 优先、名称其次解析目标分组。
- 实现已复用 `autoLayoutSubset`，只回写目标节点 position；节点其余字段保持最新状态。

## 2026-08-02 update_node 并发超时
- 用户提供的失败为 `Mini-app client request timed out: canvas.updateNodeData`，说明服务端未在超时前关联到对应浏览器响应。
- 服务端 `mini-app-client-rpc.ts` 为每个请求生成独立 UUID，并用 `Map<requestId, PendingRequest>` 管理，原生支持多并发。
- 浏览器 `respondClientRequest` 会原样回传 requestId，服务端响应 handler 也按 requestId 精确 resolve，不是关联冲突。
- 高概率根因在 `mini-app-renderer.tsx`：`taskEvents` 每次变化只取 `taskEvents.at(-1)` 分发。多个 WS 事件被 React 批处理到同一数组更新时，除最后一个之外的事件不会进入 mini-app 监听器，导致对应 RPC 超时。
- `mini-app-preview` 通过函数式 `setTaskEvents` 追加事件并保留最近 50 条；React 批处理后最终数组仍包含同批新增事件，因此 renderer 可通过“上次事件对象游标”取出全部新增项。
- 修复不应放在 update_node 重试：RPC 丢包重试会引入重复副作用，且其他 canvas RPC 同样受影响。
- 最终修复：renderer 保存最后已分发事件对象，数组变化时分发其后的全部事件；若游标已滚出 50 条缓存，则分发当前保留缓冲区。
- 宿主层修改需要重启 Web；当前 Web 由 VS Code 任务启动且环境未提供 procm-mcp，不应直接终止未知管理进程。
