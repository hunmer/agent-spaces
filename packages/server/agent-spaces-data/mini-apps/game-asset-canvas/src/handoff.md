# Handoff: 游戏资产生成画布 (game-asset-canvas)

**生成时间**: 2026-07-22
**工作区**: `G:\agent_spaces`
**分支**: main

## 项目一句话

在 Agent Spaces 的 mini-app 预览环境里，用 ReactFlow 搭一个「游戏资产生成画布」：节点化调用文生图/编辑图片工作流，节点间连线传图，支持执行队列/中断/设置页/多工作区隔离/节点复制粘贴。

## 关键路径

- **mini-app 项目根**: `packages/server/agent-spaces-data/mini-apps/game-asset-canvas/`
  - `manifest.json` (id=`game-asset-canvas`, type=react, mainFile=index.jsx)
  - `src/` 全部源码（结构见下「当前文件树」）
  - `src/CLAUDE.md` 项目契约说明（**改动前必读，改动后必更**）
- **宿主暴露层（改这两处才能让 mini-app 用第三方库）**:
  - `packages/web/src/components/mini-apps/react-renderer.tsx` — `resolveExternalModule` allowlist + 顶部 import（bare import 白名单）
  - `packages/web/src/lib/ui-exports.ts` — 导出到 `window.AgentSpacesUI` / `@agent-spaces/ui`
- **host API（window.AgentSpaces 能力）**: `packages/web/src/components/mini-apps/use-mini-app-host-api.tsx`
- **配置/数据持久化**: `packages/server/agent-spaces-data/mini-apps/game-asset-canvas/configs/`（canvas.json/panel-layout.json/settings.json/generation-history.json）
- **调用的两个工作流**:
  - text_to_image: `d88dcb7c-7f5f-47c8-962c-89217a2c0ad6`
  - edit_image: `19f5f8a9-305d-43a6-9b05-584597213a8f`
  - image_enchanter（抠图/放大）: `8425608e-9e0c-49fa-baa3-32675566a3e6`
  - text_to_voice（文字生成语音）: `820bf3b7-9d50-4f6d-966d-8e442960a233`
  - video_generator（生成视频）: `5130958f-a78e-4c36-8f03-1f2f733b87d7`

## 已暴露到 mini-app 的第三方能力

通过 allowlist + ui-exports 双重暴露（新增库必须两处都改）：
- `@xyflow/react@12.10.2` — ReactFlow, NodeResizer, NodeToolbar, useReactFlow 等
- `@dagrejs/dagre@3.0.0` — 自动布局（default + graphlib）
- `@agent-spaces/ui` — 宿主 UI 组件（Dialog/Tabs/Select/Popover/MediaGallery/openMediaGallery/ResizablePanel/WorkflowListDialog 等）+ lucide 图标

**vendor 本地加载（不走 allowlist，经 `window.AgentSpaces.srcFileUrl` + eval/dynamic import）**：
- `fabric.min.js`（v5.3.0 UMD）— UI 拆分/BBox 查看器的画布编辑器，`(0,eval)` 全局求值挂 `window.fabric`
- `browser-image-compression.js`（v2.0.2 UMD）— BBox AI 分析前压缩图片，`(0,eval)` 挂 `window.imageCompression`，Web Worker 不卡 UI
- `jszip.js` / `gifenc.js` / `gifuct-js.js` / `image-q.js` — 图像处理 + ZIP 打包，`loadVendor` + Blob URL dynamic import
- `painterro.min.js` — 图片编辑节点，`loadVendor` + `esmSuffix` 转 ESM
- `img-comparison-slider.js` — 图片对比节点 web component，`(0,eval)` 注册 customElement
- `pixelorama-web/` — 像素编辑器（Godot 4.7 导出，~45MB，含 index.pck/wasm + service worker）

## host 层新增能力（本轮加的）

`window.AgentSpaces` 上新增（use-mini-app-host-api.tsx，用 `getWS(projectId).on/send`）：
- `subscribeWorkflowEvents(cb)` — 监听 `workflow:*` 事件（`workflow:started` 含 executionId）
- `stopWorkflow(executionId)` — 发 `workflow:stop` 中断执行
- `sendWorkflowControl(event, data)` — 通用 workflow 控制
- `loadCdnModule(url)` — CDN 模块动态加载（`new Function('u','return import(u)')` 绕过 webpack 静态分析）
- `openAgentEditor(opts)` — 打开 Agent preset 配置弹窗，返回 saved preset（含 id/name/modelProvider），用于 `agent_run`
- `callPluginTool(pluginId, toolName, args, opts)` — 调用插件工具（含内置 `@agent-spaces/builtin` 的 `agent_run`/`list_agent_presets` 等）

**`agent_run` 内置工具（mini-app-tools.ts，本轮加图片支持）**：
- 参数：`prompt`（必填）/ `agentConfigId`（必填）/ `cwd` / `permissionMode` / `images`（base64 data URL 数组，视觉模型附件）
- `images` 转 `Attachment[]`（`{name,type,url:'data:...'}`）传给 `runtime.execute` 的 `userAttachments`
- **只有 claude-code 和 langchain runtime 消费 userAttachments**（其余静默丢图）；两者附件解析已扩展识别 data URL（短路）

## 当前文件树（mini-app src/）

```
src/
  index.jsx                     # <ReactFlowProvider><Canvas/></ReactFlowProvider>
  CLAUDE.md                     # 项目契约（架构/约定/坑点，必读）
  components/
    Canvas.jsx                  # 主画布：ReactFlow + 队列 + 表单 + 设置 + 多工作区 + 复制粘贴 + 分组 overlay + 底部多选 toolbar，状态单一数据源
    Toolbar.jsx                 # 顶栏（工作区切换插槽/自动布局/导出/设置/队列插槽/清空）
    RightPanel.jsx              # 右侧三 tab：新增节点/节点管理/生成记录
    SettingsDialog.jsx          # 设置页（配工作流槽位，参考 stickerGenerator）
    ExecutionQueuePopover.jsx   # 执行队列弹窗 + 中断
    NodeFormDialog.jsx          # 文生图/编辑图片表单弹窗
    WorkspaceSwitcher.jsx       # 工作区切换 popover（切换/重命名/删除/创建/批量删除）
    DeleteWorkspacesDialog.jsx  # 批量删除工作区确认弹窗（多选 checkbox，替代原生 confirm）
    nodes/
      NodeShell.jsx             # 节点外壳（Handle/状态/NodeResizer/NodeToolbar/nodrag nopan nowheel）。多选(selectionCount>1)时隐藏 NodeToolbar
      TextToImageNode.jsx       # 提示词库按钮 + pickedPrompt 标签 + 合并提交
      EditImageNode.jsx         # 同上
      ImageDisplayNode.jsx      # 上传用 window.AgentSpaces.uploadFile 拿 http URL
      ImageProcessNode.jsx      # 图像处理节点：FileUpload 上传 + 连线图只读占位 + 动态参数 + 执行。拆分后按 nodeType 反查固定 processorId（无下拉），12 个 ip* 节点 + 旧 imageProcess 单节点（兼容）共用此组件
      ImageEditorNode.jsx       # 图片编辑节点：FileUpload 单图 + 连线图只读占位 + Painterro 浏览器端编辑（画笔/文字/裁切/马赛克）
      ImageResult.jsx           # 产出网格（max=0 不截断，GIF 拆帧多帧全展示），openMediaGallery 看大图（注意：items 不可二次 map）
      PickedPromptBadge.jsx     # 已选提示词展示条（📎标签+✕清除），三处表单复用
      NoteNode.jsx
      UiSplitterNode.jsx        # 雪碧图拆分节点（fabric 画布框选+自动检测切片，多图；原 uiSplitter，仅改名）
      BBoxViewerNode.jsx        # UI拆分节点（JSON bbox 可视化+AI分析+批量导出 ZIP/画布；原 bboxViewer，仅改名）
      ImageCompareNode.jsx      # 图片对比节点（img-comparison-slider 双图滑块）
      VideoGeneratorNode.jsx    # 生成视频节点
      TextToVoiceNode.jsx       # 生成配音节点
    UiSplitterDialog.jsx        # 雪碧图拆分对话框（fabric + 连通域检测 + 多图切片导出；标题改名）
    BBoxViewerDialog.jsx        # UI拆分对话框（fabric + JSON导入 + AI分析 + 压缩 + ZIP/画布导出；标题改名）
    PromptPickerDialog.jsx      # 提示词库选择器（内置+自定义合并，搜索/分类/增删，onPick 传 item）
    NodeFormDialog.jsx          # 文生图/编辑图片表单弹窗（提示词库 + pickedPrompt + 合并提交）
  hooks/
    useCanvasState.js           # 节点/边状态 + 按工作区隔离持久化（接收 workspaceId）+ 多端同步
    useWorkflow.js              # callPluginTool 调工作流（max_wait_ms=600000）
    useGenerationHistory.js     # 生成记录持久化（按工作区隔离，接收 workspaceId）
    useSettings.js              # 设置读写（configs/settings.json，全局共享）
    useExecutionQueue.js        # 执行队列（submit/cancel/完成回调）
    usePromptLibrary.js         # 自定义提示词库持久化（configs/prompt-library.json，全局共享）
    useWorkspaces.js            # 工作区清单管理（workspaces.json 读写 + 三重读取）
  utils/
    prompts.js                  # 内置提示词库（PROMPT_LIBRARY/PROMPT_CATEGORIES/getPromptsByScene，含 aspect 联动）
    constants.js                # WORKFLOWS/NODE_TYPES（含 12 个 ip* 图像处理节点 + 旧 imageProcess 兼容）/MODEL_OPTIONS/NODE_META + IMAGE_PROCESSORS（12 处理器）+ IMAGE_PROCESSOR_CATEGORIES（7 类）+ NODE_TYPE_TO_PROCESSOR 映射 + defaultProcessorParams
    workflow.js                 # runWorkflow/generateImages（多路径提取图片）
    storage.js                  # loadCanvas/saveCanvas/onAnyConfigChanged/panel布局/下载（均接收 workspaceId）
    clipboard.js                # 节点剪贴板：copyNodes/pasteNodes/hasClipboard（模块级内存，跨工作区可粘贴）
    layout.js                   # dagre autoLayout
    export.js                   # serializeCanvas/downloadJson
    settings.js                 # DEFAULT_SETTINGS/WORKFLOW_SLOTS
    image-ops/                  # FrameRonin 移植的图像处理算法（统一 ImageData 出入参，详见「FrameRonin 工具移植」）
      cdn.js                    # vendor 库加载封装（getGifEnc/getGifUct/getImageQ/getJsZip/getFabric/getPainterro/getImgComparisonSlider/getImageCompression）
      io.js                     # urlToImageData/imageDataToBlob/imageDataToUrl（统一 canvas I/O）
      imageDataOps.js           # 纯函数 ImageData 操作（缩放/裁切/alpha 提取，无 DOM）
      gif.js                    # GIF 拆帧 decodeGifToFrames + 合成 encodeFramesToGif
      spriteSheet.js            # splitSpriteSheet/splitByTransparent/composeSpriteSheet
      pixelate.js               # pixelate（降采样 + Wu 量化，依赖 image-q）
      matte.js                  # chromaKey/whiteKey/erodeAlpha/hexToRgb
      stroke.js                 # resizeNearest/innerStroke(BFS)/crop
      compose.js                # composeLayers（多图层 alpha-over + 混合模式）
      index.js                  # PROCESSORS 注册表（含 compress 本地浏览器压缩 + enhance 云端放大）+ runProcessor 统一入口
  services/
    canvas.js                   # 服务端单写者（save_canvas/add_history/save_settings + workspace CRUD：list/create/rename/switch/delete_workspace）
```

## 重要约定 / 已踩的坑（务必遵守）

