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

## 已暴露到 mini-app 的第三方能力

通过 allowlist + ui-exports 双重暴露（新增库必须两处都改）：
- `@xyflow/react@12.10.2` — ReactFlow, NodeResizer, NodeToolbar, useReactFlow 等
- `@dagrejs/dagre@3.0.0` — 自动布局（default + graphlib）
- `@agent-spaces/ui` — 宿主 UI 组件（Dialog/Tabs/Select/Popover/MediaGallery/openMediaGallery/ResizablePanel/WorkflowListDialog 等）+ lucide 图标

## host 层新增能力（本轮加的）

`window.AgentSpaces` 上新增（use-mini-app-host-api.tsx，用 `getWS(projectId).on/send`）：
- `subscribeWorkflowEvents(cb)` — 监听 `workflow:*` 事件（`workflow:started` 含 executionId）
- `stopWorkflow(executionId)` — 发 `workflow:stop` 中断执行
- `sendWorkflowControl(event, data)` — 通用 workflow 控制

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
      ImageProcessNode.jsx      # 图像处理节点：FileUpload 上传 + 连线图只读占位 + 处理器下拉 + 动态参数 + 执行
      ImageEditorNode.jsx       # 图片编辑节点：FileUpload 单图 + 连线图只读占位 + Painterro 浏览器端编辑（画笔/文字/裁切/马赛克）
      ImageResult.jsx           # 产出网格（max=0 不截断，GIF 拆帧多帧全展示），openMediaGallery 看大图（注意：items 不可二次 map）
      PickedPromptBadge.jsx     # 已选提示词展示条（📎标签+✕清除），三处表单复用
      NoteNode.jsx
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
    constants.js                # WORKFLOWS/NODE_TYPES/MODEL_OPTIONS/NODE_META（含 imageEditor）+ IMAGE_PROCESSORS（10 处理器）+ IMAGE_PROCESSOR_CATEGORIES + defaultProcessorParams
    workflow.js                 # runWorkflow/generateImages（多路径提取图片）
    storage.js                  # loadCanvas/saveCanvas/onAnyConfigChanged/panel布局/下载（均接收 workspaceId）
    clipboard.js                # 节点剪贴板：copyNodes/pasteNodes/hasClipboard（模块级内存，跨工作区可粘贴）
    layout.js                   # dagre autoLayout
    export.js                   # serializeCanvas/downloadJson
    settings.js                 # DEFAULT_SETTINGS/WORKFLOW_SLOTS
    image-ops/                  # FrameRonin 移植的图像处理算法（统一 ImageData 出入参，详见「FrameRonin 工具移植」）
      cdn.js                    # CDN 库加载封装（getGifEnc/getGifUct/getImageQ/getJsZip），URL 集中
      io.js                     # urlToImageData/imageDataToBlob/imageDataToUrl（统一 canvas I/O）
      imageDataOps.js           # 纯函数 ImageData 操作（缩放/裁切/alpha 提取，无 DOM）
      gif.js                    # GIF 拆帧 decodeGifToFrames + 合成 encodeFramesToGif
      spriteSheet.js            # splitSpriteSheet/splitByTransparent/composeSpriteSheet
      pixelate.js               # pixelate（降采样 + Wu 量化，依赖 image-q）
      matte.js                  # chromaKey/whiteKey/erodeAlpha/hexToRgb
      stroke.js                 # resizeNearest/innerStroke(BFS)/crop
      compose.js                # composeLayers（多图层 alpha-over + 混合模式）
      index.js                  # PROCESSORS 注册表 + runProcessor 统一入口
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
- `packages/web/src/components/mini-apps/use-mini-app-host-api.tsx`（M，workflow WS 能力 + **loadCdnModule CDN 加载能力**）
- `packages/server/src/services/mini-app-services.ts`（M，新增 startServicesWatcher）
- `packages/server/src/app.ts`（M，listen 回调调 startServicesWatcher）
- `packages/server/agent-spaces-data/mini-apps/game-asset-canvas/`（新增整目录 + 多轮迭代：基础画布 → 提示词库 → 多工作区隔离 → 复制粘贴 → 批量删除弹窗 → **FrameRonin 工具移植为图像处理节点**）
- 两个 workflow.json（M，补全 model 路由关键字）
- **多工作区/复制粘贴轮次无宿主改动**（纯 mini-app src + service，service 由 watcher 热重载，前端刷新即生效）

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

## Suggested Skills

- **write-mini-app-code** (`docs/skills/write-mini-app-code/SKILL.md`) — 编辑 Workflow UI 项目的权威规范，改本 mini-app 前必读
- **handoff** — 继续交接时用
