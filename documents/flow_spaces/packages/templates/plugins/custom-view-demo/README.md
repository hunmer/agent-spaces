# Custom View Demo 插件

> 工作流插件节点自定义视图（customView）的示例插件，演示如何用 React 或 HTML 渲染节点主体界面。

## 简介

在 Workflow 编辑器中，每个节点除了左侧的属性表单外，节点主体内部还可以渲染一个「自定义视图」面板，用于展示状态、按钮、进度条等交互元素。本插件演示两种官方支持的渲染方式：

- **React customView**：基于 `window.AgentSpacesUI` 提供的 UI 组件（Card、Button、Progress 等）编写
- **HTML customView**：纯 HTML + `<script>`，通过 `props.data` 接收节点参数，`container` 操作 DOM

该插件主要用于插件开发者的参考模板，不依赖任何外部服务。

## 节点清单

| 节点 | 渲染方式 | 最小尺寸 | 用途 |
| --- | --- | --- | --- |
| `custom_view_demo_react` | React | 260 × 190 | 使用 AgentSpacesUI 组件的 React 视图 |
| `custom_view_demo_html` | HTML | 240 × 160 | 使用纯 HTML + 脚本的视图 |

## 节点输入

两个节点共用以下入参：

- `title`：标题文本（默认 `Custom View Demo` / `HTML Custom View`）
- `count`：数字（默认 3 / 5），用于驱动进度条 `count * 10%`

## 节点输出

- `success`：是否成功（恒为 `true`）
- `message`：执行消息
- `data`（仅 React 节点）：回显 `{ title, count }`

## React 视图关键点

```jsx
const { Card, CardContent, CardHeader, CardTitle, Progress, Button } = window.AgentSpacesUI
// 自定义视图接收 props: { nodeId, data }
// data 即节点的 properties 实时取值
```

> React 组件必须 `export default`，并在沙箱环境中执行，Tailwind 类名与宿主应用保持一致。

## HTML 视图关键点

```html
<!-- 通过 props.data 读取节点参数 -->
<script>
  const title = props.data.title || 'HTML Custom View'
  container.querySelector('[data-title]').textContent = title
</script>
```

- `container` 为当前视图的根 DOM 节点
- `props.data` 包含节点的所有属性值
- 可使用任意浏览器 API（alert、fetch 等）做交互

## 使用示例

1. 在插件中心安装并启用本插件
2. 新建工作流，从节点面板拖入「Custom View Demo」或「HTML Custom View Demo」
3. 打开节点，会在节点主体内看到示例面板，点击按钮触发 `alert`
4. 修改右侧属性面板的 `title` / `count`，视图会实时更新

## 常见问题

- **React 视图不渲染**：确认 `sourceCode` 是合法 JSX，且未引用未导出的 `window.AgentSpacesUI` 组件。
- **HTML 脚本未执行**：检查 `<script>` 标签是否在 `</body>` 之前，或被 CSP 拦截。
- **视图被裁剪**：调整节点 `customViewMinSize` 字段。
- **如何获取最新属性值**：React 视图从 `props.data` 拿，HTML 视图从 `props.data` 拿，框架会随节点参数变化重新挂载。

## 适用场景

- 想做一个有实时状态的节点（轮询 / 进度条）
- 想在节点内部放按钮触发额外操作
- 想展示与节点相关的可视化数据
