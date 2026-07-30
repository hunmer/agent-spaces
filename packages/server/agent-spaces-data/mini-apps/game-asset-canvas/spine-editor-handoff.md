# Handoff: Spine 骨骼编辑器 + AI 换肤

> 更新时间：2026-07-30
>
> mini-app 根目录：`packages/server/agent-spaces-data/mini-apps/game-asset-canvas/`
>
> 节点类型：`spineEditor`

## 当前状态

Spine 已从独立 Vite SPA 完整迁入 `game-asset-canvas`：

- 已删除 `spine-editor-build/` 和 `src/vendor/spine-editor-web/`。
- 不再使用 iframe、postMessage 或独立 npm 构建。
- 编辑核心位于 `src/spine/`，由 `SpineEditorDialog.jsx` 直接创建和销毁。
- 工具栏、角色库、骨骼树、变换面板和换肤面板统一使用 `@agent-spaces/ui`。
- 右侧侧边栏通过 Tabs 融合“变换”和“换肤”。
- PixiJS、pixi-spine、JSZip 使用固定版本浏览器 dist，并保存到 `src/vendor/spine/`。
- 角色库资源固定从 jsDelivr 的 `FrankoFPM/Spine-Viewer-Web@gh-pages` 分支加载。
- Dialog canvas 使用 callback ref/state 触发初始化，避免 Portal 延迟挂载导致编辑器不启动。

## 功能范围

### 骨骼编辑器

- 上传 `.skel/.json + .atlas + .png` 三件套。
- 从内置角色索引选择远程角色。
- Spine 3.8 二进制/JSON 与 Spine 4.2 JSON 解析。
- 姿势/动画模式切换、动画切换、播放速度（`0.25x`～`2x`）、皮肤切换。
- 骨骼树选择、展开折叠、骨骼及子级显隐。
- 画布骨骼 Gizmo：拖拽移动、右键旋转。
- 数值编辑 X/Y/Rotation/ScaleX/ScaleY。
- 单骨骼/整角色翻转、单骨骼/全部重置。
- 撤销/重做、正确按角色 bounds 居中的适应视图、截图、WebM 录制、姿势 JSON、三件套 ZIP。

### AI 换肤

- 全局换肤与 per-slot 局部重绘。
- 合成方法：`atlas` / `exploded`。
- 分割方法：`sam` / `bg_components`。
- `.skel` 资源通过运行时实例反向导出最小 Spine JSON。
- 可选侵蚀去白边及半径设置。
- atlas 贴图热替换预览。
- 实时 pipeline 日志。
- localStorage 皮肤历史与重新应用。
- 右上角设置对话框选择处理模型；模型列表复用画布全局 `editImageModels`。
- AI 重绘统一调用画布设置中的 `edit_image` workflow，不再直接调用 Nano Banana 插件。
- `edit_image` 生成图会在换肤面板中展示，点击通过 Media Gallery 查看大图；生成图保留到手动删除，重复换肤直接复用并跳过再次生成。
- 换肤生成图、当前角色资源和表单参数保存到节点 `data.reskinEditorData`；关闭并重新打开编辑器后恢复，角色资源变化时自动丢弃不兼容的生成图。
- SAM 返回图统一转为 Canvas 后再侵蚀，避免 `canvas.getContext is not a function`；atlas 热预览原位更新 Pixi ImageResource，可重复应用而不触发 `Resource can be set only once`。
- 形状交集分割在读取 alpha 前统一把原 atlas 和重绘图的 Image/ImageBitmap 转为 Canvas，避免 `sourceCanvas.getContext is not a function`。
- 换肤表单使用独立滚动区域，pipeline 日志固定高度，不受生成图 Gallery 高度影响。

## 当前架构

```text
SpineEditorNode.jsx
  ├─ FileUpload：上传并持久化三件套
  ├─ 维护节点 output / exportedPose / reskinAssets
  └─ 打开 SpineEditorDialog
       ├─ 顶部：模式 / 动画 / 速度 / 皮肤 / 撤销 / 导出 / 设置
       ├─ 左侧 Tabs
       │    ├─ SpineAssetLibrary
       │    └─ SpineBoneTree
       ├─ 中间：原生 canvas + SpineEditorApp
       └─ 右侧 Tabs
            ├─ SpineTransformPanel
            └─ ReskinPanel

SpineEditorDialog
  ├─ loadSpineRuntime() → src/vendor/spine/*
  ├─ loadSpine() → pixi-spine Spine 实例
  ├─ SpineEditorApp → Pixi 渲染与编辑
  ├─ RecordManager / PoseExporter / SpineJsonExporter
  └─ 直接函数调用 ReskinPanel，无 postMessage
```

