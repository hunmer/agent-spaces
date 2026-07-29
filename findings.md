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
