# Task Plan

## Goal
根据指定父/子执行日志复现并修复子工作流执行报错，保留用户现有运行数据和无关改动。

## Phases
- [complete] 检查工程技能上下文并解析两份执行日志
- [complete] 建立最小复现，提出并验证根因假设
- [complete] 先补回归测试，再实施最小修复
- [in_progress] 运行原始场景与定向验证，清理临时文件

## Constraints
- 不编辑 execution_history 或 workflow 运行数据。
- 修复共享根因，不对单份日志做特判。
- 不覆盖当前工作树已有改动。

## Errors Encountered
- 查询不存在的 `docs/agents` 目录导致 `rg` 返回 1；已确认诊断不依赖该配置，不重复查询。
- 新回归测试按预期失败，但容错模式将 `Loop node missing body` 记录为步骤错误后继续执行，测试表面错误为结果 `undefined`；该信号仍稳定对应原日志故障链。
- server 包没有 ESLint 9 所需的 `eslint.config.*`，定向 ESLint 无法运行；改用 server TypeScript、构建和定向测试验证。
- 三文件组合测试 9/10，既有 `workflow-scoped-join` 缺失引用用例未按预期 rejection；下一步单独运行并检查是否为并行状态干扰或本次回归。
