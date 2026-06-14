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

## 执行链路

```text
server execution-manager
  -> 发现插件节点 type 是 client/both
  -> ClientNodeManager.request()
  -> WS 发送 workflow:client-node 给发起执行的客户端

web workflow execution hook
  -> 收到 workflow:client-node
  -> 调用 window.electronAPI.clientPlugins.executeNode(pluginId, nodeType, args)
  -> 将执行结果通过 workflow:client-node 回传 server

electron main process
  -> clientPlugin:executeNode IPC
  -> client-plugin-runner 动态加载插件 actions.js/api.js
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
  - `requiresClientExecution(nodeType)` 判断节点是否需要客户端执行
  - `getPluginIdByNodeType(nodeType)` 查找节点所属插件
- `packages/server/src/services/client-node-manager.ts`
  - 维护 pending client node 请求
  - 处理超时、断线重连、执行停止取消
- `packages/server/src/services/execution-manager.ts`
  - client/both 插件节点走 `executeClientNode()`
- `packages/server/src/ws/connection-manager.ts`
  - 注册 client node response handler
- `packages/server/src/ws/handler.ts`
  - 接收客户端 `workflow:client-node` 响应

web：

- `packages/web/src/components/workflow/use-workflow-editor-execution.ts`
  - 监听 `workflow:client-node`
  - 不声明具体插件 API
  - 只转发到 `window.electronAPI.clientPlugins.executeNode(...)`

electron：

- `packages/electron/preload/index.ts`
  - 暴露 `window.electronAPI.clientPlugins.executeNode(pluginId, nodeType, args)`
- `packages/electron/main.ts`
  - 注册 `clientPlugin:executeNode` IPC
- `packages/electron/services/client-plugin-runner.ts`
  - 按 `pluginId` 定位插件目录
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

模板插件目前使用 CommonJS：

```javascript
module.exports = ...
```

由于 `packages/templates/package.json` 使用 `"type": "module"`，Electron 不能直接 `require()` 模板插件的 `.js` 文件。`client-plugin-runner.ts` 会读取源码并用 `vm.Script` 包装成 CommonJS 执行，避免 `ERR_REQUIRE_ESM`。

插件作者仍应保持模板插件使用 CommonJS 写法，除非后续 runtime 明确支持 ESM 插件入口。

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
- `client-plugin-runner.ts` 当前注入的依赖是 `{ desktopNative, windowManager }`。新增 Electron service 时，需要在 runner 的 `createPluginApi()` 中加入依赖。
- client 节点请求只发送给发起执行的 owner client；该客户端断线时会短暂等待重连，超时后执行失败。

## 新增 Client 插件步骤

1. 在插件 `info.json` 设置 `type: "client"` 或 `type: "both"`。
2. 用 `actions.js` 定义工作流节点和执行函数。
3. 用 `api.js` 通过 `createApi(deps)` 声明插件需要的客户端能力。
4. 如果需要新的 Electron service，在 `packages/electron/services/` 中实现，并注入 `client-plugin-runner.ts`。
5. 确认 `actions.js` 返回 `{ success, data }`，让 workflow 输出字段能正确取值。
6. 运行类型检查并在 Electron 环境中执行节点测试。
