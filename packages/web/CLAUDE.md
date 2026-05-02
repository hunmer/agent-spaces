[根目录](../../CLAUDE.md) > [packages](../) > **web**

# @agent-spaces/web

## 模块职责

Next.js 16 前端应用，提供多 Agent 协同编程平台的用户界面。基于 FlexLayout 实现可拖拽的 IDE 级布局，集成 Monaco 代码编辑器、xterm.js 终端、TipTap 富文本聊天（含 @mention Agent）、议题管理、Git 操作面板、Agent 配置管理、LLM 模型管理等核心功能。通过 Zustand 管理全局状态，WebSocket 实现实时数据同步。

**重要提示**：本项目使用的 Next.js 版本存在 Breaking Changes，详见 `AGENTS.md`。UI 设计规范参考 `DESIGN.md`（MiniMax 风格）。

## 入口与启动

- **入口文件**：`src/app/layout.tsx`（根布局）+ `src/app/page.tsx`（首页）
- **启动命令**：`pnpm dev`（自定义 server.mjs，默认 3000 端口）
- **构建命令**：`pnpm build` + `pnpm start`
- **API 代理**：通过 `next.config.ts` rewrites 将 `/api/*` 和 `/ws` 代理到后端 `localhost:3100`

## 对外接口

### 页面路由

| 路由 | 文件 | 说明 |
|------|------|------|
| `/` | `src/app/page.tsx` | 首页：工作空间列表 + 创建表单 |
| `/workspace/[id]` | `src/app/workspace/[id]/page.tsx` | 工作空间页：FlexLayout IDE 布局 |

### FlexLayout 面板映射

| 组件名 | 面板 | 位置 | 说明 |
|--------|------|------|------|
| `channel-list` | 频道列表 | 左侧 (25%) | 频道列表 + 创建频道 |
| `issue-list` | 议题列表 | 左侧 (25%) | 议题列表 + 创建议题 |
| `editor` | 代码编辑器 | 右侧 (75%) | FileTree + EditorTabs + Monaco Editor |
| `chat` | 聊天面板 | 右侧 (75%) | 消息列表 + TipTap 富文本输入 + @mention Agent |
| `issue-detail` | 议题详情 | 右侧 (75%) | 议题详细视图 |
| `terminal` | 终端 | 底部 dock | xterm.js 多 tab 终端 |
| `git` | Git 面板 | 底部 dock | Git 状态 + Diff 查看 |

## 关键依赖与配置

### 运行时依赖

| 依赖 | 用途 |
|------|------|
| `next` (16.2) | React 全栈框架 |
| `react` / `react-dom` (19.2) | UI 库 |
| `flexlayout-react` (0.9) | 可拖拽面板布局 |
| `zustand` (5) | 状态管理 |
| `@monaco-editor/react` | 代码编辑器 |
| `@xterm/xterm` + addons | 终端模拟器（fit + web-links） |
| `@tiptap/core` + extensions | 富文本编辑器（mention、placeholder、suggestion） |
| `shadcn` + `class-variance-authority` | UI 组件系统 |
| `tailwind-merge` + `clsx` | CSS 工具 |
| `lucide-react` + `@tabler/icons-react` | 图标库 |
| `react-markdown` + `remark-gfm` | Markdown 渲染 |
| `recharts` | 图表组件 |
| `framer-motion` | 动画库 |
| `react-dropzone` | 文件拖拽上传 |
| `tippy.js` | Tooltip 浮层（mention 弹窗） |
| `@agent-spaces/shared` | 共享类型 |

### 配置

- **TailwindCSS 4**：使用 `@tailwindcss/postcss` 插件
- **shadcn/ui**：`base-nova` 风格，路径别名 `@/components/ui`
- **路径别名**：`@/*` -> `./src/*`
- **字体**：DM Sans（UI）、Outfit（标题）、Poppins（中间层标题）
- **主题**：`next-themes` 支持 light/dark/system 切换
- **自定义 server**：`server.mjs` 提供开发服务器
- **Inspector**：`react-dev-inspector` 开发辅助

