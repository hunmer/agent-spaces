# 模块职责

## 节点类型清单（utils/constants.js NODE_TYPES，38 个）

| type | label | 说明 | 是否 receiver |
|------|-------|------|--------------|
| text | 文字 📝 | Markdown 文本节点，产出 `data.output.text` 经文本边派生 | 否 |
| storyboard | 分镜创作 🎞️ | 文案拆镜 + 角色引用 + 分镜图片/视频/语音生成（scene 级 handle） | 否 |
| textToImage | 文字生成图片 ✍️ | 调 text_to_image 工作流 | 否 |
| editImage | 编辑图片 🖌️ | 调 edit_image 工作流（需上游图；#1/#2 参考图 mention） | 是 |
| imageDisplay | 图片展示 🖼️ | 上传/URL/上游/历史均可入；有连入边时优先派生输入转发 | 是 |
| imageProcess | 图像处理 🔧 | 旧单节点（兼容已有 canvas.json，新画布不再添加） | 是 |
| ipGifSplit/ipGifMerge/ipSpriteSplit/ipSpriteMerge/ipPixelate/ipResizeNearest/ipInnerStroke/ipChromaKey/ipWhiteKey/ipComposeOverlay/ipEnhance/ipCompress | 12 个拆分节点 🔧 | 一个处理器 = 一个节点类型，共用 `ImageProcessNode` 组件；`ipSpriteMerge` 对外名「网格拼接」挂 `GridStitchDialog` | 是 |
| imageEditor | 图片编辑 🎨 | Painterro 浏览器端画笔/文字/裁切/马赛克 | 是（单图） |
| maskPaint | 蒙版绘制 🎭 | 浏览器端蒙版画笔（MaskPaintNode + MaskPaintDialog） | 是 |
| pixelEditor | 像素编辑器 👾 | 本地 Pixelorama web（Godot 4.7 导出） | 是（多图） |
| photopea | 在线PS 🖌️ | iframe 加载 Photopea（云端），saveToOE 回传 | 是 |
| uiSplitter | 雪碧图拆分 🧩 | fabric 画布框选 + 自动检测切片，多图 | 是 |
| bboxViewer | UI拆分 📦 | JSON bbox 可视化 + AI 分析 + 批量导出 | 是（单图） |
| cutout | 抠图 ✂️ | 统一抠图节点，select 切 4 种 mode（whiteKey/chromaKey/workflow/rembg） | 是 |
| depthExtract | 提取深度图 🏔️ | 调 workflow.depth-anything 插件批量提取单目深度图 | 是 |
| directorDesk | 3D导演台 🎥 | iframe 加载 vendor/director-desk-web，截图经 postMessage 回传 | 否 |
| workflowRunner | 执行工作流 ⚙️ | 选任意工作流 + 自定义 JSON 参数 → 执行 → 提取 URL 字段展示 | 否 |
| promptReverse | 反推提示词 🔍 | agent_run + 多图 → 文本产出（NodeOutput 外置展示） | 是 |
| textToVoice | 生成配音 🔊 | 调 text_to_voice 工作流，`<audio>` 产出 | 否 |
| audioDisplay | 音频展示 🔊 | 上传/播放/转发音频，带输入输出 Handle | 否 |
| videoGenerator | 生成视频 🎬 | 调 video_generator 工作流，`<video>` 产出 | 是（参考图） |
| videoDisplay | 视频展示 🎬 | 上传/播放/转发视频；连入边时优先派生输入 | 是 |
| videoEditor | 视频编辑器 🎞️ | 双播放器/帧选区/动画组/精灵图导出；ffmpeg 截帧；上游视频去重合并非覆盖 | 是 |
| imageCompare | 图片对比 🔀 | img-comparison-slider 双图滑块 | 是 |
| spineEditor | 骨骼编辑器 🦴 | Spine 骨骼摆姿/录制/换肤（iframe + PixiJS） | 是 |
| spineDisplay | Spine展示 🦴 | Spine 运行时展示 | 是 |
| note | 便签 📝 | 纯文本备注，不参与工作流，无 Handle | 否 |

> 「分组」不是节点类型，是 `groups` 数据（WorkflowGroupOverlay 渲染，与 nodes/edges 平级）。

## hooks（src/hooks/，26 个）

