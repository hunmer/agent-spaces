# 对外接口

mini-app 是宿主渲染的「被动」组件，对外暴露两类接口：**Agent 可调用的画布 API** 和 **服务端单写者 handlers**。其余都是宿主提供给 mini-app 的能力（`window.AgentSpaces.*`）。

## 1. Agent 画布 API（src/api.js）

由 Agent（LLM function calling 或人工调）调用，通过 `ctx.requestClient` RPC 到浏览器执行。每个 handler 返回 `{ ok, message, ... }`。

| handler | 入参 | 返回 | 说明 |
|---------|------|------|------|
| `add_node` | `{type, label?, position?, data?, focus?}` | `{ ok, nodeId, type, typeLabel, position, message }` | 新增单节点。`type` 必须在 `VALID_NODE_TYPES` |
| `add_nodes` | `{nodes:[{type,label?,position?,data?}], focusFirst?}` | `{ ok, count, nodeIds, message }` | 批量新增（一次 RPC，比循环快） |
| `list_nodes` | `{type?}` | `{ ok, total, totalCount, items:[{id,type,typeLabel,label,position}], message }` | 按 type 过滤或全量 |
| `get_canvas` | `{}` | `{ ok, nodeCount, edgeCount, nodes, edges, message }` | 全貌（节点 + 边） |
| `connect_nodes` | `{sourceId, targetId}` | `{ ok, edgeId, sourceId, targetId, message }` | 单连线；已存在则不重复 |
| `connect_batch` | `{edges:[{sourceId,targetId}]}` | `{ ok, created, skipped, invalid, message }` | 批量连线 |
| `delete_node` | `{nodeId}` | `{ ok, nodeId, message }` | 删节点（同时清理相关连线） |
| `delete_edge` | `{sourceId, targetId}` | `{ ok, message }` | 删连线 |
| `update_node` | `{nodeId, data}` | `{ ok, nodeId, applied, message }` | 部分 patch 到节点 data |
| `get_selection` | `{}` | `{ ok, count, items, message }` | 当前选中节点 |

### RPC 协议（浏览器侧 useCanvasAgentRpc 监听）

服务端发 `miniApp.clientRequest` 事件，payload `{ requestId, type, payload }`，浏览器按 `type` 分流：

| type | payload | 浏览器执行 |
|------|---------|-----------|
| `canvas.addNode` | `{type, position?, data?, focus?}` | `createFn(type, position, data)` + 可选 focus |
| `canvas.addNodes` | `{nodes:[{type,position?,data?}], focusFirst?}` | 批量 setNodesFn + 可选 focusFirst |
| `canvas.updateNodeData` | `{nodeId, data}` | `updateFn(nodeId, data)` |
| `canvas.deleteNode` | `{nodeId}` | `deleteFn(nodeId)`（不存在返回 ok:false） |
| `canvas.connectNodes` | `{sourceId, targetId}` | 校验节点存在 → addEdge（已存在不重复） |
| `canvas.connectBatch` | `{edges:[{sourceId,targetId}]}` | 批量 addEdge（去重 + 跳过无效） |
| `canvas.deleteEdge` | `{sourceId, targetId}` | setEdgesFn filter |
| `canvas.getSelection` | `{}` | 返回 `nodes.filter(selected)` |
| `canvas.getCanvas` | `{}` | 返回 `{nodes:[{id,type,label,position}], edges:[{source,target}]}` |

响应：`window.AgentSpaces.respondClientRequest(requestId, result, ok=true, error?)`。

## 2. 服务端单写者 handlers（src/services/canvas.js）

前端通过 `window.AgentSpaces.invokeService(handlerName, payload)` 调用，handler 收到 `(payload, ctx)`，`ctx` 提供 `readConfig(path)` / `writeConfig(path, value)` / `updateConfig(path, fn)`。

### 画布（按 workspaceId 隔离到 `configs/workspaces/<id>/canvas.json`）
- `save_canvas({workspaceId, state})`：state `{nodes, edges, groups}`，写盘 + `savedAt`
- `load_canvas({workspaceId})`：返回 state 或 null
- `clear_canvas({workspaceId})`：写空 `{nodes:[],edges:[],savedAt}`

### 生成记录（按 workspaceId 隔离）
- `add_history({workspaceId, item})`：原子追加到头部，截断 `HISTORY_MAX=200`
- `remove_history({workspaceId, id})`：按 id 过滤
- `clear_history({workspaceId})`：写空数组

### 设置（全局共享 `configs/settings.json`）
- `save_settings({settings})`：整体覆盖（前端已 merge 默认值）

### 自定义提示词库（全局共享 `configs/prompt-library.json`）
- `save_prompt({item})`：upsert（同 id 覆盖，否则追加头部）
- `delete_prompt({id})`：按 id 过滤

