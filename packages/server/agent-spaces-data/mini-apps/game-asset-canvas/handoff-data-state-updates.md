# Game Asset Canvas 数据状态方案交接

更新时间：2026-08-28

## 交接目标

本轮修复针对以下问题：

- 产出展示有多个历史/执行分组时，切换展示或删除一张图片会导致其他图片、分组或执行实例被清空。
- 更新逻辑曾使用旧闭包中的完整 `nodes/groups` 快照覆盖当前状态。
- `useGroupExecution` 的函数 patch 曾被当作完整节点数据替换，删除 `output` 时会丢失 `params/status/versions` 等字段。
- `[GroupExecutionDebug]` 日志过多，无法区分真正的数据写入口。

## 当前架构

### 单一业务数据更新入口

入口位于：

- `src/hooks/useCanvasState.js`：`updateCanvasData`
- `src/utils/canvas-state-updates.js`：纯函数 `applyCanvasCollectionUpdate`

所有节点/分组业务数据更新请求都应携带：

```js
updateCanvasData({
  source: 'node-output-delete',
  targetType: 'node', // 'node' | 'group'
  targetId: nodeId,
  key: 'data.output',
  value: nextOutput,
  method: 'replace', // merge | replace | update | append | remove
});
```

字段含义：

- `source`：更新来源，必须是非空字符串，用于诊断日志和后续审计。
- `targetType`：目标集合类型，默认为 `node`。
- `targetId`：目标实体 id；入口只修改该实体。
- `key`：更新路径，支持点路径，例如 `data.output`、`batchExecution`；`$` 表示整个目标实体。
- `value`：要写入的值；`method=update` 时必须是函数，函数接收目标当前值。
- `method`：明确更新语义，禁止隐式全量集合替换。

入口只对目标 id 执行路径更新，其他节点/分组引用保持原对象和原数据。入口会输出唯一结构化日志：

```text
[CanvasStateUpdate] {
  source,
  targetType,
  targetId,
  key,
  method,
  valueSummary
}
```

`valueSummary` 只包含类型、字段名和数量摘要，不输出完整图片 URL 或大对象。

### 兼容包装

`useCanvasState.updateNodeData(nodeId, patch)` 仍保留给既有调用方使用，但内部已经转换为：

- `source: 'node-data'`
- `targetType: 'node'`
- `key: 'data'`
- `method: 'update'`

函数 patch 的语义是“基于当前 data 返回局部 patch”，不会再把返回值直接当作完整 data 替换。自动版本存档和内部标记清理仍在该包装中执行。

## 已迁移的数据路径

### 分组执行

文件：`src/hooks/useGroupExecution.js`

- `commit` 不再直接调用 `setGroups/setNodes` 全量 map。
- 分组执行状态通过 `key: 'batchExecution'` 精确更新目标分组。
- 执行实例节点状态通过 `key: 'data'` 精确更新目标节点。
- `groupsRef/nodesRef` 在提交前用同一纯更新函数同步，避免 React 尚未提交时连续执行读取旧快照。
- `commitRunState` 只委托 `commit`，不再维护第二套写入逻辑。
- `setMode/setCount/switchRun/removeAsset/setOutputBinding` 不再输出高频 GroupExecutionDebug。

### 执行节点 patch

文件：`src/utils/group-execution.js`

`applyExecutionNodePatch(oldData, patch)` 现在先计算 patch，再执行浅合并：

```js
const patchValue = typeof patch === 'function' ? patch(previous) : patch;
const next = { ...previous, ...(patchValue || {}) };
```

因此历史版本删除只改变 `output/versions`，不会丢失同一执行实例中的其他字段。

### ImageResult 产出与历史

文件：`src/components/nodes/ImageResult.jsx`、`src/components/Canvas.jsx`

- 分组折叠、历史版本切换只改变展示状态，不把过滤结果写回父级数据。
- 删除当前产出：基于当前执行实例自身的 `output.images/resources` 删除。
- 删除历史版本：只修改 `versions[versionIndex]`；如果删除的是 active version，当前 `output` 也基于自身数据删除相同资源 id。
- 添加、删除、清空、重排产出都优先通过 `getExecutionTargetForNode` 更新当前执行实例，普通节点再回退到 `updateNodeData`。
- 资源匹配按 URL 出现顺序处理，不使用 `Map<url, resource>` 覆盖重复 URL 的分组元数据。

### 其他已迁移路径

- 背景图片持久化完成后的 URL 替换：按节点逐个更新 `data.output`。
- 全局节点预览模式：按节点逐个更新 `data.outputPreviewMode`。
- RPC `canvas.updateNodes`：逐节点调用 `updateNodeData`，不再用一次全量 map 覆盖节点数据。
- 分组属性更新：通过 `key: '$'` 对指定分组做合并。
- 节点自动尺寸的旋转/尺寸元数据：业务 data 通过统一入口，几何尺寸仍由 ReactFlow 节点 setter 更新。

