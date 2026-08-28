# 常见问题（FAQ）

## Q: 改了源码刷新没生效？

**A:** 按改动范围分情况：
- `src/components` / `src/hooks` / `src/utils` → 浏览器**强制刷新**（Ctrl+Shift+R），有时 dev server 缓存。
- `src/services/*.js` → chokidar watcher 热重载，看启动日志 `reloaded services for game-asset-canvas`。**只重载已加载过的项目**，首次 invokeService 才惰性加载。
- 宿主层（`packages/web/*` 或 `packages/server/*`）→ **必须重启 web 服务**。
- `manifest.json` → 重启 web 或刷新 mini-app 列表。

定位路径：先看 F12 Network 是否 200 拿到新 `index.jsx`，再看 Console 是否有报错。

## Q: 节点删除键（Backspace/Delete）不工作？

**A:** 焦点在 textarea/input/select/contenteditable 时 ReactFlow **故意忽略**删除键（防误删输入）。解决：先点画布空白处或节点非输入区让 ReactFlow 重获焦点，节点保持选中后再按删除键。
- 检查 `deleteKeyCode={['Backspace','Delete']}`（v12 默认只含 Backspace，必须显式补 Delete）。

## Q: 节点 resize 拖拽无效？

**A:** NodeResizer 要求节点同时有：
1. 顶层 `width`/`height` 字段
2. `style: { width, height }`

二者都给。只给一个 resize 无效。建节点时用 `DEFAULT_SIZE[type] || DEFAULT_SIZE.default`（见 `utils/canvas-constants.js`）。

## Q: 工作流执行报「超时」或「未返回图片」？

**A:**
- **必须传 `max_wait_ms:600000`**：`execute_workflow_sync` 默认 120s，jimeng/可灵等异步生成经常超时。`utils/workflow.js` 的 `runWorkflow` 已传满上限。
- 检查工作流 ID 是否正确（设置页或 `constants.WORKFLOWS`）。
- 看 `steps` 是否有 `error`：`runWorkflow` 在 status≠completed 时从 steps 反向找 error 信息抛出。
- 真超时（timedOut=true 且无产出）抛「工作流执行超时（>10分钟）」。

## Q: 上传图片刷新后丢失？

**A:** 用了 `URL.createObjectURL`（刷新失效）。**必须**用 `window.AgentSpaces.uploadFile(file)` 拿 http URL（返回 `.url`，存到 `data/uploads/`）。

## Q: 节点产出图提交给工作流，后端下载失败（跨域）？

**A:** 节点产出可能是相对路径（如 `/static/uploads/xxx.png`），浏览器同源能展示，但提交给工作流后端跨域下载会失败。**所有「节点产出图 → 提交工作流」前必须 `normalizeImageUrls`**（补 `window.location.origin`）。
- 媒体外链图同样用 `persistImagesToBackend` 下载到后端 data/ 换 httpUrl。

## Q: 「ImageResult」「HistoryCard」报 `item.src.startsWith is not a function`？

**A:** `openMediaGallery` 的 items 已经是 `[{src, type}]` 对象数组，**不可二次 map**。再 `.map((src)=>({src,...}))` 会让 `item.src` 变成对象。
- 正确：`openMediaGallery(items, index)` 直接传 items。
- 错误：`openMediaGallery(items.map((src)=>({src, type:'image'})), index)`。

## Q: 队列产出在「生成记录」tab 不显示？

**A:** `useExecutionQueue` 的 `onComplete` **必须也调 addHistory**。曾遗漏导致队列产出节点有了但历史 tab 空。
- 节点内「生成」走 `handleGenerate`（已写），表单「⚡生成」走 `submit → onComplete`。

## Q: 设置/历史/提示词库首次读取空？

**A:** 组件挂载时 config 快照可能未 ready（`getConfig` 返回 null）。**必须用三重读取**：`getConfig + onConfigReady + onAnyConfigChanged`。
- 见 `useGenerationHistory` / `useSettings` / `usePromptLibrary` / `useWorkspaces`。

## Q: 多选节点时各节点 toolbar 还在显示？

