# Findings

## 视频编辑器帧播放器重构（2026-08-03）

- README 指定库为 `@mediamonks/fast-image-sequence`，零依赖；核心类构造为 `new FastImageSequence(container, {frames, src:{imageURL}, loop, objectFit})`，通过 `play(fps)` / `stop()` / `progress` 控制。
- README 提供 React 组件，但 mini-app 外部模块受 allowlist 限制，用户明确要求 dist CDN 本地化，预计应下载浏览器 dist 并通过 vendor loader 使用核心类。
- 当前 `FramePlayer` 自行逐张解码全部图片并用 rAF 绘制；可替换为对本地 dist 的通用 React 包装组件。
- `VideoEditorDialog` 当前主区只有原生 `<video>`，动画组卡片各自嵌入旧 `FramePlayer`；帧列表仍有 dots 菜单设置各组起止帧，需读取未截断源码确认完整回调链。
- README 共 503 行，未提供 CDN/dist 文件名，仅给 npm 包名与源码构建方式；需查询 npm 包实际 exports/files 后确定稳定 CDN URL。
- 当前动画组创建固定 `startFrame=0/endFrame=0`；dots 菜单按“帧→已有组”写边界。新交互应改为 Dialog 层 `selectedStartFrame/selectedEndFrame`，帧点击只更新选区，新建组读取该选区。
- 主预览区域位于中栏顶部，可增加“视频播放器/帧预览”Tabs；帧预览使用当前选区，动画组卡片仍可复用同一通用播放器。
- 切换视频和重新截帧时应重置当前选区，防止索引超出新 frames。
- npm 当前版本为 `@mediamonks/fast-image-sequence@2.2.0`；主 ESM 入口是 `fast-image-sequence.js`，React 入口是 `fast-image-sequence-react.js`。固定版本 CDN 可用 jsDelivr 的包文件 URL。
- 项目已有 `utils/image-ops/cdn.js`：从 mini-app `src/file/vendor/...` fetch 源码，转 Blob URL 后 dynamic import，适合加载本地 ESM dist，无需修改宿主 allowlist。
- 包主入口仅 136 字节并相对 import `./FastImageSequence-jb1XI9BR.js`；核心 chunk 约 37KB。现有 fetch→Blob loader 无法解析该相对 import，应为此库直接 dynamic import 本地 `srcFileUrl`，让浏览器按 vendor HTTP 路径解析 chunk。
- jsDelivr 包清单仅需核心入口与 chunk（图像 URL 模式）；React dist 额外依赖 React，不采用。
- jsDelivr `.min.js` 仍保留相对 chunk import，不能单文件使用；固定下载 `fast-image-sequence.js` 与 `FastImageSequence-jb1XI9BR.js` 两个文件。
- 核心类会自行创建 canvas，支持 `play/stop/progress`，并在容器脱离 DOM 时自动 `destruct()`；组件主动清理仍应调用 `destruct()`。
- 图片 URL 源的 worker 代码内联在核心 chunk，不需要额外下载 worker 文件。
- `FastImageSequence` 构造时向容器附加 canvas；`ready()` 等待 sources 初始化；`tick` 可读取 `sequence.index`；`destruct()` 会停止动画、断开 observers、删除 canvas并释放来源缓存。
- 当前仓库只有 `VideoEditorDialog` 使用 `FramePlayer`，可新增 `components/FrameSequencePlayer.jsx` 并将旧 `nodes/FramePlayer.jsx` 改为兼容 re-export。
- 通用播放器应提供播放/暂停、帧滑杆、当前绝对帧号、fps 展示/可选修改，并在 frames/range 改变或卸载时 destruct 旧实例。
- 选区持久化为 `data.frameSelection`，主帧预览和新建动画组共享；重新截帧初始化为全范围，切换视频清空。
- dist 已下载：入口 136B、核心 chunk 37042B，SHA-256 分别为 `a61377412a426c81d0b497063527695c08493a7d7fa1fba5fea4d69772dc242c` 与 `517f31505b21d089761f2e95c9d72d17998440926e6202fcbfa6ecf097e1e99e`。
- 已新增 `getFastImageSequence` 直接 import 本地 HTTP 入口；新增通用播放器并将旧节点路径改为兼容 re-export。
- 视频编辑器已改为主预览双 Tabs、帧点击选区和按当前选区创建动画组；旧 MoreVertical/DotsSubmenu 链路无残留。
- 三个 JSX 文件 Babel 编译、两个本地工具 JS 和两个 vendor dist `node --check` 均通过，`git diff --check` 通过。
- Node 原生导入本地 dist 成功，导出包含 `FastImageSequence/clamp/isMobile`，证明入口与相对 chunk 完整。
- 最终审查发现两个可收紧点：sequenceKey 应显式包含 start/end，避免重复 URL 造成区间变化不重建；持久 selection 的非数值 end 应回退末帧而非传播 NaN。
- 上述边界已修正，并新增 `frame-selection.js` 纯函数与 5 项测试，覆盖默认全范围、越界/非法值、单击起点、起点越过终点、Ctrl/Cmd 终点。
- 当前 Web 的 mini-app 本地资源路由对 vendor 入口与相对 chunk 均返回 HTTP 200、`text/javascript`，本地原生 ESM 加载链路可用。
- 5 项选区测试通过，三个受影响 JSX Babel 编译、工具 JS 语法和 `git diff --check` 全部通过。
- 最终旧 dots 菜单实现与说明均已清除；主交接和视频交接已更新，vendor README 记录固定版本、CDN URL 与 SHA-256。

