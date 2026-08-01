# Task Plan

## Goal
为 workflow group header 增加可注入操作区，并在 game-asset-canvas 实现分组批量运行、可调队列并发数、运行/排队节点状态视觉反馈。

## Phases
- [complete] 1. 定位相关组件、队列状态和 UI 导出能力
- [complete] 2. 设计最小接口并实现宿主与 mini-app 联动
- [complete] 3. 完成语法、类型和针对性行为验证
- [complete] 4. 汇总结果与验收步骤
- [complete] 5. 定位多选工具栏接口与现有确认弹窗模式
- [complete] 6. 抽取共享批量运行入口并接入二次确认
- [complete] 7. 验证两个入口、输出计数和取消行为

## Decisions
- 默认复用现有执行队列，不另建批处理执行器。
- 默认并发数为 3，并沿用现有 settings 持久化机制。
- 分组批量运行仅提交当前已有统一执行规格的 4 类生成节点；其他展示/处理节点跳过。
- 队列支持自定义 execute/cancel 回调，以复用节点原有执行逻辑和取消控制器。
- 分组和多选批量运行共用同一个节点 ID 执行入口。
- 已有输出计数仅针对本次实际可入队的生成节点，输出字段支持数组和字符串值。

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| Web 全量 `tsc --noEmit` 失败 | 1 | 错误均位于既有非目标文件（dropzone、编辑器、图表等），目标 `workflow-group-node.tsx` 未报错；改用目标文件语法检查与差异检查继续验收。 |
| Slider 使用了错误提交事件 `onValueCommit` | 1 | 查阅本地 Base UI 1.4.1 声明，修正为 `onValueCommitted`。 |
