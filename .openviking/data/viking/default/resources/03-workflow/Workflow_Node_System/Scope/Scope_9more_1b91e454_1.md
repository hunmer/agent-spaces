# Scope

本文单独研究当前项目的 workflow node 系统，不覆盖完整执行引擎和编辑器布局逻辑。关注点是：

- node 的共享数据模型
- 前端内建节点定义与注册
- 节点在编辑器里的渲染与属性配置
- 服务端如何把 `node.type` 分派到具体执行实现
- 插件节点、客户端节点与 `agent_run` 这类特殊节点的扩展路径

目标是让后续 AI agent 能在不重扫全仓的情况下新增节点、修改节点属性、接插件节点或排查节点执行问题。

## Main Responsibilities

- 用统一的 `WorkflowNode` 数据结构承载所有节点实例。
- 用 `NodeTypeDefinition` 描述节点类型的编辑器元数据。
- 前端根据 definition 决定：
  - 节点分类与搜索
  - icon / label / description
  - 属性面板表单结构
  - handles、动态 handles、默认 outputs
  - 特殊渲染或 custom view
- 服务端根据 `node.type` 和 `node.data` 决定：
  - 内建节点执行函数
  - 插件节点执行方式
  - 是否要转给客户端执行

## Core Data Model

共享 node 实例定义位于 `packages/shared/src/types/workflow.ts`：

```text
WorkflowNode
  - id
  - type
  - label
  - position
  - data: Record<string, unknown>
  - inputFields?
  - outputs?
  - nodeState?
  - breakpoint?
  - nodeColor?
  - composite?
```

关键结论：

- `type` 是字符串，不是 enum。
- 真正的节点业务参数基本都放在 `data`。
- `inputFields` / `outputs` 既出现在 node 顶层，也可能在编辑器快照阶段复制到 `data` 中做执行态预览。
- `composite` 用于 loop / sub workflow 这类复合节点的子节点关系、隐藏节点、scope boundary 等。

这套设计本质上是：

> 运行态实例 `WorkflowNode` 保持宽松，编辑器能力和执行能力再分别通过 definition 与 dispatch 补上。

## Node Type Definition Model

节点类型元数据同样定义在 `packages/shared/src/types/workflow.ts` 中，核心是 `NodeTypeDefinition` 相关字段族。

可验证的能力包括：

- `type`
- `label`
- `category`
- `icon`
- `description`
- `properties`
- `outputs`
- `allowInputFields`
- `allowedInputFieldTypes`
- `handles`
- `singleton`
- `customView`

`NodeProperty` 支撑的属性类型包括：

- `text`
- `textarea`
- `number`
- `select`
- `checkbox`
- `code`
- `conditions`
- `array`
- `output_fields`
- `agent`
- `sqlite`
- `knowledge-base`

因此 node 系统的本质不是“每个节点写死一套表单”，而是：

- `NodeTypeDefinition` 驱动编辑器生成大部分通用表单
- 少数节点再用 custom view 或额外逻辑补足

## Frontend Definition Registry

前端 registry 位于 `packages/web/src/lib/workflow-nodes/registry.ts`。

主流程：

```text
definitions/*
  -> registry.ts: allNodeDefinitions
  -> getAllNodeDefinitions()
  -> getNodeDefinitionsByCategory()
  -> getNodeDefinition(type)
  -> i18n.ts 进行本地化包装
  -> 组件侧使用 localized definitions
```

内建节点来源：

- `flowControlNodes`
- `aiNodes`
- `interactionNodes`
- `displayNodes`
- `utilsNodes`
- `stringNodes`
- `sqliteNodes`
- `knowledgeBaseNodes`
- `LOCAL_BRIDGE_WORKFLOW_NODES`

插件节点来源：

- `registerPluginNodeDefinitions(nodes)`
- 与内建定义合并后参与查找与渲染

## Built-in Node Categories

从 `definitions/*` 可以确认当前节点体系至少包含这些大类：

- Flow Control
  - `start`
  - `end`
  - `run_code`
  - `run_python`
  - `toast`
  - `switch`
  - `set_variable`
  - `get_variable`
  - `delete_variable`
  - `loop`
  - `loop_break`
  - `sub_workflow`
- AI
  - `agent_run`
- Interaction
  - `alert`
  - `prompt`
  - `form`
- Display
  - `table_display`
  - `gallery_preview`
  - `code_render`
  - `markdown`
  - `sticky_note`
- Utilities / String / SQLite / Knowledge Base

这说明 node 分类主要是编辑器导航语义，不直接影响服务端 dispatch。

## Definition Example

`packages/web/src/lib/workflow-nodes/definitions/ai.ts` 中的 `agent_run` 很典型：