## 视频编辑器按秒间隔抽帧（2026-08-03）

- 新模式定义为从时间轴起点开始每 N 秒抽取一张，支持小数秒；ffmpeg 可用 `fps=1/N` 实现稳定的时间采样。
- 参数字段使用 `secondsInterval`，避免与现有按源帧序号采样的 `interval` 混淆。
- 实现已接入 `seconds` 模式，前后端均限制 `secondsInterval >= 0.01`，插件滤镜为 `fps=(1/secondsInterval)`。
- 静态验证通过：插件与 constants 语法、Dialog Babel 编译、双副本 diff、`git diff --check` 均无错误；UI、调用参数和插件分支均已检出。
- 用户视频真实插件结果：secondsInterval=0.5/1/2 分别输出 30/15/8 张，说明小数和大于 1 秒的间隔均生效。

## 分组运行所有（2026-08-03）

- 现有 `GroupOverlays`“批量运行”只调用 `onRunGroup(group.id)`，最终由 Canvas 将当前活动实例节点加入执行队列；它不会等待整组完成，不能在多个 run 之间直接复用。
- `handleGenerate/handleGenerateMedia` 返回可等待 Promise，适合“单个 run 内并行、runs 之间串行”的运行所有编排。
- 每轮需先切换 run 并等待 React 提交，再从最新 decoratedNodes 构建执行参数；执行结束后保存当前 nodeStates，才能安全切换下一实例。
- 最终实现同时支持 count 与 assets 两种模式的全部 runs；素材缩略图显示等待、运行中、完成、失败，运行中禁用模式、实例、上传、删除、连线及原批量运行入口。
- 验证结果：18 项相关 Node 测试通过，Canvas/GroupOverlays/GroupExecutionToolbar/useGroupExecution 均通过 Babel 编译，`git diff --check` 通过。

## 视频编辑器按帧拆分（2026-08-03）

