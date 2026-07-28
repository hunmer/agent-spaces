# Handoff: 游戏资产生成画布 (game-asset-canvas)

> 本文件是**索引型文档**：快速理解项目骨架 + 修改某功能去哪个文件。
> 逐轮改动历史查 git log；协议/算法细节需要时读对应源码，不在此堆砌。

## 项目一句话

ReactFlow 搭的「游戏资产生成画布」mini-app：节点化调用文生图/编辑图片/图像处理/配音/视频工作流，节点间连线传图，支持多工作区/复制粘贴/分组/执行队列/Agent RPC。

## 关键路径

```
mini-app 根: packages/server/agent-spaces-data/mini-apps/game-asset-canvas/
  manifest.json          # mini-app 配置 + agents[] 定义（改 agent 改这里）
  src/
    index.jsx            # <ReactFlowProvider><Canvas/></ReactFlowProvider>
    api.js               # Agent 工具实现（RPC 到浏览器）—— 改 agent 能力改这里
    tools.js             # Agent 工具元数据（description/inputSchema）—— 改 agent 工具描述改这里
    components/
      Canvas.jsx         # 编排层（hook 装配 + ReactFlow 回调 + JSX），~400 行
      RightPanel.jsx     # 右侧三 tab：新增节点/节点管理/生成记录
      Toolbar.jsx / SettingsDialog.jsx / ExecutionQueuePopover.jsx
      NodeFormDialog.jsx / NodeExecuteDialog.jsx
      PromptPickerDialog.jsx / FileUpload.jsx
      nodes/             # 各节点组件（含 PARAMS_SCHEMA export）
      canvas/            # Canvas 子组件（菜单/多选 toolbar/分组 overlay）
    hooks/               # 状态/业务逻辑（见下「数据流」）
    utils/
      constants.js       # 节点类型/工作流 ID/各 OPTIONS 枚举（单一数据源）
      canvas-constants.js# 节点组件聚合 + NODE_PARAMS_SCHEMA 映射
      workflow.js / cutout.js / image-ops/  # 执行逻辑
      storage.js / clipboard.js / layout.js
    services/canvas.js   # 服务端持久化（save_canvas/history/workspaces）
    vendor/              # 本地第三方资源（pixelorama/director-desk/painterro/fabric 等）

宿主层（改这些需重启 web）:
  packages/web/src/components/mini-apps/react-renderer.tsx      # resolveExternalModule allowlist + 顶部 import
  packages/web/src/lib/ui-exports.ts                            # 导出到 window.AgentSpacesUI
  packages/web/src/components/mini-apps/use-mini-app-host-api.tsx # window.AgentSpaces 能力（WS/上传/CDN/插件）
  packages/server/src/services/builtin-tools/mini-app-tools.ts  # agent_run/list_agent_presets 内置工具
  packages/server/src/services/mini-app-client-rpc.ts           # RPC 双向通信（requestClient/respondClientRequest）
  packages/server/src/services/mini-app-agent.ts                # loadApiJs/loadMiniAppToolsJs（每次重读，改即生效）
```

**工作流 ID**（在 settings 可换）：text_to_image / edit_image / image_enchanter / text_to_voice / video_generator（具体 UUID 在 `utils/constants.js` WORKFLOWS）。

## 改动刷新策略

- **mini-app src 改动**（含 manifest/api.js/tools.js/节点/服务）→ **刷新即生效**。
- **宿主层改动**（react-renderer/ui-exports/use-mini-app-host-api/mini-app-tools）→ **必须重启 web**。
- 例外：`src/services/*.js` 由 chokidar watcher 热重载，无需重启。

## 数据流（单一数据源）

```
useCanvasState(workspaceId)  ← nodes/edges/groups 的唯一 state
  ├─ 持久化到 configs/workspaces/<id>/{canvas,generation-history}.json
  ├─ settings/prompt-library/panel-layout 存顶层（用户级，不隔离）
  └─ 多端同步经 onAnyConfigChanged 广播
        ↓
computeInputImages(nodes, edges)  ← 上游产出图派生到下游 data.images（多跳转发）
        ↓
useDecoratedNodes({nodes, callbacks})  ← 注入 onUpdate/onGenerate/onProcessLocal 等回调
        ↓
ReactFlow nodes={decoratedNodes}
```

