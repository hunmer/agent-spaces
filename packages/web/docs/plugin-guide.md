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
├── package.json        # 声明 npm 依赖（可选，见「使用外部 npm 依赖」）
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

## 本地测试环境

本地测试 runner、`--config <json>`、`--mock-api <file>` 和 fetch demo 说明见 [插件本地测试环境](./plugin-local-testing.md)。

多文件工具入口的每个文件都使用同样的导出结构：

```javascript
module.exports = {
  tools: [
    {
      name: 'my_image_tool',
      description: '图片处理工具',
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
    if (name !== 'my_image_tool') {
      return { success: false, message: `未知工具: ${name}` }
    }

    return {
      success: true,
      message: 'ok',
      data: {},
    }
  },
}
```

拆分建议：

- 每个工具文件只放同一类能力，例如 `tools-image.js`、`tools-video.js`
- 公共请求、鉴权、轮询逻辑放到 `shared.js`，由各工具文件 `require('./shared')`
- 每个工具名必须全局唯一；不同工具文件里不要重复声明同名 `name`
- `handler` 只处理当前文件声明的工具，未知工具返回失败结果

### 复用 workflow node 与 Agent tool 定义

当同一个能力既要注册为 workflow node，又要暴露为 Agent tool，推荐把元数据和执行逻辑放在一份动作定义里，并在 `main.js` 的 `activate(context)` 中通过 `context.registerActions(actions)` 注册。插件加载器会把这份动作定义转换成 workflow nodes 和 Agent tools，避免在 `workflow.js` 和 `tools.js` 中重复维护字段、schema 和 handler。

参考 `packages/templates/plugins/aliyun_oss`：

```text
aliyun_oss/
├── actions.js      # 唯一动作定义：字段、输出、执行逻辑
├── main.js         # activate(context) 中注册 actions
├── workflow.js     # 兼容旧入口，可为空
└── tools.js        # 兼容旧入口，可为空
```

核心写法：

```javascript
// actions.js
module.exports = [
  {
    name: 'my_action',
    label: '我的节点',
    category: '示例',
    icon: 'Box',
    description: '同一份定义同时用于 workflow 和 tool',
    properties: [
      { key: 'prompt', label: 'Prompt', type: 'textarea', dataType: 'string', required: true },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
    ],
    run: async (ctx, args) => {
      return { success: true, message: args.prompt }
    },
  },
]
```

```javascript
// main.js
const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions)
}
```

```javascript
// workflow.js
module.exports = { nodes: [] }
```

```javascript
// tools.js
module.exports = { tools: [] }
```

动作字段约定：
- `name`：同时作为 workflow node `type` 和默认 tool `name`
- `label/category/icon/description`：用于 workflow 节点面板
- `properties`：workflow 节点属性，也会作为默认 tool 入参来源
- `toolProperties`：当 tool 入参与 workflow 属性不一致时使用
- `configProperties`：通用配置字段，会追加到 workflow 属性和 tool 入参
- `outputs`：workflow 输出字段
- `customView`：可选，自定义节点主体视图；支持 `{ type: 'react' | 'html', sourceCode: string }`
- `customViewMinSize`：可选，自定义视图节点最小尺寸，例如 `{ width: 260, height: 190 }`
- `run(ctx, args)`：统一执行函数，workflow 和 tool 都会调用它
- `tool: false`：仅注册 workflow node，不暴露为 Agent tool

### property 字段类型：`type` 与 `dataType`

每个 property 有两个类型相关字段：

- **`type`**（必填）：表单控件类型，决定 UI 怎么渲染。可选值：`text`、`textarea`、`number`、`select`、`checkbox`、`code`、`conditions`、`array`、`output_fields`
- **`dataType`**（必填）：字段的实际数据类型，所有 property 都必须显式设置。可选值：`string`、`number`、`boolean`、`string[]`、`number[]`、`object[]`、`object`、`any`

`type` 只表示表单控件，不能作为数据类型来源。即使 `type: 'number'`、`type: 'select'`、`type: 'checkbox'` 等控件类型看起来能推断，也必须写明 `dataType`。常见写法：

| 场景 | `type` | `dataType` | 说明 |
|------|--------|------------|------|
| JSON 数组输入（图片 URL 列表） | `textarea` | `string[]` | 用户在 textarea 里输入 JSON 数组，tool schema 会正确生成为 `type: "array", items: { type: "string" }` |
| JSON 对象数组输入（按钮列表） | `textarea` | `object[]` | 同上，items 不会自动生成 |
| JSON 对象输入 | `textarea` | `object` | 用户输入 JSON 对象 |
| 单行文本数组 | `text` | `string[]` | 逗号分隔或 JSON 数组 |

