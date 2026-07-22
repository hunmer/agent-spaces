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
    Canvas.jsx                  # 主画布：ReactFlow + 队列 + 表单 + 设置 + 多工作区 + 复制粘贴，状态单一数据源
    Toolbar.jsx                 # 顶栏（工作区切换插槽/自动布局/导出/设置/队列插槽/清空）
    RightPanel.jsx              # 右侧三 tab：新增节点/节点管理/生成记录
    SettingsDialog.jsx          # 设置页（配工作流槽位，参考 stickerGenerator）
    ExecutionQueuePopover.jsx   # 执行队列弹窗 + 中断
    NodeFormDialog.jsx          # 文生图/编辑图片表单弹窗
    WorkspaceSwitcher.jsx       # 工作区切换 popover（切换/重命名/删除/创建/批量删除）
    DeleteWorkspacesDialog.jsx  # 批量删除工作区确认弹窗（多选 checkbox，替代原生 confirm）
    nodes/
      NodeShell.jsx             # 节点外壳（Handle/状态/NodeResizer/NodeToolbar/nodrag nopan nowheel）
      TextToImageNode.jsx       # 提示词库按钮 + pickedPrompt 标签 + 合并提交
      EditImageNode.jsx         # 同上
      ImageDisplayNode.jsx      # 上传用 window.AgentSpaces.uploadFile 拿 http URL
      ImageResult.jsx           # 产出网格，openMediaGallery 看大图（注意：items 不可二次 map）
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
    constants.js                # WORKFLOWS/NODE_TYPES/MODEL_OPTIONS/NODE_META + 工作区路径常量/DEFAULT_WORKSPACE_ID
    workflow.js                 # runWorkflow/generateImages（多路径提取图片）
    storage.js                  # loadCanvas/saveCanvas/onAnyConfigChanged/panel布局/下载（均接收 workspaceId）
    clipboard.js                # 节点剪贴板：copyNodes/pasteNodes/hasClipboard（模块级内存，跨工作区可粘贴）
    layout.js                   # dagre autoLayout
    export.js                   # serializeCanvas/downloadJson
    settings.js                 # DEFAULT_SETTINGS/WORKFLOW_SLOTS
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
- `packages/web/src/components/mini-apps/use-mini-app-host-api.tsx`（M，workflow WS 能力）
- `packages/server/src/services/mini-app-services.ts`（M，新增 startServicesWatcher）
- `packages/server/src/app.ts`（M，listen 回调调 startServicesWatcher）
- `packages/server/agent-spaces-data/mini-apps/game-asset-canvas/`（新增整目录 + 多轮迭代：基础画布 → 提示词库 → 多工作区隔离 → 复制粘贴 → 批量删除弹窗）
- 两个 workflow.json（M，补全 model 路由关键字）
- **多工作区/复制粘贴轮次无宿主改动**（纯 mini-app src + service，service 由 watcher 热重载，前端刷新即生效）

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

## Suggested Skills

- **write-mini-app-code** (`docs/skills/write-mini-app-code/SKILL.md`) — 编辑 Workflow UI 项目的权威规范，改本 mini-app 前必读
- **handoff** — 继续交接时用
