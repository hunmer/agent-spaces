# Task Plan

## Goal
修复 game-asset-canvas 执行队列取消后运行中节点未退出生成状态的问题。

## Phases
- [complete] 1. 阅读参考实现与现有 API/RPC/分组布局代码
- [complete] 2. 确定最小接口与改动范围
- [complete] 3. 实现 API、工具元数据及画布端处理
- [complete] 4. 执行语法与针对性验证
- [complete] 5. 诊断 update_node 并发 RPC 超时根因
- [complete] 6. 实施最小修复并补充回归测试
- [complete] 7. 验证并发更新链路
- [complete] 8. 检查 Toolbar 自动布局与 group 坐标模型
- [complete] 9. 实现横向/垂直子菜单与顶层实体布局
- [complete] 10. 执行语法和布局回归验证
- [complete] 11. 全画布自动布局后触发 fitView
- [complete] 12. 诊断队列取消与节点运行态清理链路
- [complete] 13. 实施最小修复并补取消路径保护
- [complete] 14. 执行语法与针对性验证

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| 根目录运行 ESLint 9 找不到 `eslint.config.*` | 1 | 项目仅 `packages/web` 有配置，本次 server mini-app 文件改用 Babel 语法检查和 Node 测试验证 |
