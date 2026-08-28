# 开发约定

## 改动生效规则（重要）

| 改动范围 | 生效方式 |
|---------|---------|
| `src/**` 源码（含 manifest/api.js/tools.js/节点/服务） | **浏览器刷新即生效** |
| `src/services/*.js` | chokidar watcher 热重载，无需重启 |
| 宿主层（`packages/web/src/components/mini-apps/*` / `ui-exports.ts` / `use-mini-app-host-api.tsx` / server routes） | **必须重启 web 服务** |

## 必读契约

- **改前读 `src/handoff.md`**（索引型交接文档：改 X 去 Y + 全部坑点），改后同步更新。
- 详情文档在 `src/claude/*.md`（本目录）；handoff.md 是活文档，两者互补。

## ReactFlow 约定（务必遵守）

1. **节点 `selected` 不许覆盖**：decoratedNodes 不设 `selected`；`selectedId` 只用于面板高亮。
2. **NodeResizer**：建节点必须同时给顶层 `width/height` + `style:{width,height}`。
3. **交互抑制**：节点内容区 + NoteNode textarea 加 `nodrag nopan nowheel`。
4. **删除键**：`deleteKeyCode={['Backspace','Delete']}`；焦点在输入框时 ReactFlow 故意忽略。
5. **懒加载**：不开 `onlyRenderVisibleElements`，统一 `useViewportActivation`（首次进入视窗永久激活）。
6. **手动连线**：`Canvas.jsx` 的 addConnections 用 `MarkerType.ArrowClosed`，必须从 `@xyflow/react` 显式导入。
7. **多选隐藏 toolbar**：NodeToolbar `isVisible={selected && selectionCount <= 1}`。
8. **边颜色是展示态**：`decorateEdgesForSelection` 按顺序 `getEdgeColor(edge,index)`；变量 Decoration 复用同函数同顺序（{变量} 与边同色）；颜色不写入持久化 edges；label 仅在边关联**选中或 hover** 节点时显示（hoveredNodeId 控制，不持久化）。
9. **自动吸附**：`snapGrid` 开启时先网格吸附，`useAlignmentGuides` 再对齐辅助线（阈值屏幕 6px）；多选拖拽不介入；松手/关闭/离开必须清辅助线。
10. **拖拽自动平移**：文件/图片拖拽 72px 边缘热区由 `useCanvasDragAutoPan` 接管，位移走受控 `setViewport`（`useReactFlow()` 不保证暴露 panBy）；drop/dragend/离开/卸载都要停动画帧。

## 数据派生约定（最易踩坑区）

1. **透传节点优先当前派生输入**：imageDisplay/videoDisplay 有连入边时向下游转发必须取 computeInput* 本轮派生值（含空数组），不回退旧 `data.images/videos`。
2. **videoEditor 上游视频是去重合并**（`[...own, ...upstream]`），不是覆盖——它是编辑器，用户会上传自己的视频。
3. **输出协议**：图片统一 `output.images: string[]`（URL 数组，禁止改对象数组）+ 并行 `output.resources[]`（thumb/groupName/label 可选）；缩略展示回退 `thumb || url`。`computeInputImages` 同步派生 `data.imageResources`。
4. **媒体 URL 不作 React key**：同 URL 会重复出现，统一 `utils/list-keys.js` 的 `occurrenceKeys`（出现序号+URL）。
5. **文本连线是引用不复制**：`data.output.text` → `computeInputTexts` 派生到 `data.textInputValues`；目标组件保留 `data.params` 模板；edge 用 `data.inputType='text'` + `inputTarget` + 可选 `inputVariable`（只替换同名 {变量}）。
6. **对话框编辑态持久化到 `data.<featureData>`**（gridStitchData/editMaskPaintData/bboxData 等），不要只放 Dialog useState；换输入资源时清旧数据。
7. **输出预览模式是节点级状态**（`data.outputPreviewMode`）；有无产出只看 `data.output.images`，不能把 `data.images`（上游输入）误判为输出。
8. **节点自定义标题存 `data.title`**（EditableNodeTitle 原位编辑，空回退类型中文名）；Agent 用 `add_node.title`，旧 `label` 仅兼容。

## 执行/工作流约定

