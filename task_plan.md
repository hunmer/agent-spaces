# Task Plan: mini-app 内嵌 Agent Chat

## Goal
通过 `agentChatPlacement: "mini-app-slot"` 配置，将宿主 `MiniAppAgentDock` 挂载到 mini-app 的 `RightPanel` Chat tab，同时提供可复用的 Host Slot 注册协议，并保留默认外层侧栏行为。

## Current Phase
Phase 5 complete

## Phases

### Phase 1: 数据路径梳理
- **Status:** complete

### Phase 2: 配置字段传递
- **Status:** complete

### Phase 3: Host Slot 与 Portal
- **Status:** complete

### Phase 4: RightPanel Chat 接入
- **Status:** complete

### Phase 5: 验证与交付
- **Status:** complete

## Decisions
- 配置字段：`agentChatPlacement?: "dock" | "mini-app-slot"`，缺省等同 `dock`。
- Chat 状态、会话和权限继续归宿主管理，mini-app 只提供 DOM 插槽与 tab 切换。
- 插槽协议挂在 `window.AgentSpaces`，使用注册/注销和订阅机制，避免 DOM 轮询。

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| 差异复核工具脚本出现 `Unexpected token '/'` | 1 | 拆成无嵌套引号的独立命令执行 |
| Web 全量 `tsc --noEmit` 失败 | 1 | SDK build 后本次相关错误已消失；剩余均为仓库既有类型错误 |
| 第二个 Next dev 服务启动失败 | 1 | Next 单目录开发锁禁止并行；保留现有 3000 服务，其健康检查为 200 |
| planning 完成检查器误报 5/0、0/0 | 2 | 按模板改为 `### Phase` + `**Status:** complete` |
