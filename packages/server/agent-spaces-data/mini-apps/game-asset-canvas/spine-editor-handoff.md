# Handoff: Spine 编辑、展示与 AI 换肤

> 更新时间：2026-07-30
>
> mini-app：`packages/server/agent-spaces-data/mini-apps/game-asset-canvas/`
>
> 相关节点：`spineEditor`、`spineDisplay`

## 当前状态

Spine 已原生集成到 game-asset-canvas，不使用 iframe、postMessage 或独立构建：

- `SpineEditorNode`：上传/接收三件套，打开完整骨骼编辑器。
- `SpineDisplayNode`：节点内只读播放 Spine，支持动画、皮肤和速度控制。
- `SpineEditorDialog`：直接创建 `SpineEditorApp`，包含角色库、骨骼编辑、换肤和日志。
- 支持 Spine 3.8 二进制/JSON、Spine 4.2 JSON。
- PixiJS、pixi-spine、Spine 4.2 runtime、JSZip 使用 `src/vendor/spine/` 固定 dist。
- 当前工作树有未提交 Spine 展示节点及注册改动；接手时不要回退未知改动，先读 `git status`/`git diff`。

## 入口与职责

| 文件 | 职责 |
|---|---|
| `src/components/nodes/SpineEditorNode.jsx` | 编辑节点、三件套上传、编辑会话和换肤产物持久化 |
| `src/components/nodes/SpineDisplayNode.jsx` | 只读展示节点、动画/皮肤/速度控制 |
| `src/components/SpineEditorDialog.jsx` | 编辑器生命周期、三栏布局、Viewer、MaskPaint/日志协调 |
| `src/components/ReskinPanel.jsx` | 换肤表单、历史、日志 UI、材质/Spine 对比 |
| `src/components/MaskPaintDialog.jsx` | 通用蒙版编辑器；`binary-mask` 模式编辑 SAM 黑白蒙版 |
| `src/components/SpineCompareViewer.jsx` | ReactCompareSlider 内的只读 Spine Viewer |
| `src/spine/core/SpineEditorApp.js` | Pixi 编辑 Viewer、视图、Gizmo、历史、热换 atlas、导出 |
| `src/spine/core/SpinePreviewApp.js` | SpineDisplayNode 使用的轻量只读播放器 |
| `src/spine/loaders/SpineLoader.js` | 三件套解析、3.8/4.2 runtime 路由 |
| `src/spine/runtime.js` | vendor dist 加载、全局隔离和 Promise 缓存 |
| `src/utils/spine-url.js` | HTTP/data URL 统一转换 |
| `src/utils/input-images.js` | `computeInputSpineAssets` 三件套连线派生 |
| `src/utils/reskin/reskinPipeline.js` | 全局换肤、局部重绘、SAM/rembg、repack |
| `src/utils/reskin/maskRepaint.js` | 重绘蒙版应用到部件与预览 atlas |
| `src/utils/reskin/reskinHistoryData.js` | 生成记录材质/双 Viewer 对比资源解析 |

项目级索引与通用约束见 `src/handoff.md`，本文件只记录 Spine 子系统。

## 运行架构

```text
SpineDisplayNode
  └─ SpinePreviewApp（节点内只读 Pixi Viewer）

SpineEditorNode
  └─ SpineEditorDialog
       ├─ 左：角色库 / 骨骼树
       ├─ 中：SpineEditorApp canvas
       └─ 右：ResizablePanel（默认 28%，范围 18%–65%）
            ├─ 变换
            ├─ 换肤
            └─ 日志
```

Viewer 与右栏放在 `ResizablePanelGroup` 内。拖动宽度只触发 Pixi `resizeTo`，不应销毁 Viewer。

### 编辑器生命周期

1. Dialog Portal 挂载后，callback ref 设置实际 canvas 容器。
2. `loadSpineRuntime()` 加载本地 runtime。
3. 创建 `SpineEditorApp`、`BoneVisibility`、`RecordManager`。
4. URL 经 `src/utils/spine-url.js` 转 data URL，随后 `loadSpine()`。
5. `setSpine()` 初始化 setup pose、动画、皮肤、bounds 和适应视图。
6. Dialog 关闭时停止录制、移除事件并销毁 Pixi Application。

资源在 Viewer 就绪前到达时使用 `pendingAssetsRef` 排队。

### 防重载约定

- Viewer 初始化 effect 依赖三件套 URL 签名，不依赖 `assets` 对象引用。
- 换肤表单持久化、节点数据克隆、切换右侧 Tab 不应重建 Viewer。
- `ReskinPanel` 只在用户实际修改表单后开启 `onDataChange`；初始化和异步模型纠正不写节点，避免开发环境首次打开触发 HMR/刷新。

