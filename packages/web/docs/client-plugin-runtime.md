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

## 插件目录要求

client 插件推荐结构：

```text
my-client-plugin/
├── info.json
├── main.js
├── actions.js
├── api.js
├── workflow.js
├── tools.js
└── icon.png
```

安装后的目录位于 Electron 本机：

```text
~/.agent-spaces-client/plugins/workflow.my-client-plugin/
```

`info.json` 关键字段：

```json
{
  "id": "workflow.my-client-plugin",
  "type": "client",
  "hasWorkflow": true,
  "entries": {
    "main": "main.js",
    "workflow": "workflow.js"
  }
}
```

`actions.js`：

```javascript
module.exports = (t) => [
  {
    name: 'my_action',
    label: t('action.my_action.label', 'My Action'),
    category: t('category', 'My Client Plugin'),
    icon: 'Plug',
    description: t('action.my_action.description', 'Run client action'),
    properties: [],
    outputs: [{ key: 'result', type: 'string' }],
    run: async (ctx, args) => {
      const result = await ctx.api.doSomething(args)
      return { success: true, data: { result } }
    },
  },
]
```

`api.js`：

```javascript
module.exports = {
  createApi: ({ desktopNative, windowManager }) => ({
    doSomething: async () => {
      return desktopNative.readClipboardText()
    },
  }),
}
```

## CommonJS 加载规则

client 插件目前使用 CommonJS：

```javascript
module.exports = ...
```

由于商店插件可能来自 `"type": "module"` 目录，Electron 不直接 `require()` 插件 `.js` 文件。`client-plugin-runner.ts` 会读取源码并用 `vm.Script` 包装成 CommonJS 执行，避免 `ERR_REQUIRE_ESM`。

插件作者仍应保持 client 插件入口使用 CommonJS 写法，除非后续 runtime 明确支持 ESM 插件入口。

## 结果格式

client action 建议返回：

```javascript
return { success: true, data: { key: value } }
```

server 端会把 `data` 作为节点输出对象：

```javascript
{ success: true, data: { text: 'hello' } }
// 节点输出为 { text: 'hello' }
```

如果没有 `data`，server 会将返回对象整体作为节点输出。

## 限制

- 当前 client 插件执行依赖 Electron preload 暴露的 `clientPlugins.executeNode`。
- Web-only 浏览器环境没有 Electron IPC 时，会返回“当前客户端不支持 client 插件运行时”。
- Web-only 浏览器环境不能安装或运行 `type: "client"` / `type: "both"` 插件。
- server 不知道当前客户端安装了哪些本地 client 插件；执行依赖 workflow snapshot 中节点保存的 `data.pluginId` / `data.pluginType`。
- `client-plugin-runner.ts` 当前注入的依赖是 `{ desktopNative, windowManager }`。新增 Electron service 时，需要在 runner 的 `createPluginApi()` 中加入依赖。
- client 节点请求只发送给发起执行的 owner client；该客户端断线时会短暂等待重连，超时后执行失败。

## 新增 Client 插件步骤

1. 在插件 `info.json` 设置 `type: "client"` 或 `type: "both"`。
2. 确保插件出现在商店索引中，并带有正确的 `path` / `md5` / `type`。
3. 用 `actions.js` 定义工作流节点和执行函数。
4. 用 `api.js` 通过 `createApi(deps)` 声明插件需要的客户端能力。
5. 如果需要新的 Electron service，在 `packages/electron/services/` 中实现，并注入 `client-plugin-runner.ts`。
6. 确认 `actions.js` 返回 `{ success, data }`，让 workflow 输出字段能正确取值。
7. 从 Electron 环境的插件商店安装，确认文件落到 `~/.agent-spaces-client/plugins/<pluginId>/`。
8. 运行类型检查并在 Electron 环境中执行节点测试。
