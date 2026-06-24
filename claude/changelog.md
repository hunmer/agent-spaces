# 变更记录 (Changelog)

## 2026-06-24 -- init-architect 增量更新（断点续扫）

- **server storage/ 关键 store 字段深挖**：修正 `agent-store.ts` 误描述（实为 SQLite Agent Usage 统计，非 Agent preset；preset 实际分散在 `chat-templates/` 与 `agent-templates/`）。补充 chat-store 全字段（ChatAgent 30+ 字段含 runtimeKind/providerId/skills/tools/outputStyle、ChatMessage 含 thinking/usage/toolCalls/timeline、ChatSession、ChatWorkspace、WorkspaceTabState）、workspace-store/issue-store/task-store 扁平 CRUD 范式（index.json + {id}.json 双写）、workflow-store 目录式布局（versions/execution_history/plugin_configs/staging/operation_history/chat）
- **web components/workflow/ hooks/utils 深抽**：5 个关键文件确认用途 —— `use-workflow-editor-canvas.ts`（节点/边/组操作编排）、`use-workflow-canvas-data.ts`（执行步骤聚合 + scope 迭代）、`use-workflow-node-actions.ts`（节点 CustomEvent dispatch）、`workflow-canvas-utils.ts`（loop body 边界 + scope 布局同步）、`workflow-canvas-helpers.ts`（多边形命中 + 连接落点判断）
- **templates agents 格式确认**：抽样 `engineering-code-reviewer.md`，确认统一格式为 YAML frontmatter（name/description/color/emoji/vibe）+ 7 段标准章节（Identity/Mission/Critical Rules/Capabilities/Workflow/Communication/Success Metrics）
- **electron/renderer 现状确认**：实为 Monaco 离线 bundle（vs/ 下 100+ 语言 chunk + nls 多语言 + worker），无业务代码，继续跳过
- **UTF-8 编码保障**：全部 .md 文件以 UTF-8 写入，修复此前可能的 GBK 读写异常
- **覆盖率**：约 95%（从 94% 提升）
- **仍存缺口**：storage 其余 10 个 JSON store 字段、agents 184 模板逐一抽样、plugins 120+ 的 tools.js/workflow.js、workflow 部分 .tsx 对话框内部结构

## 2026-06-23 -- init-architect 增量更新（断点续扫）

- **新增 electron 模块**：纳入根 CLAUDE.md 模块索引（之前遗漏，模块已自带 CLAUDE.md）。electron 职责：窗口生命周期 / `local://` 协议 / 桌面原生能力 / 全局快捷键 / renderer↔main 桥接，不含业务逻辑（CRUD 全走 server）
- **server storage/ 缺口补全**：从 21 store 扩展到 24 文件。新增章节"SQL 安全 sql-safety.ts（纯函数 driver 无关）"与"SQLite 三层"（`mini-app-db` better-sqlite3 + `sqlite-store` node:sqlite + `knowledge-base-store` node:sqlite），分别记录驱动/落盘路径/连接池策略；补全 `MAX_ROWS=10000`、`DB_NAME_RE`、`IDENT_RE`、`BLOCKED_RE` 等关键校验常量
- **web components/sidebar/ 缺口补全**：56 文件按骨架与导航(8) / 对话框(18) / Settings 子面板(14) / Skills Dialog 子目录(10) / Hooks(3) 五组展开，标注每个文件对应的资源或标签页
- **templates agents 缺口补全**：15 个分类的目录命名全部确认（academic/design/engineering/finance/game-development/marketing/paid-media/product/project-management/sales/spatial-computing/specialized/support/testing），与 templates CLAUDE.md 既有计数对齐
- **根 CLAUDE.md 重构**：模块索引从 7 → 8（加 electron）；Mermaid 图新增 electron 节点与 `loadFile renderer` / `HTTP/WS` 边；约定规则精简为单行摘要（详情指向 claude/conventions.md）；扫描状态时间戳更新
- **覆盖率**：约 94%（从 92% 提升）

## 2026-06-13 -- init-architect 增量更新（断点续扫）

- **阶段 A 全仓清点**：完成 7 个模块的文件统计与差异对比，识别自 2026-06-12 以来的结构变化
- **server mini-app 架构扩展**：`mini-app.ts` 拆分为 5 文件（`mini-apps.ts` CRUD + `mini-app-services.ts` 沙箱服务编译 + `mini-app-agent.ts` Agent 运行时 + `mini-app-tasks.ts` 任务缓存 + `mini-app-client-rpc.ts` 客户端 RPC）；路由 `mini-app.ts` → `mini-apps.ts`
- **server 新增服务文件**：`pty.ts`（node-pty 终端会话）、`command-process-manager.ts`（命令进程管理 + 重启）、`generated-title.ts`（频道/Issue 标题生成调度）、`issue-retry.ts`（启动时 running 任务恢复）、`issue-comment.ts`、`tool-detail.ts`（工具调用详情持久化）、`auth-store.ts`、`llm-model-config.ts`（thinking 配置）、`global-wechat-qr.ts`（全局企微扫码）、`gitignore.ts`、`workspace-prompt.ts`
- **server ws 新增**：`message-parts.ts`（消息组装）、`agent-prompt.ts`（系统提示构建）、`html-utils.ts`
- **server agents 新增**：`agent-context.ts`（共享上下文接口）、`agent-message-parts.ts`（消息片段追踪器）、`title-generator-agent.ts`（场景标题生成）
- **server storage 新增**：`mini-app-store.ts` + `mini-app-db.ts`（SQLite 连接池 + 越界保护）
- **flutter 测试缺口已填补**：新增 `test/widget_test.dart`（App 构建冒烟测试）+ `test/services/file_sources/webdav_url_test.dart`（URL 规范化单元测试）
- **templates 大幅扩展**：skills 从 15 增至 66+ 文件；plugins 新增 mira-sdk/dingtalk/aliyun_oss/tencent_cos/epub-parser/fish-audio/jimeng/test-plugin；prompt 2 个；output-styles 7 个；mini-app 1 个；workflows 1 个（code-writing 四阶段）
- **覆盖率**：约 92%（从 88% 提升）

## 2026-06-12 -- init-architect 增量更新

- 增量扫描全部 7 个模块的 package.json / pubspec.yaml / 入口与目录结构
- 补建 `packages/dom-inspector-hook/CLAUDE.md`（此前缺失，确认 2 源文件 + 3 公开导出）
- 根 CLAUDE.md：补充 Mermaid 图缺失的 dom-inspector-hook 节点 click 链接、刷新模块源文件计数与运行命令（新增 `up` / `lint` / `publish`）
- 覆盖率：约 88%

## 2026-06-09 -- init-architect 扫描

- 初始化 `claude/` 详情文件目录（11 个详情文件）
- 生成根级轻量索引 CLAUDE.md（从 600+ 行旧版拆分为索引 + 详情）
- 生成 shared / sdk / server / web / flutter / templates 六个模块的 CLAUDE.md + claude/
- 覆盖全部 7 个模块包
- 扫描覆盖率：约 85%
