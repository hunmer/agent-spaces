# Web 模块 — 架构总览

## 运行模式

1. **开发模式**: `node server.mjs` 启动自定义 HTTP server → Next.js dev server (port 3000)。API 请求通过 rewrites 代理到 Server (port 3100)。
2. **静态导出模式**: `NEXT_STATIC_EXPORT=1 next build` 生成纯静态 HTML/JS/CSS。输出到 `packages/web/out/`，供 Electron/Flutter/Server 嵌入。
3. **SSR 模式**: 默认 Next.js 服务端渲染。

## 架构要点

- **状态管理**: 30+ Zustand stores，覆盖 agent/chat/editor/workflow/terminal/git 等领域。
- **代码编辑器**: Monaco Editor + monaco-languageclient → WebSocket LSP 代理。
- **Workflow 编辑器**: ReactFlow (xyflow) 节点编排，支持拖拽、连线、属性编辑。
- **聊天界面**: TipTap 富文本编辑器 + 代码块 + Mermaid 渲染。
- **终端**: xterm.js，通过 WebSocket 连接 Server 的 node-pty。
- **命令面板**: cmdk，支持文件/命令/Issue/Workflow 搜索。

## 设计取舍

- Web dev server 在 webpack dev 模式下禁用 cache（因为 Monaco + vscode-languageclient 包过大导致 Node 内存问题）。
- react-dev-inspector 用于开发时点击元素跳转源码（配合 dom-inspector-hook）。
- Turbopack root 设置为 monorepo root 以正确解析 workspace 依赖。
