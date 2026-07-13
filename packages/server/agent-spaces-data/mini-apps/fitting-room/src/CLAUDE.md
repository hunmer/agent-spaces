# fitting-room (试衣间)

> 管理「我的形象」，并通过图生图工作流生成发型 / 服装效果图。

## Project Overview

试衣间 miniapp，分三个模板：

- **我的形象** (`profile`)：上传多张照片和个人服饰，录入性别 / 身高 / 体重 / 三围。
- **发型库** (`hairstyle`)：展示发型历史生成图；通过图生图工作流（形象图 + 发型参考图）生成新发型。
- **服装库** (`outfit`)：展示服装历史生成图；通过图生图工作流（形象图 + 服装参考图）生成新穿搭。

## File Structure

- `index.jsx` — 入口；用 `Router` 把 `path[0]` 映射到三个模板（默认 `profile`）。
- `components/Style.jsx` — 全局 `<style>`（主题感知 CSS 变量）。
- `components/ProfilePage.jsx` — 我的形象：体型表单 + 形象照片/个人服饰上传。
- `components/GalleryPage.jsx` — 通用画廊（`kind: "hairstyle" | "outfit"`）；历史展示 + 工作流选择 + 浮动生图按钮。
- `components/HairstylePage.jsx` / `OutfitPage.jsx` — 画廊薄包装。
- `components/GenerateDialog.jsx` — 生图对话框：从我的形象选择 / 上传形象图，再上传多张参考图，调用图生图工作流。
- `services/store.js` — 服务端单写者：保存形象、追加/删除/清空两个历史、保存 shared-config。
- `utils/helpers.js` — 上传解析、`unwrapWorkflowPayload` / `extractImages`、`runImageToImage`。

## Key Design Decisions

- **路由**：入口包在 `<Router>`，`useRouter` 只在 `<App>` 内调用（位于 `<Router>` 子树）。未知 `path[0]` 回退到 `profile`。
- **数据持久化（单写者）**：所有可变配置走 `invokeService` → `services/store.js`（`ctx.updateConfig` / `ctx.writeConfig`），前端通过 `getConfig` / `onConfigChanged` 读，避免多端覆盖。
  - `profile.json`：形象（照片、个人服饰 URL 列表 + 体型字段）。
  - `hairstyle-history.json` / `outfit-history.json`：生图历史（去重 by url，最多 200 条）。
  - `shared-config.json`：发型 / 服装各自选中的 `workflowId` + `workflowName`。
- **生图**：适配 `edit_image` 工作流协议 —— `callPluginTool('@agent-spaces/builtin', 'execute_workflow_sync', { workflow_id, input: { images, prompt, model, aspect, size }, max_wait_ms })` + `{ taskId, meta }` 跟踪。`images` 是 URL 字符串数组，首项为形象图，其余为参考图。
- **结果解析**：`unwrapWorkflowPayload` + `extractImages`，从返回 `result` 数组的成功结束节点提取图片，忽略仅返回 `error` 的默认结束节点。
- **样式**：Tailwind `className` 优先，必要时用 CSS 变量（`var(--card)` / `var(--border)` 等），不强制 dark/light。

## Dependencies

- Host UI：`window.AgentSpacesUI` 的 Button / Input / Label / Textarea / Select / FileUpload / Dialog / Badge / WorkflowListDialog 等。
- Router：`@agent-spaces/ui` 的 `Router` / `useRouter` / `Link`。
- 插件：`@agent-spaces/builtin` 的 `list_workflows` / `execute_workflow_sync`。

## Notes

- 需要用户在发型库 / 服装库右上角分别选好对应的「图生图工作流」，否则点浮动按钮会弹提示并打开工作流选择对话框。
- `FileUpload` 不支持 children trigger，直接渲染其拖拽区域即可（已在 `ProfilePage` / `GenerateDialog` 中正确使用）。
