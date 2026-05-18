# Monaco TypeScript LSP

本文档描述当前 Monaco 编辑器的 TypeScript/JavaScript 定义跳转实现。当前实现使用 `monaco-languageclient` 连接后端 TypeScript Language Server，不再使用 Monaco 内置 TypeScript worker 的 `typescriptDefaults`、`addExtraLib` 或本地目录预加载兜底。

## 一句话模型

前端 Monaco 只负责打开当前文件 model，并把 model URI 设置为真实文件系统 `file://` URI。后端为每个 LSP WebSocket 连接启动一个 `typescript-language-server --stdio` 子进程，工作目录优先使用能找到 `tsconfig.json`/`jsconfig.json` 的项目根。定义跳转、引用、诊断等 TypeScript 语义能力由 TypeScript Language Server 基于真实 workspace、`tsconfig` 和 `node_modules` 提供。

## 关键文件

后端：

- `packages/server/src/app.ts`
- `packages/server/src/ws/typescript-lsp.ts`
- `packages/server/src/routes/file.ts`
- `packages/server/src/services/file.ts`
- `packages/server/package.json`

前端：

- `packages/web/src/lib/monaco-language-client.ts`
- `packages/web/src/lib/monaco-models.ts`
- `packages/web/src/components/editor/code-editor.tsx`
- `packages/web/package.json`

依赖：

- server: `typescript-language-server`, `vscode-ws-jsonrpc`
- web: `monaco-languageclient`, `vscode-languageclient`, `vscode-ws-jsonrpc`

## 后端 WebSocket

后端新增独立 LSP WebSocket endpoint：

```text
GET /ws/lsp/typescript?workspaceId={workspaceId}&token={token}
```

它和现有业务 WebSocket `/ws` 分离，避免混用业务事件协议和 LSP JSON-RPC 协议。

连接流程：

1. `app.ts` 在 HTTP upgrade 中识别 `/ws/lsp/typescript`。
2. 校验 `workspaceId` 和 `token`。
3. 调用 `handleTypeScriptLspConnection(ws, workspaceId)`。
4. 根据 `workspaceId` 读取 workspace。
5. 以 `workspace.boundDirs[0]` 为基础解析 TypeScript Language Server 的 `cwd`。
   - 如果根目录本身有 `tsconfig.json` 或 `jsconfig.json`，使用根目录。
   - 如果根目录下存在 `packages/web/tsconfig.json` 或 `packages/web/jsconfig.json`，优先使用 `packages/web`。
   - 否则回退到 `workspace.boundDirs[0]`。
6. 通过 `vscode-ws-jsonrpc` 在浏览器 WebSocket 和 language server stdio 之间转发 JSON-RPC 消息。

后端启动的命令等价于：

```bash
node node_modules/typescript-language-server/lib/cli.mjs --stdio
```

调试日志：

- 后端启动 LSP 时打印 `[typescript-lsp] starting`，包含 `workspaceId`、`rootDir`、`tsRootDir`。
- 前端 WebSocket 连接成功时打印 `[monaco-language-client] TypeScript websocket opened`，包含 `workspaceId`、`workspaceRoot`。

## 前端 Language Client

前端入口是 `startTypeScriptLanguageClient(workspaceId, workspaceRoot)`。

行为：

1. 构造 `/ws/lsp/typescript` WebSocket URL。
2. 复用现有 auth token。
3. 首次启动时初始化 `MonacoVscodeApiWrapper`。
4. 创建 `MonacoLanguageClient`。
5. `documentSelector` 绑定：

```ts
[
  { language: 'typescript', scheme: 'file' },
  { language: 'javascript', scheme: 'file' },
]
```

6. `workspaceFolder.uri` 使用真实 workspace 根目录：

```ts
Uri.file(workspaceRoot)
```

同一 workspace 只启动一个 language client。`CodeEditor` 卸载时调用 `stopTypeScriptLanguageClient(workspaceId)`。

## Model URI

当前实现要求 Monaco model URI 和后端 TypeScript Language Server 看到的文件 URI 一致。

`packages/web/src/lib/monaco-models.ts` 中的 `getModelUri()` 在有 `workspaceRoot` 时生成真实文件 URI：

```ts
file://{workspaceRoot}/{relativeFilePath}
```

例如 workspace 根目录是：

```text
/Users/me/project
```

打开文件：

```text
src/lib/foo.ts
```

Monaco model URI 为：

```text
file:///Users/me/project/src/lib/foo.ts
```

这点很关键。TypeScript Language Server 运行在真实文件系统目录下，只有真实 `file://` URI 才能让它正确关联打开的文档、`tsconfig`、源码文件和 `node_modules`。

## Go 与 Show 菜单

右键菜单中的语义导航分成两类：

- `Go to Definition` / `Go to References`：使用 Monaco 内置 action，结果通过 `monaco.editor.registerEditorOpener()` 接管，转换为应用内 editor tab 打开。
- `Show Definition` / `Show References`：新增显式菜单项，调用 Monaco 的 peek action，用于保留面板展示能力。

实现要点：

