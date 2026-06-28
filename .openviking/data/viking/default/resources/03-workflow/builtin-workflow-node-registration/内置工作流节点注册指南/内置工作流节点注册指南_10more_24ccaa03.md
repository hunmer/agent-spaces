# 内置工作流节点注册指南

本文面向 LLM 或代码生成 Agent：目标是在当前代码结构下，快速、正确地新增内置工作流节点，并尽量发挥节点定义里的 UI、连线、输入输出和组合能力。

## 先看注册入口

当前内置节点定义拆在：

- `electron/services/nodes/flow-control.ts`
- `electron/services/nodes/ai.ts`
- `electron/services/nodes/display.ts`

统一入口是 `electron/services/nodes/index.ts`：

```ts
const allNodes: PluginWorkflowNode[] = [
  ...flowControlNodes,
  ...aiNodes,
  ...displayNodes,
]

export const builtinNodeDefinitions: PluginWorkflowNode[] = allNodes.map((node) => ({
  allowInputFields: true,
  ...node,
}))
```

这意味着：

- 新节点通常只需要加入对应分类文件的数组。
- `allowInputFields` 默认会被设置为 `true`，节点属性面板会显示“输入字段”编辑区。
- 如果某个节点不希望支持输入字段，可以在节点定义中显式写 `allowInputFields: false`，因为展开顺序是先给默认值，再展开节点自身字段。
- `electron/services/builtin-nodes.ts` 只是转发入口，不要优先在里面直接追加节点。

## 最小新增流程

1. 根据节点用途选择文件：
   - 流程、控制、变量、画布辅助：`flow-control.ts`
   - AI 调用、模型、Agent：`ai.ts`
   - 展示、交互 UI、媒体和数据视图：`display.ts`
2. 在对应 `PluginWorkflowNode[]` 数组末尾追加节点对象。
3. 确保 `type` 全局唯一，使用稳定的 snake_case。
4. 给出清晰的 `label`、`category`、`icon`、`description`。
5. 用 `properties` 声明配置表单，用 `outputs` 声明下游可选择的输出结构。
6. 如果节点需要特殊执行逻辑，仅注册定义还不够，还要到后端执行器或插件 handler 链路中实现运行时行为。

## 基础模板

```ts
{
  type: 'my_node',
  label: '我的节点',
  category: '展示',
  icon: 'Box',
  description: '一句话说明节点作用和关键行为。',
  properties: [
    {
      key: 'title',
      label: '标题',
      type: 'text',
      required: true,
      placeholder: '请输入标题',
      tooltip: '显示在节点运行或展示结果中的标题。',
    },
    {
      key: 'mode',
      label: '模式',
      type: 'select',
      default: 'simple',
      options: [
        { label: '简单', value: 'simple' },
        { label: '高级', value: 'advanced' },
      ],
    },
  ],
  outputs: [
    { key: 'result', type: 'string' },
    { key: 'metadata', type: 'object' },
  ],
}
```

## 节点顶层字段

| 字段 | 必填 | 用途 |
| --- | --- | --- |
| `type` | 是 | 节点类型唯一标识。写 snake_case，不要改已有 type，否则旧工作流会失效。 |
| `label` | 是 | UI 展示名，建议中文、短名。 |
| `category` | 是 | 侧边栏分组名，例如 `流程控制`、`AI`、`展示`。 |
| `icon` | 否 | 图标名，当前通常使用 lucide 图标名，如 `Bot`、`Table`、`Terminal`。 |
| `description` | 是 | 给用户和 LLM 理解节点用途的说明。 |
| `properties` | 否 | 节点配置表单。无配置时写 `[]`。 |
| `handles` | 否 | 控制输入/输出连接点，以及多出口。 |
| `outputs` | 否 | 声明节点输出字段，供变量选择器和下游节点使用。 |
| `customViewMinSize` | 否 | 自定义展示节点的最小尺寸。 |
| `manualCreate` | 否 | 设为 `false` 后不出现在手动创建入口，适合内部节点。 |
| `compound` | 否 | 组合节点声明，例如循环节点自动生成子节点。 |
| `allowInputFields` | 否 | 控制属性面板是否显示输入字段，内置节点默认 `true`。 |

## properties 写法

`properties` 决定节点属性面板展示什么输入控件，也会影响创建节点时的默认 `data`。

支持的 `type`：

