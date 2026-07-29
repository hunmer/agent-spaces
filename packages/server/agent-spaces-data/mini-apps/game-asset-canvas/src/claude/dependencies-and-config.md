# 依赖与配置

## 项目依赖特征

- **无 `package.json`**：项目自包含，所有运行时依赖经宿主 allowlist 或本地 vendor/CDN 提供。
- **无构建步骤**：宿主 react-renderer 即时编译 `index.jsx` 依赖图。
- **vendor 本地大资源**：`src/vendor/` ~51MB（Pixelorama web 导出占大头）。

## 第三方库（宿主 allowlist 暴露）

新增库必须**两处都改**：
1. `packages/web/src/components/mini-apps/react-renderer.tsx` 的 `resolveExternalModule` allowlist + 顶部 import
2. `packages/web/src/lib/ui-exports.ts` 导出到 `window.AgentSpacesUI` / `@agent-spaces/ui`

| 库 | 版本 | 用途 | 暴露方式 |
|----|------|------|---------|
| `@xyflow/react` | 12.10.2 | ReactFlow/NodeResizer/NodeToolbar/useReactFlow/ViewportPortal | bare import allowlist |
| `@dagrejs/dagre` | 3.0.0 | 自动布局（default + graphlib） | bare import allowlist |
| `@agent-spaces/ui` | - | 宿主 UI 组件库 + lucide 图标 | `window.AgentSpacesUI` + bare import |

### `@agent-spaces/ui` 已暴露的能力（部分）
- 容器/布局：Dialog/DialogTrigger/DialogContent、Tabs/TabsList/TabsTrigger/TabsContent、Popover、ScrollArea、ResizablePanelGroup/ResizablePanel/ResizableHandle、InputGroup/InputGroupAddon/InputGroupButton
- 表单：Button/Input/Textarea/Select/Checkbox/Switch/ColorPicker/Tooltip*
- 反馈：MediaGallery/openMediaGallery、Markdown
- 业务：FileUpload、WorkflowListDialog、WorkflowGroupOverlay/useGroupManagement
- 图标：`export * from 'lucide-react'`（Layers/Trash2/Crosshair/Undo2/Redo2/Pipette/SquarePen/MousePointer2/Hand/SquareMousePointer/MapPinned/Eraser/等）

> **不要直接 `import from 'lucide-react'`**（不在 allowlist，react-renderer 解析为 undefined 会报 `Cannot read properties of undefined`）。一律从 `@agent-spaces/ui` 命名导入。

## vendor 本地库（src/vendor/，不走 allowlist）

经 `window.AgentSpaces.srcFileUrl` 拿 URL + dynamic import / `(0,eval)` 求值。加载封装在 `utils/image-ops/cdn.js`。

| 文件 | 版本 | 大小 | 加载方式 | 用途 |
|------|------|------|---------|------|
| `fabric.min.js` | 5.3.0 UMD | - | `(0,eval)` 挂 `window.fabric` | UiSplitter/BBoxViewer 画布编辑器 |
| `browser-image-compression.js` | 2.0.2 UMD | 57KB | `(0,eval)` 挂 `window.imageCompression`，Web Worker | BBox AI 分析/反推提示词前压缩图片 |
| `painterro.min.js` | 1.2.92 IIFE | 295KB | `loadVendor` + `esmSuffix` 转 ESM（追加 `export default Painterro;`） | 图片编辑节点 |
| `jszip.js` | - | - | `loadVendor` + Blob URL dynamic import | ZIP 打包 |
| `gifenc.js` / `gifuct-js.js` / `image-q.js` | - | - | 同上 | GIF 编解码 + Wu 量化 |
| `img-comparison-slider.js` | - | - | `(0,eval)` 注册 customElement | 图片对比节点 |
| `spine/pixi-7.3.3.min.js` | 7.3.3 | 444KB | `(0,eval)` 挂 `window.PIXI` | Spine 渲染 |
| `spine/pixi-spine-3.8-4.0.6.js` | 4.0.6 | 145KB | `(0,eval)` 挂 `PIXI.spine` | Spine 3.8 解析/渲染 |
| `spine/spine-pixi-v7-4.2.119.min.js` | 4.2.119 | 190KB | 按 JSON 版本懒加载 IIFE，缓存独立 namespace | Spine 4.2 JSON 解析/渲染 |
| `spine/jszip-3.10.1.min.js` | 3.10.1 | 95KB | `(0,eval)` 挂 `window.JSZip` | Spine 三件套 ZIP |
| `pixelorama-web/` | Godot 4.7 导出 | ~45MB | iframe（含 index.pck 12MB + index.wasm 37MB + service worker） | 像素编辑器节点 |