**关键 hook 职责**（改某功能先定位这里）：
- `useNodeCrud` — 节点 CRUD + 定位/布局/导出 + 尺寸自适应 + 表单提交
- `useNodeExecutions` — 工作流生成/媒体/本地算法/抠图/反推提示词执行回调
- `useGroupOperations` — 分组数据 ops + overlay 移动/连线
- `useSelectionClipboard` — 选中 + 对齐分布 + 批量删除 + 复制粘贴
- `useImageOutputs` — 批量产出（addImageNodesFromUrls）
- `useExecutionQueue` — 执行队列（submit/cancel/完成回调）
- `useCanvasAgentRpc` — Agent WS RPC 入口（详见下「Agent RPC」）

## Agent RPC 通路

```
Agent → api.js handler → ctx.requestClient(type, payload, timeoutMs)
  → mini-app-client-rpc.ts 广播 miniApp.clientRequest
  → useCanvasAgentRpc 监听 → 按 type 分流 → setNodes/setEdges/setGroups 或调执行回调
  → respondClientRequest(requestId, result) → Promise resolve 回 api.js
```

**RPC case 清单**（在 useCanvasAgentRpc.js）：addNode / addNodes / updateNodeData / deleteNode / connectNodes / connectBatch / getSelection / deleteEdge / getCanvas / executeNode / waitNodeResult / getNodeParams。

**关键实现**：
- `ctxRef` 持有最新 nodes/edges/callbacks，effect deps `[]` 只订阅一次 WS（避免重订阅抖动）。
- onTaskEvent 回调是 **async**（waitNodeResult 用 `await new Promise` + setTimeout 轮询）。
- useCanvasAgentRpc 调用必须放在 Canvas.jsx 里 **nodeCallbacks useMemo 之后**（TDZ：依赖 handleGenerate/handleGenerateMedia）。

## 功能快速路径（要改 X → 去 Y）

| 要改的功能 | 去哪个文件 | 改什么 |
|---|---|---|
| 加/改 agent（systemPrompt/suggestions） | `manifest.json` | `agents[]` 数组，零宿主改动 |
| 加 agent 工具 | `api.js` + `tools.js` | api.js 加 handler（用 rpc→canvas.xxx），tools.js 加元数据 |
| 加节点类型 | `utils/constants.js` + `utils/canvas-constants.js` + `api.js` + `tools.js` + 节点组件 | 见下「新增节点 Checklist」 |
| 改节点 UI | `components/nodes/XxxNode.jsx` | 节点组件 + PARAMS_SCHEMA（若有枚举参数） |
| 改节点执行逻辑 | `hooks/useNodeExecutions.js` | handleGenerate/handleProcessLocal 等 |
| 改默认工作流 ID | `utils/constants.js` WORKFLOWS 或 settings | WORKFLOWS 是 fallback，settings 是用户配置 |
| 改提示词库 | `utils/prompts.js`（内置）+ configs/prompt-library.json（自定义） | 内置不写盘 |
| 改设置项 | `utils/settings.js` DEFAULT_SETTINGS + `SettingsDialog.jsx` | 加字段 + 加 UI |
| 改图像处理算法 | `utils/image-ops/` | 统一 (ImageData, params) => ImageData |
| 改抠图 | `utils/cutout.js` + `CutoutNode.jsx` | runCutout 分流（本地/工作流/rembg） |
| 工作区数据目录（产图落本地） | `utils/workflow.js`（persistImagesToBackend/generateImages）+ `useWorkflow.js` + `useExecutionQueue.js` + Canvas `activeWorkspace?.directory` | 见下「工作区数据目录」 |
| 暴露新第三方库到 mini-app | `react-renderer.tsx` + `ui-exports.ts` | allowlist + 顶部 import（两处都改，需重启 web） |
| 加 host 能力 | `use-mini-app-host-api.tsx` | window.AgentSpaces 上挂方法（需重启 web） |
| 改 vendor 资源 | `vendor/` + 对应 Dialog/Node | 见下「Vendor 资源」 |

