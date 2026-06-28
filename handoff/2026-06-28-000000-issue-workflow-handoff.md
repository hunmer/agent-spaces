# Issue Workflow Handoff

## 目标

把 issue 执行流程从 task 驱动改成 workflow 驱动，并补齐创建 issue 时的新建 workspace workflow 流程、悬浮 iframe 打开、初始化 prompt 自动发送、issue 详情嵌入 workflow 执行视图。

## 当前结论

- Issue 创建弹窗已改成只选择 `workspace` 类型 workflow。
- 支持在创建 issue 时直接新建 workflow，保存后通过 `FloatingPanel` iframe 打开 workflow 页面。
- iframe header 已支持“新窗口打开”按钮，点击后会关闭当前 panel 并在新窗口打开。
- workflow 页面支持通过 URL `prompt` 自动触发一次初始化对话。
- `prompt` 参数会在页面读取后立即从 URL 清掉。
- 自动发送初始化 prompt 只在当前 workflow 没有任何聊天消息时才会触发。
- Issue 详情页已不再显示/编辑 task，改为嵌入 workflow 执行视图。
- workflow 嵌入 issue 时使用轻量执行模式，只保留执行栏和画布，不显示完整编辑器壳层。
- workflow 执行状态已增加被动 WS 订阅，即使不是从当前 iframe 发起执行，也能实时更新执行态。

## 已修改文件

- `packages/shared/src/types/workflow.ts`
  - 新增 `workflow.type?: 'normal' | 'workspace'`

- `packages/shared/src/types/issue.ts`
  - 新增 `workflowExecutionId`
  - 新增 `workflowExecutionStatus`

- `packages/server/src/services/workflow.ts`
  - workflow create/update 支持 `type`

- `packages/server/src/storage/workflow-store.ts`
  - legacy workflow 迁移时补默认 `type`

- `packages/server/src/services/issue.ts`
  - issue 持久化补 workflow execution 相关字段

- `packages/server/src/agents/issue-agent-runner.ts`
  - issue 执行主线改成直接启动 workflow execution
  - 根据 `workflow:started/resumed/paused/completed/error` 和 `execution:log` 更新 issue 状态

- `packages/server/src/routes/issue.ts`
  - start / continue / resume / interrupt 改成围绕 workflow execution 工作

- `packages/web/src/components/issue/create-issue-dialog.tsx`
  - 原生 select 改成 `SearchSelect`
  - 只展示 `workspace` workflow
  - 支持直接新建 workflow
  - 支持 workflow 草稿取消时自动删除
  - 支持用 `FloatingPanel` 打开 workflow iframe
  - workflow 面板接入“新窗口打开”

- `packages/web/src/components/workflow/workflow-info-dialog.tsx`
  - 保存时等待异步 `onSave` 完成后再关闭，避免误删刚保存的 workflow

- `packages/web/src/components/common/floating-panel.tsx`
  - header 增加可选 `onOpenInNewWindow`

- `packages/web/src/components/workflow/use-workflow-editor-agent-chat.ts`
  - 增加 `agentChatReady`
  - 增加 `hasAgentMessages`
  - 自动发送前等待聊天初始化完成

- `packages/web/src/components/workflow/workflow-editor.tsx`
  - 支持 `initialAgentPrompt`
  - 支持 `embeddedMode="issue"`
  - 自动发送初始化 prompt 前要求：聊天已初始化且当前无消息

- `packages/web/src/components/workflow/use-workflow-editor-execution.ts`
  - 增加被动订阅 `execution:log / workflow:paused / workflow:resumed / workflow:completed / workflow:error`

- `packages/web/src/app/workflows/[id]/workflow-editor-page-client.tsx`
  - 支持 `prompt`
  - 支持 `embedded=issue`
  - 读取 `prompt` 后清理 URL

- `packages/web/src/components/issue/issue-detail-tasks-panel.tsx`
  - 改成嵌入 workflow 视图