**A:** NodeShell 的 NodeToolbar 必须 `isVisible={selected && selectionCount <= 1}`。`selectionCount`（当前选中节点总数）由 Canvas `onSelectionChange` 维护，经 decoratedNodes 注入到每个节点 data。多选时全隐藏避免干扰框选。

## Q: Dialog 内按 Delete 误删节点？

**A:** ReactFlow `deleteKeyCode` 通过 `useKeyPress` 在 **document bubble 阶段**监听。Dialog 打开时按 Delete 会冒泡到 document 误删节点。
- **正解**：Dialog 的 keydown 用 **window capture 阶段**（`addEventListener('keydown', fn, true)`），capture 先于 document bubble，`stopPropagation()` 阻止事件到 document。
- 见 `UiSplitterDialog` / `BBoxViewerDialog`。

## Q: 改了 Pixelorama GDScript 重新导出，浏览器加载的还是旧的？

**A:** service worker 缓存陷阱。`index.service.worker.js` 的 `CACHEABLE_FILES` 默认会缓存 `index.pck`/`index.wasm`。
- **已修复**：`CACHEABLE_FILES=[]`（pck/wasm 不缓存）+ 加 `CACHE_VERSION` 后缀。
- 调试遇「改了没反应」：无痕窗口，或 F12→Application→Service Workers→Unregister + Clear site data。

## Q: Pixelorama iframe 报 SecurityError？

**A:** iframe src 用**父页面 origin**（`window.location.origin`）拼，保证 dev(3000)/dist(3100) 都同源。
- **不要用 `srcFileUrl` 解析的 origin**：它是 dist 的 3100，dev 下父页面 3000 → 真跨域 → SecurityError。

## Q: BBox AI 分析返回的框与图片错位？

**A:** 根因是 AI 返回的 coords 基于「AI 看到的图」尺寸，画布背景图是原图，两者尺寸不同。
- **正解（已修复）**：压缩时**不改尺寸**（`browser-image-compression` 只传 `maxSizeMB + useWebWorker`，**不传 `maxWidthOrHeight`**），AI 看到的图与画布显示的原图宽高完全一致，坐标天然 1:1，无需替换 sourceRef / fabric 背景图。
- 早期方案「压缩后用压缩图重建 sourceRef + 更新背景图」已废弃（画布预览图被压缩图替换，体验差）。

## Q: `Cannot access 'X' before initialization`（TDZ）？

**A:** 被依赖的 `const`/`useCallback` 必须先声明。常见场景：
- `REMBG_MODELS` 必须在 `CUTOUT_PARAMS` 之前（CUTOUT_PARAMS.rembg 引用此常量）
- `fitToStage` 必须在 `handleAiAnalyze` 之前（handleAiAnalyze deps 含 fitToStage）
- `deleteSelectedRects` 必须在 `pushHistory`/`renderList` 之后（依赖它们）

## Q: 图标 import 报 `Cannot read properties of undefined`？

**A:** 直接 `import { Layers } from 'lucide-react'` 不在 allowlist，react-renderer 解析为 undefined。
- **正解**：从 `@agent-spaces/ui` 命名导入（`export * from 'lucide-react'` 已暴露）。
- 注意 `SquareDashed` lucide-react 没导出（文件存在但主入口未导出），改用 `SquareMousePointer`。

## Q: 怎么调试 Agent RPC？

**A:**
- 服务端日志看 `ctx.requestClient` 调用和 `respondClientRequest` 响应。
- 浏览器 F12 console 看 `canvas RPC error:` 日志（`useCanvasAgentRpc` 的 catch）。
- 手动调：`window.AgentSpaces.onTaskEvent` 监听 + `respondClientRequest` 回复。

## Q: 怎么添加新 mini-app？

**A:**
1. 在 `packages/server/agent-spaces-data/mini-apps/` 下建目录（目录名 = id）
2. 写 `manifest.json`（id=目录名, type=react, mainFile=index.jsx）
3. 或插入 `mini-apps/index.json` 数组
4. 重启 web 或刷新 mini-app 列表

