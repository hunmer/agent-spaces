# MCP 注入排查计划

## 目标
定位并修复 agent 配置了 `fetch` MCP，但 Claude Code 实际运行时没有注入该 MCP 的问题。

## 阶段
- [complete] Phase 1: 定位配置模型、运行时组装和 Claude Code 启动链路
- [complete] Phase 2: 核对目标 agent 配置目录与生成的 `.claude` 配置
- [complete] Phase 3: 修复 MCP 注入缺口，保持实现简单且符合现有架构
- [complete] Phase 4: 提供验证步骤，不主动执行测试

## 约束
- 不执行 git 提交或分支操作。
- 先读后写，避免修改无关文件。
- 响应使用简体中文。

## 错误记录
暂无。