## Spine 三件套连线

`computeInputSpineAssets(nodes, edges)` 与图片/视频派生并列：

- 来源：`spineDisplay`、`spineEditor` 的 `data.spineAssets`。
- 接收：`spineDisplay`、`spineEditor`。
- 三件套作为整体 `{skel, atlas, png, name}` 传递，不按数组合并。
- `spineDisplay` 可透传，允许展示节点串联。
- 上游注入时标记 `source: 'upstream'`，展示节点隐藏本地上传，避免覆盖连线资源。

节点注册改动涉及：

- `src/utils/constants.js`
- `src/utils/canvas-constants.js`
- `src/utils/input-images.js`
- `src/hooks/useDecoratedNodes.js`
- `src/components/RightPanel.jsx`
- `src/api.js`
- `src/tools.js`

## 运行时与版本

| 包 | 固定版本 | 本地文件 |
|---|---:|---|
| `pixi.js` | 7.3.3 | `src/vendor/spine/pixi-7.3.3.min.js` |
| `@pixi-spine/all-3.8` | 4.0.6 | `src/vendor/spine/pixi-spine-3.8-4.0.6.js` |
| `@esotericsoftware/spine-pixi-v7` | 4.2.119 | `src/vendor/spine/spine-pixi-v7-4.2.119.min.js` |
| `jszip` | 3.10.1 | `src/vendor/spine/jszip-3.10.1.min.js` |

`runtime.js` 通过 `window.AgentSpaces.srcFileUrl()` 获取同源 dist，fetch 文本后间接 eval。解析 JSON 的 `skeleton.spine` 决定使用 3.8 或 4.2 runtime；两套 namespace 不互相覆盖。

当前不支持 Spine 4.2 二进制和未显式路由的其他 major/minor。

## 编辑与坐标约定

- Spine 实例和 Gizmo Graphics 同挂 `spineContainer`。
- `bone.worldX/worldY` 是 skeleton 空间坐标。
- `_boneToContainer()` 只能应用 Spine 实例 `localTransform`；使用 `worldTransform` 会重复叠加 fit/zoom/pan。
- 顶部“骨骼拖拽”开关默认关闭；关闭时关节点仍可选择但不能拖动，开启后在姿势模式下左键移动、右键旋转，拖拽结束写入撤销历史。
- 每次 `setSpine()` 后必须把 Gizmo Graphics 调到 `spineContainer` 最上层，避免后加入的 Spine 实例遮住骨骼线和关节点。
- 角色水平/竖直翻转作用于 Spine DisplayObject，并围绕当前可视中心补偿位置；禁止用 skeleton 负缩放，避免约束网格材质挤压。
- 选中骨骼关节点半径为 10（普通为 4）；拖拽开始后对 Pixi canvas 使用 Pointer Capture，并设置 `touch-action: none`，兼容 macOS 触控板连续拖拽。
- 点击角色 attachment 时按逆序 `drawOrder` 命中最上层 Region/Mesh 所属 slot bone，自动切换到左侧骨骼 Tab、展开祖先并滚动到对应行。
- 选中骨骼附近显示移动与水平翻转快捷按钮；按钮位置每帧从骨骼坐标映射到 Viewer 屏幕坐标，跟随动画、缩放和平移。
- 从左侧选择叶子骨骼时短暂高亮该骨骼；选择带 children 的分组骨骼时短暂高亮整个子树。
- 子骨骼拖拽的父级逆变换读取 Spine Bone 的 `a/b/c/d/worldX/worldY`，不能读取 Pixi DisplayObject 才有的 `worldTransform`。
- `bone.rotation` 在 Spine runtime 中就是度数；变换面板、右键旋转和姿势导出禁止再做弧度换算。
- `fitView()` 先恢复单位缩放/零平移，再读取 `spine.getBounds()`。
- 编辑 Viewer padding 为 60px、缩放范围 `0.1x`–`5x`。
- 展示节点使用轻量 `SpinePreviewApp`，无 Gizmo、HistoryManager 和编辑交互。

## AI 换肤

### 调用链

```text
当前 Viewer snapshot + 原 atlas + Spine JSON
  → atlas / exploded composite
  → edit_image workflow
  → 保留实际工作流输出分辨率（含 4K）
  → workflow.sam 批量 boxes，或 bg_components
  → 生成图 RGB × mask alpha
  → 可选侵蚀
  → atlas repack + addSkin
  → 原坐标 preview atlas 热替换
  → 上传三件套 + 服务端生成记录
```

