# 文件地图

## 根目录结构

```
agent-spaces/
  package.json              # 根项目配置
  pnpm-workspace.yaml       # workspace 定义
  .gitignore
  CLAUDE.md                 # 项目索引文档
  claude/                   # 根级详情文档
  docs/                     # 项目文档（40+ .md）
  scripts/                  # 构建脚本
  packages/
    shared/                 # 共享类型定义
    sdk/                    # 前端 API SDK
    server/                 # 后端服务
    web/                    # 前端应用
    flutter/                # Flutter 客户端
    templates/              # Agent 模板库
    dom-inspector-hook/     # DOM Inspector Hook
```

## server 源码结构（173 文件）

```
packages/server/src/
  app.ts                    # 入口（435 行）
  middleware/auth.ts         # 认证中间件
  routes/                   # 37 个路由文件
    auth.ts, workspace.ts, channel.ts, issue.ts, task.ts, agent.ts,
    agent-sse.ts, workflow.ts, mini-app.ts, workflow-hook.ts,
    command.ts, git.ts, llm.ts, search.ts, database.ts, kanban.ts,
    worktree.ts, plugin.ts, chat.ts, chat-run.ts, import.ts, data.ts,
    file.ts, folder.ts, code-favorites.ts, prompt-template.ts, hooks.ts,
    output-style.ts, subscription.ts, speech-recognition.ts, skill.ts,
    mcp.ts, notification.ts, version.ts, robot-account.ts,
    agent-commands.ts, npm-settings.ts
  services/                 # 业务逻辑层
    workspace.ts, workflow.ts, agent.ts, channel.ts, issue.ts, task.ts,
    message.ts, file.ts, command.ts, search.ts, execution-manager.ts (1757 行),
    interaction-manager.ts, workflow-trigger-service.ts, plugin.ts (918 行),
    hook-engine.ts, persistent-agent-context.ts, ai-text.ts,
    database-vector.ts, kanban.ts, worktree.ts, chat.ts,
    notification-center.ts, git-operation-log.ts,
    subscription/, speech-recognition/, notification-hub/ (14 文件),
    builtin-tools/ (10 文件)
  storage/                  # 持久化层
    json-store.ts, workspace-store.ts, workflow-store.ts,
    agent-store.ts, issue-store.ts, task-store.ts, database-store.ts,
    kanban-store.ts, chat-store.ts, llm-store.ts, ...
  adapters/                 # Agent 运行时
    agent-runtime.ts, agent-runtime-types.ts, git.ts,
    open-agent-sdk-runtime.ts, langchain-runtime.ts, codex-runtime.ts,
    hermes-runtime.ts, oh-my-pi-runtime.ts, codex-function-tool-bridge.ts,
    claude-code-runtime/ (7 文件)
  agents/                   # Agent 编排
    issue-agent-runner.ts, issue-task-controller.ts (851 行),
    scheduler-agent.ts, commit-agent.ts, pull-request-agent.ts,
    agent-designer.ts, title-generator-agent.ts, ...
  ws/                       # WebSocket 处理
    handler.ts, agent-runner.ts (1009 行), connection-manager.ts,
    terminal-handler.ts, typescript-lsp.ts, chat-handler.ts, ...
  hooks/                    # Agent Hook 链
```

## web 源码结构（250+ 文件）

```
packages/web/src/
  app/                      # Next.js 页面
    login/, settings/, workflows/, chat/, workspace/[id]/, workspaces/,
    mini-apps/, mini-apps-preview/
  components/               # React 组件
    chat/ (30+ 文件)        # 聊天组件
    sidebar/ (50+ 文件)     # 侧边栏组件
    editor/ (15+ 文件)      # Monaco 编辑器
    git/ (20+ 文件)         # Git 面板
    database/ (15+ 文件)    # 文档数据库
    workflow/ (30+ 文件)    # Workflow 编辑器
    kanban/ (6 文件)        # Kanban 看板
    worktree/ (3 文件)      # Worktree 面板
    issue/ (10+ 文件)       # 议题管理
    terminal/ (5+ 文件)     # 终端
    composer/ (6 文件)      # Composer 编辑器
    mini-apps/ (8+ 文件) # Workflow UI 编辑器
    forgeui/, common/, ui/  # UI 基础组件
  stores/                   # 34 个 Zustand Store
  lib/                      # 工具库（30+ 文件）
  hooks/                    # React Hooks
  locales/                  # i18n（34 命名空间 x 2 语言）
  i18n/                     # next-intl 配置
```

## flutter 源码结构（46 文件）

```
packages/flutter/lib/
  main.dart
  models/ (5 文件)         # 数据模型
  providers/ (6 文件)      # Riverpod 状态管理
  screens/ (5 文件)        # 页面
  widgets/ (16 文件)       # UI 组件（含终端/文件浏览）
  services/ (5 文件)       # 服务层（含 SSH/SFTP/FTP/WebDAV）
  bridge/ (1 文件)         # JS Bridge
```

## templates 结构（324+ 文件）

```
packages/templates/
  agents/ (15 分类, 184 文件)  # Agent 预设模板
  chat/ (6 文件)               # Chat Agent 模板
  mcps/ (9 文件)               # MCP 服务器配置
  skills/ (15 文件)            # Skill 模板
  plugins/ (107+ 文件)         # Plugin 模板
  workflows/                   # Workflow 模板
  prompt/                      # Prompt 模板
  output-styles/               # OutputStyle 模板
  mini-app/                  # Workflow UI 模板
```

## 文档目录

```
docs/
  anthropic-bridge.md, ai-message-rendering.md, agent-lifecycle.md,
  agent-store.md, bot-notification-workflow.md, codex-runtime-limitations.md,
  database-knowledge-base-architecture.md, dom-inspector-integration.md,
  function-call-tools.md, hermes-agent-runtime.md, hook-engine.md,
  issue-agent-automation.md, issue-workflow-system.md,
  langchain-agent-runtime.md, model-usage-accounting.md,
  monaco-typescript-lsp.md, oh-my-pi-agent-runtime.md,
  open-agent-sdk-runtime.md, persistent-agent-context.md,
  react-dev-inspector.md, reply-ai-message-workflow.md,
  workflow-system.md, worktree-system.md, ...
  superpowers/specs/ (设计文档)
  superpowers/plans/ (实现计划)
```
