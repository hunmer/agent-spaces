## 两项优化实现计划

### 一、Service 热重载（宿主层，改完需重启一次 web 生效）

**目标**：`src/services/*.js` 增删改后无需重启服务，自动重载 registry。

**改动文件**：
1. `packages/server/src/services/mini-app-services.ts`
   - 新增 `startServicesWatcher()`：用 chokidar 监听 base 目录 `<getDataDir()>/mini-apps/*/src/services/*.{js,mjs,cjs}`
   - 变更回调：从相对路径第一段反解 `projectId`，调现有 `reloadServices(projectId)`
   - 顶部 import 补 `getDataDir`（from `../storage/json-store.js`）、`chokidar`、`relative`/`sep`（from `node:path`）
   - 防抖：同一次批量保存可能触发多次事件，用简单 debounce（~200ms 按 projectId 合并）避免重复 reload
2. `packages/server/src/app.ts`
   - 在 `server.listen` 回调里 `ensureAgentsConfigs()` 之后调用 `startServicesWatcher()`

**复用**：`reloadServices(projectId)`（已存在于 mini-app-services.ts:108，原无人调用，本次接上）。

### 二、NodeToolbar 导出图片（mini-app 层，刷新即生效）

**目标**：节点选中时显示 NodeToolbar「导出图片」按钮，点击把当前节点 `data.output.images` 的产出图作为独立图片展示节点加到画布。

**改动文件**：
1. `src/components/nodes/NodeShell.jsx`
   - import 补 `NodeToolbar`（from `@xyflow/react`，已暴露）
   - 根元素内（NodeResizer 之后、Handle 之前）加 `<NodeToolbar isVisible={selected} position={Position.Top} align="end">`
   - 按钮条件：仅当 `data?.output?.images?.length > 0` 时渲染「导出图片」按钮
   - 点击：`e.stopPropagation()`（防误触节点拖拽/选中）后调 `data.onExportImages?.(images)`
2. `src/components/Canvas.jsx`
   - `decoratedNodes`（309 行起）注入 `onExportImages: (imgs) => addImageNodesFromUrls(imgs)`（复用现有 278 行 `addImageNodesFromUrls`）
   - 依赖数组补 `addImageNodesFromUrls`

**复用**：`addImageNodesFromUrls`（已实现，把 URL 数组转成 ImageDisplay 节点错落加到画布，与队列完成、记录「用作输入」一致行为）。

### 验收
- Service：改 `services/canvas.js` 任意 handler（如改 `HISTORY_MAX`）→ 不重启 → 调对应 service 行为变化
- NodeToolbar：生成图片后点选节点 → 顶部出现「导出图片」→ 点击 → 画布新增图片展示节点