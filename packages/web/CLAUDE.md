[根目录](../../CLAUDE.md) > [packages](../) > **web**

# @agent-spaces/web

## 模块职责

Next.js 16 前端应用，提供多 Agent 协同编程平台的用户界面。基于 FlexLayout 实现可拖拽的 IDE 级布局，集成 Monaco 代码编辑器、xterm.js 终端、频道聊天、议题管理、Git 操作面板等核心功能。通过 Zustand 管理全局状态，WebSocket 实现实时数据同步。

**重要提示**：本项目使用的 Next.js 版本存在 Breaking Changes，详见 `AGENTS.md`。开发前务必阅读 `node_modules/next/dist/docs/` 中的相关指南。

## 入口与启动

- **入口文件**：`src/app/layout.tsx`（根布局）+ `src/app/page.tsx`（首页）
- **启动命令**：`pnpm dev`（Next.js dev server，默认 3000 端口）
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
| `chat` | 聊天面板 | 右侧 (75%) | 消息列表 + 输入框 |
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
| `@xterm/xterm` + addons | 终端模拟器 |
| `shadcn` + `class-variance-authority` | UI 组件系统 |
| `tailwind-merge` + `clsx` | CSS 工具 |
| `lucide-react` | 图标库 |
| `@agent-spaces/shared` | 共享类型 |

### 配置

- **TailwindCSS 4**：使用 `@tailwindcss/postcss` 插件
- **shadcn/ui**：`base-nova` 风格，路径别名 `@/components/ui`
- **路径别名**：`@/*` -> `./src/*`
- **Monaco Editor**：`transpilePackages: ["flexlayout-react"]` 确保构建兼容

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
    layout.tsx                    # 根布局（Geist 字体）
    page.tsx                      # 首页（Workspace 列表 + 创建）
    globals.css                   # 全局样式
    workspace/[id]/page.tsx       # Workspace 页（加载 workspace -> WorkspaceShell）
  components/
    layout/
      workspace-shell.tsx         # FlexLayout IDE 布局（核心容器）
    editor/
      editor-panel.tsx            # 编辑器面板（FileTree + CodeEditor）
      file-tree.tsx               # 文件树（递归渲染）
      editor-tabs.tsx             # 编辑器 tab 栏
      code-editor.tsx             # Monaco Editor 集成
    chat/
      chat-panel.tsx              # 聊天面板
      channel-list.tsx            # 频道列表
      message-item.tsx            # 消息条目
    issue/
      issue-list.tsx              # 议题列表
      issue-detail.tsx            # 议题详情
    terminal/
      terminal-panel.tsx          # 终端面板（多 tab）
      terminal-instance.tsx       # xterm.js 终端实例
    git/
      git-panel.tsx               # Git 操作面板
      diff-viewer.tsx             # Monaco DiffEditor 差异查看
    ui/                           # shadcn/ui 组件
      button.tsx, input.tsx, badge.tsx, dialog.tsx,
      scroll-area.tsx, textarea.tsx
  stores/
    editor.ts                     # 编辑器状态
    terminal.ts                   # 终端状态
    channel.ts                    # 频道/消息状态
    issue.ts                      # 议题状态
    task.ts                       # 任务状态
    git.ts                        # Git 状态
  lib/
    ws.ts                         # WebSocket 客户端
    utils.ts                      # cn() 工具函数
```

## 测试与质量

- **Lint**：`pnpm lint`（eslint + eslint-config-next）
- 当前无单元测试或 E2E 测试

## 常见问题 (FAQ)

- **Q: Next.js 16 有什么不同？** A: 参考 `AGENTS.md` 和 `node_modules/next/dist/docs/`，API 和文件结构可能有 Breaking Changes。
- **Q: 为什么 API 请求不需要完整 URL？** A: `next.config.ts` 中配置了 rewrites，将 `/api/*` 代理到后端 `localhost:3100`。
- **Q: FlexLayout 布局如何自定义？** A: 修改 `workspace-shell.tsx` 中的 `defaultJson` 配置对象。

## 相关文件清单

```
packages/web/
  package.json
  tsconfig.json
  next.config.ts                  # Next.js 配置（API 代理）
  components.json                 # shadcn/ui 配置
  AGENTS.md                       # Next.js 16 Breaking Changes 提示
  CLAUDE.md                       # 原有 CLAUDE.md（引用 AGENTS.md）
  src/
    (如上代码结构所示)
```

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-05-02T01:07:33 | 初始化 | init-architect 首次扫描生成 |
