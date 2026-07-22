# 游戏资产生成画布 (game-asset-canvas)

基于 ReactFlow 的游戏资产生成画布。三种自定义节点，节点间连线传图，画布状态持久化到 configs。

## 入口
- `index.jsx`：`<ReactFlowProvider><Canvas/></ReactFlowProvider>`
- `manifest.json`：`mainFile: index.jsx`，`type: react`

## 节点类型 (utils/constants.js NODE_TYPES)
- `textToImage` 文字生成图片 → 调 `text_to_image` 工作流
- `editImage` 编辑图片 → 调 `edit_image` 工作流（需上游图片）
- `preview` 图片预览 → 纯展示，接收上游图片

## 数据流（连线传图）
- 节点 data 结构：`{ params, output: { images: string[] }, status, error, onUpdate, onGenerate, label }`
- 预览/编辑节点额外有 `data.images`（上游推入）
- 生成完成 → `propagateDownstream`（Canvas.jsx）：取 `edges.filter(source===本节点)`，把产出图片推给 target：
  - editImage → `data.images`（替换）
  - preview → `data.images`（累加去重）
- Handle：source（输出）在底部 Bottom，target（输入）在顶部 Top

## 工作流调用 (utils/workflow.js)
- `window.AgentSpaces.callPluginTool('@agent-spaces/builtin', 'execute_workflow_sync', { workflow_id, input, fault_tolerance:'stop' }, { meta })`
- 结果取 `steps` 里最后 `nodeType==='end'` 的 `output.result`（string[] URL）
- 工作流 ID：text_to_image=`d88dcb7c-7f5f-47c8-962c-89217a2c0ad6`，edit_image=`19f5f8a9-305d-43a6-9b05-584597213a8f`

## 模型下拉 (utils/constants.js MODEL_OPTIONS)
只放能命中工作流 run_code 路由关键字的 model：含 `gpt`(case-3) / `jimeng`(case-2) / `qwen`(case-1)。
不放 `dall-e-*` / `wanx*`（不命中任何分支会返回"错误的提供商"）。

## 持久化
- 画布状态（nodes/edges）存 `configs/canvas.json`
- 写入走服务端单写者 `src/services/canvas.js` 的 `save_canvas`（`invokeService`）
- 读取用 `getConfig('canvas.json')`，订阅 `onConfigChanged` 多端同步
- 生成图片额外下载到 `data/gen/`（`downloadFile`）

## 依赖（宿主已暴露，无需项目内安装）
- `@xyflow/react`（通过 bare import 或 window.AgentSpacesUI 取用）
- ReactFlow CSS 由宿主全局加载

## 重要约定
- ReactFlow 以 useCanvasState 的 nodes/edges 为单一数据源（onNodesChange/onConnect 直接 setNodes/setEdges）
- 节点 data 的 onUpdate/onGenerate 由 Canvas 注入，不在持久化数据里（序列化时是函数，JSON.stringify 会自动丢弃，不影响存储）