关键约定：

- `workflow.sam/sam_segment_with_boxes` 一次发送整图和全部 boxes；禁止逐 region 调 SAM。
- SAM 返回灰度 mask，只控制生成图 alpha，不作为材质 RGB。
- 工作流输出可能是 5504×3072 等高分辨率；bbox、轮廓和 atlas 裁剪必须从逻辑坐标映射到实际输出，不能按 2K 坐标裁 4K 图。
- Pixi 热预览仍使用当前 UV，因此预览图保持原 atlas region 坐标；导出继续使用 repack PNG + 新 atlas。
- `workflow.rembg` 只用于 `bg_components` 去背景与 per-slot 局部重绘。

插件 canonical 目录：`packages/templates/plugins/sam/`。运行时副本位于 `packages/server/agent-spaces-data/plugins/sam/`，该目录被 gitignore。

### 日志与蒙版重绘

- 日志状态由 `SpineEditorDialog` 持有，在右侧“日志”Tab 展示。
- 日志按当前三件套 URL 签名写入节点 `data.reskinLogs`，最多 500 条；写入前移除 Canvas、Spine JSON 等运行时 `editContext`，关闭或刷新后可恢复展示。
- 只保留有图片输出的记录：`data.images` 或 `data.imageFlow.outputs` 非空。
- region 日志展示 `输入部件 + 蒙版 → 输出 + PARAMS`。
- 缩略图固定 `w-24` 卡片和 `h-20` 图片区域，点击仍打开原图 Gallery。
- SAM 蒙版右上角“重绘”按钮打开 `MaskPaintDialog mode='binary-mask'`。
- 二值模式以原 SAM 黑白蒙版为初始层，画笔/套索/矩形固定白色，橡皮删减区域。
- 导出后 `maskRepaint.js` 重新计算部件 alpha、覆盖 preview atlas、热更新 Viewer，并通过 `onReskinComplete` 更新节点 Spine 产物。

### 生成记录

- 换肤面板内部使用“全局换肤 / 局部重绘 / 生成记录”三个 Tab；历史列表不再与生成表单同时展示，记录数量显示在 Tab 徽标中。
- 历史写入服务端 `configs/spine-reskin-history.json`，按三件套 URL 签名隔离，最多 20 条。
- 点击记录应用 `previewPngUrl`。
- 删除记录后立即重新应用当前原始 `assets.png`，恢复默认皮肤。
- 记录右上角对比按钮打开 ReactCompareSlider：
  - “材质图对比”：原 atlas 与同坐标换肤 preview atlas。
  - “Spine 对比”：`itemOne/itemTwo` 分别挂载两个真实 `SpineCompareViewer`，不是截图。
- 每个对比 Viewer 独立加载三件套、选择默认/生成 skin；关闭弹窗必须 `destroy()` 两个 WebGL 实例。
- 新记录保存 `spineBeforeAssets/spineAfterAssets`；旧记录可用当前原始 assets 与已有 `spineJsonUrl/atlasUrl/pngUrl` 回退。

### 局部重绘多部件参考

- “选择参考”从 default skin 的 setup attachment 解析当前部件图片，单行横向滚动并支持多选。
- 选中部件保持各自实际裁剪尺寸横向拼接，并按 `edit_image` 支持的 aspect 透明留白后一次提交；工作流返回任意分辨率时使用统一缩放和居中偏移拆分，禁止 X/Y 分别缩放造成压扁。
- 每个拆分结果自动复用统一抠图节点的 workflow 模式（`image_enchanter/process_type=segment`）去除假透明背景；抠图返回尺寸变化时按 contain 等比放入原部件画布。
- 工作流抠图返回兼容 `urls/images/image_urls/result[]/result:string`；空结果错误附带返回键和 result 类型摘要。
- 局部重绘错误不受“只保留图片日志”过滤，既写入日志 Tab，也在换肤表单内以错误提示直接展示。
- 拆分结果以横向缩略图列表保留；点击临时激活/再次点击取消。右上角菜单支持“替换当前动作”“替换所有动作”“删除”。
- 结果作用域优先级为：临时预览 > 当前动作 > 所有动作。动画切换时从原 atlas 重新合成当前适用部件并调用 `replaceAtlasTexture`。
- 结果冲突按 slot 计算，不按生成时 region 计算。当前动作会覆盖 setup attachment 与该动作 attachment timeline 涉及的全部 regions；所有动作覆盖该 slot 在 default skin 下的全部 attachment regions。
- `.skel` 反向导出的最小 JSON 不含 animation timeline，此时当前动作 scope 在目标动作激活期间覆盖该 slot 全部 regions，切换动作后恢复；所有动作行为不变。
- 每次应用输出 `[SpineEditor][slot-repaint] applying atlas regions`，包含 animation 与实际 target regionNames，供跨动作映射诊断。
- 最终部件 PNG 上传为稳定 URL；`selectedSlots/slotResults/scope/animation` 写入当前节点 `reskinEditorData`，重新打开对话框会恢复缩略图、作用域与预览。
- “替换所有动作”会用原 atlas 文本、原 Spine JSON 和同坐标 preview PNG 更新节点产物；“替换当前动作”持久化在节点编辑器配置中，因为静态 Spine 三件套无法表达按动画切换整张 atlas。

