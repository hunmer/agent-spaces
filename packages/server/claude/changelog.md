# 变更记录 (Changelog)

## 2026-06-24 -- 存储层关键 store 字段深挖

- `claude/storage.md`：修正 `agent-store.ts` 误描述（实为 SQLite Agent Usage 统计，**非 Agent preset**；preset 实际分散在 `chat-templates/` 与 `agent-templates/`）。新增"关键 store 字段抽样"章节：agent-store 双表结构（agent_sessions UPSERT + agent_usage 21 列 + 成本估算 fallback + Dashboard 聚合）、chat-store 全字段（ChatAgent 30+ 字段含运行时不持久化的凭据剥离、ChatMessage 结构化字段、WorkspaceTabState）、workspace/issue/task store 扁平 CRUD 范式、workflow-store 目录式布局补全
- SQLite 三层表修正：agent-store 加入表格（之前只在"Store 索引"中标注为"Agent preset + 配置目录"）
- 覆盖率：约 96%（从 95% 提升）
- 仍存缺口：其余 10 个 JSON store 字段、notification-hub bot-agent/service 细节

## 2026-06-12 -- Workflow 引擎 + 存储层深挖

- `claude/architecture.md`：Workflow 章节从概述扩为完整架构（6 核心文件 / 会话生命周期 / 执行流程 5 道关卡 / 22+ 节点类型 / 循环 AsyncLocalStorage / switch 分支剪枝 / 变量模板 / 事件流 / 触发器 / 端到端数据流）
- 新建 `claude/storage.md`：21 个 store 索引 + 数据目录布局（workflow-store 目录式范例）+ 写入约定
- `CLAUDE.md` 文件索引新增 storage.md 链接
- 关键文件行数校正：execution-manager.ts 实际 2043 行（原记 1757）

## 2026-06-09 -- init-architect 扫描

- 创建 `claude/` 详情文件目录
- 从 CLAUDE.md 提取架构详解和路由索引，拆分到 claude/*.md
- 扫描覆盖率：约 90%（173 个源文件中已识别全部路由、服务、适配器）
