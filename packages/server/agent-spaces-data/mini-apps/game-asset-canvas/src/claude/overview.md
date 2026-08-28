# 架构总览

## 一句话定位

Agent Spaces 宿主里的 React mini-app，用 ReactFlow 搭一个**节点化的游戏资产生成画布**：38 种节点调工作流（文生图/编辑/抠图/放大/语音/视频/深度图/任意工作流）或跑本地图像算法（GIF/像素化/网格拼接），外加浏览器端编辑器（Painterro/Pixelorama/Photopea/蒙版/Spine 骨骼/3D 导演台）与分镜创作子域；节点间连线传图片/视频/音频/文本产物，支持多工作区隔离 + 复制粘贴/属性粘贴 + 分组 overlay/多实例执行 + 执行队列 + 画布版本 + Agent RPC 操控画布。

## 在宿主中的位置

```
Agent Spaces
├── packages/web                    # 宿主前端，提供 mini-app 运行时 + bare import 白名单 + window.AgentSpaces API
└── packages/server
    └── agent-spaces-data
        └── mini-apps/<本项目>      # ← 当前 mini-app（manifest.json 注册到宿主）
            ├── manifest.json       # id=game-asset-canvas, type=react, mainFile=index.jsx
            ├── configs/            # 运行时数据（按工作区隔离 / 全局共享）
            ├── data/               # 生成/上传/导出的图片文件
            ├── chat/               # agent 会话存档
            └── src/                # ← mini-app 源码（本目录是它的 AI 上下文）
```

- **运行方式**：宿主 `react-renderer.tsx` 把 `index.jsx` 默认导出渲染进 iframe/容器；`window.AgentSpaces` 提供能力（uploadFile / getConfig / invokeService / callPluginTool / subscribeWorkflowEvents / openMediaGallery / openAgentEditor / loadCdnModule 等）。
- **依赖来源**：项目内**没有 `package.json`**。所有第三方库（`@xyflow/react` / `@dagrejs/dagre` / `@agent-spaces/ui`）经宿主 `resolveExternalModule` allowlist + bare import 暴露；vendor 库（fabric/painterro/pixelorama/browser-image-compression/gifenc 等）本地加载或 CDN 动态 import。

## 三层源码结构（Canvas 拆分后的形态）

```text
src/
  index.jsx                 # 入口：<ReactFlowProvider><Canvas/></ReactFlowProvider>
  api.js + api/             # Agent 可调用的画布操作 API（→ RPC 到浏览器）；api/ 是 asset 类拆分
  tools.js                  # Agent 工具签名/描述（供宿主注册到 LLM function calling）
  handoff.md                # 活的索引型交接文档（改 X 去 Y + 坑点清单）
  components/
    Canvas.jsx              # 编排层：hook 装配 + ReactFlow 变更回调 + nodeCallbacks useMemo
    right-panel/            # 右侧 tab 装配（含 agent-chat 宿主插槽）
    canvas/                 # 画布级子组件（主视图/弹窗层/菜单/多选/辅助线/FloatingEdge/分组 overlay+执行）
    nodes/                  # 43 个节点组件（NodeShell 外壳 + EditableNodeTitle + 各业务节点）
    ui-splitter/            # Sheet 拆分编辑器子域
  hooks/                    # 业务逻辑 hooks（26 个，见 module-responsibilities.md）
  context/                  # ImageSelectionContext（跨节点图片多选）
  utils/                    # 纯函数/常量/单例（~50 顶层 + image-ops/ + reskin/）
    constants.js            # 单一数据源：NODE_TYPES/NODE_META/各 OPTIONS 枚举/WORKFLOWS
    canvas-constants.js     # Canvas 依赖聚合点（NODE_COMPONENTS/ADD_NODE_ITEMS/NODE_PARAMS_SCHEMA）
    workflow.js             # 工作流调用 + 产图落地（data 目录 / 工作区数据目录）
    storyboard*.js          # 分镜子域（解析/handle/生成参数兼容）
    output-resources.js     # 输出资源协议（images+resources/thumb/groupName）
    image-ops/              # 本地图像算法（ImageData 出入参）
    reskin/                 # Spine 换肤管线
  services/
    canvas.js               # 服务端单写者：31 个 handler（画布/历史/版本/角色/换肤/工作区/素材库）
  spine/                    # Spine 编辑核心（非 React：loaders/core/exporters）
  vendor/                   # 本地大资源（Pixelorama ~45MB + director-desk + spine dist + UMD 库）
  assets/                   # 静态资源
```

