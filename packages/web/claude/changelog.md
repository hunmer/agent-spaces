# 变更记录 (Changelog)

## 2026-06-24 -- workflow 组件分组深挖

- `claude/component-groups.md`：新增"`components/workflow/` 86 文件分组"章节，按 Hooks 行为层(11) / Utils 工具层(6+) / Types(5) / 节点视图 / 对话框 / 属性面板 / 画布 七组展开
- 深抽 5 个关键 hook/utils 文件用途：
  - `use-workflow-editor-canvas.ts`：画布顶层编排，workflowId 变化时 `ensureLoopBodyBoundaryNodes` + `syncAllScopeBoundaryLayouts` 修正布局
  - `use-workflow-canvas-data.ts`：执行步骤聚合 + scope 迭代步骤合成；z-index 四层分层（LOOP_BODY=-100 / DEFAULT=1 / SCOPED_CHILD=1000 / ACTIVE=2000）
  - `use-workflow-node-actions.ts`：节点 CustomEvent dispatch（`workflow:update-node-data` / `workflow:delete-node`），受 isCanvasLocked/isExecutionBusy/isDeleteDisabled 门控
  - `workflow-canvas-utils.ts`：loop body 边界节点保证 + scope 布局同步；re-export 共享类型守卫
  - `workflow-canvas-helpers.ts`：几何与 DOM 工具（`isPointInPolygon` 套索、`isConnectionEndOnCanvasNode` 连接落点判断）
- 覆盖率：约 95%（从 94% 提升）
- 仍存缺口：workflow 部分 .tsx 对话框/属性面板内部 JSX 结构未逐一深抽

## 2026-06-12 -- workflow-editor store 深挖

- `claude/stores.md`：useWorkflowEditorStore 条目从"单文件 878 行"改为 12 文件 slice 组合，新增详解章节（入口注册表 / 25 字段 State + 57 action / 9 slice 职责表 / interaction 闭环 / 与后端 WS 契约）

## 2026-06-09 -- init-architect 扫描

- 创建 `claude/` 详情文件目录
- 从 CLAUDE.md 提取索引结构，详情拆分到 claude/*.md
- 扫描覆盖率：约 90%（250+ 源文件中已识别主要组件、Store、工具库）