## 导出与持久化

| 操作 | 行为 |
|---|---|
| 截图 | Viewer PNG → `uploadFile` → `data.output.images` |
| 录制 | 隐藏 Gizmo、锁视图、按角色包围盒裁 WebM；停止后恢复交互 |
| 下载 Spine | 原始三件套通过 JSZip 打包下载 |
| AI 换肤 | 上传 PNG/atlas/Spine JSON，写 `data.reskinAssets` 与 `output.images` |
| 换肤表单 | `data.reskinEditorData`，只在用户修改后写入 |
| 素材替换日志 | `data.reskinLogs`，按三件套签名隔离，最多 500 条 |
| 换肤历史 | `configs/spine-reskin-history.json`，图片仅保存 URL |

## 插件依赖

`manifest.json.enabledPlugins` 必须包含：

- `@agent-spaces/builtin`：执行 `edit_image` workflow。
- `workflow.sam`：批量 boxes 分割。
- `workflow.rembg`：形状交集和局部去背景。

## 验证状态

本轮最后一次自动验证：

- reskin tests：22/22。
- Spine core tests：13/13。
- component contract tests：10/10（随后新增 SpineDisplayNode，需重新统计）。
- history service tests：2/2。
- Babel：SpineEditorDialog、ReskinPanel、SpineCompareViewer 通过。
- Babel：新增 SpineDisplayNode、SpinePreviewApp、spine-url 也通过。
- `git diff --check` 通过。

未运行真实浏览器验证。`SpineDisplayNode/SpinePreviewApp/computeInputSpineAssets` 是当前工作树后续新增内容，应补：

1. 相对 import 闭环与节点注册完整性。
2. 展示节点上传三件套、上游连线和透传。
3. 滚出视口销毁、回到视口重建。
4. 动画/皮肤/速度切换不重载资源。
5. 编辑器右栏拖拽时 Viewer 不重建。
6. ReactCompareSlider 双 Viewer 对齐并在关闭后释放 WebGL。

## 已知限制

1. 内置角色索引在本地，角色三件套仍依赖固定 jsDelivr 远端分支。
2. 4.2 二进制及其他未路由版本不支持。
3. `bg_components` 在部件明显移出原轮廓时可能匹配失败并降级。
4. SAM 服务必须单独运行；默认 `http://127.0.0.1:30231`。
5. WebM 录制依赖现代 Chromium 的 `captureStream/MediaRecorder`。
6. ZIP 当前把 JSON 骨架也可能命名为 `<name>.skel`。
7. 双 Viewer 对比创建两个 WebGL context，必须关注低端设备资源占用和 cleanup。

## 最短接手路径

1. 先执行 `git status --short`，确认并保留未提交 SpineDisplay 相关改动。
2. 阅读 `src/handoff.md`、本文件和 `src/CLAUDE.md`。
3. 运行：

```powershell
node --test "packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/utils/reskin/*.test.js"
node --test "packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/spine/test/*.test.js"
node --test "packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/components/*.test.js"
node --test "packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/services/*.test.js"
```

4. 加载问题按 `spine-url → runtime → SpineLoader → SpineEditorApp/SpinePreviewApp` 排查。
5. 换肤问题按 `ReskinPanel → reskinPipeline → plugin response → mask → repack → replaceAtlas` 排查。
6. `loader cant load version` 或 `Invalid timeline type` 优先检查骨架版本，不要先排上传。

## Suggested Skills

- `diagnose`：复现并定位 Viewer 生命周期、WebGL、HMR、SAM 或换肤回归。
- `planning-with-files`：继续跨组件/插件/服务的多阶段改造。
- `code-architecture-research`：需要重新梳理 Spine 展示/编辑/连线数据流时使用。
- `handoff`：下一轮结束时同步更新本文件。
