# Handoff: 游戏资产生成画布 (game-asset-canvas)

> 本文件是**索引型文档**：快速理解项目骨架 + 修改某功能去哪个文件。
> 逐轮改动历史查 git log；协议/算法细节需要时读对应源码，不在此堆砌。

## 项目一句话

ReactFlow 搭的「游戏资产生成画布」mini-app：节点化调用文生图/编辑图片/图像处理/配音/视频工作流，节点间连线传图，支持多工作区/复制粘贴/分组/执行队列/Agent RPC。

## 关键路径

```
mini-app 根: packages/server/agent-spaces-data/mini-apps/game-asset-canvas/
  manifest.json          # mini-app 配置 + agents[] 定义（改 agent 改这里）
  src/
    index.jsx            # <ReactFlowProvider><Canvas/></ReactFlowProvider>
    api.js               # Agent 工具实现（RPC 到浏览器）—— 改 agent 能力改这里
    tools.js             # Agent 工具元数据（description/inputSchema）—— 改 agent 工具描述改这里
    components/
      Canvas.jsx         # 编排层（hook 装配 + ReactFlow 回调 + JSX），~400 行
      RightPanel.jsx     # 右侧三 tab：新增节点/节点管理/生成记录
      Toolbar.jsx / SettingsDialog.jsx / ExecutionQueuePopover.jsx
      NodeFormDialog.jsx / NodeExecuteDialog.jsx
      PromptPickerDialog.jsx / FileUpload.jsx
      nodes/             # 各节点组件（含 PARAMS_SCHEMA export）
      canvas/            # Canvas 子组件（菜单/多选 toolbar/分组 overlay）
    hooks/               # 状态/业务逻辑（见下「数据流」）
    utils/
      constants.js       # 节点类型/工作流 ID/各 OPTIONS 枚举（单一数据源）
      canvas-constants.js# 节点组件聚合 + NODE_PARAMS_SCHEMA 映射
      workflow.js / cutout.js / image-ops/  # 执行逻辑
      storage.js / clipboard.js / layout.js
    services/canvas.js   # 服务端持久化（save_canvas/history/workspaces）
    vendor/              # 本地第三方资源（pixelorama/director-desk/painterro/fabric 等）

宿主层（改这些需重启 web）:
  packages/web/src/components/mini-apps/react-renderer.tsx      # resolveExternalModule allowlist + 顶部 import
  packages/web/src/lib/ui-exports.ts                            # 导出到 window.AgentSpacesUI
  packages/web/src/components/mini-apps/use-mini-app-host-api.tsx # window.AgentSpaces 能力（WS/上传/CDN/插件）
  packages/web/src/components/mini-apps/mini-app-host-slots.ts    # 宿主 UI 插槽注册/激活状态同步
  packages/server/src/services/builtin-tools/mini-app-tools.ts  # agent_run/list_agent_presets 内置工具
  packages/server/src/services/mini-app-client-rpc.ts           # RPC 双向通信（requestClient/respondClientRequest）
  packages/server/src/services/mini-app-agent.ts                # loadApiJs/loadMiniAppToolsJs（每次重读，改即生效）
```

**工作流 ID**（在 settings 可换）：text_to_image / edit_image / image_enchanter / text_to_voice / video_generator（具体 UUID 在 `utils/constants.js` WORKFLOWS）。

## 改动刷新策略

- **mini-app src 改动**（含 manifest/api.js/tools.js/节点/服务）→ **刷新即生效**。
- **宿主层改动**（react-renderer/ui-exports/use-mini-app-host-api/mini-app-tools）→ **必须重启 web**。
- 例外：`src/services/*.js` 由 chokidar watcher 热重载，无需重启。

## 数据流（单一数据源）