| hook | 职责 |
|------|------|
| useWorkspaces | 工作区清单（workspaces.json 三重读取；invokeService 写） |
| useCanvasState(workspaceId) | 节点/边/分组单一数据源 + 按工作区隔离持久化 + 多端同步 |
| useWorkflow | callPluginTool 调工作流（max_wait_ms=600000；directory 落地） |
| useGenerationHistory(workspaceId) | 生成记录持久化（按工作区隔离） |
| useSettings | settings.json 读写（全局共享，mergeSettings 补默认值） |
| useExecutionQueue | 执行队列（submit/cancel/onComplete/onError；cancel 立即清节点状态 + 丢弃晚到结果） |
| usePromptLibrary | 自定义提示词库持久化（全局共享） |
| usePanelLayout | 面板布局 + MiniMap 显隐持久化 |
| useImageOutputs | addImageNodesFromUrls / handleExportImages（产出图转节点） |
| useImageSelection | 跨节点图片多选（ImageSelectionContext + 批量收藏/删除/导出） |
| useSelectionClipboard | 选中 + 复制粘贴 + 对齐分布 + 批量删除；粘贴属性 PastePropertiesDialog 分流 |
| useGroupOperations | 分组数据 ops + overlay 移动/连线 + 整组平移 |
| useGroupExecution | 分组多实例（count/assets）执行：run 切换/串行运行所有/executionTarget 写回 |
| useNodeCrud | 节点 CRUD + 定位/布局/导出 + 尺寸自适应 + 表单提交 |
| useNodeExecutions | 工作流/媒体/本地算法/抠图/反推提示词执行回调（共用 processingControllers 取消） |
| useCanvasAgentRpc | Agent WS RPC 入口（ref 持有最新值，effect 只订阅一次；13 个 case） |
| useDecoratedNodes | 节点 data 注入回调（videoEditor 上游视频去重合并；imageResources 派生） |
| useAssetLibrary | 素材库（按工作区隔离） |
| useCharacterLibrary | 分镜角色库（storyboard-characters.json，按工作区隔离） |
| useStoryboardOperations | AI 拆镜、分镜媒体生成、场景输出写回 |
| useSpineReskinHistory | Spine 换肤生成记录（configs/spine-reskin-history.json） |
| useViewportActivation | 节点首次进入视窗后永久激活正文，离屏不卸载已加载图片 |
| useAlignmentGuides | 单节点拖拽网格吸附后的辅助线对齐（6px 阈值，多选不介入） |
| useCanvasDragAutoPan | 文件/图片拖拽靠近画布 72px 边缘热区时自动平移（受控 setViewport） |
| useLastParams(workspaceId) | 每工作区每节点类型「上次提交参数」（last-params.json，建节点时合并） |
| useNodePresets | 节点预设库（全局 node-presets.json，选中子图模板跨工作区复用） |

## utils 纯函数/单例（src/utils/，约 50 个顶层 + image-ops/ + reskin/）

### 核心
| 文件 | 职责 |
|------|------|
| constants.js | 全局常量（NODE_TYPES/NODE_META/IMAGE_PROCESSORS/CUTOUT_PARAMS/WORKFLOWS/OPTIONS 枚举/Agent 提示词） |
| canvas-constants.js | Canvas 依赖聚合点（NODE_COMPONENTS/ADD_NODE_ITEMS/initialData/DEFAULT_SIZE/NODE_PARAMS_SCHEMA） |
| canvas-id.js | genId + seq / autoPosition + positionIndex（模块级单例） |
| processing-controllers.js | AbortController 注册表单例，跨 hook 共享取消 |
| input-images.js | computeInputImages（fixed-point 多跳转发派生输入图 + imageResources） |
| connection-targets.js | 按素材类型解析兼容目标输入；分镜素材选择后的目标过滤 |
| text-variable-bindings.js | 文本边变量绑定派生（{变量} 替换优先级链） |
| workflow.js | runWorkflow/generateImages/generateAudio/generateVideo/persistImagesToBackend + URL 工具 |
| storyboard.js / storyboard-assets.js / storyboard-generation.js | 分镜提示词与解析 / scene handle 与素材规范化 / 生成参数兼容 |
| cutout.js | runCutout 统一执行入口（4 mode 分流） |
| storage.js | loadCanvas/saveCanvas/onAnyConfigChanged + debounce + 面板布局读写 |
| settings.js | DEFAULT_SETTINGS/WORKFLOW_SLOTS/mergeSettings |
| prompts.js | 内置提示词库 |
| layout.js / export.js / clipboard.js / canvas-gallery.js | dagre 布局 / 画布导出 / 模块级内存剪贴板 / Gallery 打开辅助 |