### Pixelorama 特殊处理
- **COOP/COEP（SharedArrayBuffer 前提）由自带 service worker 注入**：`index.service.worker.js` 的 `ensureCrossOriginIsolationHeaders` 给响应补 `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`。零宿主改动。
- **service worker 缓存陷阱**：`CACHEABLE_FILES` 默认会缓存 `index.pck`/`index.wasm`，改 GDScript 重导出后浏览器加载旧 pck。**已改 `CACHEABLE_FILES=[]`**（pck/wasm 不缓存，每次拉最新）。调试遇「改了没反应」：无痕窗口或 F12→Application→Service Workers→Unregister + Clear site data。
- **iframe 同源**：src 用父页面 origin（`window.location.origin`）拼，dev(3000)/dist(3100) 都同源。**不要用 `srcFileUrl` 解析的 origin**（dist 的 3100，dev 下父页面 3000 → 跨域 SecurityError）。
- **中文支持**：Roboto 不含 CJK，已加 `fallbacks=[SimHei.ttf]`（9.7MB，复制自 `C:/Windows/Fonts/simhei.ttf`）。
- **跳过欢迎页**：URL 固定带 `?nosplash=1`，`Main.gd` 检测到直接 return。

## CDN 库（esm.sh 动态 import）

URL 集中在 `utils/image-ops/cdn.js`。经宿主 `window.AgentSpaces.loadCdnModule(url)`（`new Function('u','return import(u)')` 绕过打包器静态分析）。按 URL 缓存。

- gifenc / gifuct-js / image-q / jszip（esm.sh 自动 CJS→ESM 转译）

## 配置文件（configs/）

### 数据布局
```
configs/
  settings.json                  # 全局共享（用户级偏好）
  prompt-library.json            # 全局共享（自定义提示词库，数组）
  panel-layout.json              # 全局共享（{layout:{panelId:pct}, showMinimap, savedAt}）
  workspaces.json                # 全局共享（{activeId, workspaces:[{id,name,createdAt}]}）
  workspaces/
    <id>/
      canvas.json                # 按工作区隔离（{nodes, edges, groups, savedAt}）
      generation-history.json    # 按工作区隔离（[item, ...]，HISTORY_MAX=200）
      asset-library.json         # 按工作区隔离（{categories:[{id,name,createdAt,assets}]}）
```

> 旧版顶层 `canvas.json` / `generation-history.json` 仍存在（迁移前数据），新数据全走 `workspaces/<id>/`。

### settings.json 字段（utils/settings.js DEFAULT_SETTINGS）
- 工作流槽位：`textToImageWorkflowId/Name` / `editImageWorkflowId/Name` / `imageEnchanterWorkflowId/Name` / `textToVoiceWorkflowId/Name` / `videoGeneratorWorkflowId/Name`
- BBox AI 分析：`bboxAgentConfigId` / `bboxAgentName` / `bboxAiUserPrompt` / `bboxCompressThresholdMB`（默认 2）/ `bboxCompressTargetMB`（默认 1）
- 反推提示词：`promptReverseAgentConfigId` / `promptReverseName` / `promptReverseUserPrompt`

> systemPrompt 归 agent preset 自带（openAgentEditor 弹窗里编辑），**不存 settings.json**。

### workspaces.json 字段
```json
{
  "activeId": "default",
  "workspaces": [{ "id": "default", "name": "默认工作区", "createdAt": 1730000000000 }]
}
```
- 首次无清单时兜底返回 `default` 默认工作区（不阻塞使用）。
- 至少保留一个工作区；删当前激活时 activeId 回退到第一个。

## 环境差异

| 环境 | 端口 | iframe origin | 备注 |
|------|------|--------------|------|
| dev | 3000 | `window.location.origin`（3000） | 宿主 dev 服务 |
| dist | 3100 | `window.location.origin`（3100） | 宿主 dist 服务 |

- `srcFileUrl` 解析的 origin 是 dist 的 3100，**dev 下不要用它做 iframe src**（跨域）。
- 后端图片路由：`/api/mini-apps/<projectId>/(data/file|src/file|local-file|proxy-image)`，与 host API `proxyImageUrl`/`dataFileUrl`/`srcFileUrl`/`localFileUrl` 产出的 URL 一致。

## 关键常量速查（utils/constants.js）

| 常量 | 值/说明 |
|------|--------|
| `SAVE_DEBOUNCE` | 600ms（useCanvasState 防抖保存） |
| `HISTORY_MAX` | 200（service 端截断） |
| `ASSET_MAX_PER_CATEGORY` | 500 |
| `DEFAULT_WORKSPACE_ID` | `'default'` |
| `BUILTIN_PLUGIN` | `'@agent-spaces/builtin'` |
| `EXEC_TOOL` | `'execute_workflow_sync'` |
| `MAX_WAIT_MS`（workflow.js） | 600000（10 分钟，execute_workflow_sync 上限） |
