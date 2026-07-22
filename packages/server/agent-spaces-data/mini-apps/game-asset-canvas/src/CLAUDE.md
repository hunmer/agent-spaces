# 游戏资产生成画布 (game-asset-canvas)

基于 ReactFlow 的游戏资产生成画布。三种自定义节点，节点间连线传图，画布状态持久化到 configs。

## 入口
- `index.jsx`：`<ReactFlowProvider><Canvas/></ReactFlowProvider>`
- `manifest.json`：`mainFile: index.jsx`，`type: react`

## 节点类型 (utils/constants.js NODE_TYPES)
- `textToImage` 文字生成图片 → 调 `text_to_image` 工作流
- `editImage` 编辑图片 → 调 `edit_image` 工作流（需上游图片）
- `imageDisplay` 图片展示 → 可上传/粘贴 URL，也接收上游连线图片，带 source 标记（upload/url/upstream/history）
- `note` 便签 → 纯文本批注，不参与工作流，无 Handle

## 节点可调整大小（NodeResizer）
- 参考 https://reactflow.dev/api-reference/components/node-resizer
- 所有走 NodeShell 的节点选中后显示 NodeResizer 调整框（minWidth 220 / minHeight 120）
- 创建节点时带**顶层 `width`/`height` 字段 + `style: {width,height}`**（二者都给，NodeResizer 依赖）
- resize 拖拽触发 `onNodesChange` 的 dimensions 变更，由 `applyNodeChanges` 回写到节点并持久化
- 自定义节点透传 `selected` prop 给 NodeShell（`isVisible={selected}`）

## 节点删除
- `deleteKeyCode={['Backspace','Delete']}`（v12 默认只含 Backspace，显式补 Delete）
- `onNodesDelete` 兜底清理被删节点相关的 edges
- 注意：焦点在 textarea/input 时 ReactFlow 会忽略删除键（防误删输入），需先点画布空白/节点非输入区让 ReactFlow 重获焦点，节点保持选中再按删除键

## 图片大图查看
- 节点产出、图片展示节点、生成记录都用宿主 `openMediaGallery(items, index)` 打开大图
- items 字段是 `src`（不是 url），`type: 'image'`，命令式调用自动管理生命周期

## 数据流（连线传图）
- 节点 data 结构：`{ params, output: { images: string[] }, status, error, onUpdate, onGenerate, onExportImages, label }`
  - 文生图/编辑节点 `params`：`{ prompt, pickedPrompt, model, aspect, size }`
    - `prompt`：用户输入框提示词；`pickedPrompt`：从提示词库选中的提示词（可选，展示为标签，提交时与 prompt 合并）
- 预览/编辑节点额外有 `data.images`（上游推入）
- 生成完成 → `propagateDownstream`（Canvas.jsx）：取 `edges.filter(source===本节点)`，把产出图片推给 target：
  - editImage → `data.images`（替换）
  - preview → `data.images`（累加去重）
- Handle：source（输出）在底部 Bottom，target（输入）在顶部 Top

## 工作流调用 (utils/workflow.js)
- `window.AgentSpaces.callPluginTool('@agent-spaces/builtin', 'execute_workflow_sync', { workflow_id, input, fault_tolerance:'stop', max_wait_ms:600000 }, { meta })`
- **max_wait_ms=600000（10分钟）**：execute_workflow_sync 默认仅等 120s，jimeng/可灵等异步图片生成往往超过，必须传满上限避免 timedOut
- 结果解析（extractOutput，多路径兜底）：优先 end 节点 output.result/images；其次生成节点 output.data.images（jimeng/aliyun 结构）；最后任意 completed 节点
- 超时容错：timedOut=true 且无产出时抛明确超时错误（不抛隐晦的"未返回图片"）
- **工作流 ID 可在设置页配置**（见下「设置」），节点执行时优先用 settings 里的 ID，fallback 到 constants 默认值
- 默认工作流 ID：text_to_image=`d88dcb7c-7f5f-47c8-962c-89217a2c0ad6`，edit_image=`19f5f8a9-305d-43a6-9b05-584597213a8f`

