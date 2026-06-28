## 插件节点如何复用这套能力

插件侧类型声明已经支持：

- `manualCreate`
- `compound`
- `visibleWhen`
- `output_fields`
- `handles.sourceHandles`

最小示例如下：

```js
module.exports = {
  nodes: [
    {
      type: 'my_group',
      label: '我的组合节点',
      category: '示例',
      icon: 'Boxes',
      description: '示例组合节点',
      properties: [],
      handles: {
        target: true,
        sourceHandles: [
          { id: 'body', label: '内部流程' },
          { id: 'next', label: '完成后' },
        ],
      },
      compound: {
        rootRole: 'my_group',
        children: [
          { role: 'my_group', type: 'my_group' },
          {
            role: 'my_group_body',
            type: 'my_group_body',
            hidden: true,
            parentRole: 'my_group',
            offset: { x: 240, y: 0 },
          },
        ],
        edges: [
          {
            sourceRole: 'my_group',
            targetRole: 'my_group_body',
            sourceHandle: 'body',
            targetHandle: 'target',
            hidden: true,
            locked: true,
          },
        ],
      },
      handler: async (_ctx, args) => {
        return {
          success: true,
          data: {
            received: args,
          },
        }
      },
    },
    {
      type: 'my_group_body',
      label: '我的组合体节点',
      category: '示例',
      icon: 'Ghost',
      description: '自动生成的内部节点',
      properties: [],
      handles: {
        target: true,
        source: true,
      },
      manualCreate: false,
      handler: async () => ({ success: true, data: {} }),
    },
  ],
}
```

但要注意一个限制：

- 插件声明的 `compound` 目前主要复用的是编辑器层的组合结构能力
- 如果你要实现的是“循环节点”这种容器型流程控制语义，当前仍需要内建执行器配合
- 也就是说，插件 `handler` 本身并不能替代 `execution-manager.ts` 对子图遍历规则的控制

因此：

- 纯结构型组合节点，可以直接放在插件里做
- 强流程控制型组合节点，建议按内建节点方式接入

## 循环节点的最小注册片段

下面是一个精简版的 `loop` / `loop_body` 定义骨架，便于后续参考：

```ts
{
  type: 'loop',
  label: '循环节点',
  category: '流程控制',
  icon: 'RotateCw',
  properties: [
    {
      key: 'loopType',
      label: '循环类型',
      type: 'select',
      default: 'count',
      options: [
        { label: '按次数循环', value: 'count' },
        { label: '使用数组循环', value: 'array' },
        { label: '无限循环', value: 'infinite' },
      ],
    },
    {
      key: 'count',
      label: '循环次数',
      type: 'number',
      visibleWhen: { key: 'loopType', equals: 'count' },
    },
    {
      key: 'arrayPath',
      label: '数组变量',
      type: 'text',
      visibleWhen: { key: 'loopType', equals: 'array' },
    },
    {
      key: 'sharedVariables',
      label: '中间变量',
      type: 'output_fields',
      default: [],
    },
  ],
  handles: {
    target: true,
    sourceHandles: [
      { id: 'loop-body', label: '循环体' },
      { id: 'loop-next', label: '完成后' },
    ],
  },
  outputs: [
    { key: 'items', type: 'any' },
  ],
  compound: {
    rootRole: 'loop',
    children: [
      { role: 'loop', type: 'loop' },
      {
        role: 'loop_body',
        type: 'loop_body',
        hidden: true,
        parentRole: 'loop',
        offset: { x: 260, y: 0 },
      },
    ],
    edges: [
      {
        sourceRole: 'loop',
        targetRole: 'loop_body',
        sourceHandle: 'loop-body',
        targetHandle: 'target',
        hidden: true,
        locked: true,
      },
    ],
  },
}
```

```ts
{
  type: 'loop_body',
  label: '循环体节点',
  category: '流程控制',
  icon: 'Ghost',
  properties: [],
  handles: {
    target: true,
    source: true,
  },
  manualCreate: false,
}
```

## 相关文件索引

如果要继续扩展这套机制，建议优先阅读这些文件：

- 类型与公共方法
  - `shared/workflow-types.ts`
  - `src/lib/workflow/types.ts`
  - `shared/workflow-composite.ts`
  - `electron/services/plugin-types.ts`
- 节点定义
  - `src/lib/workflow/nodes/flowControl.ts`
  - `electron/services/builtin-nodes.ts`
- 画布与编辑器
  - `src/stores/workflow.ts`
  - `src/composables/workflow/useFlowCanvas.ts`
  - `src/composables/workflow/useConnectionDrop.ts`
  - `src/composables/workflow/useEdgeInsert.ts`
  - `src/components/workflow/CustomNodeWrapper.vue`
  - `src/components/workflow/NodeProperties.vue`
  - `src/components/workflow/VariablePicker.vue`
- 执行器
  - `backend/workflow/execution-manager.ts`
  - `src/lib/workflow/engine.ts`

## 结论

这次新增的不是“一个特殊循环节点”，而是一套可复用的组合节点机制：

- 用 `compound` 描述一组固定父子节点和受保护边
- 用 `manualCreate: false` 隐藏内部节点的创建入口
- 用隐藏生成节点作为作用域锚点
- 用执行器分发为根节点补充容器型流程控制语义

后续如果要继续做 `retry`、`parallel`、`transaction`、`foreach-map` 一类节点，建议都沿这条路径扩展，而不是再写一次硬编码特殊逻辑。