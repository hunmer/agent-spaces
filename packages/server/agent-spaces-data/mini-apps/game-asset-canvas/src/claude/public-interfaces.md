# 对外接口

mini-app 是宿主渲染的「被动」组件，对外暴露：**Agent 画布 API**（api.js）与 **服务端单写者 handlers**（services/canvas.js）。其余是宿主提供的能力（`window.AgentSpaces.*`）。

## 1. Agent 画布 API（src/api.js，约 27 个 handler）

Agent（LLM function calling）调用，经 `ctx.requestClient` RPC 到浏览器执行。每个 handler 返回 `{ ok, message, ... }`。

### 画布操作
| handler | 说明 |
|---------|------|
| `add_node` / `add_nodes` | 建节点（可选 groupName 归组、data 预填、title 自定义标题；旧 label 参数兼容） |
| `list_nodes` / `get_canvas` | 查节点（可按 type 过滤）/ 全貌 |
| `connect_nodes` / `connect_batch` | 连线（已存在不重复） |
| `delete_node` / `delete_edge` | 删除 |
| `update_node` / `update_nodes` | patch 节点 data（单/批） |
| `get_selection` | 当前选中节点 |
| `get_node_params` | 查节点参数 schema（改枚举参数前必查） |
| `arrange_group` | 按分组 id/名称对组内节点横向/纵向/网格编排 |
| `execute_node` / `execute_nodes` | 执行生成类节点（可选 waitForResult 等待产出） |
| `create_canvas_version` / `list_canvas_versions` / `restore_canvas_version` | 画布版本快照（configs/workspaces/<id>/canvas-versions.json） |

### 素材库操作（api/ 目录实现）
`list_asset_categories` / `list_assets` / `find_asset_by_name` / `add_asset` / `update_asset` / `remove_asset` / `move_asset` / `create_asset_category` / `rename_asset_category` / `delete_asset_category`

### RPC 协议（浏览器侧 useCanvasAgentRpc 监听，13 个 case）

服务端发 `miniApp.clientRequest` 事件，payload `{ requestId, type, payload }`，浏览器按 `type` 分流：

| type | 浏览器执行 |
|------|-----------|
| `canvas.addNode` / `canvas.addNodes` | createFn / 批量 setNodesFn（可选 focus） |
| `canvas.updateNodeData` | updateFn(nodeId, data) |
| `canvas.deleteNode` / `canvas.deleteEdge` | 删节点（连带边）/ filter 边 |
| `canvas.connectNodes` / `canvas.connectBatch` | addEdge（去重 + 跳过无效） |
| `canvas.getSelection` / `canvas.getCanvas` | 返回选中 / 全貌 |
| `canvas.arrangeGroup` | 组内节点编排 |
| `canvas.executeNode` | buildNodeExecution 分支执行 |
| `canvas.waitNodeResult` | async 轮询等产出（onTaskEvent 内 `await new Promise`） |
| `canvas.getNodeParams` | 返回节点参数 schema |

响应：`window.AgentSpaces.respondClientRequest(requestId, result, ok=true, error?)`。

**关键实现约束**：
- `ctxRef` 持有最新 nodes/edges/callbacks，effect deps `[]` 只订阅一次 WS。
- useCanvasAgentRpc 调用必须放在 Canvas.jsx 的 nodeCallbacks useMemo **之后**（TDZ：依赖 handleGenerate/handleGenerateMedia）。
- 宿主 `mini-app-renderer.tsx` 的 taskEvents 必须**增量全量分发**（事件游标），只发最后一条会让并发 `ctx.requestClient` 超时。

## 2. 服务端单写者 handlers（src/services/canvas.js，31 个）

前端经 `window.AgentSpaces.invokeService(handler, payload)` 调用，ctx 提供 `readConfig/writeConfig/updateConfig`。

### 画布（`configs/workspaces/<id>/`）
- `save_canvas({workspaceId, state})` / `load_canvas` / `clear_canvas`
- `add_history({workspaceId, item})`（头部追加，HISTORY_MAX=200）/ `save_generation_history`（整文件写，补缩略图用，必须保留 resources）/ `remove_history` / `clear_history`
- `save_last_params({workspaceId, params})`（每节点类型上次提交参数）

### 分镜角色 / Spine 换肤
- `save_storyboard_characters` / `save_storyboard_character` / `delete_storyboard_character`（按工作区隔离）
- `save_spine_reskin_history` / `delete_spine_reskin_history`（全局，SPINE_RESKIN_HISTORY_MAX=20）

### 全局共享
- `save_settings`；`save_prompt`（upsert）/ `delete_prompt` / `reset_prompts`