```
useCanvasState(workspaceId)  ← nodes/edges/groups 的唯一 state
  ├─ 持久化到 configs/workspaces/<id>/{canvas,generation-history}.json
  ├─ settings/prompt-library/panel-layout 存顶层（用户级，不隔离）
  └─ 多端同步经 onAnyConfigChanged 广播
        ↓
computeInputImages(nodes, edges)  ← 上游产出图派生到下游 data.images（多跳转发）
                                  ← 同步派生 data.imageResources（仅缩略展示）
computeInputVideos(nodes, edges)  ← 上游产出视频派生到下游 data.videos
computeInputTexts(nodes, edges)   ← 上游 output.text 按 edge.inputTarget 派生到 data.textInputValues
        ↓
useDecoratedNodes({nodes, callbacks})  ← 注入 onUpdate/onGenerate/onProcessLocal 等回调
  （videoEditor 的上游视频与用户上传去重合并，非覆盖）
        ↓
ReactFlow nodes={decoratedNodes}
```

**关键 hook 职责**（改某功能先定位这里）：
- `useNodeCrud` — 节点 CRUD + 定位/布局/导出 + 尺寸自适应 + 表单提交
- `useNodeExecutions` — 工作流生成/媒体/本地算法/抠图/反推提示词执行回调
- `useGroupOperations` — 分组数据 ops + overlay 移动/连线
- `useSelectionClipboard` — 选中 + 对齐分布 + 批量删除 + 复制粘贴
- `useImageOutputs` — 批量产出（addImageNodesFromUrls）
- `useExecutionQueue` — 执行队列（submit/cancel/完成回调）
- `useCanvasAgentRpc` — Agent WS RPC 入口（详见下「Agent RPC」）

## Agent RPC 通路

```
Agent → api.js handler → ctx.requestClient(type, payload, timeoutMs)
  → mini-app-client-rpc.ts 广播 miniApp.clientRequest
  → useCanvasAgentRpc 监听 → 按 type 分流 → setNodes/setEdges/setGroups 或调执行回调
  → respondClientRequest(requestId, result) → Promise resolve 回 api.js
```

**RPC case 清单**（在 useCanvasAgentRpc.js）：addNode / addNodes / updateNodeData / deleteNode / connectNodes / connectBatch / getSelection / deleteEdge / getCanvas / arrangeGroup / executeNode / waitNodeResult / getNodeParams。

**关键实现**：
- `ctxRef` 持有最新 nodes/edges/callbacks，effect deps `[]` 只订阅一次 WS（避免重订阅抖动）。
- onTaskEvent 回调是 **async**（waitNodeResult 用 `await new Promise` + setTimeout 轮询）。
- useCanvasAgentRpc 调用必须放在 Canvas.jsx 里 **nodeCallbacks useMemo 之后**（TDZ：依赖 handleGenerate/handleGenerateMedia）。

## 功能快速路径（要改 X → 去 Y）

