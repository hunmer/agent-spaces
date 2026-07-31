## 目标
把 `WorkflowListDialog` 从「单击即选中退出」改成「单选/多选 + 默认选中 + 左侧 checkbox + 底部确定按钮」，并迁移全部 7 个调用方。B 类即时持久化改为确定才提交；单选点行高亮、底部确定提交。

## 1. 重构 WorkflowListDialog（packages/web/src/components/workflow/workflow-list-dialog.tsx）

### 新增 Props
- `mode?: 'single' | 'multiple'` — 选择模式。
- `defaultSelectedIds?: string[]` — 弹窗打开时的初始选中快照。
- `onConfirm?: (selected: WorkflowTemplate[]) => void` — 点确定回调，回传选中的工作流对象数组。

### 内部状态机
- 用 `useState<string[]>` 维护 `selectedIds`（临时选中，非受控）。
- `useEffect` 监听 `open` 由 false→true：把 `defaultSelectedIds` 拷贝进 `selectedIds`（每次打开重置快照，避免上次残留）。
- 单选：`toggle(id)` → 直接 `setSelectedIds([id])`（点新项替换旧的）。
- 多选：`toggle(id)` → 增删。

### 列表渲染
- **左侧 checkbox 始终显示**（单选/多选都显示）。单选时表现为「选中态单选」。
- 点行 / 点 checkbox / 键盘 Enter 都触发 `toggle`，**不再立即 onSelect 退出**。
- 保留 `onConfigure`（配置按钮）、`currentWorkflowIds`、过滤工具栏。

### Footer
- 新增「确定」按钮：点击 → `onConfirm(selectedWorkflows)` → `onClose()`。
  - `selectedWorkflows = selectedIds.map(id => workflows.find(w=>w.id===id)).filter(Boolean)`
- 单选模式：未选中时确定按钮 disabled；多选模式：允许空选确定（语义为清空绑定）。
- 保留 `showCreate` 的「新建」按钮。

### 兼容旧 Props（标记 @deprecated，不删，避免破坏）
- `onSelect`、`selectable`、`selectedWorkflowIds`、`onSelectedWorkflowIdsChange`、`selectionDisabled`：当调用方未用新 API 时走旧逻辑（单击 onSelect 退出），保证渐进迁移不报错。但本任务会同时迁移所有调用方到新 API。

## 2. 迁移调用方

### A 类（单选，改 mode='single' + onConfirm）
1. **use-mini-app-host-api.tsx:1182** — `onSelect` 改为 `onConfirm`，确定时 `ensureMiniAppWorkflowConfig` + `closeWorkflowPicker`。
2. **team-management-page.tsx:514** — `onSelect={handleImportFromWorkflow}` 改 `onConfirm`，确定时导入。
3. **workflow-fields-workflow.tsx:47** — onSelect+setOpen(false) 改为 onConfirm+onClose，去掉手动 setOpen。
4. **workflows-page.tsx:353** — `onSelect={handleListOpen}` 改 `onConfirm`。
5. **mini-app-preview.tsx:1693**（配置模式，selectionDisabled）— 改 `onConfigure` 保留，无需 onConfirm（该弹窗只配置不选择），`mode` 不传或用兼容路径。

### B 类（多选，改 mode='multiple' + defaultSelectedIds + onConfirm，移除即时持久化）
6. **chat-input-info-bar.tsx:813** — 
   - `defaultSelectedIds={workflowIds}`（打开时快照）。
   - 移除 `onSelectedWorkflowIdsChange` 里的 `persistAgentBindings` 调用。
   - 新增 `onConfirm={(wfs) => { const ids = wfs.map(w=>w.id); setDraftWorkflowIds(ids); void persistAgentBindings({ boundWorkflowIds: ids }); }}`。
   - 保留 `draftWorkflowIds` 作为内部预览高亮（或直接由弹窗内部状态管理，移除 draft）。
7. **agent-detail.tsx:808** — 
   - `mode='multiple'`，`defaultSelectedIds={agent.boundWorkflowIds}`。
   - `onConfirm={(wfs) => onChange("boundWorkflowIds", wfs.map(w=>w.id))}`。
   - 取消时 editDraft 不被污染（因为 onChange 只在确定时调一次）。

## 3. 文案（locales/zh+en/workflows.json）
在 `page` 块新增：
- `confirm`: 确定 / Confirm
- `cancel`: 取消 / Cancel（如 footer 需显式取消按钮；若复用 onClose 关闭则可省略）

## 验证
- `pnpm --filter @agent-spaces/web exec eslint` 改动文件，0 error。
- `pnpm --filter @agent-spaces/web exec tsc --noEmit` 改动文件无新增类型错误。
- 手动：各调用方点开弹窗 → 勾选不退出 → 底部确定才生效关闭。

## 风险与取舍
- 旧 props 保留为兼容层，增加少量代码复杂度，但保证迁移期间不破坏未覆盖到的边缘调用。所有已知调用方会同步迁移到新 API。
- B 类「确定才提交」是行为变更（用户已确认接受）。
