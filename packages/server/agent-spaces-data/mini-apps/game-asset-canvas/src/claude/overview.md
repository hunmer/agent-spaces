# 架构总览

## 一句话定位

Agent Spaces 宿主里的 React mini-app，用 ReactFlow 搭一个**节点化的游戏资产生成画布**：节点调工作流（文生图/编辑/抠图/放大/语音/视频）或跑本地图像算法（GIF/像素化/Sheet 合成），节点间连线传图，支持多工作区隔离 + 复制粘贴 + 分组 overlay + Agent RPC 操控画布。

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
  CLAUDE.md                 # 旧版单文件契约（已被本 claude/ 目录替代为详情，仍保留作历史参考）
  api.js                    # Agent 可调用的画布操作 API（→ RPC 到浏览器）
  tools.js                  # Agent 工具签名/描述（供宿主注册到 LLM function calling）
  handoff.md                # 历次迭代的交接文档（仅作 changelog 类参考，不要当代码契约）
  components/
    Canvas.jsx              # 编排层（~400行）：hook 装配 + ReactFlow 变更回调 + JSX
    Toolbar/RightPanel/...   # 顶层 UI
    canvas/                 # 画布级子组件（右键菜单/落空菜单/多选 toolbar/分组 overlay/添加菜单项）
    nodes/                  # 节点组件（19个）+ NodeShell 通用外壳 + ImageResult/ParamField 等通用件
  hooks/                    # 业务逻辑 hooks（17个，见 module-responsibilities.md）
  utils/                    # 纯函数/常量/单例
    constants.js            # 全局常量（NODE_TYPES/NODE_META/IMAGE_PROCESSORS/CUTOUT_PARAMS/工作流 ID/Agent 提示词）
    canvas-constants.js     # Canvas 依赖聚合点（NODE_COMPONENTS/ADD_NODE_ITEMS/initialData）
    workflow.js             # 工作流调用 + 媒体提取 + 视觉 Agent 文本反推
    cutout.js               # 统一抠图执行入口（4 种 mode 分流）
    storage.js / settings.js / layout.js / clipboard.js / export.js / canvas-id.js
    processing-controllers.js / align-distribute.js / group-helpers.js / input-images.js
    prompts.js              # 内置提示词库
    image-ops/              # 本地图像算法（FrameRonin 移植，ImageData 出入参）
  services/
    canvas.js               # 服务端单写者：画布/历史/设置/工作区/素材库/提示词库 CRUD
  vendor/                   # 本地大资源（~51MB，Pixelorama web 导出 + fabric/painterro/gifenc 等 UMD）
  assets/                   # 静态资源（图标/参考图等）
```

## 核心数据流

```
useCanvasState (单一数据源)
   │ nodes / edges / groups
   ↓
computeInputImages (utils/input-images.js) —— fixed-point 多跳转发，派生 data.images 给接收节点
   ↓
decoratedNodes (useDecoratedNodes) —— 注入回调 onUpdate/onGenerate/onProcess*/onCutout/onExportImages 等
   ↓
<ReactFlow nodes={decoratedNodes} .../>
   ↓
节点内回调 → useNodeExecutions → 工作流(云端)/本地算法/抠图/反推 → updateNodeData(output.images)
   ↓
产出回 nodes → 触发 computeInputImages 重算 → 下游节点 data.images 更新
```

## 关键设计取舍

1. **宿主依赖最小化**：项目自包含（无 package.json），所有运行时依赖走宿主 allowlist 或 CDN/vendor 本地加载。改宿主层（react-renderer / ui-exports / use-mini-app-host-api）**必须重启 web 服务**；改本项目 src/ **刷新即生效**（services/ 经 chokidar 热重载，也无需重启）。
2. **三层拆分**：Canvas.jsx 只做编排，业务逻辑在 hooks，纯函数/单例在 utils，展示子组件在 components/canvas。避免「上帝组件」回归。
3. **服务端单写者模式**：所有 configs/ 写入都走 `src/services/canvas.js` 的 handler（经 `window.AgentSpaces.invokeService` 调），前端 `getConfig`/`writeConfigJson` 不绕过该层，避免并发覆盖。
4. **多工作区数据隔离零宿主改动**：宿主 `safeProjectSubdirPath` 支持子目录、`listConfigs` 递归扫描、config 广播带完整相对路径 → 节点/历史按 `configs/workspaces/<id>/` 隔离，设置/提示词库/面板布局仍全局共享。
5. **本地算法 vs 云端工作流二选一**：`image-ops` 纯 JS（无 WASM 依赖，opencv 全砍），通过 `runProcessor` 统一入口；`enhance`/`compress`/`cutout.workflow` 走工作流，用 `__url` 透传机制跳过 ImageData 管道。
6. **Agent RPC 用 ref 持有最新值**：`useCanvasAgentRpc` effect deps=`[]` 只订阅一次 WS，靠 ref 读最新闭包，避免 nodes/edges 变化重订阅抖动。

## 运行时形态

- 浏览器端 React 单页（Babel/TS 由宿主 react-renderer 即时编译），无构建步骤。
- 工作流执行通过 `window.AgentSpaces.callPluginTool('@agent-spaces/builtin', 'execute_workflow_sync', {...})` 同步等待，超时上限 600000ms（10 分钟）。
- 图片下载到后端 `data/` 目录（`window.AgentSpaces.downloadImage`）后换 httpUrl，避免外链失效。
