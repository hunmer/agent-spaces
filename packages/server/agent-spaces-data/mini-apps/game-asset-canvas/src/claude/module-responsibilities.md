# 模块职责

## 节点类型清单（utils/constants.js NODE_TYPES）

| type | label | 说明 | 是否 receiver |
|------|-------|------|--------------|
| textToImage | 文字生成图片 ✍️ | 调 text_to_image 工作流 | 否 |
| editImage | 编辑图片 🖌️ | 调 edit_image 工作流（需上游图） | 是 |
| imageDisplay | 图片展示 🖼️ | 上传/URL/上游/历史均可入 | 是 |
| imageProcess | 图像处理 🔧 | 旧单节点（兼容已有 canvas.json，新画布不再添加） | 是 |
| ipGifSplit/ipGifMerge/ipSpriteSplit/ipSpriteMerge/ipPixelate/ipResizeNearest/ipInnerStroke/ipChromaKey/ipWhiteKey/ipComposeOverlay/ipEnhance/ipCompress | 12 个拆分节点 🔧 | 一个处理器 = 一个节点类型，共用 `ImageProcessNode` 组件 | 是 |
| imageEditor | 图片编辑 🎨 | Painterro 浏览器端画笔/文字/裁切/马赛克 | 是（单图） |
| pixelEditor | 像素编辑器 👾 | 本地 Pixelorama web（Godot 4.7 导出） | 是（多图） |
| uiSplitter | 雪碧图拆分 🧩 | fabric 画布框选 + 自动检测切片，多图 | 是 |
| bboxViewer | UI拆分 📦 | JSON bbox 可视化 + AI 分析 + 批量导出 | 是（单图） |
| promptReverse | 反推提示词 🔍 | agent_run + 多图 → 文本产出 | 是 |
| textToVoice | 生成配音 🔊 | 调 text_to_voice 工作流，`<audio>` 产出 | 否 |
| videoGenerator | 生成视频 🎬 | 调 video_generator 工作流，`<video>` 产出 | 是（参考图） |
| imageCompare | 图片对比 🔀 | img-comparison-slider 双图滑块 | 是 |
| note | 便签 📝 | 纯文本备注，不参与工作流，无 Handle | 否 |
| cutout | 抠图 ✂️ | 统一抠图节点，select 切 4 种 mode | 是 |

> 「分组」不是节点类型，是 `WorkflowGroupOverlay`（groups 数据驱动，与 nodes/edges 平级），复用 workflow-editor 同源组件。

## hooks（src/hooks/，17 个）

| hook | 职责 |
|------|------|
| useWorkspaces | 工作区清单（workspaces.json：getConfig + onConfigReady + onAnyConfigChanged 三重读取；invokeService 写） |
| useCanvasState(workspaceId) | 节点/边/分组单一数据源 + 按工作区隔离持久化（防抖 600ms）+ 多端同步 |
| useWorkflow | callPluginTool 调工作流（max_wait_ms=600000）|
| useGenerationHistory(workspaceId) | 生成记录持久化（按工作区隔离） |
| useSettings | settings.json 读写（全局共享，mergeSettings 补默认值） |
| useExecutionQueue | 执行队列（submit/cancel/onComplete/onError；并行订阅 workflow:started 拿 executionId） |
| usePromptLibrary | 自定义提示词库持久化（prompt-library.json，全局共享） |
| usePanelLayout | 面板布局 + MiniMap 显隐持久化 |
| useImageOutputs | addImageNodesFromUrls / handleExportImages（产出图转节点） |
| useSelectionClipboard | 选中 + 复制粘贴（Ctrl+C/V）+ 对齐分布 + 批量删除 |
| useGroupOperations | 分组数据 ops + overlay 移动/连线 + 整组平移 |
| useNodeCrud | 节点 CRUD + 定位/布局/导出 + 尺寸自适应 + 表单提交 |
| useNodeExecutions | 工作流/媒体/本地算法/抠图/反推提示词执行回调（共用 processingControllers 取消） |
| useCanvasAgentRpc | WS message 监听（ref 持有最新值，effect 只订阅一次） |
| useDecoratedNodes | 节点 data 注入回调（与 settings/selectionCount 联动） |
| useAssetLibrary | 素材库（asset-library.json，按工作区隔离） |
| useViewportActivation | 节点首次进入视窗后永久激活正文，离屏不卸载已加载图片 |