| 要改的功能 | 去哪个文件 | 改什么 |
|---|---|---|
| 加/改 agent（systemPrompt/suggestions） | `manifest.json` | `agents[]` 数组，零宿主改动 |
| 加 agent 工具 | `api.js` + `tools.js` | api.js 加 handler（用 rpc→canvas.xxx），tools.js 加元数据 |
| 加节点类型 | `utils/constants.js` + `utils/canvas-constants.js` + `api.js` + `tools.js` + 节点组件 | 见下「新增节点 Checklist」 |
| 改节点 UI | `components/nodes/XxxNode.jsx` | 节点组件 + PARAMS_SCHEMA（若有枚举参数） |
| 改节点执行逻辑 | `hooks/useNodeExecutions.js` | handleGenerate/handleProcessLocal 等 |
| 改默认工作流 ID | `utils/constants.js` WORKFLOWS 或 settings | WORKFLOWS 是 fallback，settings 是用户配置 |
| 改提示词库 | `utils/prompts.js`（内置）+ configs/prompt-library.json（自定义） | 内置不写盘 |
| 改设置项 | `utils/settings.js` DEFAULT_SETTINGS + `SettingsDialog.jsx` | 加字段 + 加 UI |
| 改画布样式菜单 | `Toolbar.jsx` + `Canvas.jsx` + `components/canvas/floating-edge-utils.js` | 背景/Handle 方向/吸附，配置存 settings |
| 改图像处理算法 | `utils/image-ops/` | 统一 (ImageData, params) => ImageData |
| 改抠图 | `utils/cutout.js` + `CutoutNode.jsx` | runCutout 分流（本地/工作流/rembg） |
| 工作区数据目录（产图落本地） | `utils/workflow.js`（persistImagesToBackend/generateImages）+ `useWorkflow.js` + `useExecutionQueue.js` + Canvas `activeWorkspace?.directory` | 见下「工作区数据目录」 |
| 暴露新第三方库到 mini-app | `react-renderer.tsx` + `ui-exports.ts` | allowlist + 顶部 import（两处都改，需重启 web） |
| 加 host 能力 | `use-mini-app-host-api.tsx` | window.AgentSpaces 上挂方法（需重启 web） |
| 把宿主 Chat 嵌入右侧面板 | `manifest.json` + `mini-app-preview/index.tsx` + `mini-app-host-slots.ts` + `components/right-panel/index.jsx` | `agentChatPlacement: "mini-app-slot"`，宿主 Portal 到 `agent-chat` 插槽 |
| 改 vendor 资源 | `vendor/` + 对应 Dialog/Node | 见下「Vendor 资源」 |
| 视频编辑器节点 | `components/nodes/VideoEditorNode.jsx` + `components/VideoEditorDialog.jsx` + `components/FrameSequencePlayer.jsx` | 节点外壳 + 大对话框（双播放器/帧选区/动画组）+ React 内置帧播放器 |
| 视频帧截取/区域截取/尺寸调整 | ffmpeg 插件（`ffmpeg_extract_frames` / `ffmpeg_custom` / `ffmpeg_probe`） | 经 `callPluginTool('workflow.ffmpeg', action, args)` 调用；帧为原分辨率无损 PNG，归一化 cropRegion 在插件内转 ffmpeg crop |
| 插件访问 mini-app data 目录 | `plugin-runtime-api.ts`（getMiniAppDataDir/saveMiniAppDataFile）+ `routes/plugin.ts:187`（透传 workspaceId） | 打通了 workspaceId → 插件 api 断点，使 ffmpeg 产物能写到当前 mini-app 的 data 沙箱 |

## 核心约束 / 坑点（去重精选）

