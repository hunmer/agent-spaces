# 文件索引

> 完整目录树。统计：**101 个 JS/JSX 源码文件**，src 总 146 文件，vendor ~51MB。

## 项目根

```
game-asset-canvas/
  manifest.json              # mini-app 注册（id/name/type=react/mainFile/enableAgents/agents）
  agents.json                # agent 配置（与 manifest.agents 同步）
  configs/                   # 运行时数据（见 data-model.md）
  data/                      # 图片文件（gen/output/uploads）
  chat/                      # agent 会话存档
  src/                       # ← 源码
```

## src/

```
src/
  index.jsx                  # 入口：<ReactFlowProvider><Canvas/></ReactFlowProvider>
  api.js                     # Agent 画布操作 API（10 个 handler，RPC 到浏览器）
  tools.js                   # Agent 工具签名/描述（VALID_NODE_TYPES/NODE_LABELS/NODE_TYPE_DESC）
  CLAUDE.md                  # 旧版单文件契约（历史参考，新文档在 claude/）
  handoff.md                 # 历次迭代交接文档（changelog 类参考，非契约）
  assets/                    # 静态资源（图标/参考图）
  claude/                    # ← 本目录（AI 上下文详情）
```

## src/components/（顶层 17 个）

```
components/
  Canvas.jsx                 # 编排层（~400行）：hook 装配 + ReactFlow 变更回调 + JSX
  Toolbar.jsx                # 顶栏（工作区插槽/自动布局/导出/设置/队列插槽/清空）
  RightPanel.jsx             # 右侧 Tabs（新增节点/节点管理/生成记录）
  SettingsDialog.jsx         # 设置页（工作流槽位 + BBox AI + 反推 AI）
  ExecutionQueuePopover.jsx  # 执行队列弹窗 + 中断
  NodeFormDialog.jsx         # 文生图/编辑图片表单（提示词库 + 合并提交）
  NodeExecuteDialog.jsx      # 节点执行弹窗（不建节点，产出只写历史）
  WorkspaceSwitcher.jsx      # 工作区切换 popover
  DeleteWorkspacesDialog.jsx # 批量删除工作区确认弹窗
  CreateWorkspaceDialog.jsx  # 新建工作区对话框
  ConnectionLine.jsx         # 自定义连线样式
  PromptPickerDialog.jsx     # 提示词库选择器
  UiSplitterDialog.jsx       # 雪碧图拆分对话框（fabric + 连通域检测）
  BBoxViewerDialog.jsx       # UI 拆分对话框（fabric + JSON bbox + AI 分析 + ZIP）
  PixelEditorDialog.jsx      # Pixelorama iframe + postMessage 双向通信
  FileUpload.jsx             # 通用文件上传
  AssetLibrary.jsx           # 素材库面板
```

## src/components/canvas/（5 个）

```
canvas/
  AddNodeMenuItems.jsx       # render-prop 菜单项（适配 ContextMenu + DropdownMenu）
  MultiSelectToolbar.jsx     # 底部多选浮出 toolbar（分组/对齐/删除）
  DropNodeMenu.jsx           # 拖拽落空菜单
  CanvasContextMenu.jsx      # 右键菜单（ContextMenuTrigger 包裹）
  GroupOverlays.jsx          # ViewportPortal 内 WorkflowGroupOverlay 列表
```

## src/components/nodes/（19 个）

```
nodes/
  NodeShell.jsx              # 节点外壳（Handle/状态/NodeResizer/NodeToolbar/nodrag nopan nowheel）
  TextToImageNode.jsx        # 文字生成图片
  EditImageNode.jsx          # 编辑图片
  ImageDisplayNode.jsx       # 图片展示
  ImageProcessNode.jsx       # 12 个 ip* + 旧 imageProcess 共用
  ImageEditorNode.jsx        # 图片编辑（Painterro）
  PixelEditorNode.jsx        # 像素编辑器（Pixelorama）
  UiSplitterNode.jsx         # 雪碧图拆分
  BBoxViewerNode.jsx         # UI 拆分
  TextToVoiceNode.jsx        # 生成配音
  VideoGeneratorNode.jsx     # 生成视频
  ImageCompareNode.jsx       # 图片对比
  PromptReverseNode.jsx      # 反推提示词
  CutoutNode.jsx             # 统一抠图（4 mode）
  NoteNode.jsx               # 便签
  ImageResult.jsx            # 产出网格（max=0 不截断）
  UpstreamImageList.jsx      # 上游连线图只读占位
  PickedPromptBadge.jsx      # 已选提示词展示条
  ParamField.jsx             # 通用参数字段（number/color/select/bool/text + showWhen）
```

## src/hooks/（17 个）

```
hooks/
  useWorkspaces.js           # 工作区清单
  useCanvasState.js          # 节点/边/分组单一数据源 + 持久化 + 多端同步
  useWorkflow.js             # callPluginTool 调工作流
  useGenerationHistory.js    # 生成记录（按工作区隔离）
  useSettings.js             # settings.json 读写
  useExecutionQueue.js       # 执行队列
  usePromptLibrary.js        # 自定义提示词库
  usePanelLayout.js          # 面板布局 + MiniMap 显隐
  useImageOutputs.js         # 产出图转节点
  useSelectionClipboard.js   # 选中 + 复制粘贴 + 对齐分布 + 批量删除
  useGroupOperations.js      # 分组数据 ops + overlay
  useNodeCrud.js             # 节点 CRUD + 定位/布局/导出 + 尺寸自适应 + 表单提交
  useNodeExecutions.js       # 执行回调（工作流/媒体/本地算法/抠图/反推）
  useCanvasAgentRpc.js       # WS message 监听
  useDecoratedNodes.js       # 节点 data 注入回调
  useAssetLibrary.js         # 素材库
  useViewportActivation.js   # 节点首次进入视窗后永久激活正文
```

