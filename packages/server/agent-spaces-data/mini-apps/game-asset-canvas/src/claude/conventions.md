# 开发约定

## 改动生效规则（重要）

| 改动范围 | 生效方式 |
|---------|---------|
| `src/**` 下源码（components/hooks/utils） | **浏览器刷新即生效** |
| `src/services/*.js` | chokidar watcher 热重载（dev 启动日志 `[mini-app-services] services file watcher started`），无需重启 |
| 宿主层（`packages/web/src/components/mini-apps/*` / `ui-exports.ts` / `use-mini-app-host-api.tsx`） | **必须重启 web 服务** |
| 宿主层（`packages/server/src/routes/mini-apps.ts` 等 server 文件） | **必须重启 web 服务** |
| `manifest.json` | 重启 web 或刷新 mini-app 列表 |

## 必读契约

- **改前读 `src/CLAUDE.md` + `src/handoff.md`**（旧契约 + 历次踩坑），改后同步更新。
- `CLAUDE.md` 现在仅是历史索引，**新文档写在 `src/claude/*.md`**（本目录）。

## ReactFlow 约定（务必遵守，否则行为诡异）

1. **节点 `selected` 不许覆盖**：不要在 `decoratedNodes` 里设置 `selected`，ReactFlow 自管。`selectedId` 只用于面板高亮联动。
2. **NodeResizer 要求**：建节点必须同时给顶层 `width`/`height` 字段 **和** `style:{width,height}`，否则 resize 无效。`NodeResizer isVisible={selected}`。
3. **交互抑制**：节点内容区 + NoteNode textarea 必须加 `nodrag nopan nowheel` class，否则节点内滚动/选文本会误触画布。
4. **删除键**：`deleteKeyCode={['Backspace','Delete']}`（v12 默认只含 Backspace，必须显式补 Delete）。焦点在 textarea/input 时 ReactFlow 忽略删除键，需先点画布空白让 ReactFlow 重获焦点。
5. **节点内容视窗懒加载**：不要开启 `ReactFlow.onlyRenderVisibleElements`（会让节点离屏后卸载、重新进入时重建图片）。统一由 `useViewportActivation` 控制：节点首次进入视窗后挂载正文并永久保持，已加载图片离屏再进入时不重新加载。

## 状态管理约定

- **单一数据源**：`useCanvasState(workspaceId)` 持有 `nodes/edges/groups`，所有 setNodes/setEdges/setGroups 都走它。其他 hook 通过 props/闭包读取。
- **callback 稳定性**（ref 模式）：只读最新 nodes/edges 的 callback 用 `nodesRef.current`/`edgesRef.current` 读，deps 去掉 nodes/edges → 稳定 callback，避免触发 `decoratedNodes` 全量重算。
  - ref 同步：`nodesRef.current = nodes`（渲染期直接赋值，React 推荐模式，非 useEffect）。
  - `nodeCallbacks` 的 deps **逐个解构具体 callback**（而非整个 executions/crud 对象），任一稳定则 nodeCallbacks 稳定。
- **持久化防抖**：`useCanvasState` 用 `SAVE_DEBOUNCE=1000ms` 防抖保存，`saveCanvas` 按工作区串行合并在途请求；多端同步用 `onCanvasChanged` 订阅，本地 dirty 时不套用远端更新。

## 工作流调用约定

- **必须传 `max_wait_ms:600000`**：`execute_workflow_sync` 默认 120s，jimeng/可灵等异步生成经常超时。
- **结果解析兜底**（`extractOutput`）：end 节点 → 生成节点 `data.images` → 任意 completed 节点；媒体用 `returnRawEndOutput:true` 跳过图片专用提取。
- **超时容错**：`timedOut=true` 且无产出时抛明确超时错误（不抛隐晦的「未返回图片」）。
- **URL 规范化**：所有「节点产出图 → 提交工作流」前必须 `normalizeImageUrls`（相对路径补 `window.location.origin`），跨域下载才不失败。

## 图片处理约定

- **本地算法签名统一**：`(ImageData, params) => ImageData`，多输入/多输出走数组。详见 `image-ops/`。
- **`__url` 透传机制**：云端处理器（enhance/compress）run 直接返回 URL，用 `{__url}` 标记，`runProcessor` 跳过 ImageData 转换（与 `__gifUrl` 同款）。
- **多图批量并发用 `Promise.allSettled`**：部分失败不阻塞成功的，全部失败才抛错。
- **`persistImagesToBackend`**：外链图（含音频/视频）下载到后端 data 目录换 httpUrl，避免防盗链/CORS/过期。失败保留原地址。
- **Painterro 挂载**：必须传唯一 `id` 并使用独占空容器；构造函数会先触发一次 `onHide`，只能在 `show()` 成功后响应关闭。React 状态节点放在挂载容器之外。其运行时 CSS 会把 holder 重置为 fixed，Dialog 内嵌时必须用 holder 内联样式限制边界，并显式提高 `.ptro-bar` 层级。
- **图片取色**：复用 `ImageEditorDialog mode="colorPicker"` 和同一 Painterro 画布；取色模式不能把 `select`/`brush` 当吸管，应先用 `closeActiveTool(true)` 清空活动工具，再启用 Painterro 内部 `colorPicker.choosing`（自带像素放大镜），通过 `setZoom` 提供缩放。颜色字段通过 `ParamField.colorPicker + onPickColor` 接入，并由持有输入图的节点负责回填参数。

## Agent RPC 约定

- 服务端 `src/api.js` 的画布操作通过 `ctx.requestClient` RPC 到浏览器（`miniApp.clientRequest` 事件），浏览器 `useCanvasAgentRpc` 订阅后 setNodes/setEdges。
- **批量优先**：建多个节点用 `add_nodes`（一次 RPC），连多条线用 `connect_batch`。
- **`get_selection`** 在用户说「这个」「它」「选中的」时先调，拿选中节点 id 再操作。

## 命名/编码风格

- 文件名：组件 PascalCase（`Canvas.jsx`/`NodeShell.jsx`），工具/hooks camelCase（`useCanvasState.js`/`canvas-id.js`）。
- 节点 type id 用 camelCase（`textToImage`/`ipGifSplit`），label 是中文（`文字生成图片`/`GIF 拆帧`）。
- 中文注释 + 中文 UI 文案；代码标识符英文。
- TDZ 规避：被依赖的 `const`/`useCallback` 必须先声明（如 `REMBG_MODELS` 在 `CUTOUT_PARAMS` 之前；`fitToStage` 在 `handleAiAnalyze` 之前）。

## 安全边界（不要做）

- 不要在 mini-app 内调 `npm install`（项目无 package.json，依赖走宿主）。
- 不要直接 `URL.createObjectURL` 存图片 URL（刷新失效），用 `window.AgentSpaces.uploadFile` 拿 http URL。
- 不要从 `lucide-react` 直接 import 图标（不在 allowlist），从 `@agent-spaces/ui` 命名导入。
- 不要绕过 `services/canvas.js` 直接写 configs（并发覆盖风险）。