1. **节点选中状态**：不要在 decoratedNodes 里覆盖 `selected`（会破坏 ReactFlow 内置选中/删除机制）。selected 由 ReactFlow 自管，`selectedId` 只用于面板高亮联动。
2. **NodeResizer**：节点创建必须带顶层 `width`/`height` 字段 + `style:{width,height}`，否则 resize 无效。NodeResizer `isVisible={selected}`。
3. **react-resizable-panels@4**：`ResizablePanel` 的 `minSize`/`maxSize`/`defaultSize` 数字=px，百分比必须字符串 `"18%"`。`defaultLayout`/`onLayoutChange` 用 `{panelId:percentage}` 对象格式。
4. **工作流同步超时**：`execute_workflow_sync` 默认 120s，jimeng/可灵生成超时。必须传 `max_wait_ms:600000`（上限）。解析要兜底：end 节点 → 生成节点 data.images → 任意 completed 节点。
5. **交互抑制**：NodeShell 内容区 + NoteNode textarea 必须加 `nodrag nopan nowheel` class，否则节点内滚动/选文本误触画布。
6. **中断**：`callPluginTool` 本身不可中断；中断靠 `stopWorkflow(executionId)`，executionId 通过并行订阅 `workflow:started` 拿到。
7. **上传图片持久化**：用 `window.AgentSpaces.uploadFile(file)` 拿 http URL（返回 `.url`），不能用 `URL.createObjectURL`（刷新失效）。
8. **model 路由**：两个 workflow.json 的 run_code 已补全关键字（gpt/dall-e/flux/nano→case-3, jimeng→case-2, qwen/wanx→case-1, kling→case-0）。
9. **mini-app 改动刷新即生效**；**宿主层改动（react-renderer/ui-exports/use-mini-app-host-api）必须重启 web 服务**。例外：`src/services/*.js` 改动由 chokidar watcher 热重载（见下「Service 热重载」），无需重启。
10. **ImageResult / HistoryCard 的 openMediaGallery items 不可二次 map**：`items` 已经是 `[{src,type}]` 对象数组，再 `.map((src)=>({src,...}))` 会让 `item.src` 变成对象，触发 `item.src.startsWith is not a function`。
11. **生成记录必须双路径都写 history**：节点内「生成」走 handleGenerate（已写），表单「⚡生成」走 useExecutionQueue.submit → onComplete。**onComplete 必须也调 addHistory**，否则队列产出生成记录 tab 不显示（曾遗漏）。
12. **config 初始读取要 onConfigReady 兜底**：组件挂载时 config 快照可能未 ready（getConfig 返回 null），只用 getConfig 会读到空。useGenerationHistory/useSettings/usePromptLibrary 都用 `getConfig + onConfigReady + onAnyConfigChanged` 三重读取。
13. **提示词交互模式 = 展示+合并（非填充）**：选中提示词库条目后**不覆盖输入框**，存到 `params.pickedPrompt`，用 PickedPromptBadge 展示；用户输入框独立；提交时 `[pickedPrompt, prompt]` 去空去重换行合并。三处表单（TextToImageNode/EditImageNode/NodeFormDialog）一致。
14. **NodeToolbar 已暴露**：`@xyflow/react` 白名单含 NodeToolbar；NodeShell 内选中且有产出图时显示「导出图片」按钮，调 `data.onExportImages`（Canvas.decoratedNodes 注入）→ addImageNodesFromUrls。
15. **多工作区数据隔离用 configs 子目录**：`safeProjectSubdirPath` 支持子目录路径，`listConfigs` 递归扫描，`configSnapshot`/`configChanged` 广播**完整相对路径**。所以工作区数据存 `configs/workspaces/<id>/{canvas,generation-history}.json` 即可实现隔离，**零宿主改动**。settings/prompt-library/panel-layout 仍存顶层（用户级偏好，不隔离）。
16. **多工作区切换由 activeId 驱动**：`useCanvasState(workspaceId)`/`useGenerationHistory(workspaceId)` 接收 workspaceId，切换时 useEffect 重载。Canvas 渲染门控 `!activeId || !loaded` 显示加载中，避免空数据闪烁。工作区操作（create/switch/delete）都走 service 写 `workspaces.json` → 广播 → `useWorkspaces` 更新 activeId → 子 hook 自动重载，**前端不直接 setState activeId**。
17. **节点复制粘贴剪贴板是模块级内存**：`utils/clipboard.js` 用模块级 ref（非 localStorage），刷新失效。这是**唯一跨工作区复制方式**（工作区切换是整画布替换）。焦点在 input/textarea/contenteditable 时必须放行浏览器原生 Ctrl+C/V（keydown 里判 `tagName/isContentEditable`）。复制仅保留选中集**内部**连线，外部连线丢弃。
18. **多选隐藏节点 toolbar**：`NodeShell` 的 NodeToolbar `isVisible={selected && selectionCount <= 1}`。`selectionCount`（当前选中节点总数）由 Canvas `onSelectionChange` 维护，经 decoratedNodes 注入到每个节点 data。多选时各节点 toolbar 全部隐藏，避免干扰框选操作。
19. **导出图片分组（复用宿主 WorkflowGroupOverlay，一套逻辑）**：导出多图时不再散落，而是创建若干 imageDisplay 子节点 + 一条 group 数据，分组名 = 来源节点名 + 时间（如「文字生成图片 导出 14:30」）。**直接复用 workflow 编辑器同源的 `WorkflowGroupOverlay` 组件**（非自写阉割版），经 ui-exports 暴露，mini-app 在 ReactFlow 的 `<ViewportPortal>` 内渲染它，按子节点包围盒自动贴合、跟随画布 pan/zoom：
    - **数据结构**：`WorkflowGroup`（id/name/childNodeIds/childGroupIds/locked/disabled/savedNodeStates），与 `packages/web/src/stores/workflow-editor/groups.ts` 同源
    - **分组不是节点**：groups 是独立 state（useCanvasState 第三维，与 nodes/edges 平级），不占 NODE_TYPES、不走 computeInputImages、不被 nodeTypes 注册
    - **持久化**：canvas.json 新增 `groups` 字段（service save_canvas 透传，useCanvasState 读写）；old canvas.json 无 groups 兜底为 `[]`
    - **Canvas 实现**：`groupOverlayItems`（groups 映射出 childNodes）+ `screenDeltaToFlowDelta`（screenToFlowPosition 差值）+ `handleGroupMove`（整组平移）+ `deleteGroup`/`updateGroup`；删节点时 `onNodesDelete` 同步清理 groups 里悬空的 childNodeIds
    - **单图导出**不分组（走原 addImageNodesFromUrls）
    - **宿主层改动**（需重启 web）：`react-renderer.tsx` allowlist + 顶部 import 加 `ViewportPortal`；`ui-exports.ts` 导出 `WorkflowGroupOverlay`/`useGroupManagement`
    - **底部多选 toolbar**：选中节点数 `selectionCount > 1` 时，画布底部居中浮出工具条（absolute 定位在画布容器内，`nodrag nopan` 防误触画布），含三个操作：
      - **合并成分组**（`Layers` 图标）：调 `createGroupFromSelection`，取选中 id 建一条 group 数据（名「分组 N」），建完清空选中
      - **对齐分布**（`AlignHorizontalJustifyCenter` 图标，DropdownMenu）：调 `alignDistribute(mode)`，支持左/右/顶/底/水平居中/垂直居中对齐 + 水平/垂直等距分布。分布按 position 排序，首尾不动、中间均分；节点宽高取 `width`/`style.width`（NodeResizer 要求），兜底 200×100
      - **批量删除**（`Trash2` 图标）：调 `deleteSelectedNodes`，删选中节点 + 相关边 + 清理 groups 里悬空的 childNodeIds，删完清空选中
    - **图标来源**：mini-app 内图标一律从 `@agent-spaces/ui` 命名导入（如 `Layers`/`Trash2`/`Crosshair`），**不要**直接 `import from 'lucide-react'`（不在 allowlist，react-renderer 解析时为 undefined 会报 `Cannot read properties of undefined`）


## Service 热重载（宿主层，本轮新增）

