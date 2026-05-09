# MCP 注入排查进度

- 初始化排查计划文件。
- 已定位 MCP 名称进入日志与提示词的路径，下一步核对 Claude Code runtime 适配器和目标 agent `.claude` 配置。
- 已修正提示词中 MCP 与 Agent Spaces channel tools 的边界描述。
- 已在 Claude Code runtime 增加 `sdk mcp servers` 启动日志，并复用规范化后的 MCP 配置传给 SDK。
- 按用户要求未主动执行测试，准备提供复测步骤。