- 新需求：增加按源帧序号间隔抽取模式；定义 N=1 取全部帧，N=2 取第 1、3、5…帧，362 帧源视频预期得到 181 张。
- 实现采用 ffmpeg `select=not(mod(n\,N))` 按解码帧编号选择，并配合 `-vsync 0` 防止输出阶段按时间戳补帧。
- UI/节点默认值新增 `interval: 2`，调用前向下取整并限制最小值 1；插件侧再次执行相同约束。
- 静态验证通过：两份插件和两个 constants 文件通过 `node --check`，Dialog 通过 Babel JSX 编译，插件副本 diff 为空，`git diff --check` 通过。
- 源码中的滤镜参数确认生成形式为 ``select=not(mod(n\\,${interval}))``，运行时会得到 ffmpeg 需要的单反斜杠转义逗号。
- 运行时插件真实验证：interval=1 输出 362，interval=2 输出 181，interval=3 输出 121，均等于 `ceil(362/N)`。
- 交接文档定义 `ffmpeg_extract_frames` 仅有 `count/fps` 两种模式；fps 模式执行 `-vf fps=N`。
- 当前常量中的 UI 标签是“按帧率”，`1fps` 表示每秒抽 1 帧，因此 15 秒输出约 15 张符合现有算法。
- 用户称其为“按帧”，目标很可能是逐原始帧全部导出；需核对当前 UI 和视频源帧率，再决定增加 all-frames 模式还是只修正文案。
- 用户视频 `像素待机.mp4` 经 ffprobe 确认：24fps、15.083333 秒、362 帧。
- UI 当前位于“按帧截取”区，模式标签为“按帧率”，字段为“帧率 (fps)”；插件收到 fps 模式后执行 `-vf fps=1`，15 张是准确结果，但“按帧”与“每秒采样”的表述容易误导。
- 修复决策：不篡改 fps 单位语义，新增 `all`（全部原始帧）模式；该模式不加 fps 滤镜，仅可选缩放，因此用户视频应输出 362 帧。同时将字段文案明确为“每秒抽取帧数”。
- 两份 `frames.js` 当前一致，mode 只接受 fps，否则回退 count；需同时扩展插件 action 元数据和运行分支。
- `VideoEditorDialog` 对非 fps 模式一律显示“帧数”，新增 all 后必须改为三分支，避免全部帧模式仍出现 count 输入。
- 工作区已有 manifest、mini-app 索引、panel-layout 等用户改动；本次不触碰。
- 已实现 all 模式：插件使用 `-vsync 0` 且不加 fps 滤镜；UI 增加“全部原始帧”，fps 字段改为“每秒抽取帧数”。
- 插件模板与运行时副本 diff 为空；两份插件通过 `node --check`，Dialog Babel 编译、constants 语法检查及 `git diff --check` 均通过。
- 使用运行时 `frames.js` action 和用户视频做真实集成调用：all 模式成功输出 362 帧；fps=1 模式仍输出 15 帧。临时产物已清理。

## 分组内应用节点属性（2026-08-03）

- `NodeShell` 上传区开关包含 `uploadHidden` 持久态、生成完成后自动折叠 effect、图标按钮及 `UploadCollapseContext.Provider`；`UploadSection` 还负责默认开启图片悬浮预览。
- 现有 `PastePropertiesDialog` 由 `useSelectionClipboard.propertyPaste` 驱动，字段来源为原始节点 data；`params` 展开，`images/output/status` 等派生或运行字段排除。
- 手动上传图存 `data.uploadedImages`；连线参考图只在 `useDecoratedNodes` 中派生为 `data.images`，原始节点不被覆盖。
- 分组素材执行也会写 `uploadedImages`，但同时用 `groupAssetInputUrls` 标识；双槽 `imageCompare` 写入 `first/second.uploadedImages`。
- 因此分组属性应用需排除来源 `groupAssetInputUrls`，并在目标 `uploadedImages` 及双槽上传字段中保留目标的 `groupAssetInputUrls`。
- 用户纠正：目标不是分组内其他节点，而是 `GroupExecutionToolbar` 的“按上传素材执行”下其他素材实例中的同一节点。
- 每个素材实例存于 `group.batchExecution.assets.runs[]`，节点快照为 `run.nodeStates[nodeId]`；画布当前节点对应 `assets.activeId` 的可见状态。
- 应用前需用当前画布状态保存 active run；随后更新其他 runs 的同一 nodeId，并更新 `assets.templateNodeStates[nodeId]`，避免后续上传或输出绑定重建时丢失应用属性。
- 按钮只对素材模式、存在 activeId 且 runs 数量至少为 2 的分组节点注入；嵌套分组命中时选择节点数最少的素材分组。
- 最终验证：相关 27 项测试通过，7 个受影响 JSX/Hook 文件 Babel 编译通过，`git diff --check` 通过。
- 验证结果：相关 26 项 Node 测试通过，6 个受影响 JSX/Hook 文件 Babel 编译通过，`git diff --check` 通过。