### 生命周期

1. Dialog 打开后，callback ref 获得实际 canvas 元素，再调用 `loadSpineRuntime()`。
2. 创建 `SpineEditorApp(canvas)`、`BoneVisibility`、`RecordManager`。
3. 上传资源或选择角色后，将三个 URL 转成 data URL 并调用 `loadSpine()`。
4. `SpineEditorApp.setSpine()` 安装实例、初始化动画、适应视图并记录初始历史。
5. Dialog 关闭时停止录制、移除 window 事件并销毁 Pixi Application。

角色在编辑器就绪前被选择时会写入 `pendingAssetsRef`；初始化完成后优先消费排队资源，避免点击无响应。

## UI 约定

所有可交互控件从 `@agent-spaces/ui` 导入：

- 操作：`Button`
- 表单：`Input`、`Textarea`、`Select`、`Switch`、`Label`
- 模式/侧栏：`Tabs`
- 滚动与反馈：`ScrollArea`、`Badge`、`Loader`
- 图标：通过 `@agent-spaces/ui` 转出的 lucide icons

`canvas`、图片、视频和普通布局容器仍使用浏览器原生元素；它们不是可替换的宿主表单控件。

## 本地运行时

### 固定版本

| 包 | 版本 | 本地文件 | SHA-256 |
|---|---:|---|---|
| `pixi.js` | 7.3.3 | `src/vendor/spine/pixi-7.3.3.min.js` | `97f839f755b300177d6fc61903d1bb50c0f101687c88c4b3a9e94f68059286df` |
| `@pixi-spine/all-3.8` | 4.0.6 | `src/vendor/spine/pixi-spine-3.8-4.0.6.js` | `60c6a0f32d6b391015c2fff0c112c89ab3823aa495d79483fee59bcf2035f3ef` |
| `@esotericsoftware/spine-pixi-v7` | 4.2.119 | `src/vendor/spine/spine-pixi-v7-4.2.119.min.js` | `4fdf0795b255f2b3fc7beb4cb7a20bc1bdc9765080eeec9814aa389582e3cdd4` |
| `jszip` | 3.10.1 | `src/vendor/spine/jszip-3.10.1.min.js` | `acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e` |

### 加载方式

`src/spine/runtime.js` 使用：

1. `window.AgentSpaces.srcFileUrl('vendor/spine/<file>')` 生成同源 URL。
2. `fetch()` 获取本地 dist 文本。
3. 间接 `eval` 在全局作用域初始化 `window.PIXI`、`PIXI.spine`、`window.JSZip`。
4. 解析 JSON 的 `skeleton.spine`：3.8 使用 `PIXI.spine`，4.2 按需加载官方 `spine-pixi-v7` IIFE 并缓存独立 namespace。
5. Promise 缓存保证重复打开 Dialog 时不重复加载。
6. PixiJS 必须严格匹配 `7.3.3`，避免复用其它功能遗留的不同主版本全局对象。

### 升级 dist

使用固定 jsDelivr npm dist 路径下载，更新文件名后同步修改 `runtime.js` 和上表：

```text
https://cdn.jsdelivr.net/npm/pixi.js@7.3.3/dist/pixi.min.js
https://cdn.jsdelivr.net/npm/@pixi-spine/all-3.8@4.0.6/dist/pixi-spine-3.8.js
https://cdn.jsdelivr.net/npm/@esotericsoftware/spine-pixi-v7@4.2.119/dist/iife/spine-pixi-v7.min.js
https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
```

项目本身没有 `package.json`，不需要 `npm install` 或构建步骤。

## 编辑核心

| 文件 | 职责 |
|---|---|
| `src/spine/runtime.js` | 本地 dist 加载、版本检查和缓存 |
| `src/spine/core/SpineEditorApp.js` | Pixi Application、视图、模式、播放速度、截图、atlas 热替换、变换和历史 |
| `src/spine/core/ViewUtils.js` | 适应视图的纯函数缩放与居中计算 |
| `src/spine/core/BoneGizmoLayer.js` | 骨骼连线、关节点、命中测试、移动和旋转 |
| `src/spine/core/CoordinateUtils.js` | Spine/Pixi 坐标转换 |
| `src/spine/core/HistoryManager.js` | 骨骼变换快照、撤销/重做 |
| `src/spine/core/RecordManager.js` | `captureStream + MediaRecorder` WebM 录制 |
| `src/spine/loaders/SpineLoader.js` | `.skel/.json/.atlas/.png` 解析、动画/皮肤/骨骼树、显隐 |
| `src/spine/exporters/PoseExporter.js` | 当前骨骼姿势 JSON |
| `src/spine/exporters/SpineJsonExporter.js` | 从运行时实例提取换肤需要的最小 Spine JSON |
| `src/spine/components/SpinePanels.jsx` | 角色库、骨骼树、变换 React UI |
| `src/spine/data/mainData.json` | 角色索引 |
| `src/spine/test/BoneGizmoLayer.test.js` | 骨骼坐标回归测试 |
| `src/spine/test/ViewUtils.test.js` | 适应视图居中、缩放上限和窄视口回归测试 |