### 工作区（`configs/workspaces.json`）
- `list_workspaces()`：返回 `{activeId, workspaces:[{id,name,createdAt}]}`，首次兜底 `default`
- `create_workspace({name?})`：id=`ws-<base36 时间>-<随机>`，name 默认「新建工作区 N」
- `rename_workspace({id, name})`
- `switch_workspace({id})`：仅改 activeId（不存在的 id 忽略）
- `delete_workspace({id})`：不允许删最后一个；删当前激活则 activeId 回退到第一个；同时清空被删工作区的 canvas/history/asset-library 数据

### 素材库（按 workspaceId 隔离 `configs/workspaces/<id>/asset-library.json`）
- `list_assets({workspaceId})`：返回 `{categories:[{id,name,createdAt,assets:[{id,url,name,size,uploadedAt}]}]}`，兜底空 categories
- `create_category({workspaceId, name?})`
- `rename_category({workspaceId, id, name})`
- `delete_category({workspaceId, id})`
- `add_asset({workspaceId, categoryId, asset})`：原子追加到分类 assets 头部，截断 `ASSET_MAX_PER_CATEGORY=500`
- `remove_asset({workspaceId, categoryId, assetId})`

## 3. 宿主提供的 API（window.AgentSpaces.*）

mini-app **消费**的接口（在宿主 `use-mini-app-host-api.tsx` 注册）。**修改这些需改宿主层 + 重启 web**。

| API | 用途 |
|-----|------|
| `getConfig(path)` / `writeConfigJson(path, value)` / `onConfigChanged(cb)` / `onConfigReady(cb)` | config 读写 + 多端同步 |
| `invokeService(handlerName, payload)` | 调服务端单写者 handler |
| `uploadFile(file)` | 上传文件到 `data/uploads/`，返回 `{url, ...}` |
| `downloadImage(url)` | 下载外链图到 `data/`，返回 `{httpUrl, ...}` |
| `callPluginTool(pluginId, toolName, args, opts?)` | 调插件工具（含内置 `@agent-spaces/builtin` 的 `execute_workflow_sync`/`agent_run`/`list_agent_presets`/`list_workflows` 等） |
| `subscribeWorkflowEvents(cb)` | 监听 `workflow:*` 事件（`workflow:started` 含 executionId） |
| `stopWorkflow(executionId)` | 发 `workflow:stop` 中断执行 |
| `sendWorkflowControl(event, data)` | 通用 workflow 控制 |
| `loadCdnModule(url)` | CDN 模块动态加载（`new Function('u','return import(u)')` 绕过打包器静态分析） |
| `openAgentEditor(opts)` | 打开 Agent preset 配置弹窗，返回 saved preset（含 id/name/modelProvider） |
| `openMediaGallery(items, index)` / `MediaGallery` | 图片大图查看（items 是 `[{src,type}]` 数组，**不可二次 map**） |
| `srcFileUrl(relPath)` | 解析 `src/` 相对路径为 http URL（对应 `/api/mini-apps/<id>/src/file` 路由） |
| `onTaskEvent(cb)` / `respondClientRequest(requestId, result, ok?, error?)` | Agent RPC 双向通道 |

## 4. 宿主暴露的 UI/库（@agent-spaces/ui + bare import allowlist）

新增库必须**两处都改**（`react-renderer.tsx` allowlist + 顶部 import；`ui-exports.ts` 导出）。

- `@xyflow/react@12.10.2`：ReactFlow, NodeResizer, NodeToolbar, useReactFlow, ViewportPortal 等
- `@dagrejs/dagre@3.0.0`：default + graphlib（自动布局）
- `@agent-spaces/ui`：Dialog/Tabs/Select/Popover/MediaGallery/openMediaGallery/ResizablePanel/WorkflowListDialog/WorkflowGroupOverlay/useGroupManagement/Markdown/InputGroup/ColorPicker/Switch/Tooltip*/FileUpload 等 + lucide 图标（`export * from 'lucide-react'`）

## 5. 工作流契约（外部依赖）

工作流 ID 在 `utils/constants.js WORKFLOWS`，可在设置页覆盖：

| key | 默认 ID | 用途 |
|-----|---------|------|
| text_to_image | `d88dcb7c-7f5f-47c8-962c-89217a2c0ad6` | 文字生成图片 |
| edit_image | `19f5f8a9-305d-43a6-9b05-584597213a8f` | 编辑图片 |
| image_enchanter | `8425608e-9e0c-49fa-baa3-32675566a3e6` | 抠图（process_type=segment）/ 放大（process_type=enhance） |
| text_to_voice | `820bf3b7-9d50-4f6d-966d-8e442960a233` | 文字生成语音 |
| video_generator | `5130958f-a78e-4c36-8f03-1f2f733b87d7` | 生成视频 |

调用：`callPluginTool('@agent-spaces/builtin', 'execute_workflow_sync', { workflow_id, input, fault_tolerance:'stop', max_wait_ms:600000 }, { meta })`。
