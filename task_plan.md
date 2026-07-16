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

## Pi 原生 SDK 迁移（当前任务）

### Goal
将业务侧旧 CLI 进程桥接迁移为原生 pi SDK，同时保持 AgentRuntime 对外契约与现有配置兼容。

### Phases
- [complete] 盘点旧运行时调用链、配置映射和用户可见标识
- [complete] 设计并实现最小原生 SDK 适配器
- [complete] 更新运行时注册、类型、路由与测试中的旧标识
- [complete] 运行定向测试、构建和残留检查

### Constraints
- 保留其他任务的现有修改和运行数据。
- 不引入第二套抽象；复用现有 AgentRuntime 契约。
- 保持 Node 20 兼容，pi SDK 固定为 0.74.2。

### Errors Encountered
- 假设 pi-agent-core 位于 pi-coding-agent 的嵌套 node_modules，路径不存在；已从 coding-agent 暴露的事件类型获得所需结构，后续不重复查询该路径。
- 首次 server build 在 runtime descriptor 的旧 `oh-my-pi` 标识处失败；这是预期的未完成迁移点，下一步统一更新 server/web descriptor 后重跑，不重复原命令。
- 最终检查出现 7 个 fitting-room/workflow 运行数据变更；逐项 diff 后确认内容是并行应用产生的图片/资料/运行时间更新，与测试夹具无关，按用户数据保留不修改。
