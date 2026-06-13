# 文件地图

## 根目录结构

```
agent-spaces/
  package.json              # 根项目配置（v0.2.6, pnpm 10.17.1）
  pnpm-workspace.yaml       # workspace 定义
  .gitignore
  CLAUDE.md                 # 项目索引文档（轻量索引）
  claude/                   # 根级详情文档（11 个文件）
  docs/                     # 项目文档（45+ .md）
  scripts/                  # 构建脚本（copy-web.mjs / copy-package.mjs）
  Dockerfile.server         # Docker 构建文件
  docker-compose.yml
  packages/
    shared/                 # 共享类型定义（29 文件）
    sdk/                    # 前端 API SDK（42 文件）
    server/                 # 后端服务（185+ 文件）
    web/                    # 前端应用（290+ 文件）
    flutter/                # Flutter 客户端（46 源 + 2 测试）
    templates/              # 模板库（400+ 文件）
    dom-inspector-hook/     # DOM Inspector Hook（2 文件）
```

## server 源码结构（185+ 文件）

```
packages/server/src/
  app.ts                    # 入口
  middleware/auth.ts         # 认证中间件
  routes/                   # 37 个路由文件
    auth, workspace, channel, issue, task, agent, agent-sse,
    agent-commands, workflow, mini-apps, workflow-hook,
    command, git, llm, search, database, kanban,
    worktree, plugin, chat, chat-run, import, data,
    file, folder, code-favorites, prompt-template, hooks,
    output-style, subscription, speech-recognition, skill,
    mcp, notification, version, robot-account, npm-settings
  services/                 # 业务逻辑层（78 文件）
    # 核心
    workspace, workflow, agent, channel, issue, task,
    message, file, command, search, execution-manager,
    interaction-manager, workflow-trigger-service,
    workflow-command-runner, plugin, plugin-runtime-api,
    hook-engine, persistent-agent-context, ai-text,
    database-vector, kanban, worktree, chat,
    notification-center, git-operation-log, mini-apps
    # mini-app 子系统（5 文件）
    mini-apps, mini-app-services, mini-app-agent,
    mini-app-tasks, mini-app-client-rpc
    # 新增辅助
    pty, command-process-manager, generated-title,
    issue-retry, issue-comment, tool-detail, auth-store,
    llm-model-config, global-wechat-qr, gitignore,
    workspace-prompt, version, skill, prompt-template,
    output-style, agent-commands, code-favorites,
    robot-account, search, mcp
    # 子目录
    subscription/ (5 文件: aicode/base/index/minimax/zhipu)
    speech-recognition/ (3 文件: base/index/tencent)
    notification-hub/ (14 文件)
    builtin-tools/ (11 文件: 含 mini-app-tools/workflow-exec-tools/
                    workspace-file-tools/workflow-editor-tools)
  storage/                  # 持久化层（22 文件）
    json-store, workspace-store, workflow-store,
    agent-store, issue-store, task-store, database-store,
    kanban-store, chat-store, llm-store, usage,
    command-store, subscription-store, user-settings-store,
    code-favorites-store, speech-recognition-store, hook-store,
    robot-account-store, worktree-store, npm-settings-store,
    mini-app-store, mini-app-db
  adapters/                 # Agent 运行时（16 文件）
    agent-runtime, agent-runtime-types, git,
    open-agent-sdk-runtime, langchain-runtime, codex-runtime,
    hermes-runtime, oh-my-pi-runtime, codex-function-tool-bridge,
    claude-code-runtime/ (7 文件: adapter-pool/anthropic-bridge/
                         protocol-converter/types/sdk-config/
                         message-format/index)
  agents/                   # Agent 编排（10 文件）
    issue-agent-runner, issue-task-controller, scheduler-agent,
    commit-agent, pull-request-agent, agent-designer,
    title-generator-agent, agent-context, agent-message-parts,
    issue-agent-progress
  ws/                       # WebSocket 处理（10 文件）
    handler, agent-runner, connection-manager,
    terminal-handler, typescript-lsp, chat-handler,
    execution-channels, message-parts, agent-prompt, html-utils
  hooks/                    # Agent Hook 链（1 文件）
    agent-hooks
  types/                    # 类型声明（1 文件）
    node-sqlite.d.ts
```

