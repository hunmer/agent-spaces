# Findings

## 2026-08-02
- 主要节点统一复用 `components/nodes/NodeShell.jsx`，标题交互应集中实现。
- `api.js` 节点操作入口包括 add/add batch/list/get/connect/delete/update/execute 等；需区分哪些操作有合理的标题输入语义。
- `tools.js` 同步维护 Agent 工具参数 schema，避免只改 handler 后模型无法传参。
- 工作区已有与本任务无关的 `components/FileUpload.jsx` 修改，必须保留。
- `NodeShell` 当前在普通态、紧凑态和输出预览态分别直接显示 `meta.label`，三处都要改为自定义标题回退值。
- 所有节点已注入 `data.onUpdate`，可直接用 `onUpdate({ title })` 持久化，不需要新增状态链路。
- Agent 新建 RPC 当前会把 `label` 放入节点 data，但 UI 不读取它；应新增明确的 `title` 并兼容旧 `label`。
- `update_node` 当前强制要求 `data` 对象；要支持只传 `title` 的调用，并把标题合并进 RPC data。
- 查询结果当前只返回 `label`，值取 `data.label`；应同时返回实际 `title`，便于 Agent 按自定义标题识别节点。
- `NoteNode` 自带独立 Header，不复用 `NodeShell`，需要接入同一标题编辑组件。
- `ImageDisplayNode` 与 `VideoDisplayNode` 明确是无标题栏的纯媒体节点；本需求不应为它们新增 Header，以免改变布局和拖拽交互。紧凑态仍可显示自定义标题。
- 输出预览态会隐藏普通 Header，仅显示顶部类型 Badge；该位置也应显示并允许编辑标题，否则预览态无法改名。
- 最终采用 `EditableNodeTitle` 统一处理点击编辑、回车/失焦提交、Esc 取消；输入框带 `nodrag nopan nowheel` 并阻止指针事件冒泡。
- 图片产出统一由 `components/nodes/ImageResult.jsx` 渲染，含网格态与输出预览态。
- 上游连线输入统一入口是 `components/nodes/UpstreamImageList.jsx`。
- 编辑图片节点使用 mini-app 本地 `components/FileUpload.jsx`；多数节点上传输入使用宿主 `@agent-spaces/ui` 的 `FileUpload`。
- 宿主 `FileUpload` 可增加可选 HoverCard 开关，再由节点 `UploadSection` 自动注入，从而限定影响范围。
- 特殊输入预览存在于 `ImageEditorNode`、`BBoxViewerNode`、`ImageCompareNode`，需单独包裹；`ImageDisplayNode` 是主展示节点，不属于输入/产出缩略图。