## 组输出自动绑定（2026-08-03）

- 用户要求参考 `packages/web/src/components/workflow/workflow-group-node.tsx:394-405`，在 `GroupExecutionToolbar` 最右侧增加组连线入口。
- 目标组需持久化过滤规则，支持全部、指定节点、按节点类型多选。
- 连线后的自动绑定只读取来源组节点当前输出，并用于目标组“按上传素材执行”，不读取生成历史。
- 宿主 `WorkflowGroupOverlay` 已实现自定义 pointer 拖线，但现有回调目标是 ReactFlow 单节点；mini-app 的 `handleGroupConnect` 会把来源组叶子节点连到该节点。
- `GroupExecutionToolbar` 当前最右侧没有组输入入口，素材模式仅支持本地上传，所有执行配置位于 `group.batchExecution` 并随 groups 持久化。
- 本次应建立独立的组到组素材绑定，不复用普通 ReactFlow edge，避免把组语义展开为节点边并污染节点输入派生。
- 绑定方向确定为：从来源组工具栏拖到目标组 overlay；目标组保存 `batchExecution.assets.binding`。
- 绑定素材只提取匹配节点的 `data.output.images`；一张当前输出图对应目标组的一个 assets run。
- 过滤配置采用互斥模式 `all/nodes/types`，其中 nodes/types 允许多选；断开连接需清理自动绑定 run 并恢复素材模板状态。
- 最终实现会持久展示来源组到目标组的虚线箭头；拖拽落点按所有 group 屏幕矩形中面积最小者判断，兼容 `pointer-events:none` 和嵌套组。
- 来源组被删除时目标组自动断开并恢复模板；手动上传新素材会清除既有自动绑定。
- 已阻止组输出绑定环，避免互相作为来源时反复重置输出。
- 验证结果：9 项 Node 测试通过，5 个受影响 JSX/Hook 文件 Babel 编译通过，`git diff --check` 通过，开发服务 3000 返回 HTTP 200。
- 用户运行时报错 `Cannot read properties of null (reading 'filter')`：对话框关闭时 `currentBinding?.sourceGroupId` 和 `state?.sourceGroupId` 均为 undefined，宽松分支条件意外成立，随后读取 null 的 `filter`。
- 修复为 `resolveGroupOutputFilter` 统一处理空绑定、来源不匹配和正常绑定；关闭状态稳定返回 all 默认过滤器。
- 第二次运行时错误来自宿主 `resolveExternalModule`：`react-dom` 与 `react-dom/client` 都返回从 `react-dom/client` 导入的 ReactDOM，因此 mini-app 的命名导出 `createPortal` 实际为 undefined。
- 最终方案不修改宿主：拖线期间用 `document.createElementNS` 创建 body 级 SVG，pointerup/cancel/unmount 统一清理；保留 fixed 屏幕坐标效果。
- 用户实际操作是从来源组连线手柄拖到目标组相同手柄；工具栏位于 group overlay 主体上方，原矩形命中不包含目标手柄区域，因此 drag end 日志中的 targetGroupId 会为空。
- 进一步确认来源是宿主 `WorkflowGroupOverlay` 的通用输出手柄；已新增 `onConnectGroup` 协议，松手时优先识别 mini-app 的 `data-group-connect-id` 输入手柄，再回退普通节点连接。