### 画布交互/边/分组
| 文件 | 职责 |
|------|------|
| canvas-edges.js / edge-display.js / floating-edge-utils（canvas/） | 边构建 / 边颜色与选中态展示 / FloatingHandle 方向 |
| align-distribute.js / alignment-guides.js | 对齐分布算法 / 辅助线计算 |
| drag-auto-pan.js | 拖拽边缘自动平移算法 |
| group-helpers.js / group-execution.js / group-minimap.js / group-output-binding.js / agent-rpc-groups.js | 分组收集 / 多实例执行身份与串行 / 小地图 / 输出绑定 / Agent 分组编排 |
| batch-run.js | 批量运行参数构建与并发控制 |
| canvas-history.js | 画布版本快照（create/list/restore，canvas-versions.json） |
| canvas-context-menu.js | 右键菜单项定义（复制 JSON/创建下游展示节点） |
| compact-node-selection.js | 分组激活时 Ctrl+A 只选组内节点 |
| list-keys.js | occurrenceKeys（同 URL 多次出现的唯一 key） |
| clipboard-images.js | 复制图片到系统剪贴板 |

### 节点功能
| 文件 | 职责 |
|------|------|
| node-preset.js | 节点预设序列化/反序列化（子图模板） |
| output-resources.js | 输出资源协议（images+resources 增删改查、groupName/label 分组） |
| grid-stitch.js | 网格拼接编辑态（gridStitchData 顺序表恢复） |
| frame-selection.js / video-frame-extraction.js / video-crop.js | 帧选区 / ffmpeg 帧截取 / 归一化 cropRegion |
| image-display-size.js | imageDisplay 尺寸自适应 |
| depth.js | depth-anything 插件调用 |
| spine-url.js / ui-splitter-helpers.js | Spine 资源 URL / 拆分器辅助 |
| reskin/（9 个） | Spine 换肤管线（SAM 分割/atlas 预览/掩码重绘/组合构建/历史） |

### image-ops（src/utils/image-ops/，11 个）
`index.js` PROCESSORS 注册表 + runProcessor 统一入口；`cdn.js` vendor/CDN 加载封装；`io.js` canvas I/O；`imageDataOps.js` 纯 ImageData 操作；`gif.js` GIF 拆帧/合成；`spriteSheet.js` Sheet 拆分/合成/网格拼接；`sprite-splitter.js`；`pixelate.js`（降采样+Wu 量化）；`matte.js`（chromaKey/whiteKey/erodeAlpha）；`stroke.js`（resizeNearest/innerStroke/crop）；`compose.js`（多图层合成）。

## components（src/components/）

### 顶层（约 45 个，关键件）
- `Canvas.jsx`：编排层（hook 装配 + ReactFlow 回调 + nodeCallbacks useMemo）
- `Toolbar.jsx`：顶栏（工作区切换/自动布局/画布样式/导出/设置/队列/清空/调试菜单「一键补缩略图」）
- `RightPanel.jsx` → `right-panel/`（8 个）：新增节点/预设/节点管理/生成记录/素材库/角色库/Chat 插槽装配
- `SettingsDialog.jsx`：设置页（工作流槽位 + 各 AI Agent 配置：BBox/反推/提示词优化/分镜）
- `ExecutionQueuePopover.jsx`：执行队列弹窗 + 中断
- `NodeFormDialog.jsx`：文生图/编辑图片表单；`NodeExecuteDialog.jsx`：不建节点的执行弹窗
- `PastePropertiesDialog.jsx`：粘贴节点时选择应用字段（产出/派生字段不参与）
- `GroupConfirmDialog.jsx` / `DeleteGroupDialog.jsx` / `BatchRunConfirmDialog.jsx`：分组/批量确认
- `CreateWorkspaceDialog.jsx`（创建/重命名双模式，含数据保存目录 FolderPicker）/ `WorkspaceSwitcher.jsx` / `DeleteWorkspacesDialog.jsx`
- `CanvasVersionPanel.jsx`：画布版本快照面板
- 大对话框：`UiSplitterDialog`（雪碧图拆分）/ `GridStitchDialog`（网格拼接）/ `BBoxViewerDialog`（UI 拆分）/ `PixelEditorDialog`（Pixelorama）/ `PhotopeaDialog` / `DirectorDeskDialog`（3D 导演台）/ `VideoEditorDialog`（视频编辑）/ `CutoutDialog` / `ImageEditorDialog`（Painterro）/ `MaskPaintDialog`（蒙版+取色）/ `PromptOptimizeDialog` / `PromptPickerDialog` / `StoryboardGenerationDialog`（分镜四 Tab 参数）/ `ConnectionTargetDialog`（多素材连接选素材）/ `SpineEditorDialog` / `ExportImagesDialog` / `AssetLibraryPickerDialog`
- 通用件：`FileUpload.jsx`（缩略图网格 + Gallery 预览 + 排序 + onEditItem）/ `ImageHoverCard.jsx` / `FrameSequencePlayer.jsx` / `GridAnimationPreview.jsx` / `AutoResizeTextarea.jsx` / `BorderBeam.jsx`

