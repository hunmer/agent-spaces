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