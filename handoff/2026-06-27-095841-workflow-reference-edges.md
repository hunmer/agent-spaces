# Workflow Reference Edge Handoff

## 目标

修复 workflow 画布中变量引用、Property input badge 连线、运行补偿边之间的错误显示/生成行为。

## 当前结论

- Normal input 模式下，节点引用其他节点变量时，不应显示或生成额外的默认 `source/target` 运行线。
- Property input 模式下，变量引用应显示为字段/property badge 连线。
- Property input 模式下，只有当 source 到 target 没有现成节点级运行路径时，才生成默认 `source/target` 补偿 runtime 边。
- `end` 节点的 `output:*` badge 字段 runtime 边仍需要保留，用于后端把上游输出写入 end 输出；如果没有节点级运行路径，仍应补默认 runtime。

## 已修改文件

- `packages/web/src/components/workflow/workflow-reference-edges.ts`
  - 新增 `layoutSnapshot.nodeDisplayMode === 'properties'` 限制，只有 Property input 模式才同步 runtime 补偿边。
  - 新增 `hasNodeLevelRuntimePath`，已有完整节点级运行路径时不再补默认 runtime。
  - 保留字段 reference 边同步，用于 Property input 下显示 badge/property 连线。

- `packages/web/src/components/workflow/use-workflow-canvas-data.ts`
  - Normal 模式下过滤 `edgeKind === 'reference'`、生成的 `--reference-runtime`、字段 handle 边。
  - 避免这些边在 Normal 模式被归一化显示成普通 `source/target` 线。

## 关键样本

- `packages/server/agent-spaces-data/workflows/d88dcb7c-7f5f-47c8-962c-89217a2c0ad6/workflow.json`
  - Normal input 场景。
  - `start` 被多个下游图片节点引用，但已有完整路径：`start -> run_code -> switch -> image node`。
  - 不应生成或显示 `start -> image node` 的默认补偿 runtime。

- `packages/server/agent-spaces-data/workflows/b52fe020-9e70-43e0-93d6-21d9fdb0fdc3/workflow.json`
  - Property input 场景。
  - `jimeng_image_to_image output:data.images -> end output:images` 是字段 runtime 边。
  - 没有节点级运行路径时，应补 `jimeng_image_to_image source -> end target` 的默认 runtime。

## 已跑验证

- `pnpm --filter @agent-spaces/web exec eslint "src/components/workflow/workflow-reference-edges.ts" "src/components/workflow/use-workflow-canvas-data.ts"`
- `pnpm --filter @agent-spaces/server test -- workflow-end-output-edge.test.ts`

两者通过。

还用临时 Node 脚本验证：

- d88 中 `start -> 下游图片节点` 在 Normal 模式不会作为普通线显示。
- b52 中 `jimeng_image_to_image -> end` 在 Property 模式仍满足补偿条件。

## 当前工作区状态

`git status --short` 显示除核心修复外还有其他脏文件：

- `packages/server/agent-spaces-data/workflows/7a799f6b-d4ce-485d-b28e-6bc28746ac2e/workflow.json`
- `packages/server/agent-spaces-data/workflows/d88dcb7c-7f5f-47c8-962c-89217a2c0ad6/workflow.json`
- 另外 `git diff --stat` 曾显示 `workflow-editor.tsx`、`workflow-node-list-panel.tsx` 有改动。

这些不是本次核心修复里主动编辑的文件。继续前先确认是否为用户已有改动，不要随意回退。

## 建议后续

1. 补前端同步函数单测，覆盖：
   - Normal 模式变量引用不生成 runtime compensation。
   - Property 模式变量引用在无节点级路径时生成 runtime compensation。
   - 已有节点级路径时不生成 runtime compensation。
   - end output badge 字段 runtime 仍保留，并在 Property 模式下可补默认 runtime。
2. 如要做 UI 回归，打开 d88 和 b52 两个 workflow 手动确认 Normal/Property 模式画布线条。

## Suggested Skills

- `diagnose`：如果继续调试连线显示或同步边清理问题。
- `code-architecture-research`：如果要系统梳理 workflow edge/reference/runtime 的职责边界。
- `tdd`：如果要补同步逻辑的回归测试。