完整 `type` → `dataType` 映射规则：

| `type`（控件） | 推荐 `dataType` | 说明 |
|----------------|-----------------|------|
| `text` | `string` | 单行文本输入 |
| `textarea` | `string` | 多行文本输入（纯文本） |
| `textarea` | `string[]` | 多行 JSON 数组输入 |
| `textarea` | `object[]` | 多行 JSON 对象数组输入 |
| `textarea` | `object` | 多行 JSON 对象输入 |
| `select` | `string` | 下拉单选（值为字符串） |
| `code` | `string` | 代码编辑器（值为代码字符串） |
| `number` | `number` | 数字输入框 |
| `boolean` | `boolean` | 布尔开关 |
| `checkbox` | `boolean` | 复选框 |
| `object` | `object` | 对象配置项 |
| `array` | `any` / `string[]` / `object[]` | 数组配置项，按实际元素类型选择 |
| `range` | `number` | 范围滑块 |
| `buffer` | `string` | 二进制数据（JSON 字符串） |
| `json` | `object` | JSON 数据 |
| `conditions` | `string` | 条件表达式 |
| `output_fields` | `string` / `object` | 输出字段配置 |

设置 `dataType` 后：
- **Agent tool JSON Schema** 会根据 `dataType` 生成正确的类型（而非从 `type` 推断为 `string`）
- **节点测试对话框** 会自动对输入值做 JSON.parse 解析
- **`run()` 函数** 仍需自行处理 `Array.isArray(args.x) ? args.x : JSON.parse(args.x)` 防御式解析，或使用服务端导出的 `coerceByDataType(args.x, 'string[]')` 工具函数

如两侧参数不完全一致，可在动作定义里单独提供 `toolProperties`；如某个字段在 workflow 中必填、但 tool 中不必填，可设置 `toolRequired: false`。

### 插件节点 `customView`

插件 workflow node 可以通过 `customView` 替换默认节点主体。当前支持两种渲染模式：

- `react`：`sourceCode` 需要 `export default` 一个 React 组件，组件 props 为 `{ nodeId, data }`
- `html`：`sourceCode` 可以包含 HTML 和内联 `<script>`，脚本里可使用 `container`、`props`、`AgentSpacesUI`、`AgentSpaces`、`AgentSpacesAPI`

React 模式可以直接使用封装好的 UI 组件：

```javascript
customView: {
  type: 'react',
  sourceCode: `
export default function View({ nodeId, data }) {
  const { Card, CardContent, Badge } = window.AgentSpacesUI;
  return (
    <div className="h-full w-full bg-background p-2">
      <Card className="h-full rounded-md shadow-none">
        <CardContent className="space-y-2 p-3">
          <Badge variant="secondary">React</Badge>
          <div className="text-sm font-medium">{data.title || nodeId}</div>
        </CardContent>
      </Card>
    </div>
  );
}
`,
},
customViewMinSize: { width: 260, height: 190 },
```

HTML 模式适合轻量视图：

```javascript
customView: {
  type: 'html',
  sourceCode: `
<div class="h-full w-full bg-background p-3">
  <div class="rounded border bg-card p-3 text-sm" data-title></div>
</div>
<script>
container.querySelector('[data-title]').textContent = props.data.title || props.nodeId;
</script>
`,
},
customViewMinSize: { width: 240, height: 160 },
```

完整示例见 `packages/templates/plugins/custom-view-demo`。其中 `custom_view_demo_react` 使用 `window.AgentSpacesUI` 渲染 React 节点界面，`custom_view_demo_html` 使用 HTML + script 渲染节点界面。

## 多语言配置

Server 插件可以在插件目录下新增 `lang.json`，用于维护用户可见文案。插件运行时会向 `context` 提供 `t(key, fallback)`，也支持把 action 定义写成工厂函数并通过 `context.registerActions(actions)` 注册。

适合放入多语言的内容：
- workflow node 的 `label`、`category`、`description`
- property 的 `label`、`tooltip`、`description`
- Agent tool 的 `description`
- action 执行结果里的用户可见 `message`

不要放入多语言的内容：
- `context.logger.*` 调试日志
- `console.*` 调试输出
- 错误排查用的内部状态、请求参数、执行链路信息

调试信息统一使用英文，便于搜索、聚合和跨语言协作。

### `lang.json`

`lang.json` 放在插件根目录，按 locale 分组。当前内置支持 `zh` 和 `en`，缺失时会回退到另一种语言，再回退到 `fallback`，最后回退到 key 本身。

