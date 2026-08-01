# Findings

## Current Task
- `WorkflowGroupOverlay` 当前拥有分组、childNodes 和 header 内置操作，但没有自定义 header 插槽。
- 宿主 `workflow-canvas.tsx` 负责实例化 `WorkflowGroupOverlay`，需要继续确认插槽如何从 mini-app 传入。
- `useExecutionQueue` 当前 `submit` 立即执行，所有任务初始均为 `running`，没有真正的并发限制或 `queued` 状态。
- 队列任务已保留 `placeholderNodeId`，适合作为节点运行/排队视觉状态的关联键。
- 宿主已有 `components/ui/border-glide.tsx`，需确认是否已导出给 mini-app。
- mini-app 已通过 `@agent-spaces/ui` 复用 `WorkflowGroupOverlay`；因此可直接给 Overlay 增加 `headerRight`/render prop，并由 `GroupOverlays.jsx` 注入按钮，无需经过宿主 `workflow-canvas.tsx`。
- `Badge`、`Slider`、`BorderGlide` 均已从 `ui-exports.ts` 暴露给 mini-app。
- mini-app 已有独立的 `GroupExecutionToolbar` 和批次素材执行逻辑；新“批量运行”应只负责把组内现有节点提交到公共执行队列，避免混入该功能。
- settings 使用 `DEFAULT_SETTINGS + useSettings.saveSettings`，可以新增 `executionConcurrency: 3` 并在队列弹层即时保存。
- NodeShell 由所有节点复用，适合根据注入的队列状态渲染 `BorderGlide` 和排队 Badge。
- `buildNodeExecution` 已集中实现 4 类生成节点（文生图、编辑图片、配音、视频）的参数组装，但当前是文件内函数；可导出后复用于分组批量入队。
- `handleGenerate` / `handleGenerateMedia` 已返回 Promise 且自行更新节点状态、产出和历史，适合作为队列的自定义 `execute` 任务。
- 运行节点的 BorderGlide 可直接由 NodeShell 的 `data.status === 'running'` 驱动；排队位置需要 Canvas 从 jobs 派生后注入 `data.queuePosition`。
- 工作树中多个目标文件已有用户未提交修改（包括 Canvas、GroupOverlays、useCanvasAgentRpc、useDecoratedNodes、workflow-canvas、workflow-group-node），后续必须基于当前内容做最小补丁，不能覆盖或回退。
- 当前实现将表单任务和分组任务统一为 FIFO 队列；并发范围 1-10，等待任务可取消，运行任务沿用各自取消逻辑。
- 调度器使用 `activeJobIdsRef` 记录真实活动任务，避免 React StrictMode Effect 重放导致重复启动或突破并发上限。
- `Play` 图标通过 `ui-exports.ts` 的 `export * from lucide-react` 可用。
- 共享 Slider 基于 `@base-ui/react/slider`，需要通过类型检查确认提交事件名称。
- Base UI Slider 的声明不在常规 `.d.ts` 搜索路径中，直接搜索未确认提交事件；下一步读取已解析包声明。

## Batch Rerun Follow-up
- `MultiSelectToolbar` 当前只接收选择数量和布局/删除回调，可新增 `onRunSelected`，选中节点 ID 由 Canvas 从 `nodes.filter(node.selected)` 读取。
- `handleRunGroup` 当前直接收集并提交任务，应拆为共享 `requestBatchRun(nodeIds)` 与 `submitBatchRun(nodeIds)`。
- 二次确认只统计本次可执行目标中已有产出的节点，避免把展示节点等本来会跳过的节点算入提示。
- 项目已暴露完整 AlertDialog 组件，可沿用现有确认弹窗模式。
- 可执行节点产出结构包括 `output.images`、`audio/audios`、`video/videos`；通用检测应遍历 `data.output` 的数组和字符串值。
- 新建独立 `BatchRunConfirmDialog` 比复用带分组名称输入的 `GroupConfirmDialog` 更符合职责。
- 共享入口已实现：活动/不可执行节点先过滤，只有候选节点参与已有输出计数；确认时重新收集，避免弹窗打开期间队列状态变化造成重复入队。
- 为验证输出计数，适合把纯判断移动到 `utils/batch-run.js` 并增加针对图片、音频、视频、空输出的单元测试。
- 输出检测已抽到 `utils/batch-run.js`，图片、音频、视频、文本和空值计数均有测试覆盖。