## web 源码结构（290+ 文件）

```
packages/web/src/
  app/                      # Next.js 页面（29 文件）
    layout.tsx, page.tsx, loading.tsx
    login/ (page + login-hero + rotating-text)
    workspaces/page
    workspace/[id]/ (page + workspace-client)
    workflows/ (page + [id]/page + share/page)
    mini-apps/ (page + [id]/page + mini-app-editor-page-client)
    mini-apps-preview/[id]/ (page + preview-page-client)
    chat/page
    settings/ (layout + page + agents/mcps/models/providers/
               skills/prompts/output-styles/tools)
    proxy.ts
  components/               # React 组件（200+ 文件）
    chat/ (40 文件)        # 聊天组件（消息/输入/成员/工具时间线）
    sidebar/ (56 文件)     # 侧边栏（含 settings/ 14 + skills-dialog/ 10）
    editor/ (21 文件)      # Monaco 编辑器（含移动端适配）
    git/ (20 文件)         # Git 面板（提交/差异/日志/设置）
    database/ (15 文件)    # 文档数据库（Notion 编辑器/向量搜索）
    workflow/ (86 文件)    # Workflow 编辑器（画布/节点/属性/执行）
    kanban/ (5 文件)       # Kanban 看板
    worktree/ (2 文件)     # Worktree 面板
    issue/ (13 文件)       # 议题管理
    terminal/ (8 文件)     # 终端
    composer/ (8 文件)     # Composer 编辑器（TipTap 扩展）
    mini-apps/             # Mini-app 编辑器组件
    home/ (10 文件)        # 首页（用量仪表盘/订阅面板）
    timeline/ (4 文件)     # 版本更新日志
    layout/ (13 文件)      # 布局（app-shell/workspace-shell/
                          # command-palette/auth-guard/theme-provider）
    common/ (15 文件)      # 通用组件（picker/dialog/floating-ball）
    settings/ (5 文件)     # 设置面板
    ui/ (28 文件)          # shadcn/ui 基础组件
  stores/                   # 44 个 Zustand Store 文件
    # 顶层 Store
    workspace, agent, channel, chat, workflow, issue, task,
    git, editor, database, kanban, worktree, hooks, notification,
    command, code-favorites, llm, terminal, command-palette,
    mobile-panel, editor-send, inspector-history,
    keyboard-shortcuts, content-usage-report, activity-log
    # workflow-editor/ 子目录（12 文件）
    crud, edit, execution, execution-logs, groups, index,
    interaction, staging, types, undo-redo, validation, versions
    # search-commands/ 子目录（7 文件）
    index, types, file-search, server-search, channel-search,
    issue-search, workspace-search, workflow-search
  lib/                      # 工具库（37 文件）
    sdk, ws, auth, workflow-api, workflow-plugin-api,
    workflow-nodes/ (10 文件: definitions/ai/interaction/display/
                     flow-control/index + constants/i18n/registry/
                     edge-id), monaco-* (5 文件), themes,
    terminal-registry, github, navigate, commands, converter,
    server, users, agent-members, agent-store, layout-templates,
    native-notification, theme-style, ui-exports, routes,
    api-polyfill, utils
  hooks/                    # React Hooks
    use-mobile, use-pagination, use-speech-recognition,
    use-user-avatar
  locales/                  # i18n（34 命名空间 x 2 语言）
    en/ zh/ 各 34 个 .json + index.ts
  i18n/                     # next-intl 配置
    request.ts
```

## flutter 源码结构（46 源 + 2 测试）