```json
{
  "zh": {
    "category": "示例",
    "action.create.label": "创建内容",
    "action.create.description": "根据提示词创建内容。",
    "field.prompt.label": "提示词",
    "field.prompt.tooltip": "输入要处理的文本。",
    "message.created": "创建成功：{name}"
  },
  "en": {
    "category": "Example",
    "action.create.label": "Create Content",
    "action.create.description": "Create content from a prompt.",
    "field.prompt.label": "Prompt",
    "field.prompt.tooltip": "Enter the text to process.",
    "message.created": "Created: {name}"
  }
}
```

### 推荐写法：action 工厂函数

`actions.js` 推荐导出函数，参数为 `t`。这样同一份 action 定义可以在不同语言请求下生成对应文案。

```javascript
module.exports = (t) => [
  {
    name: 'my_action',
    label: t('action.create.label', 'Create Content'),
    category: t('category', 'Example'),
    icon: 'Box',
    description: t('action.create.description', 'Create content from a prompt.'),
    properties: [
      {
        key: 'prompt',
        label: t('field.prompt.label', 'Prompt'),
        type: 'textarea',
        required: true,
        tooltip: t('field.prompt.tooltip', 'Enter the text to process.'),
      },
      {
        key: 'images',
        label: t('field.images.label', 'Image URLs'),
        type: 'textarea',
        dataType: 'string[]',
        tooltip: t('field.images.tooltip', 'JSON array of image URLs, e.g. ["https://..."]'),
      },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
    ],
    run: async (ctx, args) => {
      ctx.logger.info(`Running my_action with prompt length=${String(args.prompt || '').length}`)
      return {
        success: true,
        message: t('message.created', 'Created: {name}').replace('{name}', 'demo'),
      }
    },
  },
]
```

`main.js` 保持普通注册方式即可：

```javascript
const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions)
  context.logger.info('my plugin activated')
}
```

### 兼容写法：直接使用 `context.t`

如果插件不使用 action 工厂，也可以在 `activate(context)` 中读取 `context.t` 后构造 actions。

```javascript
exports.activate = (context) => {
  const { t } = context
  context.registerActions([
    {
      name: 'my_action',
      label: t('action.create.label', 'Create Content'),
      category: t('category', 'Example'),
      icon: 'Box',
      description: t('action.create.description', 'Create content from a prompt.'),
      properties: [],
      outputs: [],
      run: async () => ({
        success: true,
        message: t('message.created', 'Created: {name}').replace('{name}', 'demo'),
      }),
    },
  ])
}
```

这种写法只适合文案不需要随语言请求动态切换的简单插件。新插件优先使用 action 工厂函数。

### key 命名建议

- `category`：插件内共享分类名
- `action.<actionName>.label`
- `action.<actionName>.description`
- `field.<fieldName>.label`
- `field.<fieldName>.tooltip`
- `message.<messageName>`

key 使用稳定英文，不要把中文或完整句子作为 key。`fallback` 必须写英文，避免语言包缺失时出现空白 UI。

## `api.js`

只有当你需要扩展默认 API 时再写。

```javascript
module.exports = {
  createApi: ({ windowManager }) => ({
    createManagedWindow(options) {
      return windowManager.createWindow(options)
    },
  }),
}
```

典型用途：

- Electron client 插件暴露窗口能力
- 对 handler 注入宿主侧附加服务

## `view.js`

当前设置面板通过字符串方式加载 `view.js`。

最简单写法：

```javascript
module.exports = {
  template: `
    <div class="text-sm">
      Hello plugin view
    </div>
  `,
}
```

注意：

- Electron 本地插件：`view.js` 从本地目录读取
- Web CDN client 插件：`view.js` 从 manifest 指向的 URL 拉取
- 当前实现对 `view.js` 的执行方式比较轻量，复杂依赖不建议直接塞进这里

## Web Client 插件 Manifest

Web client 插件需要单独 manifest。

示例：

```json
{
  "id": "workflow.test-plugin",
  "name": "Test Plugin",
  "version": "1.0.0",
  "description": "Web client plugin",
  "author": { "name": "workflow" },
  "type": "client",
  "runtimeTargets": ["web", "electron"],
  "iconUrl": "https://example.com/icon.png",
  "entries": {
    "client": {
      "url": "https://example.com/web-client.js",
      "format": "esm"
    },
    "view": {
      "url": "https://example.com/view.js",
      "format": "cjs"
    }
  }
}
```

当前要求：

- `entries.client.url` 可被浏览器 `import()`
- `entries.view.url` 当前按文本拉取

## 使用外部 npm 依赖

server 插件可以像普通 Node 项目一样使用 npm 上的第三方包。