## 核心数据流

```
useCanvasState (单一数据源)
   │ nodes / edges / groups
   ↓
computeInputImages / computeInputVideos / computeInputAudios / computeInputTexts (utils/input-images.js 等)
   —— fixed-point 多跳转发：上游 output.images 派生到下游 data.images（含空数组，透传节点不回退旧值）
   —— 同步派生 data.imageResources（仅缩略展示）；文本按 edge.inputTarget/inputVariable 派生到 data.textInputValues
   ↓
decoratedNodes (useDecoratedNodes) —— 注入 onUpdate/onGenerate/onGenerateMedia/onProcess*/onCutout 等回调
   —— videoEditor 上游视频去重合并（非覆盖）
   ↓
<ReactFlow nodes={decoratedNodes} .../>
   ↓
节点内回调 → useNodeExecutions → 工作流(云端)/本地算法/抠图/反推 → updateNodeData(output.images + output.resources)
   ↓
产出回 nodes → 触发 computeInput* 重算 → 下游节点输入更新
```

Agent 通路：`api.js handler → ctx.requestClient → mini-app-client-rpc.ts 广播 → useCanvasAgentRpc 分流（13 case）→ respondClientRequest`。宿主 Chat 经 `agentChatPlacement: "mini-app-slot"` Portal 到 RightPanel 注册的 `agent-chat` 插槽（不复制 Chat 实现）。

## 关键设计取舍

1. **宿主依赖最小化**：项目自包含（无 package.json），所有运行时依赖走宿主 allowlist 或 CDN/vendor 本地加载。改宿主层（react-renderer / ui-exports / use-mini-app-host-api）**必须重启 web 服务**；改本项目 src/ **刷新即生效**（services/ 经 chokidar 热重载，也无需重启）。
2. **三层拆分**：Canvas.jsx 只做编排，业务逻辑在 hooks，纯函数/单例在 utils，展示子组件在 components/canvas。避免「上帝组件」回归。
3. **服务端单写者模式**：所有 configs/ 写入都走 `src/services/canvas.js` 的 handler（经 `window.AgentSpaces.invokeService` 调），前端 `getConfig`/`writeConfigJson` 不绕过该层，避免并发覆盖。
4. **多工作区数据隔离零宿主改动**：宿主 `safeProjectSubdirPath` 支持子目录、`listConfigs` 递归扫描、config 广播带完整相对路径 → 节点/历史按 `configs/workspaces/<id>/` 隔离，设置/提示词库/面板布局仍全局共享。
5. **本地算法 vs 云端工作流二选一**：`image-ops` 纯 JS（无 WASM 依赖，opencv 全砍），通过 `runProcessor` 统一入口；`enhance`/`compress`/`cutout.workflow` 走工作流，用 `__url` 透传机制跳过 ImageData 管道。
6. **Agent RPC 用 ref 持有最新值**：`useCanvasAgentRpc` effect deps=`[]` 只订阅一次 WS，靠 ref 读最新闭包，避免 nodes/edges 变化重订阅抖动。
7. **原图与缩略图分离**：协议保持 `images: string[]`，并行 `resources[{url,thumb,groupName,label}]` 只服务展示；旧数据回退 `thumb || url`，补缩略图走调试菜单（不重写 images 协议）。
8. **工作区数据目录单写非双写**：directory 设了产图只落一份文件（`{historyId}/{index}.ext`）+ localFileUrl；历史子目录 id 与 addHistory 共用，天然可追溯。
9. **分组多实例 = 模板 + 执行身份冻结**：每个 run 用稳定 `nodeIds[templateNodeId]` + `executionTarget` 定向写回，画布 nodes 是当前 run 的实时视图。
10. **编辑器子域独立目录**：Spine（src/spine/ + vendor/spine/）、Sheet 拆分（ui-splitter/）、换肤管线（utils/reskin/）自成体系，React 宿主只做 Dialog 壳。

## 运行时形态

- 浏览器端 React 单页（Babel/TS 由宿主 react-renderer 即时编译），无构建步骤。
- 工作流执行通过 `window.AgentSpaces.callPluginTool('@agent-spaces/builtin', 'execute_workflow_sync', {...})` 同步等待，超时上限 600000ms（10 分钟）。
- 图片下载到后端 `data/` 目录（`window.AgentSpaces.downloadImage`）后换 httpUrl，避免外链失效。