```
packages/flutter/
  lib/                      # 46 个 Dart 源文件
    main.dart
    models/ (6 文件)       # browser_tab/bookmark/file_source_config/
                          # file_source_credential/terminal_credential
    providers/ (7 文件)    # browser/bookmark/console_log/settings/
                          # terminal_credentials/file_source_credentials
    screens/ (6 文件)      # about/bookmarks/file_source_credentials/
                          # home/settings/terminal_credentials
    widgets/ (16 文件)     # webview_panel/webview_instance/terminal_*/file_source_tree/
                          # split_layout/home_*/tab_*/debug/console_sheet/device_selector
    services/ (7 文件)     # storage/webview/notification + file_sources/ (6 文件)
    bridge/ (1 文件)       # js_bridge
  test/                    # 2 个测试文件（**新增**）
    widget_test.dart                              # App 构建冒烟测试
    services/file_sources/webdav_url_test.dart    # URL 规范化单元测试
```

## templates 结构（400+ 文件）

```
packages/templates/
  generate-index.mjs        # 索引自动生成脚本
  agents/ (184 文件, 15 分类)
    academic(5) design(8) engineering(29) finance(5)
    game-development(20) marketing(30) paid-media(7)
    product(5) project-management(6) sales(8)
    spatial-computing(6) specialized(41) support(6) testing(8)
  chat/ (6 文件)            # Chat Agent 预设
  mcps/ (9 文件)            # MCP 服务器配置
  skills/ (66+ 文件)        # Skill 模板（**大幅扩展**）
    caveman/ grill-me/ handoff/
    improve-codebase-architecture/ (5 文件)
    planning-with-files/ (含 -zh 版本, 10 文件)
    superpowers/ (14 子目录, 40+ 文件)
    tdd/ (6 文件) to-prd/
  plugins/ (120+ 文件)      # Plugin 模板（**扩展**）
    aliyun-ai/ (20+ 文件, 含 refs/) aliyun_oss/ tencent_cos/
    desktop-native/ dingtalk/ epub-parser/ fetch/ ffmpeg/
    file-system/ fish-audio/ jimeng/ mail/ minimax/ mira-sdk/
    openai/ test-plugin/ window-manager/
  workflows/                # Workflow 模板
    code-writing.json       # 4 节点 Planner→Executor→Reviewer→Commit
  prompt/ (2 文件)          # Prompt 模板
    andrej-karpathy-skills.md
    claude-token-efficient-coding.md
  output-styles/ (7 文件)   # Output Style 模板
    carmack/codex-rigor/dhh/evan-you/jobs/linus/uncle-bob
  mini-app/                 # Mini-app 模板
    minimax_tts/ (manifest.json + src/index.jsx + avatar.png)
```

## 文档目录（45+ .md）

```
docs/
  # Agent 运行时
  anthropic-bridge, agent-lifecycle, agent-store,
  codex-runtime-limitations, hermes-agent-runtime,
  hermes-mcp-config-findings, langchain-agent-runtime,
  oh-my-pi-agent-runtime, open-agent-sdk-runtime,
  function-call-tools, persistent-agent-context
  # 系统设计
  workflow-system, worktree-system, hook-engine,
  issue-workflow-system, issue-agent-automation,
  database-knowledge-base-architecture, model-usage-accounting,
  bot-notification-workflow, monaco-typescript-lsp,
  ai-message-rendering, reply-ai-message-workflow,
  flex-truncate-fix, react-dev-inspector,
  dom-inspector-integration
  # mini-app（**新增**）
  mini-app-agent, mini-app-renderer, mini-app-preview-agent,
  mini-app-state-sync-ws-plan, plugin-faq
  # 子目录
  skills/ (fix-flex-overflow-scroll, add-workflow-field-type,
           write-mini-app-code)
  ui/ (react-resizable-panels-size-units)
  superpowers/specs/ (2026-06-13 三份设计文档)
  superpowers/plans/ (2026-06-13 实施计划)
```