- `packages/server/src/services/mini-app-services.ts`：`startServicesWatcher()` 用 chokidar 监听 `mini-apps/*/src/services/*.{js,mjs,cjs}`，变更按 projectId debounce 200ms 调 `reloadServices`；**只重载已加载过 registry 的项目**（新项目首次 invokeService 时惰性加载）。
- `packages/server/src/app.ts`：`server.listen` 回调 `ensureAgentsConfigs()` 后调 `startServicesWatcher()`。
- 启动日志：`[mini-app-services] services file watcher started` + 变更时 `reloaded services for <projectId>`。
- projectId 从变更路径第一段反解，分隔符兼容 `\` / `/`（Windows）。

## 提示词库系统（本轮新增）

- **内置库**（`utils/prompts.js`）：从 sprite-sheet-creator 抽取，4 类（角色/精灵图/背景/转换）共 15 条。每条 `{ id, category, title, desc, prompt, scene, aspect? }`。
  - `scene`：`'text'`(文生图) / `'edit'`(编辑图片) / `'both'`，表单按自身类型过滤。
  - `aspect?`：选中时联动比例下拉（如精灵图攻击 21:9、视差背景 21:9；constants.ASPECT_OPTIONS 已补 21:9）。
- **自定义库**（持久化）：`configs/prompt-library.json`，service handler `save_prompt`(upsert)/`delete_prompt`(按 id)。`usePromptLibrary` hook 读取（三重读取模式）。**内置库不写盘**。
- **PromptPickerDialog**：内部自调 usePromptLibrary，合并「自定义在前(🆕「自」标)+内置在后」；搜索/分类筛选/卡片网格；自定义条目 hover 可编辑/删除；➕新建打开内联 PromptEditor。**onPick 传整个 item 对象**（非字符串），调用方取 `item.prompt`/`item.aspect`。

## 多工作区隔离（本轮新增）

每个工作区独立保存节点数据和生成记录，顶栏可切换/创建/删除/重命名工作区。

- **数据布局**：
  - 工作区清单 `configs/workspaces.json`：`{ activeId, workspaces: [{id,name,createdAt}] }`
  - 工作区数据 `configs/workspaces/<id>/canvas.json` 和 `configs/workspaces/<id>/generation-history.json`
  - 共享（不隔离）：`settings.json`/`prompt-library.json`/`panel-layout.json`
- **核心发现**：宿主 `safeProjectSubdirPath` 支持子目录、`listConfigs` 递归扫描、config 广播带完整相对路径 → 子目录隔离**无需改宿主层**。
- **组件**：
  - `WorkspaceSwitcher.jsx`（Popover）：列表点击切换、hover ✎ 重命名、✕ 删除单项、底部「＋ 新建工作区」「批量删除工作区」
  - `DeleteWorkspacesDialog.jsx`：自定义确认弹窗（替代原生 `window.confirm`），checkbox 多选批量删除；当前激活工作区不可选（避免清空当前视图）；至少保留一个
- **hooks**：
  - `useWorkspaces()`：管理 workspaces.json（getConfig + onConfigReady + onAnyConfigChanged 三重读取；invokeService 写）
  - `useCanvasState(workspaceId)` / `useGenerationHistory(workspaceId)`：接收 workspaceId，切换时 useEffect 重载
- **service handlers**（`services/canvas.js` 新增）：`list_workspaces`/`create_workspace`/`rename_workspace`/`switch_workspace`/`delete_workspace`。原 `save_canvas`/`add_history`/`remove_history`/`clear_history` 改为接收 `{ workspaceId, ... }`，按 workspaceId 路由到隔离子目录。`delete_workspace` 会清空被删工作区的 canvas/history 数据。
- **切换流程**：service 写 workspaces.json → 广播 → useWorkspaces 更新 activeId → 子 hook 重载。Canvas 不直接 setState activeId。
- **删除安全**：至少保留一个工作区；删当前激活时 activeId 回退到第一个（由 service 处理）；批量删除跳过当前激活。
- **首次无 workspaces.json**：兜底返回 `default` 默认工作区（FALLBACK），不阻塞使用。

## 节点复制粘贴 Ctrl+C / Ctrl+V（本轮新增）

支持多选节点复制，跨工作区粘贴（工作区切换是整画布替换，键盘是唯一跨工作区复制方式）。

- **`utils/clipboard.js`**：模块级内存剪贴板（非 localStorage，刷新失效）
  - `copyNodes(selectedNodes, allEdges)`：序列化选中节点（剥离注入回调 onUpdate/onGenerate/onExportImages/onProcessImage/onEditImages/onAutoSize），仅保留选中集**内部**连线（两端都在选中集），外部连线丢弃
  - `pasteNodes({ genId, offset })`：生成新 id（节点 + 边 id 重映射），整体偏移 {40,40} 防重叠。返回 `{nodes, edges}` 由调用方 setNodes/setEdges
  - `hasClipboard()`：剪贴板是否非空
- **Canvas.jsx 实现**：`useEffect` 监听 window keydown：
  - Ctrl/Cmd+C：有选中节点时 preventDefault + copyNodes
  - Ctrl/Cmd+V：hasClipboard 时 preventDefault + pasteNodes + setNodes/setEdges 追加
  - 焦点在 input/textarea/select/contenteditable 时**不拦截**（让浏览器走原生复制/粘贴）
- **多选**：用 `nodes.filter(n => n.selected)` 取选中集（ReactFlow 框选 / Shift 点选均支持，selected 由 ReactFlow 自管）

## 验收/调试速查

- **语法自检**：`node --input-type=commonjs -e "require('@babel/standalone').transform(require('fs').readFileSync('文件','utf8'),{presets:['react']})"`
- **host tsx 语法**：babel 需带 `{filename:'x.tsx',presets:[['typescript'],['react']]}`
- **import 闭环**：见 CLAUDE.md 末尾或历次自检脚本（按目录解析相对 import）
- **清污染数据**：`configs/canvas.json` 曾被写入 `selected:true`（用 node 脚本清）；`panel-layout.json` 旧格式数组需重置为 `{canvas-main:72,canvas-right:28}`
- **新 mini-app 发现**：手动建目录+manifest.json（id=目录名），或插入 `mini-apps/index.json` 数组
- **多工作区数据**：节点/历史在 `configs/workspaces/<id>/`；清单 `configs/workspaces.json`。删工作区数据出错可手动删子目录 + 重置 workspaces.json 的 activeId
- **剪贴板**：`utils/clipboard.js` 模块级 ref，刷新失效，无持久化文件

## 未提交状态

宿主改动 + mini-app 全部源码均未 commit（按规约：用户没要求就不提交）。当前 git status 主要是：
- `packages/web/src/components/mini-apps/react-renderer.tsx`（M，暴露 xyflow/dagre/NodeResizer/NodeToolbar/useReactFlow）
- `packages/web/src/lib/ui-exports.ts`（M，导出上述 + Input/Button 等）
- `packages/web/src/components/mini-apps/use-mini-app-host-api.tsx`（M，workflow WS 能力 + loadCdnModule CDN 加载 + openAgentEditor/callPluginTool）
- `packages/server/src/services/mini-app-services.ts`（M，新增 startServicesWatcher）
- `packages/server/src/app.ts`（M，listen 回调调 startServicesWatcher）
- `packages/server/src/services/builtin-tools/mini-app-tools.ts`（M，**agent_run 加 images 参数 + 转 userAttachments**）
- `packages/server/src/adapters/langchain-runtime.ts`（M，**toAttachmentDataUrl 加 data URL 短路**）
- `packages/server/src/adapters/claude-code-runtime/index.ts`（M，**resolveAttachmentFile 加 data URL 分支**）
- `packages/server/agent-spaces-data/mini-apps/game-asset-canvas/`（新增整目录 + 多轮迭代：基础画布 → 提示词库 → 多工作区隔离 → 复制粘贴 → 批量删除弹窗 → FrameRonin 工具移植 → **BBox 查看节点 + AI 分析 + 图片压缩**）
- 两个 workflow.json（M，补全 model 路由关键字）
- **BBox 节点/AI 分析/图片压缩轮次**：宿主改动 3 文件（agent_run 图片支持，需重启 web）+ mini-app src 全部（刷新即生效）

## FrameRonin 工具移植（本轮新增）

把 FrameRonin（`C:/Users/Administrator/Downloads/FrameRonin-main`）的像素图像处理工具转成画布「图像处理」节点。

### 关键决策
- **原任务「抽取硬编码 AI 提示词」无内容可抽**：FrameRonin 的 AI 生成全部走外部 Gemini Gem 链接（`frontend/src/lib/gemPixelUrls.ts`），源码无任何 prompt 文本
- **算法接入选 CDN 方案**（非 node_modules 全链路、非 allowlist）：经核实三者能力上限相同（opencv 都不可用），CDN 方案零 web 依赖污染、mini-app 自包含。目标功能 6/7 类是纯 JS 算法（仅光流插帧依赖 opencv，不在目标列表）
- **粒度选纯参数节点**：节点暴露核心参数 + 执行按钮，不做精细画笔/拖拽交互

### 宿主层新增能力
`window.AgentSpaces.loadCdnModule(url)`（use-mini-app-host-api.tsx）：
- 用 `new Function('u','return import(u)')(url)` 绕过 webpack/turbopack 静态分析
- 按 URL 缓存，CJS 互操作自动解包 default
- **任何 mini-app 都能用**，不止本画布

### mini-app 新增
- `utils/image-ops/` 目录（10 个文件）：从 FrameRonin 剥离的算法，统一 `(ImageData, params) => ImageData` 签名
- `components/nodes/ImageProcessNode.jsx`：图像处理节点
- `utils/constants.js`：NODE_TYPES.imageProcess + IMAGE_PROCESSORS（10 个处理器）+ IMAGE_PROCESSOR_CATEGORIES
- `Canvas.jsx`：handleProcessLocal + computeInputImages 纳入 imageProcess + initialData + onProcessLocal 注入
- `RightPanel.jsx`：新增节点 tab 加图像处理项
- 处理器：gif-split/gif-merge/sprite-split/sprite-merge/pixelate/resize-nearest/inner-stroke/chroma-key/white-key/compose-overlay

### 依赖（CDN 加载，web 不装）
- gifenc/gifuct-js（GIF 编解码）、image-q（Wu 量化）、jszip（暂未用，预留）
- CDN 源 esm.sh，URL 集中在 `utils/image-ops/cdn.js`
- 纯 JS，无 WASM（opencv 相关全砍，mesh 用均匀网格兜底）

### 验收要点
- 图像处理节点支持单输入（抠图/像素化）和多输入（GIF 合成/图层叠加）
- 上游连线自动派生输入（computeInputImages 已纳入 imageProcess）
- 产出走 `data.output.images`，下游自动派生，NodeToolbar 导出按钮自动可用
- 断网时执行报错但不崩溃

### 输入设计（FileUpload + 连线双来源）
节点输入由两种来源合并去重：`dedupeUrls([...uploadedImages, ...upstream])`
- **用户上传**：`@agent-spaces/ui` 的 `FileUpload` 组件，onChange 时对每个新 File 调 `window.AgentSpaces.uploadFile` 拿 http URL，存 `data.uploadedImages`（持久化，刷新不丢）。multipleIn 处理器 maxFiles=0（不限），单输入处理器 maxFiles=1
- **上游连线**：computeInputImages 派生到 `data.images`，**不进 FileUpload**（FileUpload 每项带删除按钮，连线图交由它管会逻辑混乱），单独渲染「🔗 来自连线 N 张」只读占位区
- 统计行显示「输入 N 张（上传 X + 连线 Y）」

### 本轮迭代踩坑（已修复）
1. **产出数量与展示不一致**：`ImageResult` 硬编码 `max=9`，`slice(0,9)` 截断 16 帧 → 改 `max=0`（不限制），GIF 拆帧多帧全展示；MediaGallery 也传全部 items
2. **连线图缩略图变形**：`h-10 w-full object-cover` 固定高+裁切 → 改外层固定高容器 + `max-h-full max-w-full object-contain`，按原图比例居中显示
3. **GIF 合成产出非 ImageData**：encodeFramesToGif 返回 gif Blob，run 约定返回 ImageData[]，用 `__gifUrl` 标记透传，runProcessor 识别后直接用 URL 不再转

## 图片编辑节点（本轮新增，基于 Painterro）

新增「图片编辑」节点（NODE_TYPES.imageEditor），用 Painterro（vanilla JS 浏览器端图像编辑器）实现画笔/文字/裁切/马赛克/旋转/缩放等手工编辑，支持接收上游连线输入或自定义上传单张图片。

### 关键决策
- **输入设计复用 ImageProcessNode 模式**：FileUpload 单图上传 + 上游连线只读占位。单输入（maxFiles=1），上游连线只取首张。输入优先级：上传 > 连线
- **Painterro 走 vendor 本地资源加载**（非 CDN、非 npm）：与 gifenc/image-q 同套路。官方 build 是 IIFE（`var Painterro=function(){...}().default;`，非 ESM），无法直接 dynamic import，经 `cdn.js` 的 `loadVendor` 追加 `\nexport default Painterro;` 转 ESM，浏览器原生 loader 求值
- **编辑器全屏覆盖**：Painterro 默认行为（创建 fullscreen holder）。saveHandler 拿编辑结果 Blob → uploadFile → 写 `data.output.images` → 下游自动派生，NodeToolbar 导出/抠图/放大按钮自动可用

### 改动文件
- `src/utils/image-ops/cdn.js`：`loadVendor` 新增 `esmSuffix` 参数（追加导出语句转 ESM）；新增 `getPainterro()` 加载器，返回 Painterro 构造函数
- `src/utils/constants.js`：`NODE_TYPES.imageEditor` + `NODE_META`（🎨 #f97316）+ `IMAGE_TAGS.imageEditor`
- `src/components/nodes/ImageEditorNode.jsx`（新增）：FileUpload 单图 + 上游连线占位 + 「🎨 编辑图片」按钮 → 懒加载 Painterro → show(inputUrl) → saveHandler 上传产出
- `src/components/Canvas.jsx`：注册节点组件 + ADD_NODE_ITEMS + `computeInputImages` 纳入 imageEditor + `initialData` 加 imageEditor 分支
- `src/components/RightPanel.jsx`：ADD_ITEMS 加图片编辑项
- `src/vendor/painterro.min.js`（新增，~295KB）：从 unpkg@1.2.92 下载的官方 UMD build

### 依赖（vendor 本地加载，web 不装）
- painterro@1.2.92（IIFE/UMD build），非 ESM，经 cdn.js 转 ESM 加载

### 验收要点
- 节点支持上传单图或接收上游连线单图（取首张）
- 点「🎨 编辑图片」打开 Painterro 全屏编辑器（画笔/文字/裁切/马赛克/旋转等）
- 保存后产出写入 `data.output.images`，可连线下游，NodeToolbar 按钮自动可用
- 按是否有 alpha 通道自动选 png/jpeg 格式
- 断网时编辑器加载报错但不崩溃（状态标记 error）

### 踩坑
- Painterro 官方 build 非 ESM（IIFE 赋值给 `var Painterro`），直接 dynamic import 拿不到导出 → `loadVendor` 加 `esmSuffix` 参数追加 `export default Painterro;` 转 ESM
- Painterro 的 `saveHandler(image, done)`：`done(true)` 关闭编辑器，`done(false)` 保留让用户重试；用 `savedRef` 区分「保存成功关闭」与「直接 X 关闭」（后者复位 status）

## 像素编辑器节点（本轮新增，基于 Pixelorama）

新增「像素编辑器」节点（NODE_TYPES.pixelEditor），用本地 Pixelorama web 版（Godot 4.7 导出）做像素/动画编辑，支持上游多图注入、编辑后多帧导出回传。

### 核心决策与已踩坑（务必遵守）

1. **编辑器选型 = 本地 Pixelorama web 版（非 piskel）**：原计划用 piskel（iframe + contentWindow.pskl），但 piskel-embed 在 piskelapp.github.io，**跨域拦截 contentWindow**，且 piskel **无 postMessage API**。改用本地 D:\Pixelorama 源码改 + Godot 重新导出，vendor 本地化到 `src/vendor/pixelorama-web/`（~44MB：index.wasm 37MB + index.pck 12MB 含中文字体）。
2. **通信协议 = postMessage + JavaScriptBridge.create_callback（关键！）**：
   - **不要用** `JavaScriptBridge.eval` 在 `_define_js` 里注册 `window.addEventListener('message', fn)` 再让 Godot 轮询 JS 共享状态（`window.__pixelorama._pendingImages`）——COEP 隔离下 JS 监听器写的状态 Godot eval **读不到**（不同 window 代理对象）。
   - **正解**：`JavaScriptBridge.create_callback` 把 GDScript 函数注册为 JS callback，`win.addEventListener("message", cb)`，message 事件直接进 GDScript `_on_parent_message(args)`，`args[0]` 是 JavaScriptObject（MessageEvent）。JavaScriptObject 属性访问：`event.data` 返回 JSObject，`data.type`/`data.data`/`data.mode` 读 JS 属性（`str()` 转字符串，`int()` 转数字）。
   - 父→Godot：`iframe.contentWindow.postMessage({type,data,name,mode,index}, '*')`
   - Godot→父：`window.parent.postMessage(JSON, '*')`（GDScript 用 `_post_to_parent(dict)` → `JSON.stringify` → eval `postMessage(%s,'*')`）
3. **COOP/COEP（SharedArrayBuffer 前提）由 Pixelorama 自带 service worker 注入**：`index.service.worker.js` 的 `ensureCrossOriginIsolationHeaders` 给响应补 `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` 头。**零宿主改动**（宿主 src/file 路由不发这些头）。
4. **🔴 service worker 缓存陷阱（改 pck 后必须处理）**：SW 默认把 `index.pck`/`index.wasm` 列入 `CACHEABLE_FILES` 缓存。改 GDScript 重新导出后，**浏览器加载的是旧 pck**（新诊断日志完全不出现），表现为"代码改动不生效"。**已修复**：把 `CACHEABLE_FILES` 改成 `[]`（pck/wasm 不缓存，每次网络拉最新），改 CACHE_VERSION 加后缀。调试时如遇"改了没反应"，先用无痕窗口或 F12→Application→Service Workers→Unregister + Clear site data。
5. **跨域/同源**：iframe src 用**父页面 origin**（`window.location.origin`）拼，保证 dev(3000)/dist(3100) 都同源。**不要用 `srcFileUrl` 解析的 origin**（它是 dist 的 3100，dev 下父页面 3000 → 真跨域 → SecurityError）。
6. **src/file 路由 MIME**：宿主 `SRC_FILE_MIME` 原本不含 `.pck`/`.wasm`，Godot 加载 index.pck 报 `Failed loading file 'index.pck'`。已在 `packages/server/src/routes/mini-apps.ts` 补 `.pck`(octet-stream)/`.wasm`(application/wasm)/`.data` 映射（**需重启 web**）。
7. **中文乱码**：项目默认 Roboto-Regular.ttf 不含 CJK 字形。已在 `Global.gd` 给 Roboto 加 `fallbacks=[SimHei.ttf]`（复制自 `C:/Windows/Fonts/simhei.ttf` 9.7MB 到 `assets/fonts/`），pck 从 6.5MB→12.3MB。
8. **跳过欢迎页**：iframe URL 固定带 `?nosplash=1`，`Main.gd._show_splash_screen` 和启动时的 restore_session 弹窗检测到该参数直接 return。
9. **新建类型参数**（`data.params.createMode`）：`multi`（每张图独立 project/tab）/ `frames`（首张建 project + 后续 `OpenSave.open_image_as_new_frame` 加为同一 project 的关键帧）。父端发 pxr-load 带 `mode`+`index`，GDScript 按 mode 分流。frames 模式首帧后等 600ms（父端）让 Godot 建 project。

### 改动文件（mini-app 内）
- `src/vendor/pixelorama-web/`（新增，~45MB，Pixelorama web 导出全套；SW 已改不缓存 pck/wasm）
- `src/components/nodes/PixelEditorNode.jsx`（新增）：FileUpload 多图 + 「新建类型」select + 上游连线占位 + 「👾 编辑像素」按钮 + 产出
- `src/components/PixelEditorDialog.jsx`（新增）：iframe + 同源 URL（带 ?nosplash=1）+ postMessage 双向通信 + 创建/注入/导出回传
- `src/utils/constants.js`：NODE_TYPES.pixelEditor + NODE_META（👾 #22c55e）+ IMAGE_TAGS.pixelEditor（'像素'）
- `src/components/Canvas.jsx`：NODE_COMPONENTS/ADD_NODE_ITEMS/computeInputImages.isReceiver/DEFAULT_SIZE/initialData 加 pixelEditor
- `src/components/RightPanel.jsx`：ADD_ITEMS 加「像素编辑器」

### 改动文件（宿主层，需重启 web）
- `packages/server/src/routes/mini-apps.ts`：`SRC_FILE_MIME` 加 `.pck`/`.wasm`/`.data`

### 改动文件（D:\Pixelorama，Godot 源码，已重新导出）
- `src/Autoload/HTML5FileExchange.gd`：`create_callback` 收 message + `_decode_data_url_to_image` + 按 mode 导入（multi→handle_loading_image / frames→_import_as_frame 用 open_image_as_new_frame）+ `_export_current_project_frames`（遍历帧 blend layers → base64 PNG → parent.postMessage）+ `notify_ready`
- `src/Autoload/Global.gd`：Roboto 加 SimHei fallback（中文）
- `src/Main.gd`：`?nosplash=1` 跳过 splash + restore_session
- `assets/fonts/SimHei.ttf`（新增，9.7MB）
- 重新导出：`"/c/Program Files/Godot/Godot.exe" --headless --export-release "Web"`（Godot 4.7.1，export preset name="Web"，export_path 自动到 D:/Pixelorama_web）

### 重新导出流程（改 GDScript 后必做）
```bash
# 1. 语法检查（会打印 HTML5FileExchange/Main/Global 的 parse error）
"/c/Program Files/Godot/Godot.exe" --headless --quit --path D:/Pixelorama 2>&1 | grep -iE "parse error|SCRIPT ERROR|Failed to load script"
# 2. 导出（覆盖 D:/Pixelorama_web）
"/c/Program Files/Godot/Godot.exe" --headless --export-release "Web"  # 在 D:/Pixelorama 下
# 3. 复制 pck 到 vendor（其他文件 index.html/js/wasm 不变则只复制 index.pck）
cp D:/Pixelorama_web/index.pck <miniapp>/src/vendor/pixelorama-web/index.pck
```
导出 GDScript 类型推断坑：`var x := obj.prop` 会因 prop 无确定类型报 `Cannot infer the type`，改显式声明 `var x: Type = obj.prop`。

### 协议（postMessage 消息格式）
- 父→Godot（`pxr-load`）：`{type:'pxr-load', data:'data:image/png;base64,...', name:'frame-1.png', mode:'multi'|'frames', index:0}`
- 父→Godot（`pxr-export`）：`{type:'pxr-export'}`
- Godot→父（`pxr-ready`）：`{type:'pxr-ready'}`（_ready + 1s timer 后发）
- Godot→父（`pxr-export`）：`{type:'pxr-export', data:'data:image/png;base64,...', name:'frame_0.png'}`（逐帧）
- Godot→父（`pxr-export-done`）：`{type:'pxr-export-done', ok:true|false, reason?}`

### 调试日志约定
GDScript 用 `print("[PXR] ...")`（经 index.js onPrint 输出，与 `index.js:452` 行混排）；父端用 `console.log('[pxr-parent] ...')`。当前保留了全链路诊断日志，功能稳定后可清理。

### 验收要点
- 节点支持上传多图或接收上游连线多图（合并去重）
- 点「👾 编辑像素」打开对话框，Pixelorama 加载（约 3s）不弹欢迎页，上游图按「新建类型」注入（multi=多 tab / frames=单 project 多帧）
- 点「从 Pixelorama 导出」→ Godot 遍历当前 project 所有帧逐帧回传 → 节点产出图，可连线下游，NodeToolbar 按钮自动可用
- 中文界面正常显示

## UI 拆分编辑器多图重构（本轮新增）

`UiSplitterNode` + `UiSplitterDialog` 重构为支持**多图输入**、每图独立切片记录、一键导出全部切片。

### 关键决策与已踩坑（务必遵守）

1. **useCallback 声明顺序严格自上而下**：被依赖的函数必须先定义。`deleteSelectedRects`/`clearAllRects`/`deleteRectAt` 依赖 `pushHistory`/`renderList`，必须定义在它们之后，否则 `useCallback` 渲染期求值时引用的 `pushHistory` 处于 TDZ，报 `Cannot access 'pushHistory' before initialization`。文件顶部已有注释强调此约定。
2. **多图状态隔离用 `imageStatesRef.current[url]`**：每张图独立存 `{ source, pickedColor, undo, redo, rects }`。`rects` 存的是**已计算的 box 对象**（`{x,y,width,height}`），不是 fabric Rect。**导出时不要再 `map(realBox)`**（realBox 期望 fabric Rect 带 scaleX，对 box 对象再乘得 NaN → `createImageData(NaN)` 报错）。`switchTo` 切图时存回当前图 rects（`snapshot()`）、恢复目标图 rects。
3. **画布填满 + contain 居中**：fabric 画布 DOM 尺寸 = 容器 `clientWidth/Height`（不再用图片像素），图片用 `fitToStage()`（`setViewportTransform([zoom,0,0,zoom,left,top]`，contain 计算）显示。**坐标体系不变**（切片框仍是图片像素坐标），`realBox`/`exportBox`/`detect`/保存全部零改动。`ResizeObserver` 监听容器同步 DOM 尺寸（不抹用户缩放/平移）。`.canvas-container` CSS 用 `position:absolute; inset:0; width/height:100%`。
4. **init 内联检测，不能用 `detectAll` 闭包**：init 的 `setTimeout` 里若调 `detectAll`，拿到的是首次渲染基于空 `thumbUrls=[]` 的闭包，遍历空数组导致首屏 badge 不显示。**正解**：init 内联遍历真实 `urls` 数组做检测写 rects，再调 `renderList` 刷新 badge。表单变化触发的自动检测（`useEffect` 监听 method/tolerance/minArea/padding/pickedHex）才用 `detectAll`，用 `readyRef` 门控避免加载阶段空跑。
5. **绘制模式 toggle**：`drawModeRef`（fabric 闭包）+ `drawMode`（state 驱动 UI）。`true`=框选（左键空白拉框，切片框不可选，光标十字），`false`=选择（左键点选/移动切片框，光标默认）。Alt 在两种模式都强制拉框。mouse:down 判断 `drawMode && !event.target` 或 `altKey`。切换图/检测/初始化时都要重新应用 drawMode 的 selectable/cursor（三处重复，可抽 `applyDrawMode`）。
6. **Delete 冲突修复（capture 拦截）**：ReactFlow `deleteKeyCode={['Backspace','Delete']}` 通过 `useKeyPress` 在 **document bubble 阶段**监听。对话框打开时按 Delete 会误删节点。**正解**：Dialog 的 keydown 用 **window capture 阶段**（`addEventListener('keydown', fn, true)`），capture 先于 document bubble，`stopPropagation()` 阻止事件到 document。Delete/Backspace 在对话框内（非输入框）一律拦截 + preventDefault，有选中切片框时调 `deleteSelectedRects()`。
7. **每图导出开关**：`exportEnabled`/`exportEnabledRef`（{[url]:bool}）。`handleSave` 跳过 `=== false` 的图；`totalCount`（renderList 统计）只算启用图；缩略图 badge 禁用时变灰（`bg-muted-foreground/40`）+ 缩略图 `opacity-50 grayscale`。底部「导出当前图」Switch 控制。
8. **缩略图 badge**：左上角切片数（有切片高亮 primary，禁用导出变灰），右下角序号。`sliceCounts` state 在 `renderList` 时统计。
9. **右键菜单冲突**：`DialogContent` 加 `onContextMenu={(e)=>{e.preventDefault();e.stopPropagation();}}`，阻止 fabric canvas 右键冒泡到 Canvas 的 `ContextMenuTrigger`。
10. **picked 模式每图独立背景色**：`detectFor(url)` 在 picked 模式用 `st.pickedColor`（该图自身），非统一用激活图的。ColorPicker 选色 + Pipette 吸色都写入当前激活图的 `pickedColor`。
11. **图标来源**：`Undo2`/`Redo2`/`Pipette`/`SquarePen`/`MousePointer2`/`Trash2`/`Eraser` 均从 `@agent-spaces/ui` 命名导入（`export * from 'lucide-react'`）。`ColorPicker`/`Switch`/`Tooltip*` 已在 ui-exports 导出，无需改宿主层。

### 改动文件（mini-app 内，刷新即生效）

- `src/components/UiSplitterDialog.jsx`：完整重构。多图横向列表 + 切换隔离 + contain 画布 + 绘制模式 toggle + 图标按钮工具条 + ColorPicker 背景 + 导出开关 + 列表删除/清空 + capture 拦截 Delete。
- `src/components/nodes/UiSplitterNode.jsx`：FileUpload 改 `maxFiles={0}`（多图）+ `sortable`；`handleFilesChange` 多图收集（参考 ImageProcessNode）；`inputImages={inputImages}`（上传+连线去重）传对话框；`UpstreamImageList` 多张只读。
- `src/components/Canvas.jsx`：`computeInputImages` 早已纳入 `uiSplitter` 为 receiver（取全部连线图），本轮**无改动**。

### 无宿主改动

本轮全部在 mini-app src 内，刷新即生效。依赖的 `ColorPicker`/`Switch`/lucide 图标早已在 `@agent-spaces/ui` 导出。

### 验收要点

- UiSplitter 节点支持上传多图 + 多连线，合并去重进输入
- 编辑器顶部横向缩略图列表，左上角 badge 显示该图切片数（禁用导出变灰），点击切换且切片框/撤销栈/背景色独立保留
- 打开即对所有图自动检测，badge 首屏即显示（不需切图）
- 表单参数变化自动重新检测所有图
- 工具条：绘制模式 toggle（SquarePen/MousePointer2）、吸色（Pipette）、撤销重做（Undo2/Redo2）、背景色 ColorPicker
- 绘制模式左键拉框；选择模式左键移动切片框；Alt 强制拉框
- Delete/Backspace 删切片框不删节点
- 右侧列表每项 hover 删除图标 + 标题栏清空图标
- 底部「导出当前图」Switch + 「保存全部 N 张切片」按钮，导出所有启用图的所有切片，多图文件名带 `img{N}_` 前缀
- 对话框内右键不弹画布菜单

## 媒体节点 URL 规范化 + 图像处理增加「图片放大」（本轮新增）

修复两处相对路径问题 + 给图像处理节点加云端 AI 放大处理器。

### 关键决策与已踩坑（务必遵守）

1. **`uploadFile` 返回的可能是相对路径**（如 `/static/uploads/xxx.png`），浏览器同源能展示，但提交给工作流后端跨域下载会失败。所有「节点产出图 → 提交工作流」的路径都必须先 `normalizeImageUrls`（补全 `window.location.origin`）。本轮补了两处：
   - `VideoGeneratorNode.handleRun`：提交 `input.images` 前 normalize
   - `Canvas.handleProcessImage`（toolbar 抠图/放大）：提交 `image_url` 前 normalize
2. **`handleProcessLocal` 也统一 normalize 输入**：本地算法的 `urlToImageData` 走 fetch 同源能用相对路径，但为统一规范也 normalize（不破坏本地算法）。
3. **「图片放大」处理器走工作流而非本地算法**：image_enchanter 是云端 AI 放大，无法套进 `ImageData → ImageData` 的 run 签名。采用 `__url` 透传机制（与 `__gifUrl` 同款）：
   - PROCESSORS 加 `enhance` processor，run 内通过 `ctx.workflowId` + `ctx.runWorkflowFn` 调 image_enchanter 工作流，返回 `[{__url: resultUrl}]`
   - `runProcessor` 新增第 4 参数 `extraCtx`，透传到 `processor.run` 的 ctx；识别 `__url` 标记跳过 ImageData 转换
   - `runProcessor` 把 enhance 加入「不预解码」名单（与 gif-split 同，直接用原始 URL）
   - `handleProcessLocal` 对 `processorId === 'enhance'` 注入 `{workflowId: settings.imageEnchanterWorkflowId || WORKFLOWS.image_enchanter, runWorkflowFn: runWorkflow}`
4. **enhance 的 addHistory model 标 `image_enchanter`**（其他本地处理器标 `local`），便于区分云端/本地。
5. **新分类「画质增强」**：`IMAGE_PROCESSOR_CATEGORIES` 加 `{id:'enhance', icon:'🔍'}`，IMAGE_PROCESSORS 加 `{id:'enhance', category:'enhance', params:[]}`（无参数，UI 不渲染参数表）。

### 改动文件（mini-app 内，刷新即生效，无宿主改动）

- `src/components/nodes/VideoGeneratorNode.jsx`：import `normalizeImageUrls`，handleRun 提交前 normalize inputImages
- `src/components/Canvas.jsx`：import `normalizeImageUrls`；`handleProcessImage` normalize sourceImages；`handleProcessLocal` normalize 输入 + enhance 注入 workflowId/runWorkflowFn + addHistory model 区分
- `src/utils/image-ops/index.js`：PROCESSORS 加 `enhance` processor（走工作流 + `__url` 透传，**支持批量并发**）；`runProcessor` 加 `extraCtx` 参数 + enhance 跳过预解码 + 识别 `__url`
- `src/utils/constants.js`：`IMAGE_PROCESSOR_CATEGORIES` 加 `enhance` 分类；`IMAGE_PROCESSORS` 加 `enhance`（图片放大，`multipleIn:true, minInputs:1`）项
- `src/components/nodes/ImageProcessNode.jsx`：`multipleIn` 处理器按 `minInputs`（默认 2，enhance=1）判断最少输入，单张也能执行；FileUpload 对 enhance 开启多图 + 排序

### enhance 批量放大设计

- `PROCESSORS.enhance.multipleIn = true` + `IMAGE_PROCESSORS.enhance.minInputs = 1`：multipleIn 让 FileUpload 不限张数 + 开启拖拽排序（控制放大顺序），minInputs=1 让单张也能执行（不像合成类强制 ≥2）
- enhance run 遍历 `ctx.urls` 全部并发（`Promise.allSettled`），每张图调一次 image_enchanter 工作流（input 为单图 `image_url`），收集所有成功产出 URL，部分失败不阻塞成功的
- 部分失败信息附加到首个产出的 `__note` 字段（runProcessor 不读，仅记录；如需 UI 提示可后续扩展）

### 验收要点

- 任意节点产出的图（可能是 `/static/uploads/...` 相对路径）→ 点 toolbar「放大」/「抠图」→ 工作流正常执行（不再因 URL 无法下载失败）
- 视频节点上传/连线图后生成，工作流收到的 images 是完整 http URL
- 图像处理节点下拉出现新分类「🔍 画质增强」→「图片放大」
- 选「图片放大」+ **单图或多图**输入 → 点执行 → 并发调 image_enchanter 工作流 → 产出对应数量的放大图
- 多图时部分失败不阻塞：成功的图正常产出，全部失败才报错
- 生成记录里放大条目 model 显示 `image_enchanter`（本地处理器显示 `local`）

## 生成配音 / 生成视频节点（本轮新增）

新增两个媒体节点：`TextToVoiceNode`（文字生成语音）和 `VideoGeneratorNode`（生成视频），分别调用 `text_to_voice`（`820bf3b7-9d50-4f6d-966d-8e442960a233`）和 `video_generator`（`5130958f-a78e-4c36-8f03-1f2f733b87d7`）两个工作流，设置对话框已新增两个工作流槽位。

### 关键决策与已踩坑（务必遵守）

1. **媒体节点走独立回调 `onGenerateMedia`，不复用 `onGenerate`**：`handleGenerate` 内部硬编码 `generateImages`（图片专用提取）+ 写 `output.images`，音频/视频产出结构不同（end `result` = tts `audio` 对象 / video URL 字符串），不能复用。新增 `handleGenerateMedia(nodeId, nodeType, kind, {workflowId, input})`，kind=`'audio'`/`'video'`，写 `output.audio` / `output.video`，注入到节点 data 与 `onGenerate` 平级。
2. **`runWorkflow` 增加 `returnRawEndOutput` 选项**：原 `runWorkflow` 走 `extractOutput`（图片专用，找 `result/images/image_urls` 数组）。媒体节点 end `result` 可能是对象（tts `audio`），`hasImages` 判 false 会漏提取。新增 `opts.returnRawEndOutput: true` 跳过 `extractOutput`，直接返回首个 completed end 节点的完整 output。`generateAudio`/`generateVideo` 都传这个选项。
3. **媒体 URL 提取用 `pickFirstUrlDeep` 深度优先**：tts/video 节点产出字段名各异（fish-audio `data.httpPath` / qianyin `data.fileUrl` / minimax `data.audioUrl` / video `data.video` 或 `data.videoUrl`），end `result` 可能是对象也可能直接是 URL 字符串。`pickFirstUrlDeep` 优先按已知字段名找，兜底遍历所有 value 找首个 http/https/相对路径字符串。**不要假设固定字段名**。
4. **媒体产出也调 `persistImagesToBackend`**：外链音频/视频同样可能过期/防盗链，下载到后端 data 目录换 httpUrl（复用 `downloadImage`，文件类型不限）。失败保留原地址。
5. **`<audio>`/`<video>` 加 `key={url}`**：React 复用同实例时 src 变更不会重新加载，加 key 强制重建。
6. **视频节点接收上游连线图**：`computeInputImages` 已纳入 `videoGenerator` 为 receiver（取全部连线图，与 uiSplitter 同），`VideoGeneratorNode` 复用 `ImageProcessNode` 的双来源模式（FileUpload 上传 + `UpstreamImageList` 连线只读，`dedupeUrls` 合并），图片作为 `input.images`（string[]）传给工作流。
7. **生成记录对媒体产出存 `[url]` 数组**：`addHistory` 字段名是 `images`，媒体节点也存进去（单元素数组），「用作输入」按钮能拿到媒体 URL（虽然 HistoryCard 图片网格对音频 URL 会显示 broken img，但不阻塞）。

### 改动文件（mini-app 内，刷新即生效，无宿主改动）

- `src/utils/constants.js`：`WORKFLOWS` 加 `text_to_voice`/`video_generator`；`NODE_TYPES` 加 `textToVoice`/`videoGenerator`；`NODE_META` 加 🔊 #a855f7 / 🎬 #ef4444；新增 `VOICE_PROVIDER_OPTIONS`/`VIDEO_ASPECT_OPTIONS`/`VIDEO_QUALITY_OPTIONS`/`VIDEO_DURATION_OPTIONS`/`VIDEO_MODEL_OPTIONS`（按 provider 分组）/`DEFAULT_VIDEO_MODEL`/`isAliyunVideoModel`
- `src/utils/settings.js`：`DEFAULT_SETTINGS` 加 `textToVoiceWorkflowId`/`Name`、`videoGeneratorWorkflowId`/`Name`；`WORKFLOW_SLOTS` 加两个槽位（设置对话框自动渲染）
- `src/utils/workflow.js`：`runWorkflow` 加 `opts.returnRawEndOutput`；新增 `pickFirstUrlDeep`/`generateAudio`/`generateVideo`
- `src/components/nodes/TextToVoiceNode.jsx`（新增）：textarea + provider select + voiceId input + 生成按钮 + `<audio>` 产出
- `src/components/nodes/VideoGeneratorNode.jsx`（新增）：FileUpload 多图 + UpstreamImageList + textarea + 模型分组下拉（jimeng/minimax/aliyun）+ 比例/质量/时长 + 生成按钮 + `<video>` 产出；aliyun 模型无参考图时禁用生成并提示
- `src/components/Canvas.jsx`：import 两个节点 + `NODE_COMPONENTS`/`ADD_NODE_ITEMS` 注册 + `computeInputImages` 纳入 `videoGenerator` + `DEFAULT_SIZE`/`initialData` 加两节点 + `handleGenerateMedia`（addHistory 带 `mediaType`）+ 节点 data 注入 `onGenerateMedia`
- `src/components/RightPanel.jsx`：`ADD_ITEMS` 加「生成配音」「生成视频」两项；`HistoryCard` 按 `item.mediaType` 渲染 `<audio>`/`<video>` 播放器，不再对媒体 URL 显示 broken 图片网格

### 验收要点

- 右侧「新增节点」tab 出现「生成配音」「生成视频」卡片，点击/拖拽可建节点
- 设置对话框出现「文字生成语音工作流」「生成视频工作流」两个槽位，可换默认工作流
- 生成配音节点：输入文本 + 选 provider + 可选 voiceId → 点「生成配音」→ 产出 `<audio>` 播放器 + 下载链接
- 生成视频节点：上传/连线参考图（可选）+ 提示词 + 模型下拉（按即梦/MiniMax/阿里云分组）+ 比例/质量/时长 → 点「生成视频」→ 产出 `<video>` 播放器 + 下载链接
- 选阿里云模型且无参考图时，生成按钮禁用并显示「需至少 1 张参考图」提示（工作流 aliyun 分支会取 images[0]/images[1] 作首尾帧）
- 视频节点支持上游图片节点连线（computeInputImages 派生到 data.images，UI 显示「🔗 来自连线 N 张」）
- 产出写入 `data.output.audio` / `data.output.video`，刷新后仍可播放
- 「生成记录」tab 里音频/视频条目显示对应播放器（不再 broken 图），「用作输入」仍可拿到媒体 URL

## BBox 查看节点 + AI 分析 + agent_run 图片支持（本轮新增）

新增 `bboxViewer` 节点：上传图 + JSON bbox 可视化（fabric 画布）+ 手动框选 + 批量导出框区域到 ZIP/画布。配合宿主层给 `agent_run` 加图片输入能力，实现「AI 分析图片 → 自动生成 bbox」。

### 关键决策与已踩坑（务必遵守）

1. **独立节点不复用 UiSplitter**：UiSplitter 语义是「按前景色切片去背」，BBox 是「可视化 JSON bbox + 区域导出」，两者 fabric 骨架相似但语义不同。新建 `BBoxViewerDialog`/`BBoxViewerNode`，避免 700 行组件过载。
2. **JSON schema 单一新格式**（已移除旧兼容）：`{title, elements:[{id,type,label,coords:[x,y,w,h],parentId,exportSlice,ocrText,textRole,children}]}`。`coords` 是 `[x,y,width,height]`（左上角+宽高），**不是**旧版 `bbox_2d:[x1,y1,x2,y2]`。`flatten` 递归 children，无 coords 的容器节点向下传递保持父级色。
3. **1000 坐标系自动换算**：扫所有 box 的 `max(x+w, y+h)`，若都 ≤1000 且图片 >1000px → 按 1000 比例放大（兼容 LLM 归一化输出）；否则像素坐标系（sx=1）。
4. **exportSlice 视觉区分**：`exportSlice=true` 的框用**绿色实线 + 半透明绿填充**（可导出资产）；`false` 用**配色虚线**（容器面板）。底部「仅导出切片」开关过滤导出目标。
5. **agent_run 图片支持（宿主层，需重启 web）**：
   - `mini-app-tools.ts` 的 `agent_run` 加 `images` 参数（base64 data URL 数组），execute 内转 `Attachment[]`（`{name,type,url:'data:...'}`）传给 `runtime.execute` 的 `userAttachments`
   - **只有 claude-code 和 langchain runtime 真正消费 userAttachments**（调研结论）：codex/grok/hermes/pi/open-agent-sdk 静默丢图但不报错
   - 扩展两个 runtime 的附件解析识别 data URL（短路）：`langchain-runtime.ts` 的 `toAttachmentDataUrl` 开头加 `if(url.startsWith('data:')) return url`；`claude-code-runtime/index.ts` 的 `resolveAttachmentFile` 加 data URL 分支（正则解析 mime+base64 → buffer）
6. **🔴 AI 框错位 bug（已修复）**：根因是 AI 返回的 coords 基于「AI 看到的图」尺寸，画布背景图是 `loadImageSource` 加载的图，两者尺寸不同 → `getBBoxBasis` 的 `sx` 换算错误。**正解**：压缩后用压缩图**同时**重建 sourceRef + 更新 fabric 背景图 + 传 AI，三者同源 → 坐标 1:1 对应 → sx=1 零换算。
7. **图片压缩（browser-image-compression）**：前端压缩减小 base64 体积 + Web Worker 不卡 UI。库放 `vendor/browser-image-compression.js`（57KB，UMD），走 `getImageCompression()` 加载器（与 getFabric 同款 `(0,eval)` 全局求值，挂 `window.imageCompression`）。压缩参数固定 `maxSizeMB:1, maxWidthOrHeight:1920, useWebWorker:true`，失败降级原图。
8. **systemPrompt 归 agent preset**：`agent_run` 工具签名本就不接受 systemPrompt（mini-app-tools 验证），systemPrompt 是 preset 自带字段。设置页只管「选哪个 preset + 用户提示词」，preset 内部细节（含 systemPrompt）由 openAgentEditor 弹窗管理。`openAgentEditor` 的 `initialPrompt` 传 `BBOX_AI_SYSTEM_PROMPT`（用户给的完整检测规则）。
9. **TDZ 规避**：`fitToStage` 必须声明在 `handleAiAnalyze` 之前（handleAiAnalyze 依赖数组含 fitToStage），否则 useCallback 渲染期求值引用未初始化变量报错（handoff 第 1 条坑同款）。
10. **AI 返回 JSON 提取**：`extractJsonFromText` 兼容 ```` ```json ... ``` ```` 代码块和裸 JSON（找首个 `{` 到末个 `}`），LLM 常在 JSON 前后带解释文本。

### 改动文件

#### 宿主层（需重启 web）
- `packages/server/src/services/builtin-tools/mini-app-tools.ts`：`agent_run` 加 `images` 参数 + 转 `userAttachments`；import `Attachment` 类型
- `packages/server/src/adapters/langchain-runtime.ts`：`toAttachmentDataUrl` 加 data URL 短路
- `packages/server/src/adapters/claude-code-runtime/index.ts`：`resolveAttachmentFile` 加 data URL 分支

#### mini-app 层（刷新即生效）
- `src/utils/constants.js`：`NODE_TYPES.bboxViewer` + `NODE_META`（📦 #eab308）+ `IMAGE_TAGS.bboxViewer` + `BBOX_AGENT_INIT_NAME`/`BBOX_AI_SYSTEM_PROMPT`/`BBOX_AI_USER_PROMPT`
- `src/utils/settings.js`：`DEFAULT_SETTINGS` 加 `bboxAgentConfigId`/`bboxAgentName`/`bboxAiUserPrompt`（systemPrompt 归 preset，不存 settings）
- `src/components/SettingsDialog.jsx`：新增「✨ BBox AI 分析」分区（配置 agent + 用户提示词，无系统提示词）
- `src/components/BBoxViewerDialog.jsx`（新增 ~700 行）：fabric 画布 + JSON 导入（递归 children + 1000 坐标系换算）+ 配色策略 + 图例 hover 联动 + Alt 拉框 + 撤销重做 + exportSlice 视觉区分 + ZIP 下载（getJsZip）+ 导出画布 + AI 分析（压缩+同步背景图修复错位）
- `src/components/nodes/BBoxViewerNode.jsx`（新增）：FileUpload 单图 + 连线占位 + 打开对话框 + 透传 agentConfig
- `src/components/Canvas.jsx`：注册节点（NODE_COMPONENTS/ADD_NODE_ITEMS/computeInputImages/DEFAULT_SIZE/initialData）+ decoratedNodes 注入 `data.agentConfig`（从 settings 读，加进 useMemo 依赖）
- `src/components/RightPanel.jsx`：ADD_ITEMS 加「BBox查看」
- `src/utils/image-ops/cdn.js`：新增 `getImageCompression()` 加载器
- `src/vendor/browser-image-compression.js`（新增 57KB）：v2.0.2 UMD build

### 改动文件（bbox_viewer.html → BBox 节点功能映射）
原 `C:/Users/Administrator/.zcode/workspace/default/bbox_viewer.html` 的功能落地：
- 左侧图片 → fabric 编辑器（contain 居中，滚轮缩放/空格平移/Alt 拉框）
- 方框 → fabric Rect（kind='bbox'，带 `__meta` 元数据）
- JSON 导入（递归 children）→ `flatten` + `applyJsonData`
- 配色策略（按层级/父级同色/随机）→ `getColor` + PALETTE 12 色
- 图例 hover 高亮联动 → `highlightBox`（目标框加粗+半透明黄填充，其它 opacity 0.25）
- 线宽/显示子元素/标签/ID toggle → 工具条 Switch
- **新增**：AI 分析（agent_run + 图片压缩）+ 批量导出 ZIP/画布 + exportSlice 视觉区分

### AI 分析流程
```
1. compressToDataUrl(imageUrl)  → Web Worker 压缩 → dataUrl（失败降级原图）
2. loadImageSource(dataUrl)     → 重建 sourceRef（canvas.width=压缩图宽）
3. fabric.Image.fromURL(dataUrl) → 更新背景图 + fitToStage（保证坐标同源）
4. callPluginTool('agent_run', {prompt, agentConfigId, images:[dataUrl]}) → AI 分析
5. extractJsonFromText(raw)     → 解析返回 JSON（兼容代码块包裹）
6. applyJsonData(data)          → 渲染框（sourceRef 已是压缩图，sx=1 零换算）
```

### 验收要点
- 右侧「新增节点」出现 📦 BBox 查看卡片
- 节点支持上传单图或接收上游连线单图
- 打开查看器 → fabric 画布显示图 → 点「载入示例」→ 新 schema 框渲染（含 type/ocrText/exportSlice 标记）
- 配色/线宽/显示 toggle 实时生效；图例 hover 高亮联动；点击聚焦到框
- Alt+左键拉框新建；Delete 删选中；Ctrl+Z 撤销
- 「下载 ZIP」→ 浏览器下载含每个框 PNG 的 zip；「导出到画布」→ 节点产出图网格
- 「仅导出切片」开关过滤 exportSlice=true 的框
- 设置 → BBox AI 分析 → 配置视觉 agent（Claude/GPT-4o/Gemini）+ 编辑用户提示词
- 点「✨ AI 分析」→ 状态「压缩图片中…」→「AI 分析中…」→ 框与图片内容**完全吻合不错位**
- 压缩阶段 UI 不卡（Web Worker）；压缩失败降级原图

## 图像处理节点拆分 + 图片压缩处理器（本轮新增）

把原单一「图像处理」节点（内含 12 处理器下拉切换）拆成 12 个独立节点（一个处理器 = 一个节点类型），并新增「图片压缩」处理器。

### 关键决策与已踩坑（务必遵守）

1. **拆分方案 = 映射表 + 单组件复用**（非 12 套重复组件）：12 个新 `NODE_TYPES.ip*` 全部映射到同一个 `ImageProcessNode` 组件。组件按 `NODE_TYPE_TO_PROCESSOR[type]` 反查**固定 processorId**（无下拉切换），其余逻辑（上传/连线/参数/执行/产出/NodeToolbar）完全复用。改 ImageProcessNode 一处 = 12 个节点全生效。
2. **type id 不变只改 label**：拆分和重命名都只动 `NODE_META.label`，不改 `NODE_TYPES` 的 key/value。已有 canvas.json 的 `type: 'imageProcess'/'uiSplitter'/'bboxViewer'` 节点打开仍正常（旧 imageProcess 单节点从 `data.params.processor` 读 processorId，新 ip* 节点从 nodeType 反查）。
3. **旧 imageProcess 单节点保留兼容**：`NODE_TYPES.imageProcess` 未删，组件判断 `NODE_TYPE_TO_PROCESSOR[type] || data.params.processor`（新节点走前者，旧节点走后者）。新画布不再添加旧节点（RightPanel/Canvas 菜单已移除该项），但已存在的能继续用。
4. **compress 处理器走 `__url` 透传（与 enhance 同款）**：browser-image-compression 接受 File 非 ImageData，run 内 fetch→File→compress→目标格式→uploadFile→`{__url}`，跳过 ImageData 管道。`runProcessor` 把 compress 加入「不预解码」名单（与 gif-split/enhance 同）。
5. **PNG 兜底用 canvas 重绘**：browser-image-compression 不支持 png 输出，compress 处理器内 `compressPng()` 用 canvas 重绘+缩到最长边（无 quality 概念）。
6. **ParamField 升级支持 3 个新能力**（compress 等复杂参数表需要）：
   - select 的 `options` 支持 `{value,label}` 对象数组（中文显示，不仅 string）
   - number 支持 `step` 小数（quality 0.05、maxSizeMB 0.1）
   - 新增 `showWhen: { key, eq?/in? }` 条件显隐（按 mode/format 切换显隐对应字段）
7. **历史记录记真实节点类型**：`handleProcessLocal` 第 5 个参数收 `nodeType`，addHistory 用真实 type（不再写死 `imageProcess`）。HistoryCard 已用 `NODE_META[item.nodeType]` 取 label，12 个新节点各自显示名。旧历史（nodeType=imageProcess）仍显示「图像处理」。
8. **重命名（仅 label，type id 不变）**：
   - `uiSplitter`：UI拆分 → **雪碧图拆分**（语义更准：按前景色切片去背）
   - `bboxViewer`：BBox查看 → **UI拆分**（功能化命名：JSON bbox 可视化+区域导出）
   - 同步改：NODE_META / IMAGE_TAGS / RightPanel ADD_ITEMS / 对话框标题 / 节点按钮 / api.js NODE_LABELS / tools.js NODE_TYPE_DESC

### 改动文件（mini-app 内，刷新即生效，无宿主改动）

- `utils/constants.js`：
  - `NODE_TYPES` 加 12 个 `ip*`（ipGifSplit/ipGifMerge/ipSpriteSplit/ipSpriteMerge/ipPixelate/ipResizeNearest/ipInnerStroke/ipChromaKey/ipWhiteKey/ipComposeOverlay/ipEnhance/ipCompress）
  - 新增 `NODE_TYPE_TO_PROCESSOR` / `PROCESSOR_TO_NODE_TYPE` / `isImageProcessNodeType` 映射
  - `NODE_META` 加 12 项（共用青色 #14b8a6 + 语义 icon）+ 重命名 uiSplitter/bboxViewer
  - `IMAGE_TAGS` 同步重命名
  - `IMAGE_PROCESSOR_CATEGORIES` 加 `compress` 分类（🗜️）
  - `IMAGE_PROCESSORS` 加 `compress` 处理器（mode/format/quality + showWhen 条件参数表）
- `utils/image-ops/index.js`：
  - 新增 `compress` processor（fetch→browser-image-compression→目标格式→uploadFile，`__url` 透传，批量并发部分失败不阻塞）
  - 新增 `compressPng()` 辅助函数（PNG 用 canvas 重绘兜底）
  - `runProcessor` 不预解码名单加 compress
  - import `getImageCompression`
- `components/nodes/ImageProcessNode.jsx`：
  - props 加 `type`，processorId 改为 `NODE_TYPE_TO_PROCESSOR[type] || data.params.processor`
  - 删除处理器下拉 + setProcessor + grouped 计算
  - `handleRun` 第 5 参数传 `type`
  - `ParamField` 升级：select 对象 options / number step / showWhen 条件显隐
- `components/Canvas.jsx`：
  - `NODE_COMPONENTS` 12 个 ip* 全映射 ImageProcessNode
  - `ADD_NODE_ITEMS` 加 12 项（移除旧 imageProcess）
  - `computeInputImages.isReceiverType` 用 `isImageProcessNodeType` 判 receiver
  - `initialData` 按映射生成处理器初始 params
  - `handleProcessLocal` 收 nodeType 参数，addHistory 用真实 type
- `components/RightPanel.jsx`：ADD_ITEMS 移除旧图像处理项、补 12 个拆分节点 + 重命名 uiSplitter/bboxViewer label
- `components/nodes/BBoxViewerNode.jsx`：按钮「打开 BBox 查看器」→「打开 UI 拆分器」
- `components/BBoxViewerDialog.jsx`：标题「BBox 查看器」→「UI 拆分器」
- `components/UiSplitterDialog.jsx`：标题「UI 拆分编辑器」→「雪碧图拆分编辑器」
- `api.js` / `tools.js`：VALID_NODE_TYPES/NODE_LABELS/NODE_TYPE_ENUM/NODE_TYPE_DESC 补 12 项 + 重命名 uiSplitter 描述（让 AI agent add_node 也能建新节点）

### 12 个拆分节点 ↔ 处理器映射

| 节点类型 | label | 处理器 id | multipleIn |
|---------|-------|----------|-----------|
| ipGifSplit | 🎬 GIF 拆帧 | gif-split | 否（multipleOut）|
| ipGifMerge | 🎞️ GIF 合成 | gif-merge | 是（≥2）|
| ipSpriteSplit | 🔲 Sheet 拆分 | sprite-split | 否（multipleOut）|
| ipSpriteMerge | ▦ Sheet 合成 | sprite-merge | 是（≥2）|
| ipPixelate | 🟦 像素化 | pixelate | 否 |
| ipResizeNearest | 🔍 最近邻缩放 | resize-nearest | 否 |
| ipInnerStroke | ✏️ 内描边 | inner-stroke | 否 |
| ipChromaKey | ✂️ 色度键抠图 | chroma-key | 否 |
| ipWhiteKey | ⚪ 白底抠图 | white-key | 否 |
| ipComposeOverlay | 🧬 图层叠加 | compose-overlay | 是（≥2）|
| ipEnhance | 🔼 图片放大 | enhance | 是（云端，≥1）|
| ipCompress | 🗜️ 图片压缩 | compress | 是（本地，≥1）|

### compress 处理器参数表

- `mode`（select）：按体积 / 按尺寸
- `maxSizeMB`（number, 0.01-50, step 0.1，仅 mode=size 显）：目标体积
- `maxWidthOrHeight`（number, 16-8192，仅 mode=dimensions 显）：最长边
- `format`（select）：JPEG / WebP / PNG
- `quality`（number, 0.1-1, step 0.05，仅 jpeg/webp 显）：质量

### 验收要点

- 右侧「新增节点」出现 12 个独立图像处理卡片（GIF 拆帧…图片压缩），原「图像处理」单节点卡片已移除
- 每个新节点**无处理器下拉**，只显示该处理器专属参数表
- 选「图片压缩」→ 压缩模式/体积/格式/质量带 showWhen 条件显隐
- 执行任意图像处理器 → 产出图正常，「生成记录」tab 显示真实节点名（🟦 像素化 / 🗜️ 图片压缩…）
- 原「UI拆分」卡片显示「🧩 雪碧图拆分」；原「BBox查看」显示「📦 UI拆分」
- 旧 canvas.json 的 imageProcess/uiSplitter/bboxViewer 节点打开仍正常（type id 未变）

## 统一抠图节点 + Rembg 插件接入（本轮新增）

把「白底抠图」「色度键抠图」「节点 toolbar 工作流抠图」「Rembg 插件抠图」四种抠图能力合并为单一 `cutout` 节点，select 切换模式并联动不同表单。

### 关键决策与已踩坑（务必遵守）

1. **合并而非新增第四种**：原 ipWhiteKey/ipChromaKey 是独立节点类型，toolbar 抠图是 NodeShell 按钮直接调工作流，rembg 是外部插件——四者入口散落。新建 `cutout` 节点用 mode select 统一，交互更连贯。旧 ipWhiteKey/ipChromaKey 类型保留（兼容旧 canvas.json），但右侧菜单移除。
2. **模式分流在 utils 层不在组件层**：`utils/cutout.js` 的 `runCutout(mode, urls, modeParams, ctx)` 是唯一执行入口，按 mode switch 分流到 `runProcessor`(本地) / `runWorkflowFn`(工作流) / `callPluginTool`(rembg)。CutoutNode 只管 UI 和收集参数，不含执行逻辑。与 image-ops 的 runProcessor 解耦一致。
3. **Rembg 插件 config 由后端注入**：插件 info.json 的 config（baseUrl/model/timeout）由 `pluginService.executePluginTool` 在后端 merge 进 args（`Object.assign({}, pluginConfig, args)`），前端只传用户参数（model/backgroundColor/af/ab/ae/extras/postProcessMask），不传 baseUrl/timeout。与 SKILL.md「不要传 credential 参数」一致。
4. **rembg 返回结构兼容**：插件单图动作返回 `{success, message, data:{imageUrl, size, model}}`，但 `callPluginTool` 可能再包一层 `{success, result}`。`extractRembgImageUrl` 双层兜底：先解 `{result}` 包装，再取 `data.imageUrl`。
5. **SAM 模式 extras 必填且所有图共用同一 prompt**：当前不支持逐图 prompt（节点只有 1 个 extras 输入框）。`runRembgCutout` 对 SAM 模式校验 extras 非空，支持 JSON 字符串或对象（`tryParseJson` 兜底）。
6. **多图批量所有模式都支持**：白底/色度键走 `runProcessor`（内部 Promise.all 解码），工作流/rembg 在 cutout.js 里 `Promise.allSettled` 并发，部分失败不阻塞成功的（与 enhance/compress 同款）。
7. **toolbar 抠图改创建节点**：原 `onProcessImage(images, 'segment')` 直接调工作流产出独立图片节点，改为 `onCutoutCreate(images)` 创建 cutout 节点并预填 uploadedImages，mode 默认 workflow。用户可在新节点里切换模式再执行。**放大按钮保留原逻辑**（未合并进 cutout）。
8. **showWhen 格式与 ImageProcessNode.ParmField 一致**：`{ key, eq?|in? }`，按 `allParams[key]` 判断。rembg 模式的 backgroundColor/af/ab/ae/postProcessMask/extras 都用 `showWhen: { key: 'rembgMode', eq/in: ... }` 联动 rembgMode 子下拉。
9. **TDZ 规避**：`CUTOUT_PARAMS.rembg` 引用 `REMBG_MODELS`，必须把 `REMBG_MODELS` 定义移到 `CUTOUT_PARAMS` 之前（`export const` 是 TDZ，对象字面量求值时引用未初始化常量会报错）。
10. **ParamField 新增 type='text'**：rembg 的 backgroundColor/extras 是单行文本（非 number/color/select/bool），CutoutNode 的 ParamField 比 ImageProcessNode 多一个 text 分支。

### 改动文件（mini-app 内，刷新即生效，无宿主改动）

- `src/utils/constants.js`：
  - `NODE_TYPES.cutout` + `NODE_META.cutout`（✂️ #14b8a6）+ `IMAGE_TAGS.cutout`
  - 新增 `CUTOUT_MODES`（4 模式）/`DEFAULT_CUTOUT_MODE`/`REMBG_MODELS`（16 模型）/`CUTOUT_PARAMS`（按 mode 分组参数表）/`defaultCutoutParams(mode)`
- `src/utils/cutout.js`（新增）：`runCutout` 统一执行入口 + `runWorkflowCutout`/`runRembgCutout`/`extractRembgImageUrl`/`tryParseJson`
- `src/components/nodes/CutoutNode.jsx`（新增）：mode select + 动态参数表（showWhen 联动）+ FileUpload 多图 + UpstreamImageList 连线 + 执行/取消 + 产出
- `src/components/Canvas.jsx`：
  - import CutoutNode + runCutout + DEFAULT_CUTOUT_MODE/defaultCutoutParams
  - `NODE_COMPONENTS`/`ADD_NODE_ITEMS` 注册 cutout（移除 ipWhiteKey/ipChromaKey 菜单项）
  - `computeInputImages.isReceiverType` 加 cutout
  - `DEFAULT_SIZE`/`initialData` 加 cutout
  - `handleCutout`（执行回调，与 handleProcessLocal 同款取消/状态机）+ `handleCutoutCreate`（toolbar 抠图创建节点）
  - decoratedNodes 注入 `onCutout`/`onCutoutCreate`
- `src/components/nodes/NodeShell.jsx`：抠图按钮 onClick 从 `onProcessImage(segment)` 改为 `onCutoutCreate(images)`；toolbar 显示条件加 `showCutoutButton`
- `src/components/RightPanel.jsx`：ADD_ITEMS 移除 ipWhiteKey/ipChromaKey，加 cutout

### Rembg 插件对接

- 插件 id：`workflow.rembg`（`packages/templates/plugins/rembg/`，已部署到 `packages/server/agent-spaces-data/plugins/rembg/`）
- 调用：`window.AgentSpaces.callPluginTool('workflow.rembg', action, { image, model, ... })`
- 动作映射（modeParams.rembgMode → 插件动作）：
  - `remove` → `rembg_remove`（去背景，可选 backgroundColor）
  - `mask` → `rembg_mask`（黑白掩码，可选 postProcessMask）
  - `alphaMatting` → `rembg_alpha_matting`（精细抠图，af/ab/ae + 可选 backgroundColor）
  - `sam` → `rembg_sam_segment`（SAM 分割，必填 extras JSON prompt）
- 插件需在插件管理启用；config（baseUrl=http://localhost:7000, model=u2net, timeout=120000）由后端注入，前端不传
- Rembg HTTP 服务需本机启动（`D:\rembg\start_gpu.bat`/`start_cpu.bat`），未启动时 rembg 模式报连接超时

### 验收要点

- 右侧「新增节点」出现 ✂️ 抠图卡片（原白底抠图/色度键抠图两项已移除）
- 节点内「抠图模式」下拉切换 4 种：白底抠图（本地）/色度键抠图（本地）/工作流抠图（云端）/Rembg 抠图（插件）
- 每种模式参数表独立：白底=容差+侵蚀；色度键=键色+容差+平滑+侵蚀；工作流=无参数；rembg=动作子下拉+模型+（按动作显隐）背景色/Alpha参数/掩码后处理/SAM prompt
- 切换模式时参数重置为该模式默认值（不残留旧模式参数）
- 任一模式支持上传多图 + 上游连线（合并去重），批量执行
- 执行后产出写入 `data.output.images`，可连线下游，NodeToolbar 导出/抠图/放大按钮自动可用
- 节点 toolbar「抠图」按钮 → 创建抠图节点并预填当前产出图（mode 默认工作流），不再直接调工作流
- 节点 toolbar「放大」按钮保持原逻辑（未合并）
- 生成记录里抠图条目 model 按模式显示（local/image_enchanter/rembg）
- 旧 canvas.json 的 ipWhiteKey/ipChromaKey 节点打开仍正常（类型保留兼容）

## Canvas.jsx 功能拆分（本轮新增）

把 1969 行的「上帝组件」`Canvas.jsx` 按功能拆分为 **utils（6文件）+ hooks（8个）+ components/canvas（5个）** 三层，Canvas.jsx 降到 396 行只做编排。纯重构，行为完全不变。

### 关键决策与已踩坑（务必遵守）

1. **三层拆分粒度**：utils（纯函数/单例，零 React）→ hooks（自带 state/effect）→ 子组件（纯展示）。Canvas.jsx 只剩 hook 装配 + ReactFlow 变更回调（onNodesChange/onConnect/onConnectEnd/onNodesDelete，逻辑简单）+ JSX 编排骨架。
2. **模块级单例外移**：`processingControllers`(Map) / `seq`+`positionIndex`(id/位置生成器) 是模块级可变状态，保证连续建节点不撞位置/取消信号跨 hook 共享。抽到 `utils/canvas-id.js` 和 `utils/processing-controllers.js`，封装 register/abort/clear 接口，跨 B4/B14 隐式共享变显式。
3. **前向引用处理**：`useExecutionQueue({onComplete})` 引用 `addImageNodesFromUrls`（后定义）。拆分时先调 `useImageOutputs` 拿到 `addImageNodesFromUrls`，再传给 useExecutionQueue 的 onComplete 闭包（顺序保证）。
4. **B11 RPC 重订阅优化**：原 `useEffect` deps 含 `[nodes, edges, ...5个callback]`，每次 nodes/edges 变都重新订阅 WS（潜在抖动）。`useCanvasAgentRpc` 改用 `useRef` 持有最新值，effect deps 为 `[]` 只订阅一次，靠 ref 读最新闭包。
5. **decoratedNodes callbacks 打包**：`useDecoratedNodes` 接收 `callbacks` 对象（makeOnUpdate/onGenerate/...），Canvas 用 `useMemo` 稳定 callbacks 引用，避免任一 callback 重建触发 decoratedNodes 全量重算。
6. **collectIds 递归去重**：原 `handleGroupMove`/`handleGroupConnect` 各内联一份递归收集子组节点 id。抽到 `utils/group-helpers.js` 的 `collectGroupNodeIds`/`findLeafNodeIds`，去重。
7. **alignDistribute 算法外移**：原 `alignDistribute` 内联坐标计算 + setNodes。抽 `utils/align-distribute.js` 的 `computeAlignment`（纯函数返回 Map<id,pos>），组件层只剩 setNodes 应用结果。
8. **AddNodeMenuItems render-prop 设计保留**：原组件用 render-prop 同时适配 ContextMenu 和 DropdownMenu（一份逻辑两种壳）。独立成 `components/canvas/AddNodeMenuItems.jsx` 保持设计，CanvasContextMenu/DropNodeMenu 各注入对应组件族。
9. **canvas-constants 是依赖聚合点**：`NODE_COMPONENTS` import 所有 Node 组件，Node 组件只 import `utils/constants`（不 import canvas-constants），无循环依赖。constants.js 是纯常量无副作用，处于依赖链最底层。
10. **useNodeCrud.handleAddAtMenu 改 setMenu 回调形式**：原实现同步读 `contextMenu` state，拆分后改 `setContextMenu(cur => {...})` 形式读最新值（cur 是最新 state），onPick 在 menu 关闭前同步使用 type/dataPatch，行为一致。

### 改动文件（mini-app 内，刷新即生效，无宿主改动）

#### 新增 utils（6 文件）
- `utils/canvas-constants.js`：NODE_COMPONENTS/ADD_NODE_ITEMS/DEFAULT_SIZE/initialData/dedupeTags/PANEL_*（原 M1-M10 常量部分，import 所有 Node 组件）
- `utils/input-images.js`：computeInputImages（原 M3 纯函数，fixed-point 多跳转发）
- `utils/canvas-id.js`：genId+seq / autoPosition+positionIndex（原 M6+M8 单例）
- `utils/processing-controllers.js`：AbortController 注册表单例 register/abort/clear/get（原 M7）
- `utils/align-distribute.js`：computeAlignment 纯函数（原 B9 算法部分）
- `utils/group-helpers.js`：collectGroupNodeIds/findLeafNodeIds（原 B15 内联递归去重）

#### 新增 hooks（8 文件）
- `hooks/usePanelLayout.js`：面板布局+小地图持久化（原 B2+B16布局部分）
- `hooks/useImageOutputs.js`：addImageNodesFromUrls/handleExportImages（原 B7）
- `hooks/useSelectionClipboard.js`：选中+对齐分布+批量删除+复制粘贴（原 B3选中+B9+B10）
- `hooks/useGroupOperations.js`：分组数据 ops + overlay 移动/连线（原 B8+B15）
- `hooks/useNodeCrud.js`：节点 CRUD+定位/布局/导出+尺寸自适应+表单提交（原 B5+B6+B12）
- `hooks/useNodeExecutions.js`：工作流/媒体/本地算法/抠图/反推提示词执行回调（原 B4+B14）
- `hooks/useCanvasAgentRpc.js`：WS message 监听，ref 持有最新值只订阅一次（原 B11）
- `hooks/useDecoratedNodes.js`：节点 data 注入（原 B13）

#### 新增 components/canvas（5 文件）
- `components/canvas/AddNodeMenuItems.jsx`：render-prop 菜单项（原 B18）
- `components/canvas/MultiSelectToolbar.jsx`：底部多选浮出 toolbar（分组/对齐/删除）
- `components/canvas/DropNodeMenu.jsx`：拖拽落空菜单（DropdownMenu）
- `components/canvas/CanvasContextMenu.jsx`：右键菜单（ContextMenuTrigger 包裹 + Content）
- `components/canvas/GroupOverlays.jsx`：ViewportPortal 内 WorkflowGroupOverlay 列表

#### 重写
- `components/Canvas.jsx`：1969 行 → 396 行（hook 装配 + ReactFlow 变更回调 + JSX 编排）

### 验收要点

- 画布所有原有功能完全不变（节点 CRUD/连线/拖拽/右键/落空菜单/多选 toolbar/分组 overlay/复制粘贴/Agent RPC/工作流生成/图像处理/抠图/反推提示词/媒体节点/设置/工作区切换）
- Agent RPC（canvas.addNode/addNodes/connectNodes 等）行为一致，且不再因 nodes/edges 变化重订阅 WS（性能改善）
- 文件结构清晰：Canvas.jsx 只做编排，业务逻辑分布在 hooks，纯函数/单例在 utils，展示组件在 components/canvas
- 无循环依赖：canvas-constants → Node 组件 → constants（单向）

## UI 拆分器对话框重构（本轮新增）

`BBoxViewerDialog` 重构：移除「载入示例」、右侧面板改 Tabs（元素拆分/AI思考/选中信息）、Header 工具栏增加框选/平移模式切换。

### 关键决策与已踩坑（务必遵守）

1. **「载入示例」整块删除**：原 `SAMPLE_DATA` 常量 + 工具条「载入示例」按钮 + 空状态文案里的「点载入示例」提示全部移除。空状态改为引导用「AI 分析 / Alt 拉框 / 导入 JSON」。
2. **右侧面板改 Tabs（3 个 tab）**：
   - **元素拆分**：原元素列表（树形缩进 + hover 联动 + 删除按钮），不动
   - **AI思考**：实时 markdown 渲染 AI 分析过程与返回原文（用宿主 `Markdown` 组件，已暴露于 ui-exports）
   - **选中信息**：表单修改选中框（id/type/label/x/y/w/h/depth/exportSlice/ocrText/textRole），「应用修改」写回 fabric Rect
3. **AI 思考过程「实时」=分阶段 markdown 累积（非 token 流）**：`agent_run` 是同步调用（无 token stream 能力），改造为在 `handleAiAnalyze` 各阶段 `setAiThought(t => t + ...)` 累积 markdown 文本（启动/压缩/分析中/返回原文/失败），用 `<Markdown content={aiThought}/>` 渲染。点「AI 分析」时 `setRightTab('ai')` 自动切到此 tab；分析完自动切回 list。
4. **选中信息 tab 自动切换**：fabric 选中变化（`selection:created/updated/cleared`）触发 `onFabricSelectionChange`：选中 bbox → 写 `selectedIdx` + 从 Rect 读出 `selForm` + `setRightTab('selected')`；移动/缩放中也实时同步表单坐标。
5. **表单回写 = applySelForm**：把 selForm 的 x/y/w/h 设置到 Rect（scaleX/scaleY 重置 1 + width/height 直接改），meta（id/label/type/exportSlice/ocrText/textRole）回写 `r.__meta`，exportSlice 变化同步 fill/stroke 风格。
6. **Header 工具栏框选/平移切换**：左侧加两个图标按钮（`SquareMousePointer`=框选 / `Hand`=平移），`modeRef`（fabric 闭包用）+ `modeState`（React 重渲染用）双轨。`applyMode` 把 mode 应用到 fabric 的 `selection`/`defaultCursor`/`hoverCursor`/各 Rect 的 `selectable`。鼠标按下时按 mode 分流（draw=拉框/选中、pan=拖拽平移），Alt 仍可强制拉框（与 mode 无关）。空格仍可临时平移（松开恢复 mode）。
7. **图标 `SquareMousePointer`/`Hand` 走 lucide-react `export *`**：**注意 lucide-react 没导出 `SquareDashed`**（文件存在但主入口未导出），改用 `SquareMousePointer`（方形+光标，语义贴切）。`Hand` 已导出。
8. **`Markdown` 组件已暴露无需改宿主**：`ui-exports.ts:63` 已有 `export { Markdown } from '@/components/ui/markdown'`，本轮零宿主改动。

### 改动文件（mini-app 内，刷新即生效，无宿主改动）

- `src/components/BBoxViewerDialog.jsx`：完整重构
  - 删除 `SAMPLE_DATA` + 「载入示例」按钮 + 相关文案
  - 右侧 `<ResizablePanel id="bbox-list">` 内改为 `<Tabs>`（list/ai/selected），底部导出区移到 Tabs 外（三 tab 共用）
  - 新增 `aiThought` state + `setAiThought` 阶段性累积，`<Markdown content={aiThought}/>` 渲染
  - 新增 `selectedIdx`/`selForm` state + `updateSelFormFromRect`/`applySelForm`/`deleteSelectedFromForm`
  - 新增 `MODE` 常量 + `modeRef`/`modeState` + `applyMode`/`setMode`/`switchMode`
  - fabric `bindFabricEvents` 加 `selection:created/updated/cleared → onFabricSelectionChange`，`object:moving/scaling` 中同步选中表单坐标
  - Header 工具条左侧加「框选/平移」两个 `Button`（variant 按 modeState 切换）+ 分隔线
  - import 增加 `Tabs/TabsList/TabsTrigger/TabsContent/Markdown` + `SquareMousePointer/Hand`，移除未用的 `MousePointer2`

### 验收要点

- 打开 UI 拆分器：工具条**无**「载入示例」按钮；左侧新增「框选」「平移」两个按钮
- 框选模式（默认）：左键空白拉新框；平移模式：左键拖拽画布；Alt 在两模式都强制拉框；空格临时平移
- 右侧 Tabs 三个：元素拆分（同原）/ AI思考（默认空提示）/ 选中信息（默认空提示）
- 点「AI 分析」→ 自动切到「AI思考」tab，分阶段显示「启动→压缩→分析中→返回原文」，完成后切回「元素拆分」
- 在画布选中一个框 → 自动切到「选中信息」tab，表单显示该框的 id/type/坐标/尺寸/层级/exportSlice 等，改完点「应用修改」写回；移动/缩放框时表单坐标实时同步
- 空状态文案引导「AI 分析 / Alt 拉框 / 导入 JSON」，不再提「载入示例」

## 后续可做

- 队列任务失败「重试」按钮、执行中实时进度（node:progress 事件）
- 队列结果可选连线到已有节点
- 设置页加默认模型配置（当前模型在节点内选）
- useCanvasState 持久化时防御性剥离 `selected` 字段
- 异步轮询工作流（execute_workflow_async + get_workflow_result）替代一味提高 sync 超时
- 提示词库支持多选（当前 pickedPrompt 为单选覆盖，可改为链式合并多条）
- 自定义提示词库导入/导出 JSON（批量分享）
- service watcher 启动时 initial 扫描打印加载失败项（当前 ignoreInitial:true）
- 剪贴板持久化到 localStorage（当前模块级内存刷新失效）
- 粘贴时支持鼠标位置定位（当前固定偏移 {40,40}）
- 跨工作区拖拽复制节点（需画布实例间通信，复杂度高；当前用 Ctrl+C/V 已够用）
- 工作区缩略图预览（取首个节点图片）
- 工作区排序/收藏
- 图像处理：上传多图改并发 uploadFile（当前串行）
- 图像处理：FileUpload value 反推丢失原始文件名（当前合成 upload-1.png），如需保留可把原始名一并存 data
- 图像处理：GIF 拆帧产出几十上百帧时节点过长，可加分页/折叠（当前全展示）
- 图像处理：色度键的 spill（抑色）参数当前固定 0，可暴露给用户
- 图像处理：大图处理阻塞主线程，算法可移入 Web Worker（io.js 的 canvas 操作仍需主线程）
- 像素编辑器：vendor/pixelorama-web/index.pck 12MB（含 SimHei 9.7MB），可改用 fonttools 裁剪中文字体子集（常用 3500 字，约 2-3MB）减小加载
- 像素编辑器：导出格式加 sprite sheet 拼接 / GIF（复用 encodeFramesToGif），当前只导每帧 PNG
- 像素编辑器：fps / 画布尺寸参数暴露到对话框（当前导出帧不导出 fps）
- 像素编辑器：清理 GDScript/JSX 里保留的 `[PXR]`/`[pxr-parent]` 诊断日志（功能稳定后）
- 像素编辑器：D:\Pixelorama 源码改动未 commit（git 仓库），如需保留可单独提交
- BBox 查看：压缩参数（maxSizeMB/maxWidthOrHeight）暴露到设置页（当前固定 1MB/1920px）
- BBox 查看：压缩后状态栏显示「原图 X MB → 压缩 Y MB」让用户感知效果
- BBox 查看：多图批量 AI 分析（当前单图）
- BBox 查看：手动框（无 depth）当前默认 PALETTE[0]，可加「手动框固定橙色」区分
- BBox 查看：ZIP 内加 manifest.json 记录每个 png 的原始 bbox 坐标
- agent_run：返回值标注是否消费了图片（当前非视觉 runtime 静默丢图，用户不知情）
- agent_run：给 codex/grok/hermes/pi/open-agent-sdk runtime 补 userAttachments 图片支持（当前只 claude-code/langchain 支持）
- 图像处理拆分：旧 canvas.json 的 imageProcess 节点可写迁移脚本（读 data.params.processor 自动转成对应 ip* 类型）
- 图像处理拆分：12 个节点卡片在 RightPanel 按分类折叠（当前平铺 20 个卡片，滚动可接受但略长）
- 图片压缩：产出网格加「原图 X MB → 压缩 Y MB」体积对比标签（当前无感知反馈）
- 图片压缩：PNG 走 pngquant 无损量化降体积（当前仅 canvas 重绘，体积优化有限）
- 图片压缩：压缩参数暴露到设置页做默认值（当前每节点单独配）

## Suggested Skills

- **write-mini-app-code** (`docs/skills/write-mini-app-code/SKILL.md`) — 编辑 Workflow UI 项目的权威规范，改本 mini-app 前必读
- **handoff** — 继续交接时用