### 工作区（`configs/workspaces.json`，workspace 含可选 `directory` 字段）
- `list_workspaces` / `create_workspace`（可带 directory）/ `rename_workspace`（可改 directory）/ `switch_workspace` / `delete_workspace`

### 素材库（按工作区隔离）
- `list_assets` / `create_category` / `rename_category` / `delete_category` / `add_asset` / `save_asset_library`（整文件写）/ `remove_asset` / `update_asset` / `move_asset`

## 3. 宿主提供的 API（window.AgentSpaces.*，修改需重启 web）

| API | 用途 |
|-----|------|
| `getConfig` / `writeConfigJson` / `onConfigChanged` / `onConfigReady` / `isConfigReady` | config 读写 + 多端同步 |
| `invokeService(handler, payload)` | 调服务端单写者 |
| `uploadFile(file)` | 上传到 `data/uploads/`，返回 `{url}` |
| `downloadImage(url)` | 下载外链图到 `data/`，返回 `{httpUrl}` |
| `saveImageToDir(url, dir, filename)` | 产图写工作区数据目录（绝对路径），无扩展名自动补 |
| `localFileUrl(absPath)` | 绝对路径 → `/api/mini-apps/:id/local-file?path=...` URL（isBackendUrl 识别） |
| `revealAbsolutePath(absPath)` | 文件管理器定位 |
| `callPluginTool(pluginId, toolName, args)` | 调插件工具（不可中断） |
| `subscribeWorkflowEvents(cb)` / `stopWorkflow(executionId)` | 工作流事件订阅与中断（executionId 从 `workflow:started` 拿） |
| `loadCdnModule(url)` | CDN 动态 import |
| `openAgentEditor(opts)` | Agent preset 配置弹窗 |
| `openMediaGallery(items, index)` | 大图查看（items 已是 `[{src,type}]`，不可二次 map） |
| `srcFileUrl(relPath)` / `proxyImageUrl` / `dataFileUrl` | 路径解析 |
| `onTaskEvent(cb)` / `respondClientRequest(requestId, ...)` | Agent RPC 双向通道 |
| `registerHostSlot / updateHostSlotState` | 宿主 UI 插槽注册与激活态同步（agent-chat Chat 内嵌） |

## 4. 依赖的插件工具（callPluginTool）

| 插件 | 工具 | 用途 |
|------|------|------|
| `@agent-spaces/builtin` | `execute_workflow_sync` / `agent_run` / `list_agent_presets` / `list_workflows` | 工作流执行 / AI 分析（BBox/反推/提示词优化/分镜拆镜） |
| `workflow.ffmpeg` | `ffmpeg_extract_frames` / `ffmpeg_custom` / `ffmpeg_probe` | 视频帧截取（原分辨率无损 PNG）/ 自定义命令 / 探测；workspaceId 透传使产物落 mini-app data 目录 |
| `workflow.sam` | `sam_segment_with_boxes` | Spine 换肤 SAM 分割 |
| `workflow.rembg` | rembg 去背景 | 抠图 rembg mode / 换肤形状交集 |
| `workflow.depth-anything` | 深度图提取 | depthExtract 节点 |

## 5. 宿主暴露的 UI/库（@agent-spaces/ui + bare import allowlist）

新增库必须**两处都改**（`react-renderer.tsx` allowlist + 顶部 import；`ui-exports.ts` 导出），需重启 web。

- `@xyflow/react@12.10.2`：ReactFlow, NodeResizer, NodeToolbar, useReactFlow, ViewportPortal, **MarkerType**, useUpdateNodeInternals 等
- `@dagrejs/dagre@3.0.0`：default + graphlib
- `@agent-spaces/ui`：Dialog/Tabs/Select/Popover/MediaGallery/ResizablePanel/WorkflowGroupOverlay/Markdown/ColorPicker/Switch/Tooltip/FileUpload/Masonry + lucide 图标（不要直接 import lucide-react）

## 6. 工作流契约（外部依赖）

工作流 ID 在 `utils/constants.js WORKFLOWS`（fallback），可在设置页覆盖（settings 是用户配置）：

| key | 用途 |
|-----|------|
| text_to_image | 文字生成图片 |
| edit_image | 编辑图片 |
| image_enchanter | 抠图（segment）/ 放大（enhance） |
| text_to_voice | 文字生成语音 |
| video_generator | 生成视频 |

调用：`callPluginTool('@agent-spaces/builtin', 'execute_workflow_sync', { workflow_id, input, fault_tolerance:'stop', max_wait_ms:600000 }, { meta })`。媒体节点加 `returnRawEndOutput:true` 跳过图片专用提取。
