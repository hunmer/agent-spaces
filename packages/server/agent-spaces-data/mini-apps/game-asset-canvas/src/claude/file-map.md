# 文件索引

> 统计（2026-08-28）：src 下约 **297 个 JS/JSX**（含 ~62 个 `*.test.js`，不含 vendor），vendor ~51MB+。

## 项目根（game-asset-canvas/）

```
game-asset-canvas/
  manifest.json              # mini-app 注册（agents: canvas-assistant/prompt-optimizer/game-planner；agentChatPlacement: mini-app-slot）
  agents.json                # agent 配置（与 manifest.agents 同步）
  configs/                   # 运行时数据（见 data-model.md）
  data/                      # 图片/媒体文件（uploads 等）
  chat/                      # agent 会话存档
  docs/                      # video-editor-handoff.md
  tests/                     # 3 个 .test.mjs（node:test，画布右键菜单/历史/边展示）
  spine-editor-build/        # Spine 编辑器独立构建产物（历史）
  findings.md / progress.md / task_plan.md / handoff-storyboard.md / spine-editor-handoff.md  # 历史交接文档
  src/                       # ← 源码
```

## src/ 顶层

```
src/
  index.jsx                  # 入口：<ReactFlowProvider><Canvas/></ReactFlowProvider>
  api.js                     # Agent 画布 API（~27 handler，RPC 到浏览器，1210 行）
  api/                       # asset 类 handler 拆分（assets/constants/helpers）
  tools.js                   # Agent 工具元数据（description/inputSchema）
  context/ImageSelectionContext.js  # 跨节点图片多选
  handoff.md                 # 逐轮交接索引文档（改动历史查 git log）
  CLAUDE.md + claude/        # ← 本 AI 上下文
  assets/  vendor/           # 静态资源 / 本地大资源
```

## src/components/（顶层约 45 个）

关键分组（全量清单见 module-responsibilities.md）：
- 编排：`Canvas.jsx`
- 面板/弹层：`Toolbar` / `RightPanel`（→ right-panel/）/ `SettingsDialog` / `ExecutionQueuePopover` / `NodeFormDialog` / `NodeExecuteDialog` / `PastePropertiesDialog` / `CanvasVersionPanel`
- 工作区：`WorkspaceSwitcher` / `CreateWorkspaceDialog`（创建/重命名+数据目录）/ `DeleteWorkspacesDialog`
- 大对话框：`UiSplitterDialog` / `GridStitchDialog` / `BBoxViewerDialog` / `PixelEditorDialog` / `PhotopeaDialog` / `DirectorDeskDialog` / `VideoEditorDialog` / `CutoutDialog` / `ImageEditorDialog` / `MaskPaintDialog` / `PromptOptimizeDialog` / `PromptPickerDialog` / `StoryboardGenerationDialog` / `ConnectionTargetDialog` / `SpineEditorDialog` / `ExportImagesDialog` / `AssetLibraryPickerDialog` / `GroupConfirmDialog` / `DeleteGroupDialog` / `BatchRunConfirmDialog`
- 通用件：`FileUpload` / `ImageHoverCard` / `FrameSequencePlayer` / `GridAnimationPreview` / `AutoResizeTextarea` / `BorderBeam` / `ConnectionLine` / `AssetLibrary`
- Spine 宿主 UI：`SpineEditorDialog` / `SpineCompareViewer` / `ReskinPanel`（+ SpinePanels.test）

## src/components/canvas/（16 个）

`CanvasWorkspace`（主视图）/ `CanvasOverlayDialogs`（弹窗层）/ `CanvasContextMenu` / `DropNodeMenu` / `AddNodeMenuItems` / `ImageSelectionMenuItems` / `ImageSelectionToolbar` / `MultiSelectToolbar` / `AlignmentGuides` / `FloatingEdge` + `floating-edge-utils` / `GroupOverlays` / `GroupMiniMap` / `GroupExecutionToolbar` / `GroupRunSelectionDialog` / `GroupOutputBindingDialog`

## src/components/nodes/（43 个）

外壳/通用：`NodeShell` / `EditableNodeTitle` / `FloatingHandle` / `NodeDialogContext` / `NodeOutput` / `ImageResult` / `UpstreamImageList` / `UploadSection` / `ParamField` / `PickedPromptBadge` / `TextResult` / `TextVariableEditor` / `CountAndConcurrency` / `FramePlayer` / `SpinePreviewViewer` / `compact-node`

业务节点：Text / Storyboard / TextToImage / EditImage / ImageDisplay / ImageProcess（12 个 ip* 共用）/ ImageEditor / MaskPaint / PixelEditor / Photopea / UiSplitter / BBoxViewer / Cutout / DepthExtract / DirectorDesk / WorkflowRunner / PromptReverse / TextToVoice / AudioDisplay / VideoGenerator / VideoDisplay / VideoEditor / ImageCompare / SpineEditor / SpineDisplay / Note

