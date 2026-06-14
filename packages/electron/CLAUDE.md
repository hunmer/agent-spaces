[根目录](../../CLAUDE.md) > [packages](../) > **electron**

# @agent-spaces/electron

> Agent Spaces 的 Electron 桌面壳。只承担**桌面平台专属能力**：窗口生命周期、`local://` 自定义协议、桌面原生能力（剪贴板/通知/对话框/Shell）、全局快捷键、渲染↔主进程桥接。数据 CRUD 与业务逻辑全部走外部 `packages/server`（REST + WS），electron 不 fork 子进程、不含 plugin 系统、不含 workflow 引擎。

## 模块职责

1. **窗口生命周期**：无边框窗口创建、最大化状态持久化、`local://` 协议（音视频 Range 请求）
2. **桌面原生能力**：剪贴板读写、系统通知、文件管理器、Shell、原生对话框（`desktop-native.ts`，供后续节点/IPC 复用）
3. **全局快捷键**：`globalShortcut` 注册系统级快捷键，绑定存 electron-store
4. **桥接 API**：preload 暴露 `window.electronAPI`，前端据其判断 electron 环境（见 `packages/web/src/components/workflow/workflow-execution-input-dialog.tsx` 的 `isElectronEnvironment()`）

## 已删除（相较 WorkFox 源）

- `backend-process.ts` + `ipc/backend.ts`：不 fork server，连外部 `packages/server`
- 整个 plugin 系统（`plugin-*` + `ipc/plugin.ts`）：用 server 自带 plugin 系统
- workflow 节点 + store + chat IPC（`workflow-node-registry`/`builtin-nodes`/`nodes/`/`workflow-store`/`workflow-browser-node-runtime`/`ipc/chat.ts`/`ipc/workflow.ts`）：用 server workflow 引擎

## 入口与启动

- **入口**：`main.ts`（编译到 `out/main.js`）
- **preload**：`preload/index.ts` → `out/preload/index.js`，经 `contextBridge.exposeInMainWorld('electronAPI', ...)`
- **renderer**：由根 `scripts/copy-web.mjs` 把 `packages/web/out` 复制到 `packages/electron/renderer/`
- 启动：`pnpm --filter @agent-spaces/electron dev`
  - 生产：`loadFile(../renderer/index.html)`
  - 开发：`process.env.ELECTRON_RENDERER_URL`（electron-vite 注入）
- 关闭：`unregisterGlobalShortcuts()` → 非 macOS `app.quit()`

## 对外接口

### IPC（main.ts 内联 + ipc/）

| 频道 | 方向 | 功能 |
|---|---|---|
| `window:minimize`/`maximize`/`close`/`isMaximized` | renderer→main | 窗口控制 |
| `app:getVersion` | renderer→main | 应用版本 |
| `shell:openExternal` | renderer→main | 外链打开 |
| `fs:openInExplorer` | renderer→main | 文件管理器定位（`ipc/fs.ts`） |
| `shortcut` | main→renderer | 全局快捷键触发通知 |

### 渲染桥接（`window.electronAPI`）

`isElectron` / `platform` / `app.getVersion` / `window.{minimize,toggleMaximize,close,isMaximized}` / `shell.openExternal` / `fs.openInExplorer` / `onShortcut(cb)`。

## 关键依赖

- `electron-store`：快捷键绑定、窗口最大化状态（`{userDataPath}/config.json`）
- `@electron-toolkit/utils`：`electronApp.setAppUserModelId('com.agent-spaces.app')`、`optimizer`
- `@agent-spaces/shared`：`workflow-shortcut` 类型（`SHORTCUT_ACTIONS`/`getMergedBindings`/`ShortcutBinding`）

## 数据存储

| 数据 | 路径 |
|---|---|
| 全局配置 | `{userDataPath}/config.json`（electron-store） |

## 文件清单

```
electron/
  main.ts                  入口（窗口、local:// 协议、IPC、快捷键）
  preload/index.ts         contextBridge 暴露 electronAPI
  ipc/
    fs.ts                  fs:openInExplorer
    shortcut.ts            重导出 register/unregisterGlobalShortcuts
  services/
    desktop-native.ts      桌面原生能力（剪贴板/通知/对话框/Shell）
    shortcut-manager.ts    globalShortcut 注册（绑定读 electron-store）
    store.ts               electron-store（快捷键绑定、窗口状态）
    window-manager.ts      多窗口管理服务
  utils/
    json-store.ts          JSON 文件存储工具类
```
