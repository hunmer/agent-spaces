## Persistence And External Boundaries

Workflow 存储采用每个 workflow 一个目录的结构，定义在 `packages/server/src/storage/workflow-store.ts`。

目录模型：

```text
workflows/{workflowId}/
  workflow.json
  versions/{versionId}.json
  execution_history/{logId}.json
  plugin_configs/{pluginId}/{schemeName}.json
  staging.json
  operation_history.json
  chat.json
workflows/folders.json
```

稳定结论：

- 模板本体：`workflow.json`
- 执行历史：`execution_history/*.json`
  - `ExecutionManager.persistAndCleanup()` 最终调用 `workflowStore.addExecutionLog()`
  - 默认保留最近 100 条
- 版本快照：`versions/*.json`
  - 默认保留最近 100 个
- 插件配置：`plugin_configs/{pluginId}/{scheme}.json`
- 编辑暂存：`staging.json`
- 画布操作历史：`operation_history.json`
- 工作流 Agent 对话：`chat.json`
- 兼容旧格式
  - 首次访问时自动把旧的 `workflows/<id>.json` 扁平文件迁移到目录格式

外部边界：

- WebSocket：手动执行、交互响应、客户端节点执行、恢复查询
- HTTP：hook 触发
- `node-cron`：定时调度
- 文件系统：workflow 定义、版本、执行历史、插件配置
- 插件运行时：`pluginService`
- 客户端插件桥接：`ClientNodeManager`
- AI/代码/数据库能力：通过节点分派调用到各自服务

## Trigger Registration Lifecycle

`WorkflowTriggerService` 的职责仅是“注册触发器并把触发交给 ExecutionManager”，自己不保存执行态。

主要行为：

- `start()`
  - 服务启动时扫描 `store.listWorkflows()`，批量注册全部 trigger
- `reloadWorkflow(workflowId)`
  - workflow 变更后清理并重建该 workflow 的 trigger
- `removeWorkflow(workflowId)`
  - workflow 删除后移除 trigger
- `getHookBindings(hookName)`
  - 供 hook route 反查绑定关系
- `validateCron(cronExpr)`
  - 用于校验 cron 配置并返回后续触发时间预览

Hook 触发器本质上只是 `hookName -> {workflowId, triggerId}[]` 的内存索引。

## Files To Read Next

- `packages/server/src/services/execution-manager.ts`
  - 执行主循环、节点分派、恢复态、落盘逻辑都在这里
- `packages/server/src/services/workflow-trigger-service.ts`
  - cron/hook 触发注册和重载逻辑
- `packages/server/src/services/interaction-manager.ts`
  - 阻塞式 UI 节点的暂停与恢复
- `packages/server/src/storage/workflow-store.ts`
  - workflow 目录结构和执行历史保留策略
- `packages/server/src/ws/execution-channels.ts`
  - 手动执行入口与控制命令
- `packages/server/src/routes/workflow-hook.ts`
  - 外部系统通过 HTTP 驱动 workflow 的入口
- `packages/server/src/services/execution-node-helpers.ts`
  - 拓扑排序、客户端插件节点识别、输入构造

## Open Questions / Risks

- 已修复的问题：`ExecutionManager.emitEvent()` 现在会把 `session.workspaceId` 传给 `deps.emit()`，`packages/server/src/app.ts` 的全局广播只在存在显式 `workspaceId` 时才调用 `broadcastToWorkspace()`。
  - 这修正了原先“把 `workflowId` 错传给 `broadcastToWorkspace()`”的问题。
  - 结果是：来自 WS 的执行会按真实连接 scope 广播；Hook/SSE 执行继续走 `eventSink`，不依赖全局广播。
- 仍然存在的设计缺口：系统依旧缺少统一的“workflow execution event scope”模型。
  - workflow 模板本身没有 `workspaceId` 字段。
  - 前端同样存在两套归属约定：编辑器使用 `workspaces[0]?.id` 建立 WS，分享页固定使用 `getWS('workflows')`。
  - Cron 触发默认没有前端受众 scope，因此不会进入全局广播。
  - 结论：这次修复解决了错参 bug，但没有解决 execution scope 的长期模型问题。
- 当前恢复机制只保留内存态和最终 execution log，没有持久化 session checkpoint。
  - 进程重启后无法从中间节点继续跑，只能恢复展示或重新触发。
- `WorkflowTriggerService` 的 hook/cron 注册状态是纯内存的。
  - 依赖服务启动时重新扫全量 workflow；如果未来要做分布式部署，需要改成集中调度或外部注册中心。