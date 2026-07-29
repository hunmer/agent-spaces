# 发现

- 当前目标文件包含上一轮实时网格改动，本轮在其上增量修改。
- 固定节流位于 `scheduleGridSplit` 的 `120 - elapsed`。
- 动态公式采用 `min(1000, 80 + cols*rows*2)ms`：小网格保持灵敏，20×20 为 880ms。
- `deleteRectAt` 当前只删除 Fabric slice；网格态应直接 splice `curState().rects` 并调用 renderList。
- 列表删除按钮被 `!gridMode` 隐藏，需要取消条件。

---

# Spine 迁移发现

- `spine-editor-handoff.md` 描述的是现有 `spineEditor` 节点、iframe 协议、换肤 pipeline 和 vendor 构建方式。
- `2026-06-30-workflow-agent-handoff.md` 属于工作流 Agent 保存链路历史，与 Spine 迁移没有直接实现依赖。
- Spine 当前设计为 mini-app 主应用负责换肤逻辑，iframe vendor SPA 负责 PixiJS 渲染和编辑。
- 目标依赖为 PixiJS 7.3.x 与 `@pixi-spine/all-3.8` 4.0.6，需保持 Spine 3.8 兼容。
- `write-mini-app-code` 规范要求 UI 优先使用 `window.AgentSpacesUI`，不得从仓库源码路径导入宿主组件。
- Workflow UI 渲染器只允许白名单裸导入；第三方依赖应使用本地 vendor bundle，或通过 `window.AgentSpaces.loadCdnModule(url)` 加载 CDN 模块。
- 本地模块必须静态顶层导入；不能对相对路径使用动态 `import()`。
- Tooltip/Select/Popover 等 Base UI 组件使用 `render` 组合，不使用 Radix 风格 `asChild`。
- 仓库当前已有 Spine 临时集成，但仍保留 `spine-editor-build/package.json`、Vite、npm imports、独立 DOM UI 和 iframe vendor 产物，尚未完成“迁入 mini-app”目标。
- `ReskinPanel.jsx` 目前仍混用原生 `button`、`select`、`textarea`、`input`，不满足“全部替换使用 ui-exports”。
- 最小合理迁移方向：编辑器核心代码移入 `src/`，由 React + `@agent-spaces/ui`/`window.AgentSpacesUI` 渲染；PixiJS、pixi-spine、JSZip 使用本地保存的浏览器 dist，不再依赖独立 npm 构建。
- 独立项目依赖仅有 `pixi.js@^7.3.3`、`@pixi-spine/all-3.8@^4.0.6`、`jszip@^3.10.1` 和构建工具 Vite。
- 现有本地 CDN 模式是 `window.AgentSpaces.srcFileUrl('vendor/...')` + `fetch` + 全局 `eval`/Blob ESM，并缓存加载结果。
- 迁移应保留 `SpineEditorApp`、`BoneGizmoLayer`、`HistoryManager`、`RecordManager`、loader/exporter 算法，删除 `ui/*.js` 与 `main.js` 的 DOM/postMessage 编排。
- React 对话框应统一承载：编辑画布、工具栏、角色库/骨骼树、变换面板、AI 换肤侧栏。
- 最终实现已移除 iframe/postMessage Spine 链路，变换与换肤共享同一个编辑器实例。
- `workflow.nano-banana` 原先未写入 manifest 白名单，已补充，否则 AI 换肤会在宿主层被拒绝。
- 本地 dist SHA-256：
  - JSZip：`acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e`
  - PixiJS：`97f839f755b300177d6fc61903d1bb50c0f101687c88c4b3a9e94f68059286df`
  - pixi-spine：`60c6a0f32d6b391015c2fff0c112c89ab3823aa495d79483fee59bcf2035f3ef`

---

# Spine 角色库选择问题发现

- 选择按钮会调用 `SpineAssetLibrary.selectCharacter`，并向 `SpineEditorDialog.loadAssets` 传入远程 `.skel/.atlas/.png` URL。
- `loadAssets` 通过 ref 获取编辑器，未发现 React 闭包导致点击直接失效的问题。
- 当前 `urlToDataUrl` 无差别调用宿主 `proxyImageUrl`，需确认该图片代理是否支持 `.skel/.atlas`。
- 宿主 `proxy-image` 路由实际会透传任意 http(s) 字节流，`.skel/.atlas` 可通过该路由，图片代理并非根因。
- 根因是角色库在运行时初始化期间已可操作；此时 `loadAssets` 因 `editorRef.current` 为空直接返回，没有状态、错误或延迟加载，因此表现为点击后完全无反应。
- 二次反馈证明排队逻辑生效但初始化未启动。DialogContent 通过 Portal/Presence 延迟挂载，首次 effect 执行时 `canvasRef.current` 仍为空；ref 后续赋值不会触发 effect 重跑，因此编辑器永久未初始化。
- 用户日志确认初始化链路已通过，实际加载失败来自本地 `proxy-image` 请求 `FrankoFPM.github.io` 时返回 500。
- 角色资源真实存在于仓库 `gh-pages` 分支；jsDelivr 固定分支地址对 `yalisangna_alter` 三件套均返回 200，故角色库切换到该稳定源。

---

# Spine 播放、模型设置与适应视图发现