## 核心约束 / 坑点（去重精选）

1. **节点选中状态**：不要在 decoratedNodes 里覆盖 `selected`（破坏 ReactFlow 内置机制）。selected 自管，selectedId 只用于面板高亮。
2. **NodeResizer**：节点创建必须带顶层 `width`/`height` + `style:{width,height}`，否则 resize 无效。
3. **交互抑制**：NodeShell 内容区 + NoteNode textarea 必须加 `nodrag nopan nowheel` class。
4. **上传图片持久化**：用 `window.AgentSpaces.uploadFile(file)` 拿 http URL（返回 `.url`），不能用 `URL.createObjectURL`（刷新失效）。提交工作流前 `normalizeImageUrls` 补全 origin。
5. **工作流同步超时**：`execute_workflow_sync` 默认 120s，必须传 `max_wait_ms:600000`。解析兜底：end 节点 → data.images → 任意 completed 节点。
6. **中断**：`callPluginTool` 不可中断；中断靠 `stopWorkflow(executionId)`，executionId 通过并行订阅 `workflow:started` 拿到。
7. **媒体节点走独立回调 onGenerateMedia**：产出结构不同（audio/video），不能复用 onGenerate。`runWorkflow` 加 `returnRawEndOutput:true` 跳过图片专用提取。
8. **提示词交互 = 展示+合并（非填充）**：选中提示词库存到 `params.pickedPrompt`，用 PickedPromptBadge 展示；提交时 `[pickedPrompt, prompt]` 去空去重合并。三处表单一致。
9. **多工作区隔离用 configs 子目录**：`configs/workspaces/<id>/{canvas,history}.json`；settings/prompt-library 顶层共享。切换由 activeId 驱动，子 hook 接收 workspaceId 重载。
10. **剪贴板是模块级内存**：`utils/clipboard.js` 用模块级 ref（非 localStorage），刷新失效。焦点在 input/textarea/contenteditable 时放行浏览器原生 Ctrl+C/V。
11. **多选隐藏节点 toolbar**：NodeToolbar `isVisible={selected && selectionCount <= 1}`。
12. **图标从 `@agent-spaces/ui` 命名导入**，不要直接 `import from 'lucide-react'`（不在 allowlist）。
13. **config 初始读取要三重读取**：`getConfig + onConfigReady + onAnyConfigChanged`（挂载时快照可能未 ready）。
14. **生成记录必须双路径都写 history**：节点内「生成」走 handleGenerate，表单「⚡生成」走 useExecutionQueue.submit → onComplete。onComplete 必须也调 addHistory。
15. **节点对话框数据持久化**：业务数据存节点 `data.<featureData>`（经 onUpdate 写回），不要只放 Dialog useState。换输入资源时清旧数据。详见原 handoff 同名章节（git 历史可查）。
16. **输出预览模式是节点级状态**：开关持久化在 `node.data.outputPreviewMode`；画布 Controls 入口只批量把所有节点设为开启。是否有产出只看 `data.output.images`，不能把 `data.images`（上游输入）误判为输出。
17. **vendor 库加载**：fabric/browser-image-compression 走 `(0,eval)` 全局求值；painterro 走 loadVendor + esmSuffix 转 ESM；pixelorama/director-desk 走 iframe + postMessage。
18. **API 参数 schema = 节点即文档**：不要在 tools.js 内联枚举值/写 NODE_PARAMS_SPEC 注入提示词。枚举参数的 options 在节点组件 PARAMS_SCHEMA 里**直接引用 constants 的 OPTIONS**（单一数据源）。
19. **工作区数据目录落地是「单写非双写」**：产图只产生**一份**文件。directory 设了 → 落工作区目录 `{historyId}/{index}.ext` + 返回指向该文件的 `localFileUrl`（走 `/local-file` 路由，被 `isBackendUrl` 识别为后端地址，下游/编辑不二次下载、不怕外链过期）；directory 没设 → 回退落 data 目录。**historyId 必须在调用 generateImages 前生成**（作落地子目录名，与 addHistory 共用同一 id）。改这套逻辑同时改两处调用点：`useWorkflow`（节点内生成）+ `useExecutionQueue.submit`（表单生成）。宿主能力 `saveImageToDir`/`localFileUrl`/`revealAbsolutePath` + 服务端 `write-absolute` 路由已具备，纯 mini-app 改动刷新即生效。