## 设置 (components/SettingsDialog.jsx)
- 顶栏「⚙ 设置」按钮打开，参考 stickerGenerator/SettingsDialog.jsx
- 可为每种节点类型配置执行时调用的目标工作流（WORKFLOW_SLOTS：文字生成图片 / 编辑图片）
- 工作流通过宿主 `WorkflowListDialog` 选择，列表由 `list_workflows` builtin tool 拉取
- 持久化：存 `configs/settings.json`，走 `invokeService('save_settings')` 单写者
- 读取：`useSettings` hook（getConfig + onAnyConfigChanged 多端同步 + mergeSettings 补默认值）
- 节点执行：Canvas.handleGenerate 按 nodeType 从 settings 取工作流 ID，覆盖节点默认值

## 模型下拉 (utils/constants.js MODEL_OPTIONS)
工作流 run_code 路由关键字（已补全）：
- 含 `gpt`/`dall-e`/`flux`/`nano` -> case-3 AI图片文生图
- 含 `jimeng` -> case-2 即梦AI文生图
- 含 `qwen`/`wanx`/`wan2.7` -> case-1 阿里云AI文生图
- 含 `kling` -> case-0 可灵图像生成
下拉预置：gpt-image-* / dall-e-2,3 / jimeng-* / qwen-image-* / wanx2.1 / flux-pro / kling-v2。

## 内置提示词库 (utils/prompts.js)
- 参考 sprite-sheet-creator 抽取的游戏资产提示词，分四类：角色生成 / 精灵图动画 / 背景场景 / 图像转换
- 每条 `PROMPT_LIBRARY` 项：`{ id, category, title, desc, prompt, scene, aspect? }`
  - `scene` 标记适用场景 `'text'`(文生图) / `'edit'`(编辑图片) / `'both'`
  - `aspect?` 选填，选中该条目时联动设置表单比例下拉（如横版攻击 21:9、视差背景 21:9）
- `getPromptsByScene(scene)` 按场景过滤（表单据自身类型只看相关条目）
- PromptPickerDialog 组件：搜索 + 分类筛选 + 卡片列表；**内置库不可删，自定义库（🆕「自」标记）可编辑/删除**
  - 新增/编辑用内联 PromptEditor 表单（标题/描述/正文/分类/比例）
  - **onPick 传整个 item 对象**（非纯字符串），调用方取 `item.prompt` 填提示词、`item.aspect` 联动比例
- 接入点：TextToImageNode / EditImageNode / NodeFormDialog（提示词 label 右侧「📋 提示词库」按钮）
  - 选中后**不覆盖输入框**，而是存到 `pickedPrompt`，用 PickedPromptBadge（📎 已选提示词条）展示，可 ✕ 清除
  - 用户仍可在输入框自由输入；提交时 `[pickedPrompt, prompt]` 去空去重换行合并后发给工作流
  - 选中带 aspect 的条目会联动比例下拉（详见 utils/prompts.js）

## 自定义提示词库持久化
- 用户增删的提示词存 `configs/prompt-library.json`（数组），内置库不写盘
- service 单写者：`src/services/canvas.js` 的 `save_prompt`（upsert 同 id 覆盖）/ `delete_prompt`（按 id 过滤）
- `hooks/usePromptLibrary.js`：getConfig + onConfigReady + onAnyConfigChanged 读取，invokeService 写入（模式同 useGenerationHistory）
- PromptPickerDialog 内部自调 usePromptLibrary，合并「自定义在前 + 内置在后」展示，调用方无需感知持久化

## 自动布局 (utils/layout.js)
- `autoLayout(nodes, edges, opts)` 用 dagre 计算位置（默认 LR 左→右）
- 工具栏「自动布局」按钮触发，Canvas.handleAutoLayout

## 导出 (utils/export.js)
- `serializeCanvas(nodes, edges)` 去掉注入的函数回调，输出干净 JSON
- `downloadJson(data)` 触发浏览器下载 `game-asset-canvas.json`
- 工具栏「导出 JSON」按钮触发

