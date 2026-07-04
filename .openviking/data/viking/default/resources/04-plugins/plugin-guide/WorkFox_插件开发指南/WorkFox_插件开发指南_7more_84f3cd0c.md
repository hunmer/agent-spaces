# workflow 插件开发指南

本文档聚焦“如何按当前架构开发插件”，不再假设所有插件都运行在 Electron 主进程。

## 开发前先选类型

写插件前先做一个决策：

### `server` 插件

适合：

- HTTP API 调用
- 文件处理
- AI 服务集成
- 需要被 Electron 和 Web 共用的工作流节点

目录：

- 开发内置插件可放 `resources/plugins/<plugin-id>`
- 用户安装后会进入 `backend/data/plugins/<plugin-id>`

### `client` 插件

适合：

- Electron 窗口控制
- 标签页交互
- 纯 UI 面板
- 必须运行在宿主客户端的能力

Electron 本地 client 插件：

- 开发态目录：`resources/plugins/<plugin-id>`

Web client 插件：

- 通过在线 manifest + CDN 加载
- 不保存为本地插件目录

## 最小目录结构

### Server 插件

```text
my-plugin/
├── info.json
├── main.js
├── workflow.js
├── tools.js
└── icon.png
```

### Electron Client 插件

```text
my-plugin/
├── info.json
├── main.js
├── view.js
├── api.js
└── icon.png
```

### Web Client 插件

仓库里通常至少有这些文件：

```text
my-plugin/
├── web-plugin.json
├── web-client.js
├── view.js
└── icon.png
```

## `info.json`

通用字段：

```json
{
  "id": "workflow.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "插件描述",
  "author": { "name": "workflow" },
  "tags": ["AI"],
  "type": "server",
  "hasWorkflow": true,
  "hasView": false,
  "config": [],
  "entries": {
    "server": "main.js",
    "client": "main.js",
    "workflow": "workflow.js",
    "tools": "tools.js",
    "api": "api.js",
    "view": "view.js"
  }
}
```

必填字段：

- `id`
- `name`
- `version`
- `description`
- `author.name`

当前最重要字段：

- `type`
  - `server`
  - `client`
  - `both`
- `hasWorkflow`
- `hasView`
- `entries`

`entries.tools` 支持两种写法。简单插件可以继续使用单文件入口：

```json
{
  "entries": {
    "tools": "tools.js"
  }
}
```

当 Agent 工具较多时，推荐按职责拆成多个文件，并在 `info.json` 中显式声明加载顺序：

```json
{
  "entries": {
    "tools": ["tools-image.js", "tools-video.js"]
  }
}
```

复杂插件不要把所有 Agent 工具都塞进默认 `tools.js`。把实际工具入口写进 `info.json`，可以避免入口约定和文件组织强绑定。

## `main.js`

生命周期入口：

```javascript
exports.activate = (context) => {
  context.logger.info('plugin activated')
}

exports.deactivate = (context) => {
  context.logger.info('plugin deactivated')
}
```

`context` 常见能力：

- `context.events`
- `context.storage`
- `context.plugin`
- `context.logger`
- `context.config`
- `context.registerActions(actions)`

`context.registerActions(actions)` 是 server 插件复用 workflow node 与 Agent tool 注册的推荐入口。插件只维护一份动作定义，由 loader 统一转换成 workflow nodes、tools schema 和执行 handler。

```javascript
// main.js
const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions)
  context.logger.info('plugin activated')
}
```

Electron client 插件上下文会更强；Web CDN client runtime 当前提供的是较轻量上下文。

## `workflow.js`

用于定义工作流节点。新插件如果已经在 `main.js` 里使用 `context.registerActions(actions)`，这里可以保留为空兼容入口；只有需要手写 workflow-only 节点时才直接维护 `nodes`。

```javascript
module.exports = {
  nodes: [
    {
      type: 'my_node',
      label: '我的节点',
      category: '示例',
      icon: 'Image',
      description: '示例节点',
      properties: [
        { key: 'prompt', label: 'Prompt', type: 'textarea', dataType: 'string', required: true },
        { key: 'images', label: 'Images', type: 'textarea', dataType: 'string[]', tooltip: 'JSON array of image URLs' },
      ],
      outputs: [
        { key: 'success', type: 'boolean' },
        { key: 'message', type: 'string' },
      ],
      handler: async (ctx, args) => {
        ctx.logger.info(`prompt=${args.prompt}`)
        return {
          success: true,
          message: 'ok',
        }
      },
    },
  ],
}
```

注意：

- `server` 插件节点由 backend 执行
- 前端单节点调试时，当前也会通过 backend `agent:execTool` 走同一条服务端执行链

## `tools.js`

给 Agent 暴露工具定义。新插件如果已经在 `main.js` 里使用 `context.registerActions(actions)`，这里可以保留为空兼容入口；只有需要手写 tool-only 能力时才直接维护 `tools` 和 `handler`。

```javascript
module.exports = {
  tools: [
    {
      name: 'my_tool',
      description: '示例工具',
      input_schema: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
        },
        required: ['prompt'],
      },
    },
  ],

  handler: async (name, args, api) => {
    if (name !== 'my_tool') {
      return { success: false, message: `未知工具: ${name}` }
    }

    return {
      success: true,
      message: `收到 ${args.prompt}`,
      data: {},
    }
  },
}
```