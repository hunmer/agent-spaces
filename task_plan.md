# Task Plan

## Goal
为 game-asset-canvas 的 Agent API 增加分组自动编排能力，复用现有布局规则并打通浏览器 RPC。

## Phases
- [complete] 1. 阅读参考实现与现有 API/RPC/分组布局代码
- [complete] 2. 确定最小接口与改动范围
- [complete] 3. 实现 API、工具元数据及画布端处理
- [complete] 4. 执行语法与针对性验证
- [complete] 5. 诊断 update_node 并发 RPC 超时根因
- [complete] 6. 实施最小修复并补充回归测试
- [complete] 7. 验证并发更新链路

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
