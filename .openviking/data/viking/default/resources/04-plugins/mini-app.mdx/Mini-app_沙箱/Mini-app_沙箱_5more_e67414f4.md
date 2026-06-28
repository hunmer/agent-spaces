# Mini-app 沙箱

Mini-app（迷你应用）是 Agent Spaces 提供的一种轻量应用形态。每个 Mini-app 是一个独立、自包含的 React 或 HTML 项目，自带源码、配置、数据与（可选）SQLite 数据库，可以在平台内独立编辑、预览和运行，也可以挂载 Agent 运行时让 Agent 帮你编写和增强它。

## 什么是 Mini-app？

一个 Mini-app 由以下要素组成：

- **项目类型** `react` 或 `html`，入口文件分别是 `index.jsx` 与 `index.html`。
- **源码目录** `src/`，存放所有用户编写的代码与资源。
- **配置目录** `configs/`，存放 JSON 形式的应用配置（由沙箱服务端读写，对项目内所有客户端实时同步）。
- **数据目录** `data/`，存放应用落盘的二进制或文本数据文件。
- **SQLite 数据库** `data/db/<dbName>.sqlite`，每个项目可按需创建多个命名数据库（基于 better-sqlite3）。
- **Agent 配置**（可选）`agents.json`，声明项目内可对话的多个 Agent 角色。
- **manifest.json**，记录项目元数据（名称、类型、入口文件、启用的插件、头像等）。

所有 Mini-app 项目存放在 `~/.agent-spaces-data/mini-apps/{projectId}/` 下，由 `packages/server/src/storage/mini-app-store.ts` 管理目录结构与越界保护。项目 `id` 由名称经清洗生成（替换文件系统/URL 非法字符为 `_`），创建后固定，改名只更新 `manifest.name`。

## 创建与编辑

### 1. 创建项目

通过 `POST /api/mini-apps` 创建项目，请求体需要 `name` 与 `type`（`react` 或 `html`，否则返回 400）。后端会按类型生成默认入口文件：

- React 类型：生成 `index.jsx`（用 `window.AgentSpacesUI` 解构出 `Button`、`Card` 等宿主组件）和一份自动生成的 `CLAUDE.md` 项目说明模板。
- HTML 类型：生成一份最小 `index.html` 与同名 `CLAUDE.md`。

名称必须全局唯一（大小写敏感、`trim` 后精确匹配），重名返回 `409`。

### 2. 编辑源码

编辑入口在前端 `packages/web/src/app/mini-apps/[id]/`，集成 Monaco 编辑器与 TypeScript LSP。后端提供一组文件管理 REST 路由：

- `GET /api/mini-apps/:id/files` — 文件树
- `GET /api/mini-apps/:id/files/manifest` — 扁平文件清单 + `mtimeMs`，前端据此做增量刷新
- `GET|PUT /api/mini-apps/:id/files/content?path=` — 读取/写入文件内容
- `POST /api/mini-apps/:id/files/rename` — 重命名或移动
- `POST /api/mini-apps/:id/files/folder` — 创建空目录
- `POST /api/mini-apps/:id/files/upload` — multipart 批量上传（单文件上限 500MB）
- `DELETE /api/mini-apps/:id/files` — 删除文件或目录

文件路径全部经过 `safeSrcPath` 越界校验，禁止绝对路径与 `..` 逃逸 `src/` 目录。所有写入操作都会更新 manifest 的 `updatedAt` 时间戳。

### 3. 导入与导出

- `GET /api/mini-apps/:id/export` — 用 archiver 打包为 ZIP（含 manifest.json、`src/`、icon 与 avatar）。
- `POST /api/mini-apps/import` — 接收 base64 编码的 ZIP，用 yauzl 解压。导入时会自动定位内容根（兼容 `src/` 子目录或扁平布局，最多下钻 4 层），并解压时校验条目路径安全（拒绝 `..` 与绝对路径）。

## 预览与运行

预览入口在前端 `packages/web/src/app/mini-apps-preview/[id]/`。预览页会一次性加载项目所有源码文件，按 `manifest.mainFile` 解析入口；若入口文件不在文件树中（通常是导入时多余顶层目录没剥掉），会显式报错而非静默 fallback 到 `tree[0]`，避免渲染错误的入口导致模块解析错乱。

React 模式下，宿主通过 `window.AgentSpacesUI` 注入一批 React 组件与 lucide-react 图标供应用解构使用；HTML 模式下则运行普通 HTML/CSS/JS，`window.AgentSpacesUI` 与 `window.AgentSpaces` 同样可用。

### 渲染与模块兼容

React 预览使用浏览器端 Babel 编译，再把模块转换后的代码放进 `new Function()` 沙箱执行，不依赖 Vite / Webpack 之类的构建链。当前稳定支持两类依赖：

- **宿主注入能力**：`window.AgentSpacesUI`、`window.AgentSpaces`、`window.AgentSpacesAPI`。
- **白名单模块**：`react`、`react-dom` / `react-dom/client`、`embla-carousel-react`、`@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities`、`@tiptap/react`、`@tiptap/starter-kit`、`@tiptap/extension-placeholder`、`@tiptap/extension-task-list`、`@tiptap/extension-task-item`、`@agent-spaces/ui`。

本地相对导入支持自动补全 `.jsx` / `.js` / `.tsx` / `.ts`，也支持 `index.*` 目录入口。未进入白名单的 bare import 不应在项目内自行写 shim，应该先补宿主层映射。

## 沙箱服务编译机制

Mini-app 允许在项目 `src/services/*.js` 中定义服务端可调用的服务处理函数。服务编译由 `packages/server/src/services/mini-app-services.ts` 的 `compileService()` 实现，机制是：

1. **剥离 import 行** — 用正则移除所有 `import ...` 语句（服务不依赖外部模块）。
2. **ESM → CJS 转换** — 把 `export default` 替换成 `module.exports =`。
3. **沙箱求值** — 用 `new Function('module', 'exports', stripped)` 构造函数并在沙箱中执行，默认导出应为 `{ eventName: handler }` 形式的方法表。

服务文件按项目维度缓存到内存 registry（`registries` Map），首次访问或显式 `reloadServices()` 时重新加载。项目删除时通过 `unloadServices()` 清理缓存。

每个 handler 被调用时获得一个 `MiniAppServiceContext`，提供：

- `readConfig(path)` / `writeConfig(path, value)` / `updateConfig(path, updater)` — 读写 `configs/`，写入后向该 projectId 频道广播 `miniApp.configChanged` 事件。
- `listRunningTasks()` — 返回当前进程内的运行中任务（含 `executorId`）。
- `broadcast(event, data)` — 向该 projectId 频道广播任意事件。

服务通过 `POST /api/mini-apps/:id/services/invoke` 调用，请求体为 `{ name, payload }`。服务是 `configs/` 的唯一写入方，保证状态变更集中、可广播。