- **必须 `max_wait_ms:600000`**（默认 120s 会超时）；解析兜底 end → data.images → 任意 completed；媒体节点走 `onGenerateMedia` + `returnRawEndOutput:true`。
- **提交前 `normalizeImageUrls`**；产出图 `persistImagesToBackend` 落地（外链换 httpUrl）。
- **中断**：`callPluginTool` 不可中断；中断靠 `stopWorkflow(executionId)`（并行订阅 `workflow:started` 拿 id）。
- **生成记录双路径都写 history**：节点内「生成」走 handleGenerate，表单「⚡生成」走 useExecutionQueue.submit → onComplete 也必须调 addHistory。
- **队列中断立即清节点状态**：cancel 经 onCancel 把 placeholderNodeId 写 `loading:false,status:'cancelled'`；晚到结果用 cancelledJobIdsRef 丢弃。
- **工作区数据目录单写非双写**：directory 设了产图只落一份 `{historyId}/{index}.ext`，返回 localFileUrl；**historyId 必须在 generateImages 前生成**（与 addHistory 共用同 id）；改动需同步 `useWorkflow` + `useExecutionQueue.submit` 两处调用点。
- **分组多实例执行冻结节点身份**：`nodeIds[templateNodeId]` 稳定生成，请求携带 `executionTarget`，结果按 target 写回对应 run；禁止完成时读当前 activeId 认领；队列活动集合用 executionNodeId。
- **分组「运行所有」先选 runs 再串行**；运行期间允许切换实例，禁止切模式/上传/删除/拖连线。

## 状态管理约定

- 单一数据源 `useCanvasState(workspaceId)`；ref 模式读最新值（`nodesRef.current`），deps 去掉 nodes/edges 保 callback 稳定。
- 持久化防抖 SAVE_DEBOUNCE=1000ms；saveCanvas 按工作区串行合并；多端同步 onCanvasChanged，本地 dirty 不套用远端。
- 多工作区隔离：`configs/workspaces/<id>/`；settings/prompt-library/panel-layout/node-presets 全局共享。
- config 初始读取三重读取：`getConfig + onConfigReady + onAnyConfigChanged`。
- 剪贴板是模块级内存（utils/clipboard.js），刷新失效；焦点在输入区放行浏览器原生 Ctrl+C/V。

## 图片处理约定

- 本地算法统一签名 `(ImageData, params) => ImageData`；云端处理器用 `__url` 透传跳过 ImageData 管道。
- 批量并发 `Promise.allSettled`；多图上传并发 uploadFile。
- 提示词交互 = 展示+合并：选中库存 `params.pickedPrompt`（PickedPromptBadge 展示），提交时 `[pickedPrompt, prompt]` 去空去重合并，三处表单一致。
- 编辑图片参考图 mention 用 `#1/#2/…`，编号顺序必须与提交的 `input.images` 一致。

## UI/CSS 约定

- **FileUpload 缩略图作用域 CSS**：mini-app 源码无法生成 Tailwind `group-hover`/`bottom-*` 工具类，显隐/定位/尺寸全部用组件内 `.game-asset-upload-thumb*` / `.game-asset-output-actions` 作用域 CSS；上传入口是缩略图网格第一个单元格；产出操作栏底部居中。
- 图片排序拖拽期间向 ImageHoverCard 传 `disabled`（拖拽开始立即关预览）。
- 共享 FileUpload 点击缩略图走宿主 Gallery（宿主层 file-upload.tsx，改它需重启）。
- 分镜 scene handle 列表绝对定位在 NodeShell 外部避开 overflow 裁剪；动态 handle 依赖 `useUpdateNodeInternals`。
- 视频编辑器播放器常驻（切 tab 只切显隐不卸载）；截帧原分辨率无损 PNG；cropRegion 用 0..1 归一化；动画组派生 frames 必须 useMemo/useCallback 稳定。
- Spine gizmo 坐标只用 `spine.transform.localTransform`（用 worldTransform 会重复应用父容器 fit/zoom）。

## Agent RPC 约定

- 批量优先：`add_nodes` / `connect_batch`；「这个/它/选中的」先 `get_selection`；改枚举参数前必 `get_node_params`。
- `ctxRef` 持最新值 + effect deps `[]` 只订阅一次；useCanvasAgentRpc 放 Canvas.jsx nodeCallbacks useMemo 之后（TDZ）。
- 宿主 taskEvents 必须增量全量分发（React 批处理并发 WS 事件，只发最后一条会超时）。
- API schema = 节点即文档：tools.js 不内联枚举值；PARAMS_SCHEMA 的 options 直接引用 constants 的 OPTIONS。

## 命名/编码风格

- 组件 PascalCase，工具/hooks camelCase；节点 type id camelCase，label 中文。
- 中文注释 + 中文 UI；标识符英文。
- TDZ 规避：被依赖的 const/useCallback 先声明。

## 安全边界（不要做）

- 不在 mini-app 内 `npm install`（无 package.json）。
- 不用 `URL.createObjectURL` 存图（刷新失效），用 `uploadFile` 拿 http URL。
- 不直接 `import from 'lucide-react'`（不在 allowlist），从 `@agent-spaces/ui` 命名导入。
- 不绕过 `services/canvas.js` 直接写 configs。