### 声明依赖

在插件根目录放一个标准 `package.json`，把依赖写进 `dependencies`：

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "main": "main.js",
  "type": "commonjs",
  "dependencies": {
    "feedsmith": "^2.9.6",
    "ali-oss": "^6.21.0"
  }
}
```

宿主在激活插件前会检查 `package.json`：

- 若目录下还没有 `node_modules`，会自动执行一次 `npm install --omit=dev`（使用宿主配置的 registry / proxy）
- `node_modules` 已存在则跳过，不会重复安装
- 安装失败会抛出 `Failed to install plugin dependencies ...`，插件不会被激活

> 插件目录下的 `node_modules` 和 `package-lock.json` 不要提交到仓库，让宿主在安装时生成即可。

### 在代码里引用

依赖装好后，**子模块**（如 `actions.js`、`shared.js`）里可以直接 `require` 裸包名：

```javascript
// actions.js —— 子模块，裸包名 require 正常工作
const { parseFeed } = require('feedsmith')

module.exports = (t) => [
  {
    name: 'parse_feed',
    run: async (ctx, args) => {
      const { format, feed } = parseFeed(args.content)
      return { success: true, data: { format, feed } }
    },
  },
]
```

### 重要限制：入口文件不能直接 require 裸包名

插件入口 `main.js`（`entries.server`）是在 vm sandbox 中执行的，它的 `require` 被定制过：

- 相对路径（`./`、`../`）和绝对路径：正常解析
- Node 内置模块（`fs`、`path` 等）：正常返回
- **裸包名（如 `feedsmith`）：返回一个空 stub，不会抛异常但无法使用**

因此**不要在 `main.js` 顶层直接 `require('some-package')`**，而是把使用外部依赖的逻辑放到子模块里，由 `main.js` 通过相对路径 `require('./actions')` 间接加载：

```javascript
// main.js —— 正确写法：只 require 相对路径，把依赖留给子模块
const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions)
}
```

```javascript
// main.js —— 错误写法：顶层裸包名 require 会拿到 stub，运行时报错
const { parseFeed } = require('feedsmith') // ← 拿到的是空 stub

exports.activate = (context) => {
  context.registerActions([
    { name: 'parse_feed', run: async (ctx, args) => parseFeed(args.content) }, // 运行时才报错
  ])
}
```

> 这条限制只针对 `main.js`（sandbox 入口）。`main.js` 通过 `require('./actions')` 间接加载的 `actions.js`、`shared.js` 等文件走 Node 原生模块加载，裸包名 require 完全正常。`workflow.js`、`tools.js` 如果作为入口被 sandbox 直接执行，同样受此限制——所以推荐统一用 `main.js` + `registerActions(actions)` 模式，把依赖集中在 `actions.js` / `shared.js`。

### 判断插件是否需要安装依赖

宿主用 `package.json` 的 `dependencies` 是否非空来判断要不要触发 `npm install`。没有外部依赖的插件不需要 `package.json`。

### 参考实现

- `packages/templates/plugins/mira-sdk`：`package.json` 声明 `mira-app-core`，在 `shared.js` 里 `require('mira-app-core/shared/sdk')`
- `packages/templates/plugins/aliyun_oss`：`package.json` 声明 `ali-oss`，在 `shared.js` 里 `require('ali-oss')`
- `packages/templates/plugins/feed-parser`：`package.json` 声明 `feedsmith`，在 `actions.js` 里 `require('feedsmith')`

## 配置系统

在 `info.json` 中声明：

```json
{
  "config": [
    {
      "key": "apiKey",
      "label": "API Key",
      "type": "string",
      "value": "",
      "required": true
    }
  ]
}
```

读取方式：

- `context.config.apiKey`
- workflow 运行时也会把插件配置加载到 `__config__`

## 当前推荐实践

1. 能做成 `server` 的不要做成 `client`
2. 依赖 Electron API 的插件必须是 `client`
3. 非必要不要继续新增 `both`
4. Web client 插件必须提供 `manifestUrl`
5. 插件商店条目必须写清：
   - `type`
   - `runtimeTargets`
   - `manifestUrl`（如果是 Web client）

## 当前仓库里的参考实现

### Server 插件参考

- `resources/plugins/jimeng`
- `resources/plugins/fetch`
- `resources/plugins/file-system`
- `resources/plugins/fish-audio`

### Electron Client 插件参考

- `resources/plugins/window-manager`

### Web Client Manifest 参考

- `resources/plugins/test-plugin/web-plugin.json`
- `resources/plugins/test-plugin/web-client.js`
- `resources/plugins/test-plugin/view.js`

