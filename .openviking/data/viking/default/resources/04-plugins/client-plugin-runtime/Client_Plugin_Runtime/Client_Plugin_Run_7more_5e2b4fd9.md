# Client Plugin Runtime

本文档记录当前 client 插件节点的执行模型。这里的 client 指必须在客户端宿主中运行的插件能力，例如 Electron 剪贴板、窗口管理、系统对话框等。

## 适用场景

使用 `type: "client"` 或 `type: "both"`：

- 需要 Electron API 的能力，例如 `clipboard`、`dialog`、`shell`、`BrowserWindow`
- 需要当前客户端上下文的能力
- 不适合在 server Node 进程中执行的工作流节点

不适合 client 插件：

- 纯 HTTP 调用
- 后端文件处理
- 需要 Web 端和 Electron 端都无差别执行的节点

这些应优先做成 `server` 插件。

## 当前内置 Client 插件

### `workflow.desktop-native`

位置：

- `packages/templates/plugins/desktop-native/`
- Electron 原生能力实现：`packages/electron/services/desktop-native.ts`

提供能力：

- 读取/写入文本剪贴板
- 读取/写入剪贴板图片
- 清空剪贴板
- 系统通知
- 在文件管理器中显示文件
- 打开本地路径
- 打开外部链接
- 系统蜂鸣
- 打开文件对话框
- 保存文件对话框
- 消息对话框
- 错误对话框

### `workflow.window-manager`

位置：

- `packages/templates/plugins/window-manager/`
- Electron 窗口能力实现：`packages/electron/services/window-manager.ts`

提供能力：

- 创建窗口
- 关闭窗口
- 导航窗口
- 聚焦窗口
- 窗口截图
- 获取窗口详情
- 列出窗口
- 注入 JS

## 安装与存储边界

client 插件不安装到 server 数据目录，也不上传给 server。Electron 客户端维护独立的本地插件目录：

```text
~/.agent-spaces-client/plugins/<pluginId>/
```

可通过环境变量覆盖：

```text
AGENT_SPACES_CLIENT_PLUGIN_DIR=/path/to/client/plugins
```

在线商店安装时：

- `type: "server"`：走原 server 插件安装接口，写入 server 的 `AGENT_SPACES_DATA_DIR/plugins/`
- `type: "client"` / `type: "both"`：走 Electron IPC 安装，下载到本机 client 插件目录
- Web 插件列表会合并 server 插件和当前 Electron 客户端本地 client 插件
- 本地 client 插件不会同步给 server，也不会要求 server 拥有插件文件

client 插件安装状态由 Electron 在插件目录内维护，例如 `.client-state.json` 保存 `md5` / `installedAt`，用于商店更新判断。

## 执行链路

```text
web pluginApi
  -> listWorkflowPlugins() 合并 server 插件 + Electron 本地 client 插件
  -> getWorkflowNodes(pluginId) 对本地 client 插件走 Electron IPC
  -> 创建/启用 client 插件节点时写入 data.pluginId / data.pluginType

server execution-manager
  -> 从 workflow snapshot 的 node.data.pluginType 识别本地 client 插件节点
  -> 或从 server 插件表识别 type 是 client/both 的旧链路
  -> ClientNodeManager.request()
  -> WS 发送 workflow:client-node 给发起执行的客户端

web workflow execution hook
  -> 收到 workflow:client-node
  -> 调用 window.electronAPI.clientPlugins.executeNode(pluginId, nodeType, args)
  -> 将执行结果通过 workflow:client-node 回传 server

electron main process
  -> clientPlugin:executeNode IPC
  -> client-plugin-runner 从本地 client 插件目录加载 actions.js/api.js
  -> 注入 Electron service deps
  -> 执行 action.run(ctx, args)
```

## 协议

server 发给客户端：

```typescript
interface ClientNodeRequest {
  id: string
  channel: 'workflow:client-node'
  type: 'client_node_request'
  executionId: string
  workflowId: string
  nodeId: string
  pluginId: string
  nodeType: string
  args: Record<string, unknown>
  timeoutMs?: number
}
```

客户端回给 server：

```typescript
interface ClientNodeResponse {
  id: string
  channel: 'workflow:client-node'
  type: 'client_node_response'
  executionId: string
  workflowId: string
  nodeId: string
  data?: unknown
  error?: BackendErrorShape
}
```

## 文件职责

server：

- `packages/server/src/services/plugin.ts`
  - 仍负责 server 插件及历史 client/both 插件节点识别
  - 不保存 Electron 本地 client 插件文件或清单
- `packages/server/src/services/client-node-manager.ts`
  - 维护 pending client node 请求
  - 处理超时、断线重连、执行停止取消
- `packages/server/src/services/execution-manager.ts`
  - 对 `node.data.pluginType === "client" | "both"` 且有 `node.data.pluginId` 的节点走 `executeClientNode()`
  - 兼容 server 插件表中 `type: "client" | "both"` 的旧识别方式
- `packages/server/src/ws/connection-manager.ts`
  - 注册 client node response handler
- `packages/server/src/ws/handler.ts`
  - 接收客户端 `workflow:client-node` 响应

web：

- `packages/web/src/lib/workflow-plugin-api.ts`
  - `listWorkflowPlugins()` 合并 server 插件和 Electron 本地 client 插件
  - `installFromStore()` 按插件 `type` 分流安装位置
  - `getWorkflowNodes()` 对本地 client 插件走 Electron IPC，并补充 `data.pluginId` / `data.pluginType`
- `packages/web/src/components/workflow/workflow-plugins-dialog.tsx`
  - 在线商店安装时传入插件 `type`
  - 启用 client 插件时回填已有节点的 client 元数据
- `packages/web/src/stores/workflow-editor/edit.ts`
  - 创建节点时把节点定义中的 `data` 合并进 workflow node
- `packages/web/src/components/workflow/use-workflow-editor-execution.ts`
  - 监听 `workflow:client-node`
  - 不声明具体插件 API
  - 只转发到 `window.electronAPI.clientPlugins.executeNode(...)`

electron：

- `packages/electron/preload/index.ts`
  - 暴露 `window.electronAPI.clientPlugins.listWorkflowPlugins()`
  - 暴露 `window.electronAPI.clientPlugins.getWorkflowNodes(pluginId)`
  - 暴露 `window.electronAPI.clientPlugins.installFromStore(pluginId, sourceUrl, md5)`
  - 暴露 `window.electronAPI.clientPlugins.uninstall(pluginId)`
  - 暴露 `window.electronAPI.clientPlugins.executeNode(pluginId, nodeType, args)`
- `packages/electron/main.ts`
  - 注册 client 插件列表、节点定义、安装、卸载、执行 IPC
- `packages/electron/services/client-plugin-runner.ts`
  - 按 `pluginId` 定位本地 client 插件目录
  - 从在线商店下载 client 插件文件到本地目录
  - 加载 `actions.js`
  - 加载 `api.js`
  - 注入 `{ desktopNative, windowManager }`
  - 执行对应 action

shared：

- `packages/shared/src/types/workflow-ws.ts`
  - 定义 `ClientNodeRequest` / `ClientNodeResponse`