### canvas 子目录（16 个）
`CanvasWorkspace`（主视图装配）/ `CanvasOverlayDialogs`（弹窗层聚合）/ `CanvasContextMenu` / `DropNodeMenu` / `AddNodeMenuItems` / `ImageSelectionMenuItems` / `ImageSelectionToolbar` / `MultiSelectToolbar` / `AlignmentGuides` / `FloatingEdge` + `floating-edge-utils` / `GroupOverlays` / `GroupMiniMap` / `GroupExecutionToolbar`（运行所有/停止所有）/ `GroupRunSelectionDialog`（run 缩略图多选）/ `GroupOutputBindingDialog`

### nodes 子目录（43 个）
- 外壳与通用：`NodeShell`（Handle/状态/NodeResizer/NodeToolbar/EditableNodeTitle）/ `EditableNodeTitle`（data.title 原位编辑）/ `FloatingHandle`（getFloatingHandleProps）/ `NodeDialogContext` / `NodeOutput`（文本/媒体外置输出）/ `ImageResult`（产出网格+分组折叠+缩略图+occurrenceKeys）/ `UpstreamImageList` / `UploadSection` / `ParamField` / `PickedPromptBadge` / `TextResult` / `TextVariableEditor`（Tiptap 变量高亮）/ `CountAndConcurrency` / `FramePlayer` / `SpinePreviewViewer` / `compact-node`
- 业务节点：TextToImage / EditImage / ImageDisplay / ImageProcess（12 个 ip* 共用）/ ImageEditor / MaskPaint / PixelEditor / Photopea / UiSplitter / BBoxViewer / Cutout / DepthExtract / DirectorDesk / WorkflowRunner / PromptReverse / TextToVoice / AudioDisplay / VideoGenerator / VideoDisplay / VideoEditor / ImageCompare / SpineEditor / SpineDisplay / Storyboard / Text / Note

### ui-splitter 子目录（10 个）
Sheet 拆分编辑器：`SplitterToolbar` / `CutoutSettings`（与网格拼接共享）/ `InputImageList` / `SplitResultPanel` / `bindSplitterFabricEvents` / `splitterKeyboard` / `useSplitterCrop` / `useSplitterGrid` / `useSplitterSave` / `useSplitterSlices`

## services（src/services/）

- `canvas.js`：服务端单写者，31 个 handler（画布/历史/画布版本入口在 api.js/last-params/分镜角色/Spine 换肤历史/设置/提示词库/工作区/素材库），见 public-interfaces.md。

## api/ + api.js + tools.js（Agent 对外）

- `api.js`（1210 行）：Agent 画布 API 约 27 个 handler（节点/边/画布版本/编排/执行/素材库），经 `ctx.requestClient` RPC 到浏览器；`api/`（assets/constants/helpers）为 asset 类 handler 拆分。
- `tools.js`：Agent 工具元数据（description/inputSchema），`NODE_TYPE_ENUM`/`NODE_TYPE_DESC` 引用 constants（节点即文档，不内联枚举值）。

## spine 子域（src/spine/）

独立编辑核心（非 React）：`loaders`（3.8/4.2 runtime 按版本路由）/ `core`（骨骼/gizmo，本地变换）/ `exporters`（PoseExporter）/ `components` / `data`；React 宿主 UI 在 `components/SpineEditorDialog.jsx` + `SpinePanels.jsx` + `ReskinPanel.jsx`；本地 dist 在 `vendor/spine/`。

## context（src/context/）

- `ImageSelectionContext.js`：跨节点图片多选状态。