## Q: configs/canvas.json 被污染了（含 selected:true）？

**A:** 用 node 脚本清：
```js
const fs = require('fs');
const p = 'configs/workspaces/default/canvas.json';
const d = JSON.parse(fs.readFileSync(p));
d.nodes.forEach(n => { delete n.selected; delete n.data?.selected; });
fs.writeFileSync(p, JSON.stringify(d, null, 2));
```

## Q: panel-layout.json 旧格式（数组）报错？

**A:** 旧版是数组，新版是 `{canvas-main:72, canvas-right:28}` 对象。重置为对象格式即可。

## Q: 切上游历史版本后，更下游节点还残留旧图？

**A:** 透传节点（imageDisplay/videoDisplay）有连入边时必须转发 `computeInputImages/Videos` 本轮派生值（包括空数组），不能回退到节点持久化的旧 `data.images/videos`。检查 `useDecoratedNodes` 派生逻辑。

## Q: 同一张图出现多次时列表渲染错乱 / React 报 key 重复？

**A:** 工作流可能返回重复 URL。上游输入列表统一用 `utils/list-keys.js` 的 `occurrenceKeys` 生成「出现序号+URL」唯一 key，不要 `key={url}`。

## Q: 刷新后视频编辑器的动画组/帧全没了？

**A:** `VideoEditorDialog` 的 currentVideo effect 曾在首次挂载就清空数据。必须用 ref 记录前值并跳过首次挂载，仅前后视频 URL 确实变化时才清 frames/animGroups/videoInfo。

## Q: Agent 并发操作时部分 RPC 请求超时？

**A:** 宿主 `mini-app-renderer.tsx` 的 taskEvents 只发了 `.at(-1)`，React 批处理把多条 WS 事件合并，其余 `ctx.requestClient` 拿不到响应。必须用事件对象游标把本轮新增项逐条送给 `onTaskEvent`（宿主层改动，需重启 web）。

## Q: 分组多实例执行结果写到别的实例上了？

**A:** 请求没带/没按 `executionTarget` 写回。运行状态、取消、历史和产出只能按冻结的执行节点身份（`nodeIds[templateNodeId]`，由 groupId+runId+templateNodeId 稳定生成）写入对应 run；完成回调里禁止读当前 `activeId` 认领。队列活动集合用 `executionNodeId`，不能用实例间重复的 `placeholderNodeId`。

## Q: 中断队列后节点一直转圈 / 晚到的结果覆盖了「已取消」？

**A:** `useExecutionQueue.cancel` 必须经 `onCancel(job)` 立即把 placeholderNodeId 写为 `loading:false, status:'cancelled'`；异步任务晚到结果用 `cancelledJobIdsRef` 丢弃，中断异常不能再走 `onError` 覆盖节点状态。

## Q: 旧数据没有缩略图（resources/thumb）怎么办？

**A:** Toolbar「调试 → 一键补缩略图」批量补。协议上展示处始终回退 `thumb || url`；不要把 `images` 改成对象数组。

## Q: 粘贴节点时弹出的「应用属性」选什么？

**A:** 粘贴单个节点且当前选中节点与来源同类型时，先经 `PastePropertiesDialog` 选字段（默认全不选，可全选/反选；params 按子字段展开）。产出/派生/运行态字段（output/images/videos/status/loading/error 等）不参与应用。素材实例模式复制 `uploadedImages` 要排除来源的 `groupAssetInputUrls`、保留目标 run 自己的。

## Q: Spine 骨骼 gizmo 首次加载偏到右下角？

**A:** `_boneToContainer` 误用了 `worldTransform`（把父容器 fit/zoom/pan 重复应用）。角色和骨骼 Graphics 同挂 `spineContainer`，只应用 `spine.transform.localTransform`。

## Q: 文本连线后目标节点的输入框不见了？

**A:** 正常行为：文本字段有连线时 Tiptap HoverCard 列出边并隐藏输入框；全部断线后显示 fallback 输入（`data.textVariableValues` 手动值仍可用）。目标组件保留 `data.params` 模板，执行时用派生值。