1. **节点选中状态**：不要在 decoratedNodes 里覆盖 `selected`（破坏 ReactFlow 内置机制）。selected 自管，selectedId 只用于面板高亮。
2. **NodeResizer**：节点创建必须带顶层 `width`/`height` + `style:{width,height}`，否则 resize 无效。
3. **交互抑制**：NodeShell 内容区 + NoteNode textarea 必须加 `nodrag nopan nowheel` class。
4. **上传图片持久化**：用 `window.AgentSpaces.uploadFile(file)` 拿 http URL（返回 `.url`），不能用 `URL.createObjectURL`（刷新失效）。提交工作流前 `normalizeImageUrls` 补全 origin。
5. **工作流同步超时**：`execute_workflow_sync` 默认 120s，必须传 `max_wait_ms:600000`。解析兜底：end 节点 → data.images → 任意 completed 节点。
6. **中断**：`callPluginTool` 不可中断；中断靠 `stopWorkflow(executionId)`，executionId 通过并行订阅 `workflow:started` 拿到。
7. **媒体节点走独立回调 onGenerateMedia**：产出结构不同（audio/video），不能复用 onGenerate。`runWorkflow` 加 `returnRawEndOutput:true` 跳过图片专用提取。
8. **提示词交互 = 展示+合并（非填充）**：选中提示词库存到 `params.pickedPrompt`，用 PickedPromptBadge 展示；提交时 `[pickedPrompt, prompt]` 去空去重合并。三处表单一致。
9. **多工作区隔离用 configs 子目录**：`configs/workspaces/<id>/{canvas,history}.json`；settings/prompt-library 顶层共享。切换由 activeId 驱动，子 hook 接收 workspaceId 重载。
10. **剪贴板是模块级内存**：`utils/clipboard.js` 用模块级 ref（非 localStorage），刷新失效。焦点在 input/textarea/contenteditable 时放行浏览器原生 Ctrl+C/V。
11. **多选隐藏节点 toolbar**：NodeToolbar `isVisible={selected && selectionCount <= 1}`。
12. **图标从 `@agent-spaces/ui` 命名导入**，不要直接 `import from 'lucide-react'`（不在 allowlist）。
13. **config 初始读取要三重读取**：`getConfig + onConfigReady + onAnyConfigChanged`（挂载时快照可能未 ready）。
14. **生成记录必须双路径都写 history**：节点内「生成」走 handleGenerate，表单「⚡生成」走 useExecutionQueue.submit → onComplete。onComplete 必须也调 addHistory。
15. **节点对话框数据持久化**：业务数据存节点 `data.<featureData>`（经 onUpdate 写回），不要只放 Dialog useState。换输入资源时清旧数据。详见原 handoff 同名章节（git 历史可查）。
16. **输出预览模式是节点级状态**：开关持久化在 `node.data.outputPreviewMode`；画布 Controls 入口只批量把所有节点设为开启。是否有产出只看 `data.output.images`，不能把 `data.images`（上游输入）误判为输出。
17. **vendor 库加载**：fabric/browser-image-compression 走 `(0,eval)` 全局求值；painterro 走 loadVendor + esmSuffix 转 ESM；pixelorama/director-desk 走 iframe + postMessage。
18. **API 参数 schema = 节点即文档**：不要在 tools.js 内联枚举值/写 NODE_PARAMS_SPEC 注入提示词。枚举参数的 options 在节点组件 PARAMS_SCHEMA 里**直接引用 constants 的 OPTIONS**（单一数据源）。
19. **工作区数据目录落地是「单写非双写」**：产图只产生**一份**文件。directory 设了 → 落工作区目录 `{historyId}/{index}.ext` + 返回指向该文件的 `localFileUrl`（走 `/local-file` 路由，被 `isBackendUrl` 识别为后端地址，下游/编辑不二次下载、不怕外链过期）；directory 没设 → 回退落 data 目录。**historyId 必须在调用 generateImages 前生成**（作落地子目录名，与 addHistory 共用同一 id）。改这套逻辑同时改两处调用点：`useWorkflow`（节点内生成）+ `useExecutionQueue.submit`（表单生成）。宿主能力 `saveImageToDir`/`localFileUrl`/`revealAbsolutePath` + 服务端 `write-absolute` 路由已具备，纯 mini-app 改动刷新即生效。
20. **Spine gizmo 坐标只用本地变换**：角色和骨骼 Graphics 同挂 `spineContainer`，`_boneToContainer` 只能应用 `spine.transform.localTransform`；使用 `worldTransform` 会把父容器的 fit/zoom/pan 重复应用，导致首次加载骨骼偏到右下方。
21. **videoEditor 上游视频是合并非覆盖**：videoEditor 是编辑器，用户会上传+编辑视频。`useDecoratedNodes` 对 videoEditor 的上游视频派生用**去重合并**（`[...own, ...upstream]`），不像 videoDisplay 那样覆盖。改这套逻辑见 `useDecoratedNodes.js` 的 upVids 分支。
22. **ffmpeg 插件产物落 mini-app data 目录**：`routes/plugin.ts:187` 已把 workspaceId 透传给 `createBuiltinPluginApi`，插件 ctx.api 有 `getMiniAppDataDir()` / `saveMiniAppDataFile(relPath, buffer)`（返回 httpPath，走 `/api/mini-apps/:id/data/file`）。ffmpeg 的 extract_frames/custom/probe 都用这套，产物不落全局 public/uploads。
23. **videoEditor 播放器常驻且截帧无损**：视频播放器与 `FrameSequencePlayer` 切 tab 时只切显隐，不得条件卸载；隐藏播放器用 `active`/`pause()` 停止播放并保留当前位置。截帧输出原分辨率无损 PNG；`cropRegion` 使用 `0..1` 归一化坐标，框选宽或高小于 1% 无效，框选模式开启时暂停视频并隐藏原生 controls。动画组的派生 frames 必须用 `useMemo`/`useCallback` 保持稳定，精灵图仅随源帧、起止帧、FPS 或列数变化重算。
24. **透传节点优先使用当前派生输入**：`imageDisplay` / `videoDisplay` 有连入边时，继续向下游转发必须优先取 `computeInputImages/computeInputVideos` 本轮派生值（包括空数组），不能回退到节点持久化的旧 `data.images/videos`，否则上游切换历史版本后会向更下游残留旧产出。`videoEditor` 仍按“自身上传 + 当前上游”去重合并。
24. **媒体 URL 不能直接作为 React 列表 key**：工作流可能返回重复 URL（同一图片出现多次），`key={url}` 在历史版本 `1↔2` 张切换时会触发 React 错误复用并残留 DOM。上游输入列表统一用 `occurrenceKeys` 生成“同 URL 出现序号 + URL”的唯一 key。
25. **文本连线是引用，不复制 params**：文字/反推节点的 `data.output.text` 经 `computeInputTexts` 派生到目标的 `data.textInputValues`；目标组件只在展示/执行时与持久化 `data.params` 合并，写回仍基于原始 params。edge 用 `data.inputType='text'` + `data.inputTarget=<字段 key>`；断线后应恢复目标节点原来的手动值。
25. **编辑图片缩略图可直接绘制蒙版**：`EditImageNode` 的输入缩略图悬浮时在底部居中显示并排的编辑/删除图标，编辑动作通过本地 `FileUpload.onEditItem` 打开 `MaskPaintDialog`；蒙版缩略图传 `bottomActions` 复用该底部栏但只显示删除。显隐、绝对定位和按钮尺寸全部使用 `FileUpload` 内的 `.game-asset-upload-thumb*` 作用域 CSS，不依赖 mini-app 源码无法生成的 Tailwind `group-hover` / `bottom-*` 等工具类；绘制快照存 `data.editMaskPaintData`，导出的首张 URL 写入既有 `params.mask`。
26. **本地 FileUpload 上传入口属于缩略图网格**：未达到 `max` 时，紧凑上传入口始终渲染为三列缩略图网格的第一个单元格，后接已有图片；不要恢复为缩略图整行 + 下方独立上传行。
27. **节点产出缩略图操作栏底部居中**：`ImageResult` 的“添加到素材库/删除”按钮统一放在 `.game-asset-output-actions`，悬浮时在图片内部底部居中并排显示；定位、尺寸、显隐必须用组件内作用域 CSS，不要恢复右上/右下负偏移或 Tailwind `group-hover`。
28. **共享 FileUpload 图片预览走 Gallery**：宿主 `packages/web/src/components/ui/file-upload.tsx` 点击图片缩略图调用 `openMediaGallery`，Gallery 只包含有预览 URL 的图片文件并按图片子集定位；缩略图自身悬浮时用 `group/preview` 显示半透明遮罩和眼睛图标，最右侧删除按钮仅在文件行 hover/focus 时显示。该文件是宿主层，修改后必须重启 Web。
29. **画布样式设置沿用工作流字段名**：`bgVariant`（dots/lines/cross）、`attributionPosition`（top-bottom/left-right）、`snapGrid` 存全局 settings；所有节点 Handle 方向统一走 `getFloatingHandleProps`，不要在节点内写死方位。
29. **自动吸附包含网格与辅助线对齐**：`settings.snapGrid` 开启时，ReactFlow 先按固定网格吸附，`useAlignmentGuides` 再将单个拖动节点与其他可见节点的左/中/右、上/中/下基准线对齐并显示辅助线；匹配阈值固定为屏幕 6px（按 zoom 换算）。多选拖拽不介入，松手、关闭自动吸附或离开阈值后必须清除辅助线。
30. **文件拖拽靠近画布边缘时自动平移**：画布外层统一通过 `useCanvasDragAutoPan` 接管系统文件和 `CANVAS_DROP_MIME` 图片拖拽；72px 热区内按距离加速，四角同时沿双轴平移。位移必须通过受控 `setViewport` 更新，mini-app renderer 的 `useReactFlow()` 实例不保证暴露 `panBy`。`drop`、`dragend`、离开画布和组件卸载都必须停止动画帧，不能影响节点类型拖拽。
29. **复制并应用节点属性有剪贴板与素材实例两个入口**：粘贴单个节点时，若当前至少选中一个节点且全部与来源同类型，先由 `PastePropertiesDialog` 选择字段；当节点所属分组处于“按上传素材执行”且至少有两个素材 run 时，节点顶部工具栏另有“应用到其他节点”入口，目标是其他素材 run 中同一 nodeId 的节点快照，不是画布分组内其他节点。字段默认全不选，列表顶部提供“全选/反选”；`params` 按子字段展开，`output/images/videos/status/loading/error` 等产出、派生输入和运行态字段不参与属性应用。素材实例模式复制 `uploadedImages` 时必须排除来源的 `groupAssetInputUrls`、保留每个目标 run 的 `groupAssetInputUrls`，只替换人工上传图；双槽 `first/second.uploadedImages` 同样处理，并同步更新 `assets.templateNodeStates` 供后续新 run 继承。多节点剪贴板直接沿用原粘贴行为。
30. **分组“运行所有”必须先选 execution runs，再串行执行**：点击 `GroupExecutionToolbar` 的“运行所有”先弹出缩略图选择框，默认全选，支持全选/反选；仅选中的 runs 进入串行队列，单个 run 内沿用组内可执行节点的并行批量运行。每次切换后等待画布提交再构建执行参数，完成后把当前 nodes 保存回该 run，最后恢复启动前的 activeId。素材缩略图下显示 queued/running/done/error/stopped 标签；分组运行期间按钮改为“停止所有”，点击后停止后续队列并取消当前分组内正在执行的节点。运行期间允许切换实例，但禁止切模式、上传、删除和拖连线。
29. **边高亮是展示态**：`decorateEdgesForSelection` 只基于 ReactFlow 原生 `node.selected` 派生输入蓝/输出绿、箭头颜色和居中编号标签，不把高亮字段写入持久化 `edges`；label 仅在边关联选中节点时显示。标签用原生 SVG `rect + text`，因为 mini-app renderer 未暴露 xyflow 的 `EdgeText`。
30. **宿主 Chat 内嵌使用 Host Slot，不复制 Chat 实现**：manifest 配置 `agentChatPlacement: "mini-app-slot"` 后，`MiniAppPreview` 将现有 `MiniAppAgentDock` 通过 React Portal 挂到 RightPanel 注册的 `agent-chat` DOM 插槽。mini-app 经 `window.AgentSpaces.registerHostSlot/updateHostSlotState` 注册插槽和同步 tab 状态；Chat 会话、流式响应、权限和对话框仍归宿主管理。插槽激活状态独立于 DOM 保存，mini-app 重载后可恢复 Chat tab。
30. **节点自定义标题存 `data.title`**：`NodeShell` 与 `NoteNode` 的 Header 通过 `EditableNodeTitle` 点击原位编辑，空标题回退节点类型中文名；Agent 使用 `add_node.title` / `add_nodes[].title` / `update_node.title`，旧 `label` 参数仅作兼容。
30. **图片原图与缩略图分离**：工作流图片仍以 `images: string[]` 保存和传给 Gallery/拖拽/下载/下游执行；并行保存 `resources: [{url,thumb}]`，其中 `thumb` 只用于 `<img>` 缩略展示。`computeInputImages` 会把资源派生到 `data.imageResources`，imageDisplay 使用 `data.resources`。旧数据或缩略图失败时必须回退 `thumb || url`，不要把 `images` 改成对象数组。
31. **旧数据补缩略图走调试菜单**：Toolbar「调试 → 一键补缩略图」扫描当前工作区节点、生成记录和素材库，按原图 URL 去重并复用已有 thumb，最多 4 并发调用 `generateImageResources`。回写使用 `save_canvas` / `save_generation_history` / `save_asset_library`；后两者必须保留 resources/thumb，不能用逐条 add_history（会产生重复记录）。
30. **队列中断必须同步清节点状态**：`useExecutionQueue.cancel` 通过 `onCancel(job)` 立即让 Canvas 把 `placeholderNodeId` 写为 `loading:false,status:'cancelled'`；异步任务的晚到结果用 `cancelledJobIdsRef` 丢弃，中断异常不能再走 `onError` 覆盖节点状态。
30. **宿主 taskEvents 必须增量全量分发**：`mini-app-renderer.tsx` 不能只取 `taskEvents.at(-1)`；React 会批处理多个并发 WS 事件，只发最后一条会让其余 `ctx.requestClient` 请求超时。使用事件对象游标把本轮新增项逐条送给 `onTaskEvent` 监听器。

