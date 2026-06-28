# Workflow 节点状态与断点能力

节点状态和断点是工作流节点的运行控制能力，用于在编辑器中标记节点执行策略，并由后端执行器在运行时解释。

## 数据模型

字段定义在 `@agent-spaces/shared` 的 `WorkflowNode` 顶层，不属于 `node.data`。

```ts
export type NodeRunState = 'normal' | 'disabled' | 'skipped'
export type NodeBreakpoint = 'start' | 'end'

export interface WorkflowNode {
  id: string
  type: string
  label: string
  position: { x: number; y: number }
  data: Record<string, unknown>
  nodeState?: NodeRunState
  breakpoint?: NodeBreakpoint
  nodeColor?: string
}
```

## 节点状态

| 值 | 说明 | 运行时行为 | 前端表现 |
|----|------|------------|----------|
| `normal` | 默认状态 | 正常执行节点 | 无状态徽标 |
| `disabled` | 禁用节点 | 记录 skipped step 后终止工作流，执行状态变为 error | 红色背景、`已禁` 徽标、节点标题删除线 |
| `skipped` | 跳过节点 | 记录 skipped step 后继续后续可达节点 | 黄色背景、`已跳` 徽标 |

状态设置入口：

- 节点右键菜单 → `节点状态`
- 写入事件：`workflow:update-node-data`
- 更新字段：`{ nodeState: 'normal' | 'disabled' | 'skipped' }`

实现约束：

- `nodeState` 必须写入 `WorkflowNode.nodeState`
- 不要写入 `WorkflowNode.data.nodeState`
- 运行时判断默认值为 `normal`

## 断点

| 值 | 说明 | 运行时行为 | 前端表现 |
|----|------|------------|----------|
| `start` | 开始断点 | 节点执行前暂停 | 蓝色 `开始断点` 徽标 |
| `end` | 结束断点 | 节点执行后暂停 | 紫色 `结束断点` 徽标 |
| `undefined` | 无断点 | 不触发断点暂停 | 无断点徽标 |

断点设置入口：

- 节点右键菜单 → `断点设置`
- 写入事件：`workflow:update-node-data`
- 更新字段：`{ breakpoint: 'start' | 'end' | null }`

`null` 表示清除断点，最终存储为 `undefined`。

## 执行时暂停

后端执行器命中断点后发送 `workflow:paused`：

```ts
{
  executionId: string
  workflowId: string
  status: 'paused'
  currentNodeId: string
  reason: 'breakpoint-start' | 'breakpoint-end'
}
```

前端执行 hook 保存：

- `pausedNodeId`
- `pausedReason`
- `execStatus = 'paused'`

画布将这些状态透传到节点。当前节点满足以下条件时显示断点控制条：

```ts
execStatus === 'paused'
  && pausedNodeId === node.id
  && (
    pausedReason === 'breakpoint-start'
    || pausedReason === 'breakpoint-end'
    || !!node.breakpoint
  )
```

控制条能力：

- `继续运行` → 派发 `workflow:resume-execution`
- `中断` → 派发 `workflow:stop-execution`

## 前端数据流

```
WorkflowNode 右键菜单
  → workflow:update-node-data
  → useCanvasDomEvents
  → useWorkflowEditorCanvas.handleNodeDataUpdate
  → 更新 WorkflowNode 顶层字段
  → useCanvasData 注入节点 data
  → WorkflowNode 渲染状态/断点 UI
```

执行暂停数据流：

```
execution-manager
  → workflow:paused
  → useWorkflowEditorExecution
  → WorkflowCanvas props
  → useCanvasData
  → WorkflowNode 断点暂停控制条
```

## 注意事项

- `start` / `end` 节点是流程边界节点，默认不展示普通节点右键菜单。
- 节点运行中或预览状态下画布锁定，不允许修改状态和断点。
- 状态与断点是执行控制语义，不能只做前端样式更新。
- `disabled` 会中止工作流，`skipped` 会继续执行后续可达节点。
