# Game Asset Canvas 产出实例切换交接

## 下一阶段目标

继续收紧分组执行状态更新边界：所有实例切换、模式切换、次数调整操作只更新明确的执行通道，不把当前画布节点状态全量回写到其他实例。

## 当前已完成

- 图片删除已从数组索引改为 `output.resources[].id` 唯一 ID。
- 新生成资源使用 UUID；旧数据按 URL + 出现序号生成兼容 ID。
- 单图删除、当前组清空会按 ID 更新当前历史版本。
- 删除与历史切换已支持批量执行实例状态同步。
- `switchRun` 已移除 `saveActiveRun(context.execution, context.currentStates)`，切换时只更新目标模式、目标实例 `activeId` 和目标实例 `nodeStates`。
- 相关回归测试已覆盖重复 URL、跨历史版本删除、分组清空和实例切换契约。

参考源码：

- `packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/hooks/useGroupExecution.js`
- `packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/components/Canvas.jsx`
- `packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/components/nodes/ImageResult.jsx`
- `packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/utils/output-resources.js`

## 后续优化步骤

1. 审查 `useGroupExecution.js` 的 `setMode`：确认模式切换只更新目标模式及目标实例，不在无明确用户编辑时调用全量 `saveActiveRun`。
2. 审查 `setCount`：新增/删除次数实例时，只变更 `count.runs`、`count.activeId`、`count.target`，不要用当前画布状态覆盖其他已有实例。
3. 审查素材模式相关的 `uploadAssets`、`removeAsset`、`setOutputBinding`：每个操作明确写入 `assets` 通道，避免覆盖 `count` 通道或节点其他字段。
4. 为 `switchRun`、`setMode`、`setCount` 增加纯函数测试：验证实例 A -> B -> A 后，A/B 的 `nodeStates`、产出和历史快照相互隔离。
5. 为删除操作增加执行实例回归：在实例 2 删除图片后切换实例 1，再切回实例 2，确认删除状态保留；在历史 1/2 使用相同图片索引，确认只修改指定 ID。
6. 检查所有仍按索引传递图片的调用点，目标是 `ImageResult -> Canvas -> updateExecutionNodeData` 全链路只传资源 ID。
7. 完成测试后重启 `dev:server` 与 `dev:web` 持久化进程，并读取日志确认服务正常。

## 当前验证命令

```powershell
node --test "packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/utils/group-output-binding.test.js" "packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/utils/output-resources.test.js"
```

## 风险与注意事项

- 不要在实例切换函数中恢复 `saveActiveRun(context.execution, context.currentStates)`，除非有明确的单字段/单通道保存需求。
- `output.images` 协议保持字符串数组；资源元数据和唯一 ID 放在对应 `output.resources` 项中。
- 不要覆盖用户已有的 `manifest.json`、`configs/panel-layout.json` 等无关修改。

## Suggested skills

- `diagnose`：继续按复现、假设、回归测试流程处理实例切换问题。
- `tdd`：为 `setMode`、`setCount` 和 `switchRun` 补充先失败后修复的状态隔离测试。
- `improve-codebase-architecture`：当通道更新仍与全量节点快照耦合时，评估进一步拆分状态更新边界。
