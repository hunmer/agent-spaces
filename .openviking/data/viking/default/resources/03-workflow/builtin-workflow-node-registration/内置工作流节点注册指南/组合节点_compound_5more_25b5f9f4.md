## 组合节点 compound

当一个节点创建时必须同时创建子节点和受保护连线，使用 `compound`。循环节点就是当前参考实现。

最小形态：

```ts
{
  type: 'my_compound',
  label: '组合节点',
  category: '流程控制',
  icon: 'Workflow',
  description: '创建时自动生成内部节点。',
  properties: [],
  handles: {
    target: true,
    source: true,
    sourceHandles: [
      { id: 'body', label: '内部流程' },
      { id: 'next', label: '完成后' },
    ],
  } as any,
  compound: {
    rootRole: 'my_compound',
    children: [
      { role: 'my_compound', type: 'my_compound' },
      {
        role: 'my_compound_body',
        type: 'my_compound_body',
        label: '内部节点',
        offset: { x: 260, y: 0 },
        scopeBoundary: true,
        parentRole: 'my_compound',
        data: {},
      },
    ],
    edges: [
      {
        sourceRole: 'my_compound',
        targetRole: 'my_compound_body',
        sourceHandle: 'body',
        targetHandle: 'target',
        locked: true,
      },
    ],
  } as any,
}
```

同时要注册内部节点定义：

```ts
{
  type: 'my_compound_body',
  label: '内部节点',
  category: '流程控制',
  icon: 'Container',
  description: '组合节点自动生成的内部锚点，用户不可手动创建。',
  properties: [],
  handles: {
    target: true,
    source: false,
  } as any,
  manualCreate: false as any,
}
```

组合节点不要只注册定义，还要确认执行器理解它的运行时语义。详见 `docs/compound-workflow-nodes.md`。

## 自定义展示和交互节点

注册定义只能让节点出现在节点库和属性面板里。如果节点需要自定义画布内容或用户交互，还要补前端和后端逻辑。

常见步骤：

1. 在内置节点定义中注册 `properties`、`outputs` 和必要的 `customViewMinSize`。
2. 在前端节点注册或 wrapper 中接入对应 `customView` / `customViewProps`。
3. 如果运行时需要暂停等待用户操作，在后端执行器中发起 interaction。
4. 在 `src/lib/backend-api/interaction.ts` 注册 UI interaction type。

交互式节点参考 `docs/interactive-nodes.md`，表格展示节点是当前主要样例。

## 执行逻辑在哪里补

只改 `electron/services/nodes/*.ts` 的效果是“注册节点定义”，主要影响：

- 节点侧边栏和选择器。
- 属性面板。
- 默认节点数据。
- 变量选择器可见输出字段。
- 连线口显示和连线行为。

如果节点要真正运行，需要确认执行路径：

- 内置固定节点：通常在 `backend/workflow/execution-manager.ts` 和必要的前端调试执行器里加分支。
- 插件节点：在插件 `workflow.js` 中提供 `handler`，注册器会保存 handler，但暴露给前端的定义会移除 handler。
- Agent 工具：通过插件 `tools.js` 注册工具 schema 和 handler。

新增内置节点时，不要把 `handler` 写进内置节点定义后就认为会自动执行；内置节点执行主要由执行器识别 `type`。

## LLM 新增节点检查清单

生成代码前先回答：

- 节点属于哪个分类文件？
- `type` 是否全局唯一且稳定？
- `properties` 是否覆盖全部用户需要配置的输入？
- 每个有默认值的字段是否写了 `default`？
- `select` 是否写了完整 `options`？
- 条件字段是否用了 `visibleWhen` 隐藏无效配置？
- 列表型配置是否用了 `array + itemTemplate + fields`？
- 是否需要禁用或定制 `handles`？
- 是否需要多出口或动态出口？
- 是否声明了和运行时返回一致的 `outputs`？
- 是否需要关闭 `allowInputFields`？
- 是否是内部节点，需要 `manualCreate: false`？
- 是否是组合、交互或自定义视图节点，需要同步改执行器/前端？
- 是否需要更新相关文档或测试？

## 常见节点类型范式

### 纯配置执行节点

适合 HTTP 请求、文件处理、AI 调用等。

```ts
{
  type: 'http_request',
  label: 'HTTP 请求',
  category: '流程控制',
  icon: 'Globe',
  description: '发送 HTTP 请求并返回响应。',
  properties: [
    { key: 'url', label: 'URL', type: 'text', required: true },
    {
      key: 'method',
      label: '方法',
      type: 'select',
      default: 'GET',
      options: [
        { label: 'GET', value: 'GET' },
        { label: 'POST', value: 'POST' },
      ],
    },
    {
      key: 'body',
      label: '请求体',
      type: 'textarea',
      visibleWhen: { key: 'method', in: ['POST', 'PUT', 'PATCH'] } as any,
    },
  ],
  outputs: [
    { key: 'status', type: 'number' },
    { key: 'headers', type: 'object' },
    { key: 'body', type: 'any' },
  ],
}
```

### 画布辅助节点

适合便签、分组标题等，不参与执行。

```ts
{
  type: 'canvas_note',
  label: '画布备注',
  category: '流程控制',
  icon: 'StickyNote',
  description: '画布注释节点，不影响工作流执行。',
  properties: [
    { key: 'content', label: '内容', type: 'textarea' },
  ],
  handles: {
    target: false,
    source: false,
  } as any,
  allowInputFields: false,
}
```

### 展示选择节点

适合表格、列表、图片选择等。注意输出用户操作结果。

```ts
{
  type: 'item_picker',
  label: '条目选择',
  category: '展示',
  icon: 'ListChecks',
  description: '展示条目列表，并在用户确认后输出选择结果。',
  properties: [
    {
      key: 'items',
      label: '条目列表',
      type: 'array',
      required: true,
      itemTemplate: { id: '', title: '', value: '' },
      fields: [
        { key: 'id', label: 'ID', type: 'text', required: true },
        { key: 'title', label: '标题', type: 'text', required: true },
        { key: 'value', label: '值', type: 'text' },
      ],
    },
    {
      key: 'selectionMode',
      label: '选择模式',
      type: 'select',
      default: 'single',
      options: [
        { label: '单选', value: 'single' },
        { label: '多选', value: 'multi' },
      ],
    },
  ],
  outputs: [
    { key: 'selectedItems', type: 'any' },
    { key: 'selectedCount', type: 'number' },
  ],
  customViewMinSize: { width: 260, height: 160 },
}
```