### 坐标约定

- `bone.worldX/worldY` 是 skeleton 空间坐标。
- Gizmo 与 Spine 实例同挂在 `spineContainer` 下。
- `_boneToContainer()` 只应用 Spine 实例的 `localTransform`，不重复应用容器缩放/平移或 `worldTransform`。
- 每帧绘制前调用 `spineContainer.updateTransform()`，避免读取上一帧矩阵。
- 相关行为由 `BoneGizmoLayer.test.js` 覆盖。

### 播放与视图约定

- 播放速度保存在 `SpineEditorApp.playbackSpeed`，通过 `spine.state.timeScale` 应用；切换角色后继续沿用当前速度。
- `fitView()` 必须先把 `spineContainer` 恢复到单位缩放和零平移，再读取 `spine.getBounds()`。
- 适应视图使用 60px padding，缩放范围 `0.1x`～`5x`，与手动滚轮缩放上限一致。

## 换肤调用链

`ReskinPanel` 不再发送消息，直接接收 workflow/model 配置与四个函数：

```js
{
  workflowId,
  processingModel,
  replaceAtlas(pngDataUrl, name),
  requestSnapshot(),
  requestSpineJson(),
  onReskinComplete(result),
}
```

- `workflowId` 来自全局设置 `editImageWorkflowId`。
- `processingModel` 由右上角设置对话框选择，候选值来自全局设置 `editImageModels`，当前选择保存在 localStorage。
- `edit_image` 输入固定为 `{ images, prompt, model, aspect, size }`；当前尺寸使用 `2k`，比例按输入图宽高选择最接近的工作流支持值。

### 全局换肤 `runReskin`

```text
Canvas snapshot + 原 atlas sheet + .atlas + Spine JSON
  → atlas/exploded composite
  → edit_image workflow（模型由编辑器设置选择）
  → 生成图回传 ReskinPanel Gallery（已有图时从此处复用）
  → sam 或 bg_components 分割
  → 可选 erodeAlpha
  → atlas repack + addSkin
  → replaceAtlasTexture 热预览
  → 历史记录 + onReskinComplete
```

### 局部重绘 `runInpaintSlot`

```text
选择 slot
  → 从 default skin 映射目标 atlas region
  → 裁出单 region
  → edit_image workflow 局部重绘
  → rembg 去背景
  → repack + addSkin
  → 热预览 + onReskinComplete
```

## 导出与节点持久化

| 操作 | 实际行为 |
|---|---|
| 截图 | Canvas PNG → `uploadFile` → `data.output.images`；当前实现随后关闭 Dialog |
| 姿势 | JSON 字符串 → `data.exportedPose` |
| 录制 | 开始时自动适应视图并锁定缩放/平移，隐藏骨骼 Gizmo，将角色屏幕包围盒（含 32px 边距）逐帧裁剪为 WebM；停止后恢复交互并预览 |
| 下载 Spine | 原始三件套由 JSZip 在浏览器打包并直接下载，不写节点 output |
| AI 换肤 | 新 PNG、`.atlas`、Spine JSON 上传；写入 `data.reskinAssets`，PNG 写入 `data.output.images` |

换肤编辑会话使用与其他节点对话框一致的 `initialData/onDataChange` 策略。`data.reskinEditorData` 保存当前角色三件套 URL、生成图 URL、提示词、皮肤名、合成/分割方法、输出尺寸、侵蚀配置、模型和局部重绘选择；不保存运行日志、执行中状态、派生 slot 列表或 localStorage 历史。

换肤不会修改原始 `.skel`；`reskinAssets.skel` 保留原 URL，新增 Spine JSON 单独上传。

## 插件依赖

`manifest.json` 已声明：

```json
{
  "enabledPlugins": [
    "@agent-spaces/builtin",
    "workflow.rembg"
  ]
}
```

- `@agent-spaces/builtin`：通过 `execute_workflow_sync` 执行画布设置中的 `edit_image` workflow。
- `workflow.rembg`：`rembg_sam_segment` / `rembg_remove`，需要插件侧 baseUrl。

## 节点注册位置