## 数据模型

前端不直接管理数据模型，所有数据通过 REST API 获取、WebSocket 实时更新。

### Zustand Stores

| Store | 文件 | 状态 | 说明 |
|-------|------|------|------|
| `useEditorStore` | `stores/editor.ts` | tree, openFiles, activeFilePath | 文件树、打开文件、代码编辑 |
| `useTerminalStore` | `stores/terminal.ts` | sessions, activeId | 多终端会话管理 |
| `useChannelStore` | `stores/channel.ts` | channels, messages, activeChannelId | 频道与消息 |
| `useIssueStore` | `stores/issue.ts` | issues, activeIssueId | 议题列表与选中 |
| `useTaskStore` | `stores/task.ts` | tasks | 任务列表 |
| `useGitStore` | `stores/git.ts` | status, diffs, log, selectedFile | Git 状态与 Diff |

### WebSocket 客户端

`src/lib/ws.ts` 中的 `WorkspaceWS` 类：
- 自动连接 + 断线重连（3s 间隔）
- 事件订阅/取消（`on`/`off` 方法）
- 单例模式（`getWS` / `disconnectWS`）

## 代码结构

```
packages/web/src/
  app/
    layout.tsx                    # 根布局（DM Sans/Outfit/Poppins 字体 + ThemeProvider + Sidebar）
    page.tsx                      # 首页（Workspace 列表 + 创建）
    globals.css                   # 全局样式
    api/upload/route.ts           # 文件上传 API Route
    workspace/[id]/page.tsx       # Workspace 页（加载 workspace -> WorkspaceShell）
  components/
    layout/
      workspace-shell.tsx         # FlexLayout IDE 布局（核心容器）
      workspace-tabs.tsx          # 工作空间标签栏
    sidebar/
      app-sidebar.tsx             # 主侧边栏（DashboardSidebar）
      index.tsx                   # 侧边栏导航
      logo.tsx                    # Logo 组件
      team-switcher.tsx           # 团队切换器
      nav-main.tsx                # 主导航
      nav-notifications.tsx       # 通知导航
      models-dialog.tsx           # LLM 模型管理对话框
      providers-dialog.tsx        # LLM 供应商管理对话框
      settings-dialog.tsx         # 设置对话框
      agent-dialog.tsx            # Agent 预设配置对话框（创建/编辑）
    editor/
      editor-panel.tsx            # 编辑器面板（FileTree + CodeEditor）
      file-tree.tsx               # 文件树（递归渲染）
      editor-tabs.tsx             # 编辑器 tab 栏
      code-editor.tsx             # Monaco Editor 集成
    chat/
      chat-panel.tsx              # 聊天面板
      chat-input.tsx              # 聊天输入（TipTap 集成）
      channel-list.tsx            # 频道列表
      channel-dialog.tsx          # 频道对话框
      channel-info-panel.tsx      # 频道信息面板
      message-item.tsx            # 消息条目
      add-member-dialog.tsx       # 添加成员（Agent）对话框
      member-card.tsx             # 成员卡片
      member-info-dialog.tsx      # 成员信息对话框
      context.tsx                 # 聊天上下文
      confirmation.tsx            # 确认消息组件
      commit.tsx                  # 提交消息组件
      chain-of-thought.tsx        # 思维链组件
      queue.tsx                   # 队列组件
      reasoning.tsx               # 推理组件
      task.tsx                    # 任务消息组件
      terminal.tsx                # 终端消息组件
    composer/
      composer-shell.tsx          # Composer 外壳
      composer-editor.tsx         # Composer 编辑器（TipTap）
      composer-dialog.tsx         # Composer 对话框
      suggestion-list.tsx         # 建议（mention）列表
      create-slash-extension.ts   # 斜杠命令扩展
      create-suggestion-renderer.ts # Suggestion 渲染器
    issue/
      issue-list.tsx              # 议题列表
      issue-detail.tsx            # 议题详情
      issue-message.tsx           # 议题消息
    terminal/
      terminal-panel.tsx          # 终端面板（多 tab）
      terminal-instance.tsx       # xterm.js 终端实例
    git/
      git-panel.tsx               # Git 操作面板
      diff-viewer.tsx             # Monaco DiffEditor 差异查看
    home/
      home-page.tsx               # 首页组件
    workspace/
      workspace-dialog.tsx        # 工作空间创建/管理对话框
    ui/                           # shadcn/ui 组件（30+）
      button.tsx, input.tsx, badge.tsx, dialog.tsx,
      scroll-area.tsx, textarea.tsx, accordion.tsx,
      avatar.tsx, breadcrumb.tsx, card.tsx, chart.tsx,
      collapsible.tsx, copy-code.tsx, dropdown-menu.tsx,
      loader.tsx, markdown.tsx, pagination.tsx, progress.tsx,
      search-select.tsx, separator.tsx, sheet.tsx, shimmer.tsx,
      sidebar.tsx, skeleton.tsx, status-badge.tsx, table.tsx,
      tabs.tsx, tooltip.tsx
    shadcn-studio/blocks/         # 参考组件块（图表、数据表等）
    timeline/                     # 版本时间线组件
    theme-provider.tsx            # 主题切换 Provider
    dev-inspector.tsx             # 开发辅助 Inspector
  stores/
    editor.ts                     # 编辑器状态
    terminal.ts                   # 终端状态
    channel.ts                    # 频道/消息状态
    issue.ts                      # 议题状态
    task.ts                       # 任务状态
    git.ts                        # Git 状态
  hooks/
    use-mobile.ts                 # 移动端检测 Hook
    use-pagination.ts             # 分页 Hook
  lib/
    ws.ts                         # WebSocket 客户端
    utils.ts                      # cn() 工具函数
    users.ts                      # 用户数据
    commands.ts                   # 命令定义
    agent-members.ts              # Agent 成员工具函数
```

