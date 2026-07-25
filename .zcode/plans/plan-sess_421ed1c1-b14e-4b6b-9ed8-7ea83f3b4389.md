# Canvas.jsx 功能拆分方案

把 1969 行的「上帝组件」拆成 **utils（6文件）+ hooks（7个）+ 子组件（5个）** 三层，Canvas.jsx 降到约 300 行只做编排。一次性完成，全部在 mini-app src 内，刷新即生效，无宿主改动。

## 拆分架构

```
src/
  components/
    Canvas.jsx                       # ~300行：hook 装配 + JSX 编排（骨架）
    canvas/                          # 新建目录
      AddNodeMenuItems.jsx           # render-prop 菜单项（原 B18，已独立）
      CanvasContextMenu.jsx          # 右键菜单（ContextMenuTrigger 包裹 + Content）
      DropNodeMenu.jsx               # 拖拽落空菜单（DropdownMenu）
      MultiSelectToolbar.jsx         # 底部多选浮出 toolbar（分组/对齐/删除）
      GroupOverlays.jsx              # ViewportPortal 内的 WorkflowGroupOverlay 列表
  hooks/
    useCanvasAgentRpc.js             # WS message 监听（原 B11，200行，最高价值）
    useNodeExecutions.js             # 节点执行回调（原 B4+B14：generate/media/process/cutout/promptReverse）
    useNodeCrud.js                   # 节点 CRUD（原 B5+B6+B12：create/drop/contextMenu/delete/locate/layout/export/autosize/formSubmit）
    useGroupOperations.js            # 分组操作（原 B8+B15：group data ops + overlay move/connect）
    useSelectionClipboard.js         # 选中+复制粘贴（原 B3选中部分 + B10）
    usePanelLayout.js                # 面板布局持久化（原 B2+B16部分）
    useImageOutputs.js               # 图片节点批量产出（原 B7：addImageNodesFromUrls/handleExportImages）
    useDecoratedNodes.js             # 节点 data 注入（原 B13）
  utils/
    canvas-constants.js              # NODE_COMPONENTS/ADD_NODE_ITEMS/DEFAULT_SIZE/initialData/dedupeTags/PANEL_*（原 M1-M10 常量部分）
    input-images.js                  # computeInputImages（原 M3，纯函数）
    canvas-id.js                     # genId+seq / autoPosition+positionIndex（原 M6+M8，单例）
    processing-controllers.js        # processingControllers Map + register/abort/clear（原 M7，单例）
    align-distribute.js              # computeAlignment 纯函数（原 B9 算法部分）
    group-helpers.js                 # collectIds/findLeafNodeIds（原 B15 内联的递归，去重）
```

## 各文件职责与依赖

### utils 层（纯函数/单例，零 React，最先抽）

| 文件 | 导出 | 来源 | 说明 |
|---|---|---|---|
| `canvas-constants.js` | NODE_COMPONENTS, ADD_NODE_ITEMS, DEFAULT_SIZE, initialData, dedupeTags, PANEL_ID_MAIN/RIGHT, DEFAULT_PANEL_LAYOUT | M1,M2,M4,M5,M9,M10 | 纯常量+纯函数，import 各 Node 组件 + constants |
| `input-images.js` | computeInputImages(nodes, edges) | M3 (110-178) | 纯函数，fixed-point 多跳转发，import constants 的 NODE_TYPES/isImageProcessNodeType |
| `canvas-id.js` | genId, autoPosition | M6,M8 (198-228) | **模块级单例** seq/positionIndex，保持连续建节点不撞位置 |
| `processing-controllers.js` | processingControllers, registerController, abortController, clearController | M7 (207) | **模块级单例** Map，封装 register/abort/clear，跨 B4/B14 共享取消 |
| `align-distribute.js` | computeAlignment(selectedNodes, mode) → Map\<id,{x,y}\> | B9 (928-994) | 纯函数算法，组件内只剩 setNodes 应用结果 |
| `group-helpers.js` | collectGroupNodeIds(groups, groupId), findLeafNodeIds(groups, edges, groupId) | B15 内联 (1543,1565) | 去重两处重复的递归 |

### hooks 层（自带 state/effect）

