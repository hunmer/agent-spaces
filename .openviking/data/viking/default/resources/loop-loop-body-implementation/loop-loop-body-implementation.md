# Loop 与 loop_body 关键实现

本文只记录当前 Web 编辑器中 `loop` / `loop_body` 的关键实现约束，方便后续维护迁移逻辑。

## 节点结构

`loop` 不是单节点能力，而是一组 compound 节点：

- `loop`
  - 用户可见的根节点。
  - `composite.rootId` 指向自身。
  - 对外暴露两个 source handle：`loop-body` 和 `loop-next`。
- `loop_body`
  - 自动生成的 scope boundary 节点。
  - `manualCreate: false`，不允许从侧边栏或节点选择器手动创建。
  - `composite.role = "loop_body"`。
  - `composite.parentId = loop.id`。
  - `composite.scopeBoundary = true`。
  - 只有 target handle，没有 source handle。

定义入口：

- `src/lib/workflow-nodes/definitions/flow-control.ts`

## loop_body 内置边界节点

创建 `loop` 时会自动在 `loop_body` 内创建两个可见边界节点：

- `start`
  - `composite.rootId = loop_body.id`
  - `composite.parentId = loop_body.id`
  - `composite.generated = true`
- `end`
  - `composite.rootId = loop_body.id`
  - `composite.parentId = loop_body.id`
  - `composite.generated = true`

同时创建两类边：

- `loop_body -> start`
  - 隐藏边。
  - `composite.hidden = true`
  - `composite.locked = true`
  - 用于表达循环体入口，不渲染到画布。
- `start -> end`
  - 可见默认边。
  - 仅在首次创建或补齐缺失的 `start/end` 边界节点时创建。
  - 用户在这条边上插入节点后，不允许再次自动补回 `start -> end` 直连边。

创建与补齐逻辑在：

- `src/components/workflow/use-workflow-editor-canvas.ts`
  - `ensureLoopBodyBoundaryNodes`
- `packages/shared/src/types/workflow-node-factory.ts`
  - `createWorkflowNodesForDefinition`

## Scope 布局同步

`loop_body` 的大小不是创建时硬编码放大，而是由内部可见子节点反推。

核心规则：

- 找到所有 `getCompositeParentId(node) === loop_body.id` 且非 hidden 的子节点。
- 按子节点位置和尺寸计算内容 bounds。
- 使用固定 padding 反推 `loop_body.position` 与 `data.nodeWidth/data.nodeHeight`。
- `loop_body` 最小尺寸为 `150 x 260`。

同步入口：

- 创建 `loop` 后。
- 在 `loop_body` 内插入节点后。
- 删除、移动、resize `loop_body` 内部节点后。
- 打开 workflow 时补齐旧数据结构后。

实现函数：

- `syncScopeBoundaryLayout`
- `syncAllScopeBoundaryLayouts`

## 渲染层级与交互

`loop_body` 是容器背景，不应覆盖内部节点。

当前渲染规则：

- `loop_body` 使用较低 `zIndex`。
- scope 内普通节点使用较高 `zIndex`。
- ReactFlow 的 `elevateNodesOnSelect` 关闭，避免拖动或选中 `loop_body` 后临时盖住内部节点。
- `loop_body` 的 custom view 使用 `pointer-events-none`，避免挡住内部节点 handle 和连线。
- hidden 节点和 hidden 边不进入 ReactFlow 渲染数据。

相关文件：

- `src/components/workflow/use-workflow-canvas-data.ts`
- `src/components/workflow/workflow-canvas.tsx`
- `src/components/workflow/workflow-node.tsx`

## 节点插入与连线

在 `loop_body` 内部插入节点时，scope 归属由插入来源决定：

- 从 `loop` 的 `loop-body` handle 插入时，目标 scope 是对应 `loop_body`。
- 从 `loop_body` 内部边插入时，目标 scope 是最近的 scope boundary。
- 新节点写入：
  - `composite.rootId = loop_body.id`
  - `composite.parentId = loop_body.id`

在边上插入节点时，必须拆开原边：

- 删除原边。
- 创建 `source -> newNode`。
- 创建 `newNode -> target`。

删除原边时不能只依赖 `edgeId`，还需要按 `source/target/sourceHandle` 兜底匹配，避免历史数据或 `null/undefined` handle 差异导致旧边残留。

## 删除约束

删除规则复刻旧实现的 `canDeleteNode` 语义：

- `loop_body` 是 scope boundary，禁止单独删除。
- `loop_body` 内生成的 `start/end` 禁止删除。
- `loop_body` 内用户插入的普通节点允许单独删除。
- 删除 `loop` 时，需要级联删除同 composite root 下的：
  - `loop`
  - `loop_body`
  - `loop_body` 内部生成节点
  - `loop_body` 内用户插入节点
  - 所有关联边和 composite 边

ReactFlow 可能在删除受保护节点时同时发出关联边删除事件，因此边删除也必须过滤：

- `composite.locked` 边禁止删除。
- 本轮被拒绝删除的节点关联边禁止删除。

相关实现：

- `canDeleteWorkflowNode`
- `getWorkflowNodeDeleteIds`
- `handleNodeDelete`
- `handleNodesChange`
- `handleEdgesChange`
