## Dynamic Handles And Graph Semantics

动态 handles 是 node 系统和画布系统的关键接缝。

已验证的调用链：

```text
definition.handles.dynamicSource
  -> use-workflow-edge-operations.ts
  -> workflow-node-size.ts
  -> workflow-node.tsx
  -> use-workflow-editor-state.ts
```

用途：

- 根据属性数组长度动态生成 source handles
- 典型节点：`switch`
- 同时影响：
  - 连接数量和 handle id
  - 画布尺寸估算
  - legacy sourceHandle 兼容与归一化

这意味着：

> 修改 definition 的 handles 不是纯 UI 改动，会连带影响边连接语义和已有 workflow 兼容逻辑。

## Localized Definition Layer

前端并不直接把 `registry.ts` 中的原始定义丢给组件。

`packages/web/src/lib/workflow-nodes/i18n.ts` 负责：

- 翻译 `label`
- 翻译 `category`
- 翻译 `description`
- 翻译 properties / array fields / options / handles 文本

所以：

- 原始 definitions 里可以存 i18n key
- 组件里应优先消费 localized hooks，而不是直接读 raw registry

## Plugin Node Path

插件节点的服务端主入口在 `packages/server/src/services/plugin.ts`。

已确认的能力：

- 插件 manifest 可声明 `workflowNodes`
- 可从 `workflow.js` / CommonJS workflow module 加载节点定义
- 可为节点类型绑定 handler
- `getWorkflowNodes(pluginId, locale?)` 返回节点定义给前端
- `getWorkflowNodeDefinitionByType(nodeType)` 允许执行前做 definition 查询
- `canExecuteWorkflowNode(nodeType)` 判断该 type 是否由插件运行时支持
- `requiresClientExecution(nodeType)` 决定是否必须走客户端

前端插件节点接入链：

```text
workflow-editor.tsx
  -> 拉取插件节点定义
  -> registerPluginNodeDefinitions(allNodes)
  -> registry 合并
  -> 画布/节点选择器/属性面板可见
```

所以插件节点要同时满足两件事：

1. 前端拿到 definition，才能编辑和显示  
2. 服务端拿到 handler 或执行声明，才能运行

## Client Node Bridge

客户端节点桥接由两部分组成：

- 识别：`packages/server/src/services/execution-node-helpers.ts`
  - `isClientPluginNode(node)`
  - `getClientPluginId(node)`
- 执行桥接：`packages/server/src/services/client-node-manager.ts`

执行链：

```text
ExecutionManager.dispatchNode()
  -> isClientPluginNode(node) / pluginService.requiresClientExecution(node.type)
  -> executeClientNode()
  -> clientNodeManager.request(...)
  -> WS channel 'workflow:client-node'
  -> web use-workflow-editor-execution.ts
  -> electronAPI.clientPlugins.executeNode(...)
  -> client_node_response
  -> ClientNodeManager.handleResponse()
```

关键约束：

- 这类节点必须依赖具体客户端连接
- 有 5 分钟超时与 30 秒断线重连宽限
- 如果客户端掉线且未恢复，节点执行直接失败

## Server Dispatch Model

服务端真正把 `node.type` 映射到实现的是 `packages/server/src/services/execution-manager.ts`。

主流程：

```text
executeNode()
  -> 解析变量 / dry-run / stepInput
  -> dispatchNode()
  -> switch(node.type)
  -> 内建节点函数 or 插件节点 or client node
  -> 写回 step.output / session.context / execution data
```

内建映射是显式 `switch`：

- `start` / `end`
- `sqlite_*`
- `kb_*`
- `run_code` / `run_python`
- `switch`
- `variable_aggregate`
- `set_variable` / `get_variable` / `delete_variable`
- `sub_workflow`
- `loop`
- `agent_run`
- `alert` / `prompt` / `form`

默认分支逻辑：

```text
if client plugin node
  -> executeClientNode()
else if pluginService.canExecuteWorkflowNode(node.type)
  -> 插件执行 or 客户端插件执行
else
  -> throw Unsupported node type
```

这意味着当前 node 系统是“三段式执行模型”：

- 内建 `switch`
- 服务端插件 handler
- 客户端插件桥接

## Special Case: agent_run

`agent_run` 是最特殊的内建节点之一。

前端 definition：

- 在 `ai.ts` 里声明属性和输出

服务端执行：

- `execution-manager.ts` -> `executeAgentRun()`
- `packages/server/src/services/execution-agent-runner.ts`

其特点：

- 并不是普通 plugin node
- 会解析 agent preset / runtime / permission mode / sandbox dirs
- 最终调用 agent runtime 执行 prompt
- 输出包含 `result`、`usage` 和 runtime 元信息

已确认的风险：

- `resolveWorkflowAgentWorkspaceId()` 当前直接取 `workspaceService.getAll()[0]?.id ?? 'default'`
- 说明 `agent_run` 的 workspace 归属依然不是从 workflow session 明确传入，而是依赖全局第一个 workspace

这和前面 execution scope 的研究结论是同一类设计缺口。

## Files To Read Next

- `packages/shared/src/types/workflow.ts`
  - node 实例模型与 definition 类型
- `packages/web/src/lib/workflow-nodes/registry.ts`
  - 内建/插件 definition 合并入口
- `packages/web/src/lib/workflow-nodes/definitions/*`
  - 新增节点时首先参考
- `packages/web/src/components/workflow/workflow-node.tsx`
  - 节点渲染与 definition 消费方式
- `packages/web/src/components/workflow/workflow-properties-panel.tsx`
  - 属性面板与特殊派生逻辑
- `packages/server/src/services/execution-manager.ts`
  - `node.type` 到执行实现的最终 dispatch
- `packages/server/src/services/plugin.ts`
  - 插件节点定义加载与 handler 执行
- `packages/server/src/services/client-node-manager.ts`
  - 客户端节点请求/响应桥接
- `packages/server/src/services/execution-agent-runner.ts`
  - `agent_run` 的特殊执行路径

## Open Questions / Risks

- definition 与执行实现是分离维护的。
  - 新增内建节点时，如果只加前端 definition 不加 `dispatchNode()`，运行时会直接 `Unsupported node type`。
- 插件节点存在前后端双注册要求。
  - 只注册前端 definition 会“能看到不能执行”。
  - 只注册服务端 handler 会“能执行但编辑器不可见”。
- 客户端节点依赖具体连接。
  - 不适合无 UI 或纯后台调度场景。
- `agent_run` 仍有 workspace 归属不严格的问题。
- 动态 handles 与 composite 节点改动有较高兼容性风险。
  - 会影响 edge id、画布尺寸、legacy handle 迁移和执行可达性。