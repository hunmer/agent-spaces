# 变更记录 (Changelog)

## 2026-06-13 -- init-architect 增量更新（断点续扫）

- **阶段 A 全仓清点**：完成 7 个模块的文件统计与差异对比，识别自 2026-06-12 以来的结构变化
- **server mini-app 架构扩展**：`mini-app.ts` 拆分为 5 文件（`mini-apps.ts` CRUD + `mini-app-services.ts` 沙箱服务编译 + `mini-app-agent.ts` Agent 运行时 + `mini-app-tasks.ts` 任务缓存 + `mini-app-client-rpc.ts` 客户端 RPC）；路由 `mini-app.ts` → `mini-apps.ts`
- **server 新增服务文件**：`pty.ts`（node-pty 终端会话）、`command-process-manager.ts`（命令进程管理 + 重启）、`generated-title.ts`（频道/Issue 标题生成调度）、`issue-retry.ts`（启动时 running 任务恢复）、`issue-comment.ts`、`tool-detail.ts`（工具调用详情持久化）、`auth-store.ts`、`llm-model-config.ts`（thinking 配置）、`global-wechat-qr.ts`（全局企微扫码）、`gitignore.ts`、`workspace-prompt.ts`
- **server ws 新增**：`message-parts.ts`（消息组装）、`agent-prompt.ts`（系统提示构建）、`html-utils.ts`
- **server agents 新增**：`agent-context.ts`（共享上下文接口）、`agent-message-parts.ts`（消息片段追踪器）、`title-generator-agent.ts`（场景标题生成）
- **server storage 新增**：`mini-app-store.ts` + `mini-app-db.ts`（SQLite 连接池 + 越界保护）
- **flutter 测试缺口已填补**：新增 `test/widget_test.dart`（App 构建冒烟测试）+ `test/services/file_sources/webdav_url_test.dart`（URL 规范化单元测试）
- **templates 大幅扩展**：skills 从 15 增至 66+ 文件（新增 caveman/grill-me/handoff/improve-codebase-architecture/tdd/to-prd/planning-with-files-zh 等）；plugins 新增 mira-sdk/dingtalk/aliyun_oss/tencent_cos/epub-parser/fish-audio/jimeng/test-plugin；prompt 确认 2 个（karpathy-skills + token-efficient-coding）；output-styles 确认 7 个（carmack/codex-rigor/dhh/evan-you/jobs/linus/uncle-bob）；mini-app 确认 1 个（minimax_tts）；workflows 确认 1 个（code-writing 四阶段）
- **web 组件缺口补全**：新增 home（10 文件，含 usage-dashboard + subscription-panel）、timeline（4 文件，版本更新日志）、layout（13 文件，含 app-shell/workspace-shell/command-palette/auth-guard）、common（15 文件，含 picker/dialog/floating-ball）、settings（5 文件）组件组
- **web i18n 命名空间**：确认 34 个命名空间（新增 projectSettings/home/commands/agentCommands/robotAccounts/worktree/mini-apps 等）
- **docs 新增**：mini-app-agent.md、mini-app-renderer.md、mini-app-preview-agent.md、mini-app-state-sync-ws-plan.md、plugin-faq.md、hermes-mcp-config-findings.md、flex-truncate-fix.md + superpowers/{plans,specs} 2026-06-13 三份设计文档
- **覆盖率**：约 92%（从 88% 提升）
- **仍存缺口**：server `storage/` 22 个 store 字段未逐一抽取、web `components/sidebar/` 56 文件未逐一展开、templates agents 184 个模板内容未逐一抽样

## 2026-06-12 -- init-architect 增量更新

- 增量扫描全部 7 个模块的 package.json / pubspec.yaml / 入口与目录结构
- 补建 `packages/dom-inspector-hook/CLAUDE.md`（此前缺失，确认 2 源文件 + 3 公开导出）
- 根 CLAUDE.md：补充 Mermaid 图缺失的 dom-inspector-hook 节点 click 链接、刷新模块源文件计数与运行命令（新增 `up` / `lint` / `publish`）
- 覆盖率：约 88%
- 主要缺口：server service 子模块细节、web `components/` 部分子目录、flutter/templates 内容样本

## 2026-06-09 -- init-architect 扫描

- 初始化 `claude/` 详情文件目录（11 个详情文件）
- 生成根级轻量索引 CLAUDE.md（从 600+ 行旧版拆分为索引 + 详情）
- 生成 shared / sdk / server / web / flutter / templates 六个模块的 CLAUDE.md + claude/
- 覆盖全部 7 个模块包
- 扫描覆盖率：约 85%