## src/components/right-panel/（8 个）+ ui-splitter/（10 个）

- right-panel：`index`（tab 装配 + agent-chat 插槽）/ `AddNodeTab` / `NodeManageTab` / `HistoryTab` / `PresetsTab` / `CharactersTab` / `search` / `constants`
- ui-splitter：Sheet 拆分编辑器（Toolbar/CutoutSettings/InputImageList/SplitResultPanel + fabric/keyboard/5 个 hooks）

## src/hooks/（26 个）

见 module-responsibilities.md「hooks」表。

## src/utils/（约 50 顶层 + image-ops/ 11 + reskin/ 9）

见 module-responsibilities.md「utils」表（核心/画布交互/节点功能/reskin 四组）。

## src/services/（1 个）

```
services/
  canvas.js                  # 服务端单写者（31 handler，chokidar 热重载）
```

## src/spine/（编辑核心，非 React）

`runtime.js` / `loaders`（3.8/4.2 版本路由）/ `core`（骨骼/gizmo）/ `exporters`（PoseExporter）/ `components` / `data` / `test`（8 个 node:test）

## src/vendor/

`fabric.min.js` / `painterro.min.js` / `browser-image-compression.js` / `jszip.js` / `gifenc.js` / `gifuct-js.js` / `image-q.js` / `img-comparison-slider.js` / `pixelorama-web/`（~45MB Godot 导出）/ `director-desk-web/`（3D 导演台构建产物）/ `spine/`（PixiJS/pixi-spine/JSZip 固定版本 dist）/ `fast-image-sequence/`（历史遗留，已不引用）

## configs/（运行时数据）

```
configs/
  settings.json                  # 全局（工作流槽位/模型列表/AI Agent 配置/画布样式/队列并发等）
  prompt-library.json            # 全局（自定义提示词库）
  panel-layout.json              # 全局（{canvas-main:72, canvas-right:28}）
  node-presets.json              # 全局（节点预设子图模板）
  spine-reskin-history.json      # 全局（Spine 换肤记录，按资源签名分组）
  workspaces.json                # 全局（{activeId, workspaces[]:{id,name,createdAt,directory?}}）
  workspaces/<id>/
    canvas.json                  # 画布（nodes/edges/groups/viewport）
    canvas-versions.json         # 画布版本快照
    generation-history.json      # 生成记录（HISTORY_MAX=200）
    last-params.json             # 每节点类型上次提交参数
    asset-library.json           # 素材库
    storyboard-characters.json   # 分镜角色库
```

## 关键路径速查

| 想做什么 | 看哪里 |
|---------|--------|
| 加新节点类型 | `utils/constants.js`（NODE_TYPES/NODE_META/IMAGE_TAGS）+ `utils/canvas-constants.js`（NODE_COMPONENTS/ADD_NODE_ITEMS/initialData/PARAMS_SCHEMA 映射）+ 节点组件 + `api.js`（VALID_NODE_TYPES）+ `tools.js`（NODE_TYPE_ENUM）+ `right-panel/AddNodeTab`；生成类还要 `useCanvasAgentRpc.buildNodeExecution` + `executeNode` 的 GENERATABLE Set。见 handoff「新增节点 Checklist」 |
| 加/改 agent | `manifest.json` agents[]（零宿主改动，刷新生效） |
| 加 agent 工具 | `api.js` handler + `tools.js` 元数据 |
| 加新工作流槽位 | `utils/settings.js` + `SettingsDialog.jsx` |
| 加新图像处理器 | `utils/image-ops/index.js`（PROCESSORS）+ `utils/constants.js` |
| 改 Agent RPC | `src/api.js` + `src/hooks/useCanvasAgentRpc.js` |
| 改服务端单写者 | `src/services/canvas.js`（热重载） |
| 改宿主能力/白名单 | `packages/web/.../use-mini-app-host-api.tsx` + `react-renderer.tsx` + `ui-exports.ts`（**需重启 web**） |
| 改分镜 | `StoryboardNode` + `StoryboardGenerationDialog` + `hooks/useStoryboardOperations` + `utils/storyboard*.js` |
| 改视频编辑器 | `VideoEditorNode` + `VideoEditorDialog` + `FrameSequencePlayer` + `utils/frame-selection/video-*/grid-stitch` |
| 改 Spine | `src/spine/`（核心）+ `components/Spine*Dialog`（宿主 UI）+ `utils/reskin/`（换肤）+ `vendor/spine/` |