## 工作区数据目录（产图落本地）

用户可在新建/重命名工作区时用 FolderPicker 选一个宿主机绝对路径作为「数据保存目录」。设了之后，该工作区产出的图片**只产生一份文件**，落在 `<目录>/<historyId>/<index>.<ext>`，画布/历史/编辑节点共享指向该文件的 http URL。

**数据流（directory 驱动落地）**：
```
generateImages(workflowId, input, {directory, historyId})   ← utils/workflow.js
  └─ persistImagesToBackend(urls, {directory, historyId})
       ├─ directory 有值 → saveImageToDir(url, dir, '{historyId}/{index}') → localFileUrl(绝对路径)
       └─ directory 无值 → downloadImage(url) → data httpUrl（原行为）
```

**historyId 前置**（关键时序）：两个调用点都在调用前 `genId('hist')`，落地子目录与 addHistory 复用同一 id：
- `useNodeExecutions.handleGenerate`：histId 在 runWithConcurrency 前生成，作 runWorkflow 第三参（多次调用同批落到同一子目录）。
- `useExecutionQueue.submit`：histId 在入队时生成，传给 generateImages，onComplete 第三参传出给 Canvas addHistory。

**directory 来源链**：`Canvas.activeWorkspace?.directory`（来自 workspaces.json，create/rename_workspace 写入）→ `useWorkflow(directory)` / `useExecutionQueue({directory})`。