## 持久化
- **多工作区隔离**：节点和生成记录按工作区隔离，存到 `configs/workspaces/<workspaceId>/` 子目录；设置/提示词库/面板布局仍全局共享（用户级偏好）。
  - 工作区清单：`configs/workspaces.json`，结构 `{ activeId, workspaces: [{id,name,createdAt}] }`
  - 工作区数据：`configs/workspaces/<id>/canvas.json` 和 `configs/workspaces/<id>/generation-history.json`
  - 首次无 `workspaces.json` 时兜底返回 `default` 默认工作区（不阻塞使用）
  - 关键：`safeProjectSubdirPath` 支持子目录路径，`listConfigs` 递归扫描子目录，`configSnapshot`/`configChanged` 广播完整相对路径，所以子目录隔离**无需改宿主**
- 写入走服务端单写者 `src/services/canvas.js`（`save_canvas`/`add_history`/`remove_history`/`clear_history`/`save_settings`/`save_prompt`/`delete_prompt`/`list_workspaces`/`create_workspace`/`rename_workspace`/`switch_workspace`/`delete_workspace`，`invokeService`）
- 节点/历史 handler 接收 `{ workspaceId, ... }`，按 workspaceId 路由到隔离子目录
- 读取用 `getConfig`，订阅 `onAnyConfigChanged` 多端同步（utils/storage.js）
- 生成图片额外下载到 `data/gen/`（`downloadFile`），上传图片存 `data/uploads/`

## 多工作区切换
- 顶栏 `WorkspaceSwitcher`（Popover）：展示工作区列表，支持切换/重命名/删除，底部新建 + 批量删除
- 删除走自定义 `DeleteWorkspacesDialog`（替代原生 confirm）：支持多选 checkbox 批量删除；当前激活工作区不可删（避免清空当前视图，先切走再删）；至少保留一个工作区
- `useWorkspaces` hook：管理 `workspaces.json`（getConfig + onConfigReady + onAnyConfigChanged 三重读取，invokeService 单写者）
- `useCanvasState(workspaceId)` / `useGenerationHistory(workspaceId)`：接收 workspaceId，切换时自动重载该工作区的节点/历史
- Canvas 渲染门控：`activeId` 未就绪或 canvas 未加载完时显示「加载中…」，避免渲染空数据
- 切换/创建/删除流程：调 service 写 `workspaces.json` → 广播 → `useWorkspaces` 更新 activeId → 子 hook 重载

## 节点复制粘贴（Ctrl+C / Ctrl+V）
- 选中节点（支持多选）后 Ctrl+C 复制到模块级内存剪贴板（`utils/clipboard.js`），Ctrl+V 粘贴
- **跨工作区复制**：剪贴板是模块级 ref，切换工作区后 Ctrl+V 仍可粘贴（工作区切换是整画布替换，键盘复制是唯一跨工作区方式）
- 序列化时剥离注入的函数回调（onUpdate/onGenerate 等，与 export.js 一致），仅保留选中节点**内部**连线（外部连线不复制）
- 粘贴生成新 id（节点 + 边 id 重映射），整体偏移 {40,40} 避免与原节点重叠
- 焦点在 input/textarea/contenteditable 时不拦截，让浏览器走原生复制/粘贴
- 实现：`copyNodes`/`pasteNodes`（clipboard.js）+ Canvas 内 `useEffect` 监听 window keydown

## 右侧面板 (components/RightPanel.jsx)
- 用宿主 Tabs 组件，三个 tab：
  - 【新增节点】：节点类型列表，点击添加，或拖拽到画布（draggable + onDrop）
  - 【节点管理】：画布节点列表，点击选中，🎯 定位跳转（setCenter），🗑 删除
  - 【生成记录】：生成历史卡片（节点类型/时间/提示词/缩略图），点击缩略图 MediaGallery 看大图，「用作输入」把图送入新图片展示节点