## 删除图片的正确时序

1. ImageResult 产生资源 id（由 `createOutputAssetItems` 保持 occurrence 顺序）。
2. 用户点击单图删除或分组清空。
3. Canvas 根据节点是否属于执行实例，选择：
   - `groupExecution.updateExecutionNodeData(target, patch)`；或
   - `updateNodeData(nodeId, patch)`。
4. 执行实例 patch 先和当前实例 data 合并。
5. `commit` 通过统一入口只更新目标分组/节点。
6. `useCanvasState` 的防抖保存持久化最新 `nodes/edges/groups`，其他分组不会被旧快照替换。

禁止以下写法：

```js
setNodes(oldNodesFromClosure);
setGroups(oldGroupsFromClosure);
setNodes((prev) => prev.map(() => filteredDisplayResult));
```

展示过滤结果只能作为派生值，不能作为持久化数据源。

## 测试与验证

新增/更新测试：

- `src/utils/canvas-state-updates.test.js`
  - 目标节点删除一张图片不影响其他节点/分组。
  - 目标分组执行替换不影响其他分组。
  - 分组属性局部合并。
  - 缺少 `source/key/target/method` 时拒绝更新。
- `src/utils/group-output-binding.test.js`
  - 真实快照 `configs/workspaces/ws-ms2k5lgk-fy8e/canvas.json` 的三分组过滤隔离。
  - 执行实例函数 patch 保留其他字段。
  - 删除一个执行实例图片不影响其他实例。
- `src/utils/output-resources.test.js`
  - 跨分组、跨版本资源删除隔离。
- `src/components/nodes/ImageResultActions.test.js`
  - 单图删除和分组清空动作只传目标资源 id。
- `src/components/nodes/ImageResultMetadata.test.js`
  - 展示切换不回写，历史删除传递正确版本索引。

推荐验证命令：

```powershell
node --test "packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/components/nodes/ImageResultActions.test.js" "packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/components/nodes/ImageResultMetadata.test.js" "packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/utils/output-resources.test.js" "packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/utils/group-output-binding.test.js" "packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/utils/canvas-state-updates.test.js"
git diff --check
```

最近一次结果：相关测试 `47/47` 通过；Canvas、状态 hook、分组执行、RPC、节点 CRUD 和纯更新工具的 Babel 语法检查通过；`[GroupExecutionDebug]`、`[clear-debug]`、`[clear]` 已从非 vendor 源码移除。

## 运行状态

已通过 procm-mcp 重启 Agent Spaces `dev:server` 进程。mini-app 源码通常刷新即可生效；如果修改宿主 web 层，需要额外重启 web 进程。

## 当前边界与后续工作

- 导入、恢复、节点增删、布局、选择等显式结构操作仍使用 React state setter；这些是有意的整集合结构操作，不属于产出/历史/执行数据 patch。
- 若后续要实现真正的“所有画布写入统一入口”，应先为 edges、结构新增/删除和历史恢复定义 `targetType/key/method`，再逐步迁移，避免把布局或 ReactFlow change 数组误当业务 data。
- 新增任何 output/history/group-execution 写入前，必须先确认是否能通过 `updateCanvasData` 或 `updateNodeData` 完成；不要新增旁路 `setNodes/setGroups` 全量覆盖。

## 参考文件

- 当前计划：`G:/agent_spaces/task_plan.md`
- 诊断发现：`G:/agent_spaces/findings.md`
- 进度日志：`G:/agent_spaces/progress.md`
- mini-app 现有架构交接：`packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/handoff.md`
- 统一入口实现：`packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/utils/canvas-state-updates.js`
- 状态 hook：`packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/hooks/useCanvasState.js`
- 分组执行：`packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/hooks/useGroupExecution.js`
- 产出 UI/回调：`packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/components/nodes/ImageResult.jsx`、`packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/components/Canvas.jsx`

## Suggested Skills

- `diagnose`：继续排查输出/执行状态覆盖回归时，使用复现、假设、入口日志和回归测试闭环。
- `tdd`：新增状态更新或删除行为时，先补跨分组/跨版本测试，再修改实现。
- `code-architecture-research`：需要重新梳理 Canvas、执行队列、RPC 和持久化调用链时使用。
- `planning-with-files`：涉及多个状态写入模块的迁移时，继续维护 `task_plan.md`、`findings.md`、`progress.md`。
- `handoff`：下一次交接时更新本文件，避免把方案分散到多个临时文档。