**依赖的宿主/服务端能力**（均已具备，无需重启）：
- `window.AgentSpaces.saveImageToDir(url, dir, filename)` — fetch 图→base64→写绝对路径，filename 无扩展名时按 content-type 自动补全。
- `window.AgentSpaces.localFileUrl(absPath)` — 绝对路径→`/api/mini-apps/:id/local-file?path=...` http URL。
- `window.AgentSpaces.revealAbsolutePath(absPath)` — 在文件管理器定位（重命名对话框「打开文件夹」按钮用）。
- 服务端 `POST /api/mini-apps/:id/data/write-absolute` — 写任意绝对路径，filename 支持子路径（拒绝 `..`/逃逸）。

**workspace 字段**：`workspaces.json` 的 `workspaces[]` 增加 `directory?`（可选，留空不存键）。`CreateWorkspaceDialog` 复用为创建/重命名双模式（mode 区分，重命名模式可改 directory + 打开文件夹）。

**未覆盖**：媒体节点（音频/视频）仍走 data 落地，未接工作区目录。

## 新增节点 Checklist

1. `utils/constants.js`：`NODE_TYPES` 加 key，`NODE_META` 加 {label, color}，`IMAGE_TAGS`（如产出图）。
2. `utils/canvas-constants.js`：`NODE_COMPONENTS` 注册组件，`ADD_NODE_ITEMS` 加菜单项，`DEFAULT_SIZE`/`initialData` 加默认，`computeInputImages.isReceiverType`（如接收上游图）。
3. `components/nodes/XxxNode.jsx`：写组件（用 NodeShell 外壳，内容加 nodrag nopan nowheel）。
4. `src/api.js`：`VALID_NODE_TYPES` + `NODE_LABELS` 加新类型（agent add_node 校验）。
5. `src/tools.js`：`NODE_TYPE_ENUM` + `NODE_TYPE_DESC` 加新类型（agent 工具 schema）。
6. `components/RightPanel.jsx`：`ADD_ITEMS` 加卡片。
7. **有枚举参数**：节点组件 `export const PARAMS_SCHEMA`（options 引用 constants OPTIONS），`canvas-constants.js` 的 `NODE_PARAMS_SCHEMA` 加映射。
8. **生成类节点**（agent 可执行）：`useCanvasAgentRpc.js` 的 `buildNodeExecution` 加分支 + `canvas.executeNode` case 的 `GENERATABLE` Set 加 type。
9. **对话框编辑态**：遵守约束 #15（data.<featureData> 持久化）。