- 用 `properties` 定义 agent、prompt、cwd、additionalDirectories、permissionMode
- 用 `outputs` 定义 `result` 与 `usage`

`packages/web/src/lib/workflow-nodes/definitions/flow-control.ts` 中的 `switch` 和 `loop` 更能体现 definition 的表达力：

- `switch`
  - `properties` 里有 `conditions`
  - `handles.dynamicSource` 根据 `conditions` 动态生成 source handles
- `set_variable`
  - 属性变更后 outputs 会被派生更新
- `loop`
  - 使用共享常量定义 loop root/body/break 的复合关系

## Frontend Rendering And Editing

节点渲染主入口在 `packages/web/src/components/workflow/workflow-node.tsx`。

关键机制：

- 根据 `nodeData.nodeType || type` 找 definition
- 使用 `useLocalizedNodeDefinition()` 得到翻译后的 label / category / properties
- 根据 definition 决定：
  - handles
  - 动态 source handles
  - custom view
  - 日志展示方式
  - property mode / variable input / preset 输出展示

如果 definition 声明了插件 custom view：

- `plugin-workflow-custom-view` 路径会接管一部分节点体渲染

属性编辑主入口在 `packages/web/src/components/workflow/workflow-properties-panel.tsx`。

关键点：

- 面板本身依赖 `useLocalizedNodeDefinition(node.type)`
- 大多数字段由 `properties` 描述驱动
- 某些节点会有额外派生逻辑
  - 例如 `set_variable` 的 outputs 由 `createSetVariableOutputs()` 根据变量路径生成
  - JSON preset 会把执行结果回填为可复用输出模板

## Property View Runtime Sizing

property view 模式下，节点的真实显示高度不是只由持久化的 `WorkflowNode.data.nodeHeight` 决定。

关键链路：

```text
workflow-canvas.tsx
  -> useCanvasData()
  -> rfNodes: width / height / initialWidth / initialHeight / measured / style
  -> ReactFlow nodes
  -> workflow-node.tsx: WorkflowNodeComponent()
  -> measuredPropertyHeight
  -> displayNodeHeight
  -> workflow:update-node-runtime-size
  -> workflow-canvas.tsx: runtimeNodeSizesRef + canvasNodes
```

要点：

- `use-workflow-canvas-data.ts` 会基于 `getWorkflowNodeSize()` 生成 React Flow node 的初始 `width`、`height`、`initialWidth`、`initialHeight`、`measured` 和 `style`。
- `workflow-node.tsx` 在 property view 下会测量属性面板真实内容高度，写入组件本地的 `measuredPropertyHeight`，并用它生成 `displayNodeHeight`。
- 仅调用 `useUpdateNodeInternals()` 不足以让所有下游逻辑看到真实高度；minimap、导出、分组 overlay 等逻辑会读取 React Flow node dimensions 或本地 `canvasNodes`。
- 因此 property view 的动态高度需要同步为运行时尺寸，而不是写回 workflow 持久数据。用户手动 resize 仍通过 `nodeWidth` / `nodeHeight` 持久化。

已验证的风险点：

- 画布导出：`use-workflow-canvas-export.ts` 需要使用 React Flow instance 的 `getNodesBounds()`，并合并实际 DOM bounds，避免只按静态 node size 裁剪图片。
- minimap：React Flow minimap 读取节点 dimensions；如果 `canvasNodes` 没有运行时高度，minimap 会显示过小。
- 合并成组：`use-workflow-group-operations.ts` 创建 group 时计算 bounds；`workflow-group-node.tsx` 渲染 overlay 时还会根据 `childNodes` 二次计算 bounds。两处都不能只依赖 `getWorkflowNodeSize()`。
- 组 overlay 数据源在 `workflow-canvas.tsx` 的 `groupOverlayItems`。这里必须优先使用当前 `canvasNodes` 的 `width` / `height` / `measured`，否则 property view 高节点会超出蓝色组背景。

调试点：

```text
[WorkflowGroupBoundsDebug] merge request
  -> 合并点击瞬间从 DOM / runtime cache 得到的 node bounds

[WorkflowGroupBoundsDebug] create group bounds
  -> use-workflow-group-operations.ts 里创建 group 时算出的持久 bounds

[WorkflowGroupBoundsDebug] render group bounds
  -> workflow-group-node.tsx 最终渲染 overlay 时使用的 bounds 和 childNodes
```

排查时优先比较 `create group bounds.bounds` 与 `render group bounds.renderedBounds`。如果创建时正确但渲染时变小，问题通常在 `groupOverlayItems` 或 `WorkflowGroupOverlay` 二次计算；如果创建时就偏小，问题通常在合并事件传入的 DOM/runtime bounds。