- `src/utils/constants.js`：节点类型和元信息。
- `src/utils/canvas-constants.js`：ReactFlow 组件、默认尺寸和初始数据。
- `src/components/RightPanel.jsx`：新增节点列表。
- `src/api.js`：Agent API 类型和标签。
- `src/tools.js`：Agent tool schema/说明。
- `src/components/nodes/SpineEditorNode.jsx`：节点实现。

## 已完成验证

### 静态验证

- 6 个本轮修改 JS/JSX 文件通过 Babel React preset 转译。
- 140 个非 vendor 文件相对 import 闭环通过。
- `manifest.json` JSON 解析通过。
- `git diff --check` 通过。
- `node --test src/spine/test/*.test.js`：5/5 通过。

### 浏览器验证

- 本地 dist 路由均返回 HTTP 200。
- Chrome 中确认：`PIXI.VERSION === '7.3.3'`。
- `PIXI.Application`、`PIXI.spine.Spine`、`SkeletonBinary`、`JSZip` 均成功初始化。
- `SpineEditorApp` 创建 WebGL renderer，画布尺寸 `640×480`，Gizmo 初始化成功。
- 真实角色 `Abercrombie` 解析成功：Spine `3.8.99`、52 骨骼、21 动画、1 皮肤、54 atlas regions。

## 已知限制

1. 角色索引在本地，但 `.skel/.atlas/.png` 仍从 jsDelivr 上固定的 `FrankoFPM/Spine-Viewer-Web@gh-pages` 分支加载，依赖网络和远端 CDN。
2. 当前支持 Spine 3.8 二进制/JSON 和 4.2 JSON；Spine 4.2 二进制及其他 major.minor 版本尚未路由。
3. `bg_components` 要求新图与原 pose/轮廓接近，部件明显位移时精度有限。
4. SAM 当前使用 region bbox 中心点 prompt，复杂部件可考虑升级为 box prompt。
5. atlas 热预览复用当前 UV，要求新 sheet 布局与当前 atlas 兼容；导出的新 `.atlas` 才是最终布局依据。
6. ZIP 下载当前统一把骨架文件命名为 `<name>.skel`，即使输入源是 `.json`。
7. MediaRecorder/canvas.captureStream 依赖 Chromium 等现代浏览器，Safari 兼容性有限。

### Spine 4.2 上传问题与修复

2026-07-30 上传以下三件套时，文件上传、URL 组装、canvas 挂载和编辑器初始化均成功：

```text
character-template-slim-annotated-2048.atlas
character-template-slim-annotated-2048.json
skin-4bf5e782fbbc6a3c.png
```

骨架 JSON 声明 Spine `4.2.43`，旧 3.8 loader 明确输出：

```text
Spine 3.8 loader cant load version 4.2.43
Invalid timeline type for a bone: inherit (右腿2)
```

结论：该失败不是 FileUpload、宿主上传、Dialog 生命周期或资源 URL 问题，而是运行时版本不兼容。现已增加官方 `spine-pixi-v7@4.2.119` 独立 runtime，并在解析前读取 JSON `skeleton.spine` 路由；3.8 仍使用原 `PIXI.spine`，两套 parser 不覆盖彼此。

## 最短验收路径

1. 打开 `game-asset-canvas`，新增“骨骼编辑器”节点。
2. 上传 Spine 3.8 三件套或从角色库选择角色，确认动画和骨骼树出现；再上传 `pixel_female_mage`，确认 Spine 4.2.43 正常显示。
3. 选择骨骼，验证拖拽、数值变换、撤销/重做和适应视图；播放模式切换 `0.25x`～`2x`。
4. 停止 WebM 录制后确认出现预览 Dialog；分别验证“导出到画布”和“下载视频”。
5. 点击右上角设置选择处理模型；在右侧换肤中分别验证 `edit_image` 全局换肤、局部重绘、热预览和历史重新应用。
6. 确认生成图出现在 Gallery，点击可查看大图；再次换肤不重复生成，删除后才重新调用 `edit_image`。
7. 检查节点 `output.images`、`output.videos`、`exportedPose`、`reskinAssets`。

## 后续接手建议

- 修改 mini-app 前先读 `docs/skills/write-mini-app-code/SKILL.md`。
- 加载/坐标问题优先检查 `runtime.js`、`SpineLoader.js`、`BoneGizmoLayer.js`。
- 换肤问题按 `ReskinPanel → reskinPipeline → 插件响应 → 分割 → repack` 顺序排查。
- 出现 `loader cant load version` 或 `Invalid timeline type` 时先检查骨架 Spine 版本，不要继续排查上传链路。
- 更新第三方版本时必须重新做浏览器全局导出检查和真实角色解析验证。