**`useImageOutputs({ setNodes, setGroups })`** → `{ addImageNodesFromUrls, handleExportImages }`
- 原 B7。先抽因为它被 useExecutionQueue 的 onComplete 前向引用（拆 Canvas 时用 ref 解决）

**`useNodeExecutions({ runWorkflow, updateNodeData, addHistory, settings, createNodeAt })`** → `{ handleGenerate, handleGenerateMedia, handlePromptReverse, handleProcessImage, handleProcessLocal, handleCutout, handleCutoutCreate, handleCancelProcess }`
- 合并原 B4 + B14。内部用 processing-controllers 单例管理取消
- deps: runWorkflow/generateAudio/generateVideo/runAgentVisionText/runProcessor/runCutout/normalizeImageUrls

**`useNodeCrud({ nodes, edges, setNodes, setEdges, setGroups, reactFlow, selectedId, setSelectedId, updateNodeData, settings, submit })`** → `{ createNodeAt, handleAdd, handleAddAtDrop, handleAddAtMenu, handleDragStartNode, handleDragOver, handleDrop, handleDropFiles, handleContextMenu, handleClear, handleDeleteNode, focusNode, handleSelectNode, handleLocateNode, handleAutoLayout, handleExport, handleAutoSize, handleAutoSizeToContent, handleFormSubmit }`
- 合并原 B5+B6+B12。createNodeAt 是核心，被多处复用（含 RPC）

**`useGroupOperations({ groups, nodes, edges, setGroups, setNodes, setEdges, reactFlow })`** → `{ deleteGroup, updateGroup, createGroupFromSelection, groupOverlayItems, selectedGroupId, setSelectedGroupId, screenDeltaToFlowDelta, handleGroupMove, handleGroupConnect }`
- 合并原 B8+B15。用 group-helpers 去重递归

**`useSelectionClipboard({ nodes, edges, setNodes, setEdges, setGroups, setSelectedId })`** → `{ selectionCount, setSelectionCount, onSelectionChange, deleteSelectedNodes, handleUseImage, handleCopy, handlePaste }`
- 合并原 B3(选中部分)+B10。含 keydown useEffect

**`useCanvasAgentRpc({ nodes, edges, createNodeAt, updateNodeData, handleDeleteNode, focusNode, setEdges })`**
- 原 B11（200行）。**关键优化**：用 ref 持有最新 nodes/edges/callbacks，effect 只订阅一次，避免每次 nodes 变重订阅（原 deps 极重是潜在抖动点）

**`usePanelLayout()`** → `{ panelLayout, showMinimap, setPanelLayout, setShowMinimap, handlePanelLayoutChange, toggleMinimap }`
- 合并原 B2+B16(布局部分)。含 onAnyConfigChanged 订阅

**`useDecoratedNodes({ nodes, edges, selectionCount, callbacks... })`** → `{ decoratedNodes }`
- 原 B13。用 input-images.computeInputImages + 注入所有 callback。callbacks 作为对象传入避免 deps 爆炸

### 子组件层（纯展示）

**`AddNodeMenuItems.jsx`** — 原 B18 直接外移，render-prop 设计不变

**`CanvasContextMenu.jsx`** — `{ children, onContextMenu, onPick, menuPosition }` 
- 包含 ContextMenu/ContextMenuTrigger(包裹 children)/ContextMenuContent(AddNodeMenuItems)
- ContextMenuSub 渲染图像处理器子菜单

**`DropNodeMenu.jsx`** — `{ dropNodeMenu, onClose, onPick }`
- 受控 DropdownMenu，trigger 用 1x1 span 定位

**`MultiSelectToolbar.jsx`** — `{ selectionCount, onCreateGroup, onAlignDistribute, onDeleteSelected }`
- 底部浮出 toolbar，含分组/对齐分布下拉/批量删除

**`GroupOverlays.jsx`** — `{ items, selectedGroupId, onSelect, onDelete, onUpdate, onMove, onConnect, screenDeltaToFlowDelta }`
- ViewportPortal 内渲染 WorkflowGroupOverlay 列表（需在 ReactFlow 内部使用，故接收 children 式或由 Canvas 直接放 ViewportPortal 内）

## Canvas.jsx 重写后结构（~300行）