- `packages/web/src/components/issue/issue-detail.tsx`
  - 去掉 task 增删改交互
  - 改为展示 workflow 嵌入执行态

- `documents/docs/features/issue-management.mdx`
  - 文档改成 workflow 直接执行模型

## 已修复的问题

### 1. workflow 保存后立刻消失

根因：

- `WorkflowInfoDialog` 保存时未等待异步 `onSave`
- dialog 先关闭，`create-issue-dialog` 的草稿清理逻辑把刚保存的 workflow 删掉

修复：

- `WorkflowInfoDialog.handleSave` 改成 `await Promise.resolve(onSave(...))`

### 2. workflow 聊天框只有输入占位，没有消息

根因：

- 自动发送 prompt 发生在 workflow 聊天历史加载完成前
- 本地插入的用户/assistant 占位消息被后续空历史覆盖
- SSE 回流时找不到对应 message id

修复：

- 自动发送前增加 `agentChatReady`
- 只在 `hasAgentMessages === false` 时允许自动发送

### 3. URL prompt 重复触发

根因：

- `prompt` 一直保留在地址栏

修复：

- workflow 页面首次读取 `prompt` 后立刻 `router.replace(...)` 删除该查询参数

## 已跑验证

- `pnpm --filter @agent-spaces/shared build`
  - 通过

- `pnpm --filter @agent-spaces/web exec eslint "src/components/workflow/workflow-info-dialog.tsx" "src/components/issue/create-issue-dialog.tsx"`
  - 通过

- `pnpm --filter @agent-spaces/web exec eslint "src/components/workflow/use-workflow-editor-agent-chat.ts" "src/components/workflow/workflow-editor.tsx" "src/app/workflows/[id]/workflow-editor-page-client.tsx"`
  - 只有既有 warning：
    - `packages/web/src/components/workflow/workflow-editor.tsx:778`
    - `packages/web/src/components/workflow/workflow-editor.tsx:844`

- `pnpm --filter @agent-spaces/web exec eslint "src/components/common/floating-panel.tsx" "src/components/issue/create-issue-dialog.tsx"`
  - 通过

## 当前未通过项

- `pnpm --filter @agent-spaces/server build`
  - 被仓库既有测试类型错误阻塞：
    - `packages/server/src/dev/plugin-tests/notion-request.test.ts`

- `pnpm --filter @agent-spaces/web build`
  - 被仓库既有类型错误阻塞：
    - `packages/web/src/components/sidebar/models-dialog.tsx:197`

这些不是本轮改动引入的问题。

## 当前风险

1. server 侧虽然已切 issue 主流程到 workflow execution，但仓库里仍保留大量 task 相关旧逻辑、路由、store、文案和通知分支，属于并存状态。
2. issue 详情里的嵌入 workflow 仍复用 `WorkflowCanvas`，只是改成轻量模式；功能够用，但还不是最轻的只读执行组件。
3. `workflow-editor.tsx` 里仍有既有 hook warning，没有顺手清掉。

## 建议后续

1. 继续清理 task 概念残留：
   - `packages/web/src/stores/task.ts`
   - `packages/server/src/routes/task.ts`
   - `packages/server/src/agents/issue-task-controller.ts`
   - task 相关通知和文案

2. 如果要正式发布这条链路，先修仓库既有构建问题：
   - `packages/web/src/components/sidebar/models-dialog.tsx:197`
   - `packages/server/src/dev/plugin-tests/notion-request.test.ts`

3. 如果要提升 issue 详情性能，可以单独抽一个纯执行态 viewer，避免复用完整 canvas/editor 依赖。

4. 可以补一个 e2e 回归，覆盖：
   - 创建 issue 时新建 workflow
   - 自动带 prompt 打开 workflow
   - prompt 只触发一次
   - 已有聊天消息时不自动触发
   - issue 详情嵌入 workflow 实时刷新
