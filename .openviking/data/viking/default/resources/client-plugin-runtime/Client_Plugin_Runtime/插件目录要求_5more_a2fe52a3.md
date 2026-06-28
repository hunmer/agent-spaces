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