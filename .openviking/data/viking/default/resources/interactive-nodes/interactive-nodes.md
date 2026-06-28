# Interactive Nodes（交互式节点）

需要用户在前端确认后工作流才能继续的节点类型。

## 工作原理

```
backend execution-manager
  → dispatchNode() 发现节点需要用户交互
  → interactionManager.request(interactionType)
  → WS 发送 interaction_required 到前端
  → 工作流暂停等待

frontend
  → ws-bridge 收到 interaction_required
  → interaction.ts 检查 UI_INTERACTION_TYPES
  → emit('interaction:ui_required', { interactionType, nodeId, schema })
  → store.pendingInteraction 被设置
  → CustomNodeWrapper 检测到当前节点有 pending interaction
  → customView 显示交互 UI（表格/表单/确认按钮等）
  → 用户操作后调用 resolveInteraction(data)
  → WS 发送 interaction_response 回后端
  → 工作流继续执行
```

## 现有交互式节点

| 节点类型 | interactionType | 说明 |
|---------|----------------|------|
| `table_display` (selectionMode !== 'none') | `table_confirm` | 表格行选择，支持单选/多选 |

## 新增交互式节点

以 `table_display` 为例，完整步骤：

### 1. 定义 InteractionType

`shared/ws-protocol.ts` — 添加类型和 schema：

```typescript
export type InteractionType =
  | ...
  | 'your_new_type'  // 加这里
  | 'custom'

export interface YourNewInteractionSchema {
  // 交互请求携带的数据
}
```

### 2. 注册内置节点

`electron/services/builtin-nodes.ts` — 添加节点定义。

### 3. 后端执行逻辑

`backend/workflow/execution-manager.ts` — 在 `dispatchNode` 的 switch 中加 case，通过 `interactionManager.request()` 发起交互：

```typescript
case 'your_node_type':
  return this.executeYourNode(session, node, resolvedData)

private async executeYourNode(session, node, resolvedData): Promise<any> {
  // 不需要交互时直接返回
  if (skipCondition) return { result }

  // 需要交互时
  const schema: YourNewInteractionSchema = { ... }
  const result = await this.deps.interactionManager.request({
    clientId: session.ownerClientId,
    executionId: session.id,
    workflowId: session.workflow.id,
    nodeId: node.id,
    interactionType: 'your_new_type',
    schema,
  })
  return result
}
```

### 4. 注册为 UI 交互类型

`src/lib/backend-api/interaction.ts`：

```typescript
const UI_INTERACTION_TYPES: Set<InteractionType> = new Set([
  'table_confirm',
  'your_new_type',  // 加这里
])
```

### 5. 创建 customView 组件

在 `src/components/workflow/` 下创建 Vue 组件，支持以下 props：

| Prop | 类型 | 说明 |
|------|------|------|
| `interactive` | `boolean` | 是否处于交互等待状态 |
| `onSubmit` | `(data) => void` | 用户确认后的回调（仅 interactive=true 时传入） |

组件决定交互态和非交互态的渲染差异。非交互态只展示数据，交互态显示操作控件（如 checkbox、提交按钮）。

### 6. 注册 customView

`src/lib/workflow/nodes/display.ts` — 或对应节点分类文件中注册。

### 7. CustomNodeWrapper 接入

`src/components/workflow/CustomNodeWrapper.vue` — 在 `customViewProps` computed 中添加分支：

```typescript
if (definition.value?.type === 'your_node_type') {
  const pending = store.pendingInteraction
  const isPending = pending?.nodeId === props.id && pending?.interactionType === 'your_new_type'
  const schema = isPending ? (pending.schema as YourNewInteractionSchema) : null

  return {
    // 从 schema（后端解析变量后的实际值）或静态配置取数据
    yourData: schema?.yourField ?? props.data?.yourField ?? [],
    interactive: !!isPending,
    onSubmit: isPending
      ? (result) => {
          store.pendingInteraction = null
          resolveInteraction(result)
        }
      : undefined,
  }
}
```

## 插件节点

插件注册的节点也可以使用交互机制。后端在 `BackendPluginRegistry` 中执行插件 handler 时，如果需要用户交互，按相同模式调用 `interactionManager.request()`，并将 interactionType 加入 `UI_INTERACTION_TYPES`。

前端侧需要在 `CustomNodeWrapper` 中为插件节点类型添加 customViewProps 分支，或提供通用的插件交互视图。