## 新增 Agent Checklist

1. `manifest.json` 的 `agents[]` 加一项：`{id, name, avatar, systemPrompt, suggestions}`。
2. 零宿主改动、零源码改动，刷新即生效。
3. systemPrompt 里引用工具能力即可，工具描述自解释（不要重复列枚举值）。

## Agent 工具清单（api.js）

- `add_node` / `add_nodes` — 建节点（可选 groupName 归组，可选 data 预填参数）
- `list_nodes` / `get_canvas` — 查节点（可按 type 过滤）
- `connect_nodes` / `connect_batch` — 连线
- `delete_node` / `delete_edge` — 删除
- `update_node` — patch 节点 data
- `get_selection` — 查选中节点
- `get_node_params` — 查节点参数 schema（改枚举参数前必查）
- `arrange_group` — 按分组 id/名称对组内节点做横向、纵向或网格编排
- `execute_node` / `execute_nodes` — 执行生成类节点（可选 waitForResult 等待产出）

## Vendor 资源（需要时读对应源码）

- `vendor/pixelorama-web/` — Godot 4.7 导出像素编辑器，iframe + postMessage（pxr-load/pxr-export），COOP/COEP 由自带 SW 注入。改 GDScript 后需 Godot 重新导出 pck。
- `vendor/director-desk-web/` — storyai-3d-director-desk 构建产物，iframe + postMessage（director-desk-ready/captures-sent/panorama）。
- `spine/` + `vendor/spine/` — Spine 编辑核心、宿主 React UI 与本地 PixiJS/pixi-spine/JSZip 固定版本 dist，无独立构建步骤。
- `vendor/painterro.min.js` — 图片编辑器，loadVendor + esmSuffix 转 ESM。
- `vendor/fabric.min.js` / `browser-image-compression.js` — `(0,eval)` 全局求值。
- `vendor/{gifenc,gifuct-js,image-q,jszip}.js` — 图像处理，Blob URL dynamic import。
- `vendor/fast-image-sequence/` — 历史遗留 dist，当前帧播放器不再引用；播放由 `FrameSequencePlayer.jsx` 直接完成。