- 播放链路集中在 `SpineEditorDialog` 与 `SpineEditorApp.setAnimation/setMode`，pixi-spine 可通过 `spine.state.timeScale` 控制速度。
- 换肤当前在 `reskinPipeline.js` 硬编码调用 `workflow.nano-banana / nano_banana_edit_image`。
- 项目已有统一 `edit_image` workflow（`WORKFLOWS.edit_image`）及设置项 `editImageWorkflowId/editImageModels`，应复用，不新增模型常量。
- `fitView()` 位于 `SpineEditorApp.js`，需核对当前 bounds 所在坐标系与容器变换。
- `fitView()` 当前直接调用 `spine.getBounds()`；该值已包含 `spineContainer` 的现有缩放/平移，随后又乘新 scale，导致重复适应时变换被二次计算。
- 全局设置可通过现有 `useSettings()` 获取并实时订阅；编辑模型列表为字符串数组 `settings.editImageModels`，workflow ID 为 `settings.editImageWorkflowId`。
- 现有 `generateImages()` 已封装 `@agent-spaces/builtin/execute_workflow_sync`、结果提取与 URL 规范化，换肤应直接复用。
- `edit_image` 必填输入为 `images/prompt/model/aspect/size`；换肤合成图按宽高选择最接近的支持比例，尺寸固定使用 `2k`。
- 适应视图缩放上限改为与手动缩放一致的 `5x`，避免小尺寸 Spine 居中后仍显示过小。

---

# Spine 录制导出与本地节点加载发现

- 录制输出由 `SpineEditorDialog` 通过 `onExportVideo` 交给 `SpineEditorNode` 写入 `data.output.videos`。
- Dialog 当前右上角自带关闭按钮；新增的设置按钮位于同一区域，需为关闭按钮保留固定空间。
- `/Users/Zhuanz/Downloads/pixel_female_mage` 包含 JSON/atlas/PNG 三件套，JSON 的 `skeleton.spine` 为 `4.2.43`。
- 当前本地运行时固定为 PixiJS 7.3.3 + `@pixi-spine/all-3.8` 4.0.6，只支持 Spine 3.8；样例报错是版本不兼容，不是节点上传或 URL 问题。
- 支持该样例必须在解析前检测 Spine 版本，并将 4.2 JSON 路由到独立兼容运行时，避免 3.8 与 4.2 同名全局导出冲突。
- mini-app 运行时不能静态 import 第三方 vendor；现有 Spine UMD 通过 `srcFileUrl + fetch + eval` 加载，新增版本需沿用隔离的本地 vendor 方案。
- 工作区已有多处 Spine 相关未提交改动，本次必须在其上增量修改，不能覆盖或回滚。
- `toggleRecord` 当前停止录制后立即把 data URL 上传并调用 `onExportVideo`，这就是自动写入节点输出的入口。
- 最小交互改法是把停止结果暂存在 Dialog state 中，以 `<video controls>` 预览；“导出到画布”才上传并回调，“下载视频”直接下载录制 Blob/data URL。
- 编辑器 Dialog 的设置按钮处于标题栏最右端，而宿主 `DialogContent` 自带绝对定位关闭按钮；标题栏操作区需要增加右侧留白。
- `SpineLoader` 当前直接从全局 `window.PIXI.spine` 取 3.8 parser，没有真正做注释所称的版本路由。
- Spine 官方文档确认 `@esotericsoftware/spine-pixi-v7` 支持 PixiJS 7（最低 7.2.0）；与当前 PixiJS 7.3.3 兼容。
- Spine 4.2 对应 npm 4.2 分支最新版为 `@esotericsoftware/spine-pixi-v7@4.2.119`，提供独立 IIFE `dist/iife/spine-pixi-v7.min.js`。
- 官方 IIFE 导出到全局 `spine`，不会覆盖旧运行时所在的 `window.PIXI.spine`；可分别保留 3.8 与 4.2 parser。
- 4.2 `TextureAtlas` 构造后需为每个 page 调用 `page.setTexture(SpineTexture.from(baseTexture))`；`Spine` 仍继承 PixiJS 7 `Container`。
- 4.2 `Spine` 没有旧运行时的 `spineData` 便捷字段，加载时可挂载解析得到的 `SkeletonData`，保持编辑器其余代码兼容。
- 使用本地 PixiJS 7.3.3 与官方 4.2 IIFE 对 `pixel_female_mage` 做真实 parser 验证成功：Spine 4.2.43、58 骨骼、8 动画、2 皮肤、18 atlas regions。
- 浏览器失败根因是官方 IIFE 顶层严格模式的 `var spine` 不会成为 `window.spine`；使用 `new Function(... + 'return spine')` 可直接取得 namespace，且符合 mini-app 已允许的动态代码执行方式。
- 不能直接对原 WebGL Canvas 的 `captureStream` 做裁剪；录制角色区域需要创建固定尺寸的中间 Canvas，逐帧 `drawImage` 角色屏幕包围盒，再录制中间 Canvas。
- Pixi `spine.getBounds()` 返回 renderer screen 坐标；按 `canvas.width / app.screen.width` 和高度比例转换后，才能作为源 Canvas 的像素裁剪坐标。
- 为保持录制裁剪范围稳定，录制开始需先 `fitView()`，再锁定滚轮缩放与平移；停止或异常时统一恢复交互。