## 工作区数据目录（产图落本地）

用户可在新建/重命名工作区时用 FolderPicker 选一个宿主机绝对路径作为「数据保存目录」。设了之后，该工作区产出的图片**只产生一份文件**，落在 `<目录>/<historyId>/<index>.<ext>`，画布/历史/编辑节点共享指向该文件的 http URL。

**数据流（directory 驱动落地）**：
```
generateImages(workflowId, input, {directory, historyId})   ← utils/workflow.js
  └─ persistImagesToBackend(urls, {directory, historyId})
       ├─ directory 有值 → saveImageToDir(url, dir, '{historyId}/{index}') → localFileUrl(绝对路径)
       └─ directory 无值 → downloadImage(url) → data httpUrl（原行为）
```

**historyId 前置**（关键时序）：两个调用点都在调用前 `genId('hist')`，落地子目录与 addHistory 复用同一 id：
- `useNodeExecutions.handleGenerate`：histId 在 runWithConcurrency 前生成，作 runWorkflow 第三参（多次调用同批落到同一子目录）。
- `useExecutionQueue.submit`：histId 在入队时生成，传给 generateImages，onComplete 第三参传出给 Canvas addHistory。

**directory 来源链**：`Canvas.activeWorkspace?.directory`（来自 workspaces.json，create/rename_workspace 写入）→ `useWorkflow(directory)` / `useExecutionQueue({directory})`。

**依赖的宿主/服务端能力**（均已具备，无需重启）：
- `window.AgentSpaces.saveImageToDir(url, dir, filename)` — fetch 图→base64→写绝对路径，filename 无扩展名时按 content-type 自动补全。
- `window.AgentSpaces.localFileUrl(absPath)` — 绝对路径→`/api/mini-apps/:id/local-file?path=...` http URL。
- `window.AgentSpaces.revealAbsolutePath(absPath)` — 在文件管理器定位（重命名对话框「打开文件夹」按钮用）。
- 服务端 `POST /api/mini-apps/:id/data/write-absolute` — 写任意绝对路径，filename 支持子路径（拒绝 `..`/逃逸）。

**workspace 字段**：`workspaces.json` 的 `workspaces[]` 增加 `directory?`（可选，留空不存键）。`CreateWorkspaceDialog` 复用为创建/重命名双模式（mode 区分，重命名模式可改 directory + 打开文件夹）。

**未覆盖**：媒体节点（音频/视频）仍走 data 落地，未接工作区目录。

## 新增节点 Checklist

1. `utils/constants.js`：`NODE_TYPES` 加 key，`NODE_META` 加 {label, color}，`IMAGE_TAGS`（如产出图）。
2. `utils/canvas-constants.js`：`NODE_COMPONENTS` 注册组件，`ADD_NODE_ITEMS` 加菜单项，`DEFAULT_SIZE`/`initialData` 加默认，`computeInputImages.isReceiverType`（如接收上游图）。
3. `components/nodes/XxxNode.jsx`：写组件（用 NodeShell 外壳，内容加 nodrag nopan nowheel）。
4. `src/api.js`：`VALID_NODE_TYPES` + `NODE_LABELS` 加新类型（agent add_node 校验）。
5. `src/tools.js`：`NODE_TYPE_ENUM` + `NODE_TYPE_DESC` 加新类型（agent 工具 schema）。
6. `components/RightPanel.jsx`：`ADD_ITEMS` 加卡片。
7. **有枚举参数**：节点组件 `export const PARAMS_SCHEMA`（options 引用 constants OPTIONS），`canvas-constants.js` 的 `NODE_PARAMS_SCHEMA` 加映射。
8. **生成类节点**（agent 可执行）：`useCanvasAgentRpc.js` 的 `buildNodeExecution` 加分支 + `canvas.executeNode` case 的 `GENERATABLE` Set 加 type。
9. **对话框编辑态**：遵守约束 #15（data.<featureData> 持久化）。