1. `CodeEditor` 挂载时注册 `editor.onContextMenu()`。
2. 右键菜单打开时，把 Monaco 光标同步到右键点击位置。
3. 内置 Go action 查询 LSP definition/reference。
4. Monaco 请求打开 `file://` target URI 时，`registerEditorOpener()` 把 URI 转成 workspace 相对路径。
5. 调用 `useEditorStore.jumpToPosition()` 打开或切换 tab，并在 model 就绪后跳到目标行列。

`registerEditorOpener()` 必须处理两类 URI：

- 当前项目真实路径，例如 `file:///Users/me/project/src/App.tsx`。
- 旧兼容路径，例如 `file:///workspace/{workspaceId}/src/App.tsx`。

当 `workspaceRoot` 尚未就绪时，前端会从当前 model URI 和当前文件相对路径反推出 workspace root 作为兜底，避免真实 `file://` 无法映射回相对路径。

## Import Alias 兜底

部分 JS/JSX 场景中，TypeScript Language Server 对 alias import 的 definition 可能只返回当前文件的 import 绑定位置，而不是模块源文件。例如：

```ts
import Layout from '@/components/Layout';
```

LSP 可能返回：

```text
file:///Users/me/project/client/src/App.jsx:4:8
```

这会让 Monaco 看起来“没有跳转”。前端因此增加了 import specifier 兜底：

1. 如果 LSP target 和 source 是同一个文件，且 target 行是 import/require 行。
2. 解析 import specifier。
3. 支持：
   - `@/foo/bar`
   - `./foo/bar`
   - `../foo/bar`
4. 尝试常见扩展：
   - `.tsx`
   - `.ts`
   - `.jsx`
   - `.js`
   - `.mjs`
   - `.cjs`
   - `.json`
5. 尝试目录入口：
   - `index.tsx`
   - `index.ts`
   - `index.jsx`
   - `index.js`
   - `index.mjs`
   - `index.cjs`
   - `index.json`

文件存在性探测使用：

```text
GET /api/workspaces/{workspaceId}/files/exists?path={relativePath}
```

这样不会为了探测候选扩展产生大量 `404` 日志。

## 跳转选区与高亮

`jumpToPosition()` 支持可选选区：

```ts
jumpToPosition(workspaceId, path, line, column, endLine, endColumn)
```

编辑器消费 `pendingJump` 时会：

1. 等待目标 tab 的 Monaco model 切换完成。
2. clamp 行列到目标文件实际范围。
3. 调用 `editor.setSelection()` 选中目标文本。
4. 调用 `editor.revealLineInCenter()` 居中显示。
5. 创建短暂 decoration 高亮目标。

import alias 兜底会读取目标文件内容，并尽量定位同名声明，例如：

- `export default function Layout`
- `export function Layout`
- `export const Layout`
- `class Layout`
- `const Layout`
- `export default Layout`

如果无法找到声明，则回退到目标文件 `1:1`。

跨文件打开会延迟到当前 Monaco action 调用栈结束后执行，避免在 Monaco 正在 dispose peek/reference model 时切换 tab 导致 `Canceled: Canceled` 异常。

## Clipboard 兼容

部分嵌入式浏览器或 WebView 会暴露 `navigator.clipboard.write`，但平台实际禁止调用，Monaco 内部触发时会抛：

```text
NotAllowedError: The request is not allowed by the user agent or the platform
```

前端会包装 `navigator.clipboard.write` / `writeText`，在权限失败时静默降级，避免该异常打断 Go to Definition。

## 导航调试日志

前端会输出以下日志：

- `[monaco-navigation] context menu position`：右键位置、当前 URI、word。
- `[monaco-navigation] open target`：Monaco 请求打开的目标 URI、映射后的相对路径、行列。
- `[monaco-navigation] failed to map target uri`：目标 URI 无法映射到 workspace 相对路径。
- `[monaco-navigation] resolved import target`：LSP 只返回 import 行时，兜底解析出的真实模块文件。
- `[monaco-navigation] jumped to resolved import target`：已把 import 兜底跳转交给 editor store。

## 当前能力边界

可覆盖：

- workspace 内跨目录定义跳转
- 基于真实 `tsconfig` 的路径解析
- 依赖 `node_modules` 和 `@types` 的类型跳转
- TypeScript/JavaScript/TSX/JSX 文件的 LSP 语义能力
- Go to Definition 打开应用内新 tab 并定位目标
- Show Definition / Show References 使用 Monaco peek 面板
- 常见 `@/` alias import 的前端兜底跳转

仍依赖前提：

- workspace 必须有有效 `boundDirs[0]`。
- 后端进程必须能访问该目录。
- 项目依赖和类型声明需要实际存在于 workspace 的文件系统中。
- Monaco model 必须使用真实 `file://` URI。
- import alias 兜底目前只覆盖常见 `@/` 与相对路径规则；复杂 alias 仍应优先通过项目 `tsconfig.json`/`jsconfig.json` 交给 TypeScript Language Server 解析。

## 验证命令

当前实现完成后跑过：

```bash
pnpm --filter @agent-spaces/server exec tsc --noEmit
pnpm --filter @agent-spaces/web exec tsc --noEmit
pnpm --filter @agent-spaces/server build
pnpm --filter @agent-spaces/web lint
pnpm --filter @agent-spaces/web build
```

`web build` 过程中可能打印现有的 `ENVIRONMENT_FALLBACK` 日志；只要命令退出码为 0，构建即成功。
