# 子工作流节点与执行记录 Handoff

## 当前状态

子工作流节点已完成从创建、选择目标工作流、同步输入输出字段，到执行记录和新窗口预览的完整链路。当前工作树干净，相关改动已提交到 `main`。

相关提交：

- `2bfea2bc`：注册 `sub_workflow` 节点并加入侧边栏。
- `5bbbac59`：增加工作流选择器，选择后同步目标开始节点输入字段。
- `15751cf6`：同步目标结束节点输出字段及相关执行修正。
- `7619e3bd`：生成子工作流执行记录、节点日志跳转按钮和 URL 自动预览。

## 已实现行为

### 节点配置

- 节点定义位于 `packages/web/src/lib/workflow-nodes/definitions/flow-control.ts`。
- 工作流选择器位于 `packages/web/src/components/workflow/workflow-fields-workflow.tsx`。
- 选择目标工作流后：
  - 写入 `workflowId`、`workflowName`。
  - 从第一个 `start` 节点同步 `data.inputFields`。
  - 从第一个 `end` 节点同步 `data.outputs`。
  - 同名、同类型输入字段保留已有值。
- 当前工作流会从选择列表排除，服务端仍保留禁止自调用校验。

### 执行记录

- 核心实现见 `packages/server/src/services/execution-manager.ts`。
- 子工作流继续复用父 `ExecutionSession`，避免破坏暂停、交互和嵌套执行语义。
- 服务端使用 `AsyncLocalStorage<string[]>` 标记步骤所属的子执行作用域：
  - 并行子工作流不会串步骤。
  - 嵌套子工作流的步骤同时属于外层和内层记录。
- 子执行日志按目标工作流 ID 保存，运行中用相同日志 ID 覆盖写入，完成后更新为最终状态。
- WS 场景通过 workspace broadcast 推送子日志，使新打开的预览窗口能继续收到进度；无 workspace 时回退到原 event sink。

### 查看子工作流

- `ExecutionStep` 增加：
  - `subWorkflowId`
  - `subWorkflowExecutionId`
  - `subWorkflowExecutionIds`
- `packages/web/src/components/workflow/workflow-node-execution-log.tsx` 在子工作流节点运行中和完成后的折叠内容显示“查看子工作流”。
- 点击后使用：

```text
/workflows/{subWorkflowId}?executionLogId={subWorkflowExecutionId}&preview=1
```

- `packages/web/src/components/workflow/workflow-editor.tsx` 消费这些参数，日志加载后自动选择对应记录并调用现有 `enterPreview`。
- 目标子工作流的 `workflow-execution-bar.tsx` 会展示该次执行记录。

## 回归测试与验证

回归测试在：

- `packages/server/test/workflow-execution-snapshot.test.ts`

新增用例验证子日志只包含所属作用域步骤，并使用目标工作流快照。

已通过：

```powershell
pnpm --filter "@agent-spaces/shared" build
pnpm --filter "@agent-spaces/server" build
pnpm --filter "@agent-spaces/server" exec tsx --test "test/workflow-execution-snapshot.test.ts"
pnpm --filter "@agent-spaces/web" exec tsc --noEmit
pnpm --filter "@agent-spaces/web" exec eslint "src/components/workflow/workflow-node-execution-log.tsx"
```

测试结果：`workflow-execution-snapshot.test.ts` 4/4 通过。

## 接手注意事项

- 输入和输出同步当前只取第一个 `start` / `end` 节点；如果未来允许多开始或多结束节点，需要先明确合并规则。
- 子日志当前在每次既有 execution log emit 时同步覆盖文件。代码中有 `ponytail:` 注释；只有确认 I/O 成为瓶颈后再增加节流。
- `workflow-editor.tsx` 定向 ESLint 仍有两条既有 Hook 依赖警告，与本功能无关；新增 URL 预览 effect 本身无警告。
- `7619e3bd` 同时包含两个 `packages/server/agent-spaces-data/workflows/*/workflow.json` 的运行数据变化。后续整理提交历史时需区分功能代码和运行数据。
- 不要改为独立子 `ExecutionSession`，除非同时设计父子暂停、恢复、停止和交互请求的编排；当前派生日志方案就是为避免该复杂度。

## 建议技能

- `diagnose`：子执行记录缺失、状态不同步或新窗口收不到实时事件时使用。
- `tdd`：扩展多开始/多结束、暂停恢复或父子停止传播前使用。
- `code-architecture-research`：需要重新梳理 ExecutionManager、WS、执行日志存储和预览链路时使用。
- `ponytail:ponytail`：继续修改执行链路时保持最小根因改动，避免引入第二套执行系统。

## 快速验收

1. 创建包含子工作流节点的父工作流。
2. 给目标子工作流配置开始节点输入和结束节点输出。
3. 执行父工作流，展开子工作流节点日志。
4. 运行中点击“查看子工作流”，确认新窗口直接进入本次执行预览。
5. 执行完成后重新点击，确认目标工作流执行栏保留该记录和完整步骤。