- `text`：单行文本。
- `textarea`：多行文本，适合 prompt、说明、路径列表。
- `number`：数字输入。
- `select`：下拉选项，必须提供 `options`。
- `checkbox`：布尔值。
- `code`：代码编辑器，适合 JS 代码。
- `array`：数组编辑器，配合 `itemTemplate` 和 `fields`。
- `conditions`：条件列表，主要给 `switch` 使用。
- `output_fields`：输出字段选择/定义器，适合变量聚合、循环中间变量等。

常用属性字段：

| 字段 | 用途 |
| --- | --- |
| `key` | 写入节点 `data` 的字段名，必须稳定。 |
| `label` | UI 标签。 |
| `required` | 是否必填。 |
| `default` | 创建节点时写入的默认值。 |
| `options` | `select` 选项。 |
| `tooltip` | 字段说明，建议写清变量格式、运行时语义。 |
| `placeholder` | 输入占位。 |
| `visibleWhen` | 按其它字段值控制显隐。 |
| `itemTemplate` | `array` 新增项的默认结构。 |
| `fields` | `array` 每一项的内部字段定义。 |

### 条件显隐

当字段只在某个模式下有效时，使用 `visibleWhen`，避免 UI 暴露无效配置。

```ts
{
  key: 'count',
  label: '循环次数',
  type: 'number',
  default: 1,
  required: true,
  visibleWhen: { key: 'loopType', equals: 'count' } as any,
}
```

也可以使用 `in`：

```ts
visibleWhen: { key: 'mode', in: ['advanced', 'debug'] } as any
```

### 数组字段

数组适合声明列表、表格列、资源列表、批量任务等。

```ts
{
  key: 'items',
  label: '资源列表',
  type: 'array',
  required: true,
  itemTemplate: { id: '', src: '', type: 'image', caption: '' },
  fields: [
    { key: 'src', label: '资源地址', type: 'text', required: true },
    {
      key: 'type',
      label: '类型',
      type: 'select',
      default: 'image',
      options: [
        { label: '图片', value: 'image' },
        { label: '视频', value: 'video' },
      ],
    },
    { key: 'caption', label: '标题', type: 'text' },
  ],
}
```

## handles 连接点

不写 `handles` 时，默认有输入和输出连接点。

### 入口或出口节点

```ts
// 只输出，不能输入
handles: { source: true, target: false } as any

// 只输入，不能输出
handles: { source: false, target: true } as any

// 无连线能力，适合便签
handles: { source: false, target: false } as any
```

### 多个固定出口

适合循环、成功/失败分支、人工确认分支。

```ts
handles: {
  target: true,
  source: true,
  sourceHandles: [
    { id: 'success', label: '成功' },
    { id: 'failure', label: '失败' },
  ],
} as any
```

### 动态出口

`dynamicSource` 会根据节点 `data` 中某个数组字段生成出口，适合条件分支。`extraCount` 常用于默认分支。

```ts
handles: {
  target: true,
  dynamicSource: { dataKey: 'conditions', extraCount: 1 },
} as any
```

## outputs 输出字段

`outputs` 是给变量选择器、下游节点和 LLM 编排工作流看的结构声明。它不会自动实现运行时返回值；运行时仍需执行器或 handler 返回对应数据。

```ts
outputs: [
  { key: 'text', type: 'string' },
  { key: 'count', type: 'number' },
  { key: 'ok', type: 'boolean' },
  { key: 'payload', type: 'object' },
  { key: 'raw', type: 'any' },
]
```

支持类型：

- `string`
- `number`
- `boolean`
- `object`
- `any`

建议：

- 输出字段要和实际执行结果同名。
- 展示节点如果会产生用户选择结果，也要声明输出，例如 `selectedRows`、`selectedCount`。
- `run_code` 这类动态返回节点，更新代码后也要同步写节点实例的 `data.outputs`，否则下游变量选择器无法准确感知字段。

## 输入字段 allowInputFields

当前内置节点入口默认给所有节点开启：

```ts
allowInputFields: true
```

开启后，属性面板会显示“输入字段”区域，用户可以为节点声明额外输入结构。适合：

- 需要从上游收集结构化参数的节点。
- 需要让 LLM 或变量选择器知道本节点期望输入的节点。
- 运行时会按用户配置读取 `inputFields` 的节点。

如果节点是纯画布辅助或内部锚点，可以关闭：

```ts
allowInputFields: false
```

## manualCreate 内部节点

当节点只应由系统自动创建，不应出现在侧边栏或选择器中，设置：

```ts
manualCreate: false as any
```

典型场景：

- 组合节点的内部子节点。
- 隐藏锚点。
- 运行时辅助节点。

当前创建入口会过滤 `manualCreate === false` 的节点。