- Canvas 用 ResizablePanelGroup 左右分栏（左画布 / 右面板，可拖拽调整）
- **面板尺寸持久化**：`defaultLayout` + `onLayoutChange` 用 `{ panelId: percentage }` 格式（如 `{canvas-main:72,canvas-right:28}`），存 `configs/panel-layout.json`。`ResizablePanel` 的 `minSize`/`maxSize` 用字符串百分比 `"18%"`（数字是 px）

## 节点交互抑制
- NodeShell 内容区 + NoteNode textarea 加 `nodrag nopan nowheel` class
- ReactFlow 约定：带这些 class 的元素不触发节点拖拽、画布平移、滚轮缩放
- 解决节点内滚动/选文本/操作输入框误触画布的问题

## 拖拽新增节点（参考 reactflow.dev drag-and-drop）
- 右侧【新增节点】tab 的按钮 `draggable`，onDragStart 写 dataTransfer + 记录类型
- Canvas 画布外层 div 加 `onDrop`/`onDragOver`
- onDrop 用 `reactFlow.screenToFlowPosition({x,y})` 把鼠标坐标转画布坐标，调 `createNodeAt(type, position)`
- 点击按钮则 `createNodeAt(type, null)`（默认错落位置）

## 节点定位跳转
- `useReactFlow()` 提供 `setCenter(x, y, {zoom, duration})`
- 右侧节点管理 🎯 按钮调用 `handleLocateNode`，把视口居中到目标节点

## 执行队列 + 表单提交
- 顶栏右上角【执行队列】按钮（ExecutionQueuePopover）：显示运行中/已完成任务，可中断
- 右侧【新增节点】tab：文生图/编辑图片旁有「⚡生成」按钮，打开 NodeFormDialog 填表单
- 提交流程：NodeFormDialog → Canvas.handleFormSubmit（按 nodeType 补 settings 工作流 ID）→ useExecutionQueue.submit → 入队
- 执行完毕：useExecutionQueue.onComplete 回调 → addImageNodesFromUrls 每张图生成一个图片展示节点入画布 + 写入生成记录（与节点内「生成」一致，nodeId 为 null）
- 持久化：队列是内存态（刷新后清空，非业务数据）

## 节点工具栏（NodeToolbar）
- 节点选中时顶部显示 NodeToolbar（NodeShell 渲染，`isVisible={selected}`，`position={Position.Top} align="end"`）
- 有产出图片（`data.output.images.length > 0`）时显示「导出图片」按钮
- 点击调 Canvas 注入的 `data.onExportImages(images)` → 复用 `addImageNodesFromUrls`，把每张产出图作为独立图片展示节点错落加入画布
- onExportImages 由 Canvas.decoratedNodes 注入（与 onUpdate/onGenerate 同级）

## 工作流中断（host 层能力）
- `window.AgentSpaces.subscribeWorkflowEvents(cb)`：监听 workflow:* 事件（workflow:started 含 executionId）
- `window.AgentSpaces.stopWorkflow(executionId)`：发送 workflow:stop，引擎 stop 后阻塞的 execute_workflow_sync 在 ~500ms 内 resolve
- `window.AgentSpaces.sendWorkflowControl(event, data)`：通用 workflow 控制事件发送
- 实现：use-mini-app-host-api.tsx 用 getWS(projectId).on/send，挂到 window.AgentSpaces
- useExecutionQueue.submit 并行订阅 workflow:started 拿 executionId，cancel 时 stopWorkflow

## 依赖（宿主已暴露，无需项目内安装）
- `@xyflow/react`（含 ReactFlow/NodeResizer/NodeToolbar 等，通过 bare import 或 window.AgentSpacesUI 取用）
- `@dagrejs/dagre`（自动布局，bare import `dagre, { graphlib }`）
- `@agent-spaces/ui`：Tabs/ScrollArea/ResizablePanel/openMediaGallery 等宿主组件
- ReactFlow CSS 由宿主全局加载

## 重要约定
- ReactFlow 以 useCanvasState 的 nodes/edges 为单一数据源（onNodesChange/onConnect 直接 setNodes/setEdges）
- 节点 data 的 onUpdate/onGenerate 由 Canvas 注入，不在持久化数据里（序列化时是函数，JSON.stringify 会自动丢弃，不影响存储）