## utils 纯函数/单例（src/utils/，16 个文件 + image-ops/）

### 顶层 utils
| 文件 | 职责 |
|------|------|
| constants.js | 全局常量（NODE_TYPES/NODE_META/IMAGE_PROCESSORS/CUTOUT_PARAMS/WORKFLOWS/Agent 提示词等） |
| canvas-constants.js | Canvas 依赖聚合点（NODE_COMPONENTS/ADD_NODE_ITEMS/initialData/DEFAULT_SIZE/PANEL_*） |
| canvas-id.js | genId + seq / autoPosition + positionIndex（模块级单例，连续建节点不撞位置） |
| processing-controllers.js | AbortController 注册表单例（register/abort/clear/get），跨 hook 共享取消 |
| input-images.js | computeInputImages（fixed-point 多跳转发派生输入图） |
| workflow.js | runWorkflow/generateImages/generateAudio/generateVideo/runAgentVisionText + URL 工具 |
| cutout.js | runCutout 统一执行入口（4 mode 分流：本地算法/工作流/rembg 插件） |
| storage.js | loadCanvas/saveCanvas/onAnyConfigChanged + debounce + 面板布局读写 |
| settings.js | DEFAULT_SETTINGS/WORKFLOW_SLOTS/mergeSettings |
| prompts.js | 内置提示词库（4 类 15 条：角色/精灵/背景/转换） |
| layout.js | dagre autoLayout |
| export.js | serializeCanvas/downloadJson |
| clipboard.js | copyNodes/pasteNodes/hasClipboard（模块级内存剪贴板，跨工作区） |
| align-distribute.js | computeAlignment（对齐分布纯算法） |
| group-helpers.js | collectGroupNodeIds/findLeafNodeIds |

### image-ops（src/utils/image-ops/，11 个文件）
| 文件 | 职责 |
|------|------|
| index.js | PROCESSORS 注册表 + runProcessor 统一入口（输入解码 → run → 产出转 URL） |
| cdn.js | vendor/CDN 库加载封装（getGifEnc/getGifUct/getImageQ/getJsZip/getFabric/getPainterro/getImageCompression 等） |
| io.js | urlToImageData/imageDataToBlob/imageDataToUrl（统一 canvas I/O） |
| imageDataOps.js | 纯函数 ImageData 操作（缩放/裁切/alpha 提取） |
| gif.js | GIF 拆帧 decodeGifToFrames + 合成 encodeFramesToGif |
| spriteSheet.js | splitSpriteSheet/splitByTransparent/composeSpriteSheet |
| sprite-splitter.js | Sprite Sheet 拆分辅助 |
| pixelate.js | pixelate（降采样 + Wu 量化，依赖 image-q） |
| matte.js | chromaKey/whiteKey/erodeAlpha/hexToRgb |
| stroke.js | resizeNearest/innerStroke(BFS)/crop |
| compose.js | composeLayers（多图层 alpha-over + 混合模式） |

## components（src/components/）

### 顶层（17 个）
- `Canvas.jsx`：编排层（hook 装配 + ReactFlow 变更回调 + JSX）
- `Toolbar.jsx`：顶栏（工作区切换插槽/自动布局/画布样式/导出/设置/队列插槽/清空）
- `RightPanel.jsx`：右侧 Tabs（新增节点 / 节点管理 / 生成记录）
- `SettingsDialog.jsx`：设置页（工作流槽位 + BBox AI 分析 + 反推提示词 AI）
- `ExecutionQueuePopover.jsx`：执行队列弹窗 + 中断
- `NodeFormDialog.jsx`：文生图/编辑图片表单（提示词库 + pickedPrompt + 合并提交）
- `NodeExecuteDialog.jsx`：节点执行弹窗（不建画布节点，产出只写生成记录）
- `WorkspaceSwitcher.jsx`：工作区切换 popover（切换/重命名/删除/创建/批量删除）
- `DeleteWorkspacesDialog.jsx`：批量删除工作区确认弹窗（多选 checkbox）
- `CreateWorkspaceDialog.jsx`：新建工作区对话框
- `ConnectionLine.jsx`：自定义连线样式
- `PromptPickerDialog.jsx`：提示词库选择器（搜索/分类/增删）
- `UiSplitterDialog.jsx`：雪碧图拆分对话框（fabric + 连通域检测 + 多图切片导出）
- `BBoxViewerDialog.jsx`：UI 拆分对话框（fabric + JSON bbox + AI 分析 + ZIP 导出）
- `PixelEditorDialog.jsx`：Pixelorama iframe + postMessage 双向通信
- `FileUpload.jsx`：通用文件上传（onChange uploadFile 拿 http URL）
- `AssetLibrary.jsx`：素材库面板（分类 + 资产网格）