## src/utils/（16 个顶层 + image-ops/ 11 个）

```
utils/
  constants.js               # 全局常量（NODE_TYPES/NODE_META/IMAGE_PROCESSORS/CUTOUT_PARAMS/WORKFLOWS/Agent 提示词）
  canvas-constants.js        # Canvas 依赖聚合点（NODE_COMPONENTS/ADD_NODE_ITEMS/initialData/DEFAULT_SIZE）
  canvas-id.js               # genId + seq / autoPosition + positionIndex（模块级单例）
  processing-controllers.js  # AbortController 注册表单例
  input-images.js            # computeInputImages（fixed-point 多跳转发）
  workflow.js                # runWorkflow/generateImages/generateAudio/generateVideo/runAgentVisionText
  cutout.js                  # runCutout 统一执行入口（4 mode 分流）
  storage.js                 # loadCanvas/saveCanvas/onAnyConfigChanged + debounce + 面板布局
  settings.js                # DEFAULT_SETTINGS/WORKFLOW_SLOTS/mergeSettings
  prompts.js                 # 内置提示词库
  layout.js                  # dagre autoLayout
  export.js                  # serializeCanvas/downloadJson
  clipboard.js               # copyNodes/pasteNodes/hasClipboard（模块级内存）
  align-distribute.js        # computeAlignment
  group-helpers.js           # collectGroupNodeIds/findLeafNodeIds
  image-ops/
    index.js                 # PROCESSORS 注册表 + runProcessor 统一入口
    cdn.js                   # vendor/CDN 库加载封装
    io.js                    # urlToImageData/imageDataToBlob/imageDataToUrl
    imageDataOps.js          # 纯函数 ImageData 操作
    gif.js                   # GIF 拆帧 + 合成
    spriteSheet.js           # Sheet 拆分 + 合成
    sprite-splitter.js       # Sprite Sheet 拆分辅助
    pixelate.js              # pixelate（降采样 + Wu 量化）
    matte.js                 # chromaKey/whiteKey/erodeAlpha/hexToRgb
    stroke.js                # resizeNearest/innerStroke/crop
    compose.js               # composeLayers
```

## src/services/（1 个）

```
services/
  canvas.js                  # 服务端单写者（画布/历史/设置/工作区/素材库/提示词库 CRUD）
```

## src/vendor/（~51MB）

```
vendor/
  fabric.min.js              # 5.3.0 UMD（fabric 画布编辑器）
  browser-image-compression.js  # 2.0.2 UMD（图片压缩，Web Worker）
  painterro.min.js           # 1.2.92 IIFE（图片编辑节点）
  jszip.js / gifenc.js / gifuct-js.js / image-q.js  # 图像处理 + ZIP
  img-comparison-slider.js   # 图片对比 web component
  pixelorama-web/            # ~45MB（Godot 4.7 导出，含 index.pck/wasm + service worker + SimHei.ttf）
```

## configs/（运行时数据）

```
configs/
  settings.json              # 全局共享（用户级偏好）
  prompt-library.json        # 全局共享（自定义提示词库）
  panel-layout.json          # 全局共享（面板布局 + MiniMap）
  workspaces.json            # 全局共享（工作区清单 + activeId）
  canvas.json                # 旧版顶层画布（迁移前，新数据走 workspaces/<id>/）
  generation-history.json    # 旧版顶层历史（同上）
  workspaces/
    <id>/
      canvas.json            # 工作区隔离的画布
      generation-history.json  # 工作区隔离的历史
      asset-library.json     # 工作区隔离的素材库
```

## 关键路径速查

| 想做什么 | 看哪里 |
|---------|--------|
| 加新节点类型 | `utils/constants.js`（NODE_TYPES/NODE_META/IMAGE_TAGS）+ `utils/canvas-constants.js`（NODE_COMPONENTS/ADD_NODE_ITEMS/initialData）+ `components/nodes/<新>.jsx` + `components/RightPanel.jsx`（ADD_ITEMS）+ `api.js`/`tools.js`（VALID_NODE_TYPES/NODE_LABELS） |
| 加新工作流槽位 | `utils/settings.js`（DEFAULT_SETTINGS + WORKFLOW_SLOTS）+ `components/SettingsDialog.jsx` |
| 加新图像处理器 | `utils/image-ops/index.js`（PROCESSORS）+ `utils/constants.js`（IMAGE_PROCESSORS + IMAGE_PROCESSOR_CATEGORIES + NODE_TYPE_TO_PROCESSOR） |
| 改 Agent RPC | `src/api.js`（服务端入口）+ `src/hooks/useCanvasAgentRpc.js`（浏览器分流） |
| 改宿主能力 | `packages/web/src/components/mini-apps/use-mini-app-host-api.tsx` + `react-renderer.tsx` allowlist + `ui-exports.ts`（**需重启 web**） |
| 改服务端单写者 | `src/services/canvas.js`（chokidar 热重载，无需重启） |
