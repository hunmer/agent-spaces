# Monaco TypeScript LSP

本文档描述当前 Monaco 编辑器的 TypeScript/JavaScript 定义跳转实现。当前实现使用 `monaco-languageclient` 连接后端 TypeScript Language Server，不再使用 Monaco 内置 TypeScript worker 的 `typescriptDefaults`、`addExtraLib` 或本地目录预加载兜底。

## 一句话模型

前端 Monaco 只负责打开当前文件 model，并把 model URI 设置为真实文件系统 `file://` URI。后端为每个 LSP WebSocket 连接启动一个 `typescript-language-server --stdio` 子进程，工作目录是 workspace 的 `boundDirs[0]`。定义跳转、引用、诊断等 TypeScript 语义能力由 TypeScript Language Server 基于真实 workspace、`tsconfig` 和 `node_modules` 提供。

## 关键文件

后端：

- `packages/server/src/app.ts`
- `packages/server/src/ws/typescript-lsp.ts`
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
5. 使用 `workspace.boundDirs[0]` 作为 TypeScript Language Server 的 `cwd`。
6. 通过 `vscode-ws-jsonrpc` 在浏览器 WebSocket 和 language server stdio 之间转发 JSON-RPC 消息。

后端启动的命令等价于：

```bash
node node_modules/typescript-language-server/lib/cli.mjs --stdio
```

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

## 已移除的旧兜底

以下旧逻辑已移除：

- `setupLanguageDefaults()`
- `typescriptDefaults.setCompilerOptions(...)`
- `javascriptDefaults.setCompilerOptions(...)`
- `setEagerModelSync(true)`
- 当前目录 TS/JS 文件预加载 `preloadDirectory()`
- Monaco 内置 TS worker 的 `addExtraLib` 路线

当前语义能力来源只保留 TypeScript Language Server。`getOrCreateModel()` 仍保留，用于创建/同步当前打开文件的 Monaco model。

## 当前能力边界

可覆盖：

- workspace 内跨目录定义跳转
- 基于真实 `tsconfig` 的路径解析
- 依赖 `node_modules` 和 `@types` 的类型跳转
- TypeScript/JavaScript/TSX/JSX 文件的 LSP 语义能力

仍依赖前提：

- workspace 必须有有效 `boundDirs[0]`。
- 后端进程必须能访问该目录。
- 项目依赖和类型声明需要实际存在于 workspace 的文件系统中。
- Monaco model 必须使用真实 `file://` URI。

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