- `MiniAppPreview` 当前用 `chatDockOpen` 控制宿主外层 `ResizablePanel`，其中渲染 `MiniAppAgentDock`。
- React mini-app 由同页面内独立 React Root 渲染，不是 iframe，因此宿主可以用 React Portal 挂载到 mini-app 提供的 DOM 节点。
- `RightPanel` 是受控 Tabs，`Canvas.jsx` 持有 `rightTab`，适合通过 Host Slot 激活事件切换到 `chat`。
- `MiniAppProject` 字段是显式持久化/传递，新增 manifest 配置必须补服务端类型、导入和预览 props。
- Host Slot 注册表按 `projectId:name` 隔离，支持元素订阅、激活状态双向同步和卸载清理。
- 特殊模式中，Chat tab 的直接点击和宿主工具栏按钮都会同步 `chatDockOpen`；关闭 Chat 会恢复进入 Chat 前的 tab。

## Session tools 优化

- Session 共 4 条消息、55 次工具调用；两轮 Agent 回复分别调用 14 次和 41 次工具。
- 第二轮任务为基于已有 8 个角色三视图创建 8 个表情九宫格节点，日志显示 `add_node` 被逐个调用 8 次，存在明显批量效率优化空间。
- 最终画布为 16 个节点、8 条边、2 个分组；需继续检查分组成员、节点位置与工具返回值是否一致。
- 工具调用分布：`add_node` 19、`delete_node` 11、`WriteWorkspaceFile` 10、`update_nodes` 2、`add_nodes` 1；批量任务产生大量补偿调用。
- 日志中 `add_nodes` / `update_nodes` 的 `data` 实际形态为 `{ "$text": "{\"params\":...}" }`，而非 `{params:{...}}`；工具仍返回 `ok:true`，形成“假成功”。
- 分组重建阶段连续对单节点调用相同 `groupLayout`，最终 6 个节点落在完全相同位置 `(120,1162)`，说明单节点增量布局未正确考虑已在组内的节点。
- 最终分组包含已删除的 `editImage-mscr5b4l-11`，说明 `delete_node` 清理了节点和边，但没有同步清理 group.nodeIds。
- `useCanvasAgentRpc` 每次请求从 `ctxRef.current` 读取 React 最近一次渲染快照；并发 `add_node` 请求会共享旧的 `curNodes/curGroups`。
- `canvas.addNode` 先用函数式 `ensureGroupByName` 更新 group，随后却用旧 `curGroups` 调 `arrangeGroupAfterAdd`，因此并发调用布局时看不到同轮新增成员。
- `canvas.deleteNode` 只调用 `deleteFn(nodeId)`，没有调用 `setGroups` 移除 `childNodeIds`，与日志中的幽灵成员完全一致。
- `add_node` 的自动位置先基于旧 `curNodes` 计算，再把显式 position 传给 `createNodeAt`，绕过了后者原本用于连续新增防重叠的自动位置逻辑。
- 仓库内没有 `$text` 的业务处理代码，说明它是工具 schema/参数转换产生的兼容包装；API 必须显式解包，同时工具 schema 应声明 `params/text/output` 等常用结构。
- 当前 mini-app 无独立 package.json，已有纯 JS 测试使用 Node 内置 `node:test`，适合为数据解包和分组成员纯函数补回归测试。
- 已实现 `parseNodeData`：兼容 session 中的 `{ $text: "JSON" }`，非法 JSON 明确返回 `ok:false`，普通结构化 data 原样保留。
- 已实现纯函数分组成员累加/删除，并在 RPC 每次变更后立即更新 `ctxRef` 快照，避免同一渲染周期内并发请求读取旧状态。
- 批量创建改为先计算完整 additions 与位置，再同步写入 RPC 节点快照；新增 5 项回归测试，连同 5 项布局测试共 10 项通过。
- API 集成测试已直接重放 session 的 `$text` 输入，确认 `add_nodes` 下发给 RPC 的是结构化 `data.params`；非法 `$text` 不会发 RPC。
- 当前针对性测试共 12 项全部通过。
- Mini-app agent 注册逻辑原样使用 `src/tools.js` 的 `inputSchema`；仓库已有工具广泛使用 `additionalProperties`，新增 schema 字段符合现有运行时约定。
- 重要运行时约束：`compileApiJs` 会剥离 `api.js` 的所有 import 后用 `new Function` 加载，因此 API 入口不能依赖新增模块 import；数据解析函数必须内置在 `api.js`。
- 已从正式 server dist 调用真实 `compileApiJs/compileToolsJs`：成功加载 24 个 tools、24 个 API handler，`$text` 重放后 RPC 收到结构化 params。
- 最终回归新增“8 个增量归组节点 → 4×2 网格 → 8 个唯一位置”场景；最终目标测试 10 项全部通过。