### canvas 子目录（5 个）
- `AddNodeMenuItems.jsx`：render-prop 菜单项（同时适配 ContextMenu 和 DropdownMenu）
- `MultiSelectToolbar.jsx`：底部多选浮出 toolbar（分组/对齐/删除）
- `DropNodeMenu.jsx`：拖拽落空菜单
- `CanvasContextMenu.jsx`：右键菜单
- `GroupOverlays.jsx`：ViewportPortal 内 WorkflowGroupOverlay 列表

### nodes 子目录（19 个）
- `NodeShell.jsx`：节点外壳（Handle/状态/NodeResizer/NodeToolbar/nodrag nopan nowheel）
- `TextToImageNode.jsx` / `EditImageNode.jsx`：提示词库按钮 + pickedPrompt + 合并提交
- `ImageDisplayNode.jsx`：上传用 uploadFile 拿 http URL
- `ImageProcessNode.jsx`：12 个 ip* 节点 + 旧 imageProcess 共用（按 nodeType 反查 processorId，无下拉）
- `ImageEditorNode.jsx`：Painterro 浏览器端编辑
- `PixelEditorNode.jsx`：Pixelorama iframe
- `UiSplitterNode.jsx`：雪碧图拆分（多图）
- `BBoxViewerNode.jsx`：UI 拆分（bbox 可视化）
- `TextToVoiceNode.jsx` / `VideoGeneratorNode.jsx`：媒体节点
- `ImageCompareNode.jsx`：图片对比
- `PromptReverseNode.jsx`：反推提示词
- `CutoutNode.jsx`：统一抠图（4 mode select）
- `NoteNode.jsx`：便签
- `ImageResult.jsx`：产出网格（max=0 不截断）
- `UpstreamImageList.jsx`：上游连线图只读占位
- `PickedPromptBadge.jsx`：已选提示词展示条
- `ParamField.jsx`：通用参数字段（number/color/select/bool/text + showWhen 条件显隐）

## services（src/services/，1 个）

- `canvas.js`：服务端单写者。handlers：
  - 画布：`save_canvas` / `load_canvas` / `clear_canvas`（按 workspaceId 路由到 `configs/workspaces/<id>/canvas.json`）
  - 历史：`add_history` / `remove_history` / `clear_history`（同上隔离，HISTORY_MAX=200）
  - 设置：`save_settings`（全局共享）
  - 提示词库：`save_prompt`（upsert）/ `delete_prompt`（全局共享）
  - 工作区：`list_workspaces` / `create_workspace` / `rename_workspace` / `switch_workspace` / `delete_workspace`
  - 素材库：`list_assets` / `create_category` / `rename_category` / `delete_category` / `add_asset` / `remove_asset`（按工作区隔离，ASSET_MAX_PER_CATEGORY=500）

## API/Tools（项目根 src/）

- `api.js`：Agent 可调用的画布操作 API。handlers：`add_node` / `add_nodes` / `list_nodes` / `get_canvas` / `connect_nodes` / `connect_batch` / `delete_node` / `delete_edge` / `update_node` / `get_selection`。通过 `ctx.requestClient` RPC 到浏览器执行。
- `tools.js`：Agent 工具签名/描述（VALID_NODE_TYPES/NODE_LABELS/NODE_TYPE_DESC），供宿主注册到 LLM function calling。