## 调试速查

- **语法自检**：`node -e "require('@babel/standalone').transform(require('fs').readFileSync('文件','utf8'),{filename:'x.jsx',presets:['react']})"`
- **host tsx 语法**：babel 需带 `{filename:'x.tsx',presets:[['typescript'],['react']]}`
- **清污染数据**：`configs/canvas.json` 曾被写入 `selected:true`；`panel-layout.json` 旧格式数组需重置为 `{canvas-main:72,canvas-right:28}`
- **多工作区数据**：`configs/workspaces/<id>/`；清单 `configs/workspaces.json`
- **新 mini-app 发现**：手动建目录+manifest.json（id=目录名），或插入 `mini-apps/index.json`

## 后续可做

- 队列任务失败重试 / 实时进度（node:progress 事件）
- 异步轮询工作流替代一味提高 sync 超时
- 提示词库多选 / 导入导出 JSON
- 剪贴板持久化到 localStorage / 粘贴按鼠标位置定位
- 工作区缩略图预览 / 排序 / 收藏
- 图像处理上传多图改并发 uploadFile
- 像素编辑器 vendor pck 裁剪中文字体子集（当前 12MB）
- BBox 查看：多图批量 AI 分析 / ZIP 加 manifest
- agent_run：返回值标注是否消费了图片（非视觉 runtime 静默丢图）
- agent_run：给 codex/grok/hermes/pi/open-agent-sdk runtime 补 userAttachments 图片支持

## Suggested Skills

- **write-mini-app-code** (`docs/skills/write-mini-app-code/SKILL.md`) — 改本 mini-app 前必读
- **handoff** — 继续交接时用