## 批量连线显示问题

- `connect_batch` 返回 created=8/invalid=0，但用户观察到仅一个目标节点显示 Handle edge；图生图参考图已显示，说明输入派生链路至少读取到了连接关系。
- 验收数据：workspace `ws-ms7oxb6j-uar4` 的 `canvas.json`，8 条期望边为 `node-mscmg3ya-{1..8}` → `node-mscusvbg-{1..8}`。
- 指定 `canvas.json` 实际包含 16 节点、8 条边，source/target 与 inputType/inputTarget 全部正确，但所有 edge 都缺少 `id`。
- ReactFlow 以 `edge.id` 标识渲染元素；8 条边的 id 全是 undefined 会发生渲染键冲突，因此数据派生仍能读取全部边，UI Handle 连线却只稳定显示一条。
- 手动连线路径使用 ReactFlow `addEdge`，会自动补 edge.id；`prepareBatchEdges` 直接 push 裸 edge 对象，没有 id，导致仅批量工具路径出错。
- `useCanvasState` 初次加载和远端同步都直接 `setEdges(state.edges || [])`，现有持久化数据没有迁移机会。
- 修复策略：统一纯函数 `ensureEdgeIds`，保留合法唯一旧 ID，为缺失/重复 ID 生成稳定 ID；批量建边与画布加载共同使用，并在发现迁移时回写 canvas.json。
- 2026-08-03 续作复核：规划文件与交接结论一致，Phase 9 仍在进行，后续直接实施统一 edge ID 规范化和旧数据迁移。
- 当前工作区已有 manifest、panel-layout、mini-app 索引和旧规划文件删除等无关改动，修复时不触碰、不回退。
- `useCanvasState` 的初次加载与远端同步均直接保存原始 state 到 `lastSavedRef` 并设置原始 edges；迁移需先构造规范化 state，再写入 ref/state，才能避免同步签名循环。
- 复核发现批量新边生成 ID 时还需把现有 edges 纳入保留集合，避免与既有自定义 ID 冲突。
- 远端同步若 `dirtyRef.current` 为真，不应为远端旧数据执行迁移回写，否则可能覆盖本地未保存状态；迁移保存必须置于 dirty 判断之后（保存回声例外可直接忽略）。
- 新增 edge 工具及既有工具回归共 9 项通过，`git diff --check` 通过。
- 使用用户指定 `canvas.json` 实测规范化：8 条 edges 得到 8 个唯一 ID，缺失 ID 为 0；生成结果与 8 组 source/target 一一对应。
- 根目录已安装 `@babel/core` 与 `@babel/preset-react`，可直接对两个受影响 hook 做无输出编译检查。
- 加载迁移流程先设置规范化 `lastSavedRef`，再异步 `saveCanvas`；保存回声的同步签名会被现有判断拦截，不产生回环。
- 两个受影响 hook 均通过 Babel 编译；现有开发服务 3000 端口健康检查为 200。
- 当前可用工具中没有 `procm-mcp`，无法按项目约定重启持久化服务；开发服务可由热更新或页面刷新载入改动。
