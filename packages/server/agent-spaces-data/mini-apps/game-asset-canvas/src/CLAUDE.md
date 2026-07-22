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
- 节点 data 结构：`{ params, output: { images: string[] }, status, error, onUpdate, onGenerate, label }`
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

## 自动布局 (utils/layout.js)
- `autoLayout(nodes, edges, opts)` 用 dagre 计算位置（默认 LR 左→右）
- 工具栏「自动布局」按钮触发，Canvas.handleAutoLayout

## 导出 (utils/export.js)
- `serializeCanvas(nodes, edges)` 去掉注入的函数回调，输出干净 JSON
- `downloadJson(data)` 触发浏览器下载 `game-asset-canvas.json`
- 工具栏「导出 JSON」按钮触发

## 持久化
- 画布状态（nodes/edges）存 `configs/canvas.json`
- 生成记录存 `configs/generation-history.json`（最新在前，上限 200 条）
- 写入走服务端单写者 `src/services/canvas.js`（`save_canvas`/`add_history`/`remove_history`/`clear_history`，`invokeService`）
- 读取用 `getConfig`，订阅 `onAnyConfigChanged` 多端同步（utils/storage.js）
- 生成图片额外下载到 `data/gen/`（`downloadFile`），上传图片存 `data/uploads/`

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

## 依赖（宿主已暴露，无需项目内安装）
- `@xyflow/react`（含 ReactFlow/NodeResizer/NodeToolbar 等，通过 bare import 或 window.AgentSpacesUI 取用）
- `@dagrejs/dagre`（自动布局，bare import `dagre, { graphlib }`）
- `@agent-spaces/ui`：Tabs/ScrollArea/ResizablePanel/openMediaGallery 等宿主组件
- ReactFlow CSS 由宿主全局加载

## 重要约定
- ReactFlow 以 useCanvasState 的 nodes/edges 为单一数据源（onNodesChange/onConnect 直接 setNodes/setEdges）
- 节点 data 的 onUpdate/onGenerate 由 Canvas 注入，不在持久化数据里（序列化时是函数，JSON.stringify 会自动丢弃，不影响存储）