## 新增 Agent Checklist

1. `manifest.json` 的 `agents[]` 加一项：`{id, name, avatar, systemPrompt, suggestions}`。
2. 零宿主改动、零源码改动，刷新即生效。
3. systemPrompt 里引用工具能力即可，工具描述自解释（不要重复列枚举值）。

## Agent 工具清单（api.js）

- `add_node` / `add_nodes` — 建节点（可选 groupName 归组，可选 data 预填参数）
- `list_nodes` / `get_canvas` — 查节点（可按 type 过滤）
- `connect_nodes` / `connect_batch` — 连线
- `delete_node` / `delete_edge` — 删除
- `update_node` — patch 节点 data
- `get_selection` — 查选中节点
- `get_node_params` — 查节点参数 schema（改枚举参数前必查）
- `execute_node` / `execute_nodes` — 执行生成类节点（可选 waitForResult 等待产出）

## Vendor 资源（需要时读对应源码）

- `vendor/pixelorama-web/` — Godot 4.7 导出像素编辑器，iframe + postMessage（pxr-load/pxr-export），COOP/COEP 由自带 SW 注入。改 GDScript 后需 Godot 重新导出 pck。
- `vendor/director-desk-web/` — storyai-3d-director-desk 构建产物，iframe + postMessage（director-desk-ready/captures-sent/panorama）。
- `vendor/painterro.min.js` — 图片编辑器，loadVendor + esmSuffix 转 ESM。
- `vendor/fabric.min.js` / `browser-image-compression.js` — `(0,eval)` 全局求值。
- `vendor/{gifenc,gifuct-js,image-q,jszip}.js` — 图像处理，Blob URL dynamic import。

## 调试速查

- **语法自检**：`node -e "require('@babel/standalone').transform(require('fs').readFileSync('文件','utf8'),{filename:'x.jsx',presets:['react']})"`
- **host tsx 语法**：babel 需带 `{filename:'x.tsx',presets:[['typescript'],['react']]}`
- **清污染数据**：`configs/canvas.json` 曾被写入 `selected:true`；`panel-layout.json` 旧格式数组需重置为 `{canvas-main:72,canvas-right:28}`
- **多工作区数据**：`configs/workspaces/<id>/`；清单 `configs/workspaces.json`
- **新 mini-app 发现**：手动建目录+manifest.json（id=目录名），或插入 `mini-apps/index.json`

## 后续可做

- 队列任务失败重试 / 实时进度（node:progress 事件）
- 异步轮询工作流替代一味提高 sync 超时
- 提示词库多选 / 导入导出 JSON
- 剪贴板持久化到 localStorage / 粘贴按鼠标位置定位
- 工作区缩略图预览 / 排序 / 收藏
- 图像处理上传多图改并发 uploadFile
- 像素编辑器 vendor pck 裁剪中文字体子集（当前 12MB）
- BBox 查看：多图批量 AI 分析 / ZIP 加 manifest
- agent_run：返回值标注是否消费了图片（非视觉 runtime 静默丢图）
- agent_run：给 codex/grok/hermes/pi/open-agent-sdk runtime 补 userAttachments 图片支持

## Suggested Skills

- **write-mini-app-code** (`docs/skills/write-mini-app-code/SKILL.md`) — 改本 mini-app 前必读
- **handoff** — 继续交接时用
