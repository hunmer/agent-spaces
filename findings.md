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

## 2026-08-02 Toolbar 顶层自动布局
- `Toolbar.jsx` 当前“自动布局”直接调用 `onAutoLayout`，没有方向子菜单。
- `useNodeCrud.handleAutoLayout` 无 `nodeIds` 时直接对全部 ReactFlow 节点执行 dagre，导致 group 内部结构被重新排列。
- group 不是真实 ReactFlow 节点，位置由成员节点包围盒派生；`handleGroupMove` 通过给递归成员统一增加 delta 来移动整个 group。
- 自动布局应把最外层 group 和所有未归组节点构造成同级虚拟实体，并把跨实体边映射到虚拟实体；完成后只平移 group 成员。
- 嵌套 group 应归入最外层 group，避免同一成员被重复移动。

## 2026-08-02 执行队列取消状态
- `useExecutionQueue.cancel()` 当前只更新 job 为 `stopped` 并中断底层执行，没有通知 Canvas 清理 `placeholderNodeId`。
- 表单任务的占位 `imageDisplay` 创建时写入 `loading:true`；只有 `onComplete` 和 `onError` 会清为 false，主动取消没有对应回调，因此会永久卡住。
- 批量运行任务虽然通过 `task.cancel -> handleCancelProcess` 清理节点状态，但队列层仍应统一通知取消，覆盖 queued 任务和所有 placeholder 节点。
- `runJob` 捕获中断异常时目前仍调用 `onError`，会把已取消节点再次标成错误；应只在最终状态为 `error` 时调用。
- 最小修复：队列增加 `onCancel(job)`，cancel 接受 queued/running 时立即调用一次；Canvas 统一写 `loading:false,status:'cancelled',error:undefined`。
- 仅依赖 `jobsRef.current.status` 存在 React 状态提交竞态；增加模块内 `cancelledJobIdsRef`，在异步成功/失败收尾前优先判定，防止晚到结果覆盖取消状态。

## 2026-08-02 图片缩略图链路
- 宿主已经暴露 `generateThumbnail({source|url,target,...})`，结果写入 mini-app data 目录并返回 `httpUrl`；当前 `downloadImage` 和 `saveImageToDir` 均未调用它。
- `persistImagesToBackend` 当前返回 `Promise<string[]>`，所有节点执行、连线和工作流输入都依赖 `images: string[]`，直接改成 `{url,thumb}` 对象会造成大范围破坏。
- 最小兼容方向是保留原图 URL 数组，并在相邻数据字段中保存缩略图；UI 的 `<img src>` 使用缩略图，Gallery、拖拽、删除、工作流输入继续使用原 URL。
- 工作区目录原图通过 `/local-file` 展示，缩略图仍可统一落 mini-app data 的 `thumbs/`，不产生第二份原图。
- 生成记录条目是对象且当前含 `images`，可新增同索引 `thumbs`；素材条目是 `{id,url,name,...}`，可新增单值 `thumb`。
- 节点生成输出当前为 `output: { images }`，适合扩为 `output: { images, thumbs }`；队列创建的 imageDisplay 节点可用 `data.thumbs`。
- 素材库与历史的 Gallery、拖拽和后续操作均明确使用原始 `url/images`，只需把 `<img src>` 改为 `thumb || url` 即可保持大图语义。
- 服务端缩略图接口接受远程 URL；宿主生成的带 token 的 data/local-file URL 可作为 `url` 输入，统一生成缩略图到 data 目录。
- 输出缩略图还必须沿边传播到目标节点；否则 `UpstreamImageList` 只有原 URL，输入区仍会请求大图。应在图片派生阶段同步构造 URL→thumb 映射，但不改变 URL 数组。
- `generateImages` 当前只有两个主要调用层（`useWorkflow` 与执行队列），可扩展为返回资源结果并在 hook 层拆成 `{urls, thumbs}`；媒体生成仍继续使用原 `persistImagesToBackend` 字符串返回契约。
- 最终数据设计采用 `resources: [{url, thumb}]`：`images` 保持纯字符串数组；每个资源对象显式含用户要求的 `thumb` 字段，旧数据无 resources 时 UI 自动回退原图。
