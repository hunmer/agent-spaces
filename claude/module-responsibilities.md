# 模块职责

## packages/shared

前后端共享的 TypeScript 类型定义包。定义了所有核心数据模型（Workspace/Issue/Task/Agent/Channel/Message/Workflow/Kanban/DocNode/MiniApp 等）、WebSocket 事件契约、Agent 运行时类型等。29 个源文件，无运行时依赖。

## packages/sdk

前端 API 统一调用包（@agent-spaces/sdk）。HttpClient 封装 + Bearer Token 自动注入 + 39 个 API 模块适配器（250+ 方法）。web 包通过 `lib/sdk.ts` 单例消费。42 个源文件。

## packages/server

Express 5 后端服务（185+ 文件）。核心运行时包含：
- **REST API**：37 个路由文件，按资源分组
- **WebSocket**：10 个处理器（agent-runner/chat-handler/terminal/typescript-lsp 等）
- **Agent 编排**：6 种运行时（Claude Code/Codex/Open Agent SDK/LangChain/Hermes/Oh-My-Pi）+ 10 个 agents 编排器
- **Workflow 引擎**：DAG 执行 + 触发服务 + 命令运行器
- **Mini-app 子系统**：5 文件架构（CRUD + 沙箱服务编译 + Agent 运行时 + 任务缓存 + 客户端 RPC）+ SQLite 数据库
- **Plugin 系统**：插件运行时 + 沙箱 + 11 个内置工具
- **通知中心**：飞书/企微/Native（14 文件）
- **PTY 终端**：node-pty 会话管理 + 命令进程管理
- **存储层**：22 个 store（JSON 文件 + SQLite）

## packages/web

Next.js 16 前端 SPA（290+ 文件）。包含：
- **页面**：29 个路由（login/workspaces/workspace/workflows/mini-apps/chat/settings）
- **组件**：200+ 文件，按功能域分组（chat/sidebar/editor/git/database/workflow/kanban/worktree/issue/terminal/composer/home/timeline/layout/common/settings/ui）
- **状态管理**：44 个 Zustand Store 文件（含 workflow-editor/ 12 子文件 + search-commands/ 7 子文件）
- **工具库**：37 个 lib 文件（含 workflow-nodes/ 10 文件 + monaco-* 5 文件）
- **i18n**：34 命名空间 x 中/英

## packages/flutter

Flutter 多平台原生壳应用（46 源 + 2 测试文件）。内嵌 InAppWebView 加载 Web 前端，提供 SSH 终端、多协议文件源（SFTP/FTP/Storage/WebDAV）、分屏布局、原生通知、书签管理、JS Bridge 双向通信。不包含业务逻辑。

## packages/templates

模板库（@agent-spaces/agents，400+ 文件）。涵盖：
- **Agent 预设**：184 个（15 分类）
- **Chat Agent**：6 个
- **MCP 服务器**：9 个
- **Skills**：66+ 文件（caveman/grill-me/handoff/improve-codebase-architecture/planning-with-files/superpowers 14 子目录/tdd/to-prd）
- **Plugins**：120+ 文件（aliyun-ai/aliyun_oss/tencent_cos/desktop-native/dingtalk/epub-parser/fetch/ffmpeg/file-system/fish-audio/jimeng/mail/minimax/mira-sdk/openai/test-plugin/window-manager）
- **Workflow/Prompt/OutputStyle/Mini-app** 模板

通过 `generate-index.mjs` 自动索引 + http-server 静态托管。

## packages/dom-inspector-hook

DOM Inspector 的浏览器端 Hook 库（2 文件）。捕获元素源码信息并通过 POST 发送到 Agent Spaces Server 或触发 IDE 跳转。支持 HTTP 上报 + 剪贴板复制两种模式。