```jsx
export default function Canvas() {
  // 1. hook 装配
  const { workspaces, activeId, ... } = useWorkspaces();
  const { nodes, edges, groups, loaded, setNodes, setEdges, setGroups, updateNodeData } = useCanvasState(activeId);
  const runWorkflow = useWorkflow();
  const { history, addHistory, ... } = useGenerationHistory(activeId);
  const { settings, saveSettings } = useSettings();
  const [selectedId, setSelectedId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [formState, setFormState] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [dropNodeMenu, setDropNodeMenu] = useState(null);
  const reactFlow = useReactFlow();

  // 2. 拆出的 hooks
  const imageOutputs = useImageOutputs({ setNodes, setGroups });
  const { jobs, submit, cancel, clearFinished, runningCount } = useExecutionQueue({
    onComplete: (job, images) => { /* 用 imageOutputs.addImageNodesFromUrls + updateNodeData + addHistory */ },
    onError: ...
  });
  const crud = useNodeCrud({ nodes, edges, setNodes, setEdges, setGroups, reactFlow, selectedId, setSelectedId, updateNodeData, settings, submit });
  const executions = useNodeExecutions({ runWorkflow, updateNodeData, addHistory, settings, createNodeAt: crud.createNodeAt });
  const groups Ops = useGroupOperations({ groups, nodes, edges, setGroups, setNodes, setEdges, reactFlow });
  const selection = useSelectionClipboard({ nodes, edges, setNodes, setEdges, setGroups, setSelectedId });
  const panel = usePanelLayout();
  const decoratedNodes = useDecoratedNodes({ nodes, edges, selectionCount: selection.selectionCount, callbacks: { ...executions, ...crud, onEditImages, agentConfig } });
  
  // 3. ReactFlow 变更回调（留在 Canvas，简单）
  const onNodesChange = ..., onEdgesChange = ..., onConnect = ..., onConnectEnd = ..., onNodesDelete = ...;
  
  // 4. Agent RPC
  useCanvasAgentRpc({ nodes, edges, createNodeAt: crud.createNodeAt, updateNodeData, handleDeleteNode: crud.handleDeleteNode, focusNode: crud.focusNode, setEdges });
  
  // 5. JSX 编排（loading guard + ResizablePanelGroup 骨架 + 子组件拼装）
  if (!activeId || !loaded) return <Loading/>;
  return <ResizablePanelGroup>...</ResizablePanelGroup>;
}
```

## 关键风险处理

1. **前向引用**（useExecutionQueue.onComplete 引用 addImageNodesFromUrls）：先调 `useImageOutputs` 拿到 `addImageNodesFromUrls`，再传给 useExecutionQueue 的 onComplete 闭包
2. **processingControllers 单例**：抽到 utils，useNodeExecutions 内部 import 使用，B4+B14 隐式共享变显式
3. **B11 RPC 重订阅**：useCanvasAgentRpc 内用 `useRef` 持有最新 nodes/edges/callbacks，effect deps 为 `[]` 只订阅一次
4. **decoratedNodes deps**：callbacks 打包成对象传入，useMemo deps 用 `[nodes, edges, selectionCount, callbacks, settings]`
5. **GroupOverlays 需在 ReactFlow 内**：GroupOverlays 组件内部含 `<ViewportPortal>`，由 Canvas 直接放在 `<ReactFlow>` children 里（与原位一致）

## 执行顺序（每步 babel 自检）

1. utils 层 6 文件（零风险）
2. AddNodeMenuItems（已独立）
3. 其余 4 子组件
4. usePanelLayout / useSelectionClipboard / useImageOutputs（小 hook）
5. useGroupOperations / useNodeCrud
6. useNodeExecutions（依赖 processing-controllers 单例）
7. useCanvasAgentRpc（ref 持有最新值）
8. useDecoratedNodes
9. 重写 Canvas.jsx
10. 全量 babel 自检 + CLAUDE.md/handoff.md 更新

## 预期结果

- Canvas.jsx: 1969 行 → ~300 行
- 新增 utils 6 文件 + hooks 8 文件 + components/canvas 5 文件
- 行为完全不变（纯重构，无功能增减）
- B11 RPC 性能改善（避免重订阅）