## 测试与质量

- **Lint**：`pnpm lint`（eslint + eslint-config-next）
- 当前无单元测试或 E2E 测试

## 常见问题 (FAQ)

- **Q: Next.js 16 有什么不同？** A: 参考 `AGENTS.md` 和 `node_modules/next/dist/docs/`，API 和文件结构可能有 Breaking Changes。
- **Q: 为什么 API 请求不需要完整 URL？** A: `next.config.ts` 中配置了 rewrites，将 `/api/*` 代理到后端 `localhost:3100`。
- **Q: FlexLayout 布局如何自定义？** A: 修改 `workspace-shell.tsx` 中的 `defaultJson` 配置对象。
- **Q: 如何设计 UI？** A: 遵循 `DESIGN.md` 中的设计规范（MiniMax 风格：白色主导、pill 按钮、品牌蓝色系）。
- **Q: @mention 如何触发 Agent？** A: 在聊天输入中使用 @ 符号，TipTap 的 mention 扩展会展示 Agent 列表，发送消息时自动解析 mentions 字段并触发后端 `runMentionedAgent()`。

## 相关文件清单

```
packages/web/
  package.json
  tsconfig.json
  next.config.ts                  # Next.js 配置（API 代理）
  server.mjs                      # 自定义开发服务器
  components.json                 # shadcn/ui 配置
  DESIGN.md                       # UI 设计规范（MiniMax 风格）
  AGENTS.md                       # Next.js 16 Breaking Changes 提示
  pnpm-workspace.yaml             # web 子工作空间配置
  CLAUDE.md                       # 本文件
  src/
    (如上代码结构所示)
```

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-05-02T23:43:41 | 增量更新 | 补充 TipTap 富文本编辑器、Agent 对话框、LLM 管理对话框、composer 组件、workspace 对话框、DESIGN.md 设计规范、30+ UI 组件清单、完整代码结构 |
| 2026-05-02T01:07:33 | 初始化 | init-architect 首次扫描生成 |
