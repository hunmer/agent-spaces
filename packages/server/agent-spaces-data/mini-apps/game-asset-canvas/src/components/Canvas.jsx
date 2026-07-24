import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, Controls, ControlButton, MarkerType, MiniMap, ReactFlow,
  ViewportPortal,
  addEdge, applyEdgeChanges, applyNodeChanges, useReactFlow,
} from '@xyflow/react';
import {
  ResizablePanelGroup, ResizablePanel, ResizableHandle, WorkflowGroupOverlay,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuGroup, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent, ContextMenuGroup,
  Layers, AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, Trash2, MapPinned,
} from '@agent-spaces/ui';
import Toolbar from './Toolbar';
import RightPanel from './RightPanel';
import ConnectionLine from './ConnectionLine';
import SettingsDialog from './SettingsDialog';
import ExecutionQueuePopover from './ExecutionQueuePopover';
import NodeFormDialog from './NodeFormDialog';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import TextToImageNode from './nodes/TextToImageNode';
import EditImageNode from './nodes/EditImageNode';
import ImageDisplayNode from './nodes/ImageDisplayNode';
import ImageProcessNode from './nodes/ImageProcessNode';
import ImageEditorNode from './nodes/ImageEditorNode';
import PixelEditorNode from './nodes/PixelEditorNode';
import NoteNode from './nodes/NoteNode';
import useCanvasState from '../hooks/useCanvasState';
import useWorkflow from '../hooks/useWorkflow';
import useGenerationHistory from '../hooks/useGenerationHistory';
import useSettings from '../hooks/useSettings';
import useExecutionQueue from '../hooks/useExecutionQueue';
import useWorkspaces from '../hooks/useWorkspaces';
import { IMAGE_PROCESSOR_CATEGORIES, IMAGE_PROCESSORS, IMAGE_TAGS, NODE_META, NODE_TYPES, WORKFLOWS, defaultProcessorParams } from '../utils/constants';
import { autoLayout } from '../utils/layout';
import { downloadJson, serializeCanvas } from '../utils/export';
import { copyNodes, hasClipboard, pasteNodes } from '../utils/clipboard';
import { loadPanelLayout, loadShowMinimap, onAnyConfigChanged, savePanelLayout } from '../utils/storage';
import { runProcessor } from '../utils/image-ops';

// 节点类型 -> 渲染组件
const NODE_COMPONENTS = {
  [NODE_TYPES.textToImage]: TextToImageNode,
  [NODE_TYPES.editImage]: EditImageNode,
  [NODE_TYPES.imageDisplay]: ImageDisplayNode,
  [NODE_TYPES.imageProcess]: ImageProcessNode,
  [NODE_TYPES.imageEditor]: ImageEditorNode,
  [NODE_TYPES.pixelEditor]: PixelEditorNode,
  [NODE_TYPES.note]: NoteNode,
};

// 右键菜单的节点类型列表（与 RightPanel 新增节点 tab 保持一致）
const ADD_NODE_ITEMS = [
  { type: NODE_TYPES.textToImage },
  { type: NODE_TYPES.editImage },
  { type: NODE_TYPES.imageDisplay },
  { type: NODE_TYPES.imageProcess },
  { type: NODE_TYPES.imageEditor },
  { type: NODE_TYPES.pixelEditor },
  { type: NODE_TYPES.note },
];

// 基于 nodes/edges 拓扑计算每个「图片接收节点」的输入图片。
// 参考 https://reactflow.dev/learn/advanced-use/computing-flows ：图是派生数据，nodes/edges 是真值。
// - 有连入边：input = 所有 source 节点产出图（output.images 优先，回退 data.images），覆盖手动值
// - 无连入边：不注入，保留节点自身 data.images（手动粘贴/上传）
// 这样连线 / 断开 / 上游重新生成 / 上游后上传 都能自动反映，无需在 onConnect 里手工推。
function computeInputImages(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const map = new Map(); // nodeId -> { images, isDisplay }
  for (const node of nodes) {
    // editImage / imageDisplay / imageProcess / imageEditor 都接收上游连线图片
    const isReceiver = node.type === NODE_TYPES.editImage
      || node.type === NODE_TYPES.imageDisplay
      || node.type === NODE_TYPES.imageProcess
      || node.type === NODE_TYPES.imageEditor
      || node.type === NODE_TYPES.pixelEditor;
    if (!isReceiver) continue;
    const incoming = edges.filter((e) => e.target === node.id);
    if (!incoming.length) continue;
    const upstream = [];
    for (const e of incoming) {
      const src = byId.get(e.source);
      if (!src) continue;
      const sd = src.data || {};
      const imgs = sd.output?.images?.length ? sd.output.images : sd.images || [];
      upstream.push(...imgs);
    }
    map.set(node.id, { images: upstream, isDisplay: node.type === NODE_TYPES.imageDisplay });
  }
  return map;
}

// 各节点默认尺寸（NodeResizer 需要节点有显式 width/height）
const DEFAULT_SIZE = {
  [NODE_TYPES.note]: { w: 200, h: 120 },
  [NODE_TYPES.imageDisplay]: { w: 260, h: 240 },
  [NODE_TYPES.pixelEditor]: { w: 300, h: 260 },
  default: { w: 290, h: 240 },
};

// 默认面板布局（react-resizable-panels@4: Layout = { [panelId]: percentage }）
const PANEL_ID_MAIN = 'canvas-main';
const PANEL_ID_RIGHT = 'canvas-right';
const DEFAULT_PANEL_LAYOUT = { [PANEL_ID_MAIN]: 72, [PANEL_ID_RIGHT]: 28 };

let seq = 0;
function genId(prefix) {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

// 图像处理任务的 AbortController 注册表（模块级，nodeId -> controller）。
// 用于取消正在进行的处理：handleProcessLocal 注册，handleCancelProcess abort。
// 不进节点 data（AbortController 不可序列化），仅用于运行时取消信号。
const processingControllers = new Map();

// tags 去重保序（图片展示节点 data.tags 用）
function dedupeTags(tags) {
  const seen = new Set();
  const out = [];
  for (const t of tags || []) {
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

// 每种节点的初始 data
function initialData(type) {
  if (type === NODE_TYPES.note) return { text: '' };
  if (type === NODE_TYPES.imageDisplay) return { images: [], source: '' };
  if (type === NODE_TYPES.imageProcess) {
    return {
      status: 'idle',
      output: { images: [] },
      uploadedImages: [],
      params: { processor: 'pixelate', processorParams: defaultProcessorParams('pixelate') },
    };
  }
  if (type === NODE_TYPES.imageEditor) {
    return { status: 'idle', output: { images: [] }, uploadedImages: [] };
  }
  if (type === NODE_TYPES.pixelEditor) {
    return { status: 'idle', output: { images: [] }, uploadedImages: [] };
  }
  const base = { status: 'idle', output: { images: [] }, uploadedImages: [] };
  return { ...base, params: { prompt: '', model: 'gpt-image-1', aspect: '1:1', size: '1k' } };
}

export default function Canvas() {
  // 工作区管理（activeId 驱动后续节点/历史的隔离加载）
  const { workspaces, activeId, createWorkspace, renameWorkspace, switchWorkspace, deleteWorkspace } = useWorkspaces();
  // hooks 依赖 activeId：切换工作区时自动重载该工作区的节点/历史
  const { nodes, edges, groups, loaded, setNodes, setEdges, setGroups, updateNodeData } = useCanvasState(activeId);
  const runWorkflow = useWorkflow();
  const { history, addHistory, removeHistory, clearHistory } = useGenerationHistory(activeId);
  const { settings, saveSettings } = useSettings();
  const [selectedId, setSelectedId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 执行队列：提交瞬间已创建 loading 占位节点（见 handleFormSubmit），
  // 完成后填充该占位节点（updateNodeData）而非新增节点；失败时占位节点显示错误。
  const { jobs, submit, cancel, clearFinished, runningCount } = useExecutionQueue({
    onComplete: (job, images) => {
      const tag = job.nodeType === NODE_TYPES.editImage ? IMAGE_TAGS.editImage : IMAGE_TAGS.textToImage;
      if (job.placeholderNodeId) {
        updateNodeData(job.placeholderNodeId, {
          images,
          source: 'queue',
          loading: false,
          error: undefined,
          tags: dedupeTags([...(job.tags || []), tag]),
        });
      } else {
        addImageNodesFromUrls(images, { tags: [tag] });
      }
      // 与节点内「生成」一致，把队列结果也写入生成记录
      addHistory({
        id: genId('hist'),
        nodeId: job.placeholderNodeId || null,
        nodeType: job.nodeType,
        prompt: job.input?.prompt || '',
        model: job.input?.model || '',
        images,
        createdAt: Date.now(),
      }).catch((e) => console.error('queue addHistory failed:', e));
    },
    onError: (job, err) => {
      // 失败时把占位节点标记为错误（参考 handleProcessImage 的错误处理）
      if (job.placeholderNodeId) {
        updateNodeData(job.placeholderNodeId, {
          loading: false,
          source: 'error',
          error: err?.message || String(err),
        });
      }
    },
  });
  // 节点表单弹窗（右侧新增节点 tab 触发，或节点工具栏【编辑】按钮触发）
  // { nodeType, initialImages } | null
  const [formState, setFormState] = useState(null);
  // 右键菜单位置：ContextMenu（Radix）自管浮层定位，这里只记录右键处的画布坐标，用于在该处建节点
  const [contextMenu, setContextMenu] = useState(null);
  // 拖拽连线到空白处放手的「添加节点」菜单：
  // { clientX, clientY, source, sourceHandle } | null
  const [dropNodeMenu, setDropNodeMenu] = useState(null);
  const reactFlow = useReactFlow();
  // 拖拽到画布时记录拖入的节点类型（参考 reactflow.dev drag-and-drop）
  const dragTypeRef = useRef(null);
  const wrappingRef = useRef(null);

  // 面板布局（持久化）
  const [panelLayout, setPanelLayout] = useState(() => loadPanelLayout() || DEFAULT_PANEL_LAYOUT);
  useEffect(() => {
    const unsub = onAnyConfigChanged((path, value) => {
      if (path === 'panel-layout.json') {
        if (value?.layout && typeof value.layout === 'object') setPanelLayout(value.layout);
        if (typeof value?.showMinimap === 'boolean') setShowMinimap(value.showMinimap);
      }
    });
    return () => { try { unsub(); } catch {} };
  }, []);

  // ReactFlow 直接以 useCanvasState 的 nodes/edges 为单一数据源。
  // applyNodeChanges 会处理 position/dimensions/remove 等所有变更类型，
  // 其中 dimensions 变更正是 NodeResizer 拖拽产生的，回写后节点尺寸持久化。
  const onNodesChange = useCallback((changes) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
  }, [setNodes]);

  const onEdgesChange = useCallback((changes) => {
    setEdges((prev) => applyEdgeChanges(changes, prev));
  }, [setEdges]);

  // 连线：拖单个 handle → 目标 handle。
  // 多选增强（参考 xyflow MultiConnect 示例）：若 source 节点处于选中态，
  // 把所有 selected 节点都连到 target（去重，已有连线不重复加）。
  const onConnect = useCallback((conn) => {
    setEdges((prev) => {
      const sources = nodes.some((n) => n.id === conn.source && n.selected)
        ? nodes.filter((n) => n.selected).map((n) => n.id)
        : [conn.source];
      let next = prev;
      const existing = new Set(prev.map((e) => `${e.source}->${e.target}`));
      for (const source of sources) {
        const key = `${source}->${conn.target}`;
        if (existing.has(key)) continue;
        existing.add(key);
        next = addEdge(
          {
            source,
            target: conn.target,
            sourceHandle: conn.sourceHandle,
            targetHandle: conn.targetHandle,
            markerEnd: { type: MarkerType.ArrowClosed },
            animated: true,
          },
          next,
        );
      }
      return next;
    });
  }, [nodes, setEdges]);

  // 连线拖到空白处放手（未命中有效 target）：弹出「添加节点」菜单，
  // 用户选择类型后在落点创建节点并自动与起点连接。
  // 参考 xyflow AddNodeOnEdgeDrop 示例（onConnectEnd + connectionState.isValid）。
  const onConnectEnd = useCallback((event, connectionState) => {
    if (connectionState.isValid) return; // 正常命中 target，交给 onConnect
    if (!connectionState.fromNode) return;
    const { clientX, clientY } = 'changedTouches' in event ? event.changedTouches[0] : event;
    setDropNodeMenu({
      clientX, clientY,
      source: connectionState.fromNode.id,
      sourceHandle: connectionState.fromHandle?.id ?? null,
    });
  }, []);

  // 选中数量（>1 时表示多选；用于 NodeShell 隐藏单节点 toolbar）
  const [selectionCount, setSelectionCount] = useState(0);
  // MiniMap 显示开关（Controls 上的按钮切换），默认显示
  // MiniMap 显示开关（持久化到 panel-layout.json，刷新后恢复）
  const [showMinimap, setShowMinimap] = useState(() => loadShowMinimap());
  const onSelectionChange = useCallback(({ nodes: selNodes }) => {
    setSelectedId(selNodes.length === 1 ? selNodes[0].id : null);
    setSelectionCount(selNodes.length);
  }, []);

  // 键盘删除节点：Backspace / Delete（v12 默认含 Backspace，显式补 Delete）
  const deleteKeyCode = useMemo(() => (['Backspace', 'Delete']), []);

  // 节点删除时同步清理相关连线 + 分组里悬空的 childNodeIds 引用
  const onNodesDelete = useCallback((deleted) => {
    if (!deleted?.length) return;
    const ids = new Set(deleted.map((n) => n.id));
    setEdges((prev) => prev.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
    setGroups((prev) => prev.map((g) => ({
      ...g,
      childNodeIds: g.childNodeIds.filter((id) => !ids.has(id)),
    })));
  }, [setEdges, setGroups]);

  // 节点内部更新 data 的回调（注入到 data.onUpdate）
  const makeOnUpdate = useCallback((nodeId) => (patch) => {
    updateNodeData(nodeId, patch);
  }, [updateNodeData]);

  // 节点点击"生成"：优先用设置页配置的工作流 ID，fallback 到节点传的 workflowId
  const handleGenerate = useCallback(async (nodeId, nodeType, { workflowId, input }) => {
    const settingId = nodeType === NODE_TYPES.textToImage
      ? settings.textToImageWorkflowId
      : nodeType === NODE_TYPES.editImage
        ? settings.editImageWorkflowId
        : workflowId;
    const finalWorkflowId = settingId || workflowId;
    updateNodeData(nodeId, { status: 'running', error: undefined });
    try {
      const { urls } = await runWorkflow(finalWorkflowId, input, nodeId);
      if (!urls.length) throw new Error('未返回图片');
      updateNodeData(nodeId, { status: 'done', output: { images: urls } });
      // 下游图片由 decoratedNodes 的 computeInputImages 自动派生（连线变化/重新生成都会重算），无需手工推
      addHistory({
        id: genId('hist'),
        nodeId,
        nodeType,
        prompt: input?.prompt || '',
        model: input?.model || '',
        images: urls,
        createdAt: Date.now(),
      }).catch((e) => console.error('addHistory failed:', e));
    } catch (err) {
      console.error('generate failed:', err);
      updateNodeData(nodeId, { status: 'error', error: err?.message || String(err) });
    }
  }, [runWorkflow, updateNodeData, addHistory, settings]);

  // 添加节点：显式 width/height（NodeResizer 依赖）
  // 创建节点到指定位置（点击添加 / 拖拽放下共用）
  // dataPatch: 可选，覆盖/扩展初始 data（如预填 loading/images）
  const createNodeAt = useCallback((type, position, dataPatch) => {
    const id = genId(type);
    const meta = NODE_META[type] || {};
    const size = DEFAULT_SIZE[type] || DEFAULT_SIZE.default;
    const node = {
      id,
      type,
      position: position || { x: 120 + nodes.length * 30, y: 120 + nodes.length * 30 },
      width: size.w,
      height: size.h,
      style: { width: size.w, height: size.h },
      data: { ...initialData(type), label: meta.label, ...(dataPatch || {}) },
    };
    setNodes((prev) => [...prev, node]);
    return id;
  }, [nodes.length, setNodes]);

  // 「添加节点」菜单选中类型后：在落点创建节点（居中），并连一条 edge
  // （必须在 createNodeAt 之后定义，否则 useCallback deps 会触发 TDZ）
  const handleAddAtDrop = useCallback((type, dataPatch) => {
    setDropNodeMenu((cur) => {
      if (!cur) return null;
      const flow = reactFlow.screenToFlowPosition({ x: cur.clientX, y: cur.clientY });
      const size = DEFAULT_SIZE[type] || DEFAULT_SIZE.default;
      // 节点中心落在落点
      const position = { x: flow.x - size.w / 2, y: flow.y - size.h / 2 };
      const newId = createNodeAt(type, position, dataPatch);
      setEdges((prev) => {
        const key = `${cur.source}->${newId}`;
        if (prev.some((e) => `${e.source}->${e.target}` === key)) return prev;
        return addEdge(
          {
            source: cur.source,
            target: newId,
            sourceHandle: cur.sourceHandle,
            markerEnd: { type: MarkerType.ArrowClosed },
            animated: true,
          },
          prev,
        );
      });
      return null; // 关闭菜单
    });
  }, [reactFlow, createNodeAt, setEdges]);

  // 点击添加（默认位置，偏移错落）
  const handleAdd = useCallback((type) => {
    createNodeAt(type, null);
  }, [createNodeAt]);

  // 拖拽起始（右侧新增节点列表的 button 上 onDragStart 调用）—— 记录类型
  const handleDragStartNode = useCallback((type, event) => {
    dragTypeRef.current = type;
    // 设置一个透明拖拽影像，避免浏览器默认难看的 ghost
    event.dataTransfer.setData('application/reactflow', type);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  // 拖拽经过画布：必须 preventDefault 才能触发 drop（图片和节点类型都要放行）
  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // 系统图片文件拖入画布：在落点建图片展示节点（loading 占位），
  // 串行上传到后端（window.AgentSpaces.uploadFile 拿 http URL），完成后刷新为图片
  const handleDropFiles = useCallback(async (fileList, position) => {
    const files = Array.from(fileList || []).filter((f) => f.type?.startsWith('image/'));
    if (!files.length) return;
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) return;

    const size = DEFAULT_SIZE[NODE_TYPES.imageDisplay];
    const gap = 20; // 节点间距
    const cols = 3; // 每行最多 3 个
    // 每张图一个节点，按落点 + 完整节点尺寸错落排列，避免重叠
    const ids = [];
    setNodes((prev) => {
      const base = prev.length;
      const additions = files.map((_, i) => {
        const id = genId(NODE_TYPES.imageDisplay);
        ids.push(id);
        const col = i % cols;
        const row = Math.floor(i / cols);
        return {
          id,
          type: NODE_TYPES.imageDisplay,
          position: {
            // 落点表示节点中心：第一张图中心对齐鼠标位置，其余按网格错落
            x: (position?.x || 120) + col * (size.w + gap) - size.w / 2,
            y: (position?.y || 120) + row * (size.h + gap) - size.h / 2,
          },
          width: size.w, height: size.h,
          style: { width: size.w, height: size.h },
          data: { ...initialData(NODE_TYPES.imageDisplay), source: 'upload', loading: true, images: [], tags: [IMAGE_TAGS.upload], label: NODE_META[NODE_TYPES.imageDisplay].label },
        };
      });
      return [...prev, ...additions];
    });

    // 串行上传，每张完成即刷新对应节点
    files.forEach((file, i) => {
      AS.uploadFile(file)
        .then((uploaded) => {
          const httpUrl = uploaded?.url || uploaded?.httpPath;
          if (!httpUrl) throw new Error('上传未返回 URL');
          updateNodeData(ids[i], { images: [httpUrl], loading: false, source: 'upload' });
        })
        .catch((err) => {
          console.error('drop upload failed:', err);
          updateNodeData(ids[i], { loading: false, source: 'error', error: `上传失败：${err?.message || String(err)}` });
        });
    });
  }, [setNodes, updateNodeData]);

  // 放下：区分节点类型（application/reactflow）和系统图片文件
  const handleDrop = useCallback((event) => {
    event.preventDefault();
    // 系统图片文件拖入：上传 + 展示
    if (event.dataTransfer.files?.length) {
      const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      handleDropFiles(event.dataTransfer.files, position);
      return;
    }
    // 节点拖入：用 screenToFlowPosition 把鼠标坐标转成画布坐标，创建节点
    const type = event.dataTransfer.getData('application/reactflow') || dragTypeRef.current;
    dragTypeRef.current = null;
    if (!type) return;
    const position = reactFlow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    createNodeAt(type, position);
  }, [reactFlow, createNodeAt, handleDropFiles]);

  // 画布右键：用 ContextMenu（Radix）原生管理浮层，这里只记录右键处的画布坐标供建节点。
  // ContextMenuTrigger 自带 onContextMenu 阻止浏览器默认菜单，无需手写。
  const handleContextMenu = useCallback((event) => {
    const flow = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setContextMenu({ flowX: flow.x, flowY: flow.y });
  }, [reactFlow]);

  // 右键菜单点击某节点类型：在右键位置创建节点。
  // dataPatch: 可选，覆盖/扩展初始 data（如预选某个图像处理器）。
  const handleAddAtMenu = useCallback((type, dataPatch) => {
    const pos = contextMenu
      ? { x: contextMenu.flowX, y: contextMenu.flowY }
      : null;
    createNodeAt(type, pos, dataPatch);
    setContextMenu(null);
  }, [contextMenu, createNodeAt]);

  const handleClear = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setGroups([]);
    setSelectedId(null);
  }, [setNodes, setEdges, setGroups]);

  // 删除单个节点（含相关连线）
  const handleDeleteNode = useCallback((nodeId) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedId === nodeId) setSelectedId(null);
  }, [setNodes, setEdges, selectedId]);

  // 选中并聚焦节点：设置 ReactFlow 原生 node.selected（触发选中样式 + NodeResizer 显示）
  // + setCenter 把视口居中到节点 + 同步面板高亮。
  // 参考 workflow-node-list-panel.tsx：点击列表项应让画布选中并居中对应节点。
  // 注意：不在 decoratedNodes 里覆盖 selected（见 decoratedNodes 注释 / handoff 第1条），
  // 这里改的是 useCanvasState 的真值 nodes，decoratedNodes 经 ...nd 展开会自然带过去。
  const focusNode = useCallback((nodeId) => {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target) return;
    setNodes((prev) => prev.map((n) => ({ ...n, selected: n.id === nodeId })));
    const w = target.width || target.style?.width || 280;
    const h = target.height || target.style?.height || 220;
    reactFlow.setCenter(target.position.x + w / 2, target.position.y + h / 2, { zoom: 1, duration: 400 });
    setSelectedId(nodeId);
  }, [nodes, setNodes, reactFlow]);

  // 点击列表项：选中 + 聚焦
  const handleSelectNode = useCallback((nodeId) => {
    focusNode(nodeId);
  }, [focusNode]);

  // 定位按钮：同选中 + 聚焦（行为与点击列表项一致）
  const handleLocateNode = useCallback((nodeId) => {
    focusNode(nodeId);
  }, [focusNode]);

  // 自动布局（dagre）
  const handleAutoLayout = useCallback(() => {
    setNodes((prev) => autoLayout(prev, edges));
  }, [edges, setNodes]);

  // 导出画布 JSON
  const handleExport = useCallback(() => {
    downloadJson(serializeCanvas(nodes, edges));
  }, [nodes, edges]);

  // 队列任务完成后：每张图生成一个独立的图片展示节点，错落排列
  // opts.tags: 来源标签数组（存入节点 data.tags）
  // opts.source: 来源标记（默认 'queue'）
  const addImageNodesFromUrls = useCallback((urls, opts = {}) => {
    if (!urls?.length) return;
    const size = DEFAULT_SIZE[NODE_TYPES.imageDisplay];
    const meta = NODE_META[NODE_TYPES.imageDisplay];
    const source = opts.source || 'queue';
    const tags = dedupeTags(opts.tags);
    setNodes((prev) => {
      const base = prev.length;
      const additions = urls.map((url, i) => ({
        id: genId(NODE_TYPES.imageDisplay),
        type: NODE_TYPES.imageDisplay,
        position: { x: 420 + (i % 3) * (size.w + 20), y: 120 + Math.floor(i / 3) * (size.h + 20) + base * 10 },
        width: size.w, height: size.h,
        style: { width: size.w, height: size.h },
        data: { ...initialData(NODE_TYPES.imageDisplay), images: [url], source, tags, label: meta.label },
      }));
      return [...prev, ...additions];
    });
  }, [setNodes]);

  // —— 导出图片：单图直接加节点；多图分组（复用 workflow-editor 的 WorkflowGroup 数据结构 + WorkflowGroupOverlay 渲染）——
  // 多图时创建若干 imageDisplay 子节点 + 一条 group 数据（childNodeIds 关联子节点），
  // 分组名 = 来源节点名 + 时间。group 不作为 ReactFlow 节点，而是由 WorkflowGroupOverlay（在
  // ViewportPortal 内）按子节点包围盒自动贴合渲染，与宿主 workflow 编辑器完全同源。
  const handleExportImages = useCallback((sourceNode, imgs) => {
    if (!imgs?.length) return;
    // 单图：保持原行为，直接加一个独立图片节点（不分组）
    if (imgs.length === 1) {
      addImageNodesFromUrls(imgs, { tags: [IMAGE_TAGS.export] });
      return;
    }
    // 多图：分组。子节点网格排列在画布空白区
    const size = DEFAULT_SIZE[NODE_TYPES.imageDisplay];
    const meta = NODE_META[NODE_TYPES.imageDisplay];
    const cols = Math.min(3, imgs.length);
    const tags = dedupeTags([IMAGE_TAGS.export]);
    // 分组名：来源节点名 + 时间（HH:mm）
    const srcLabel = sourceNode ? (NODE_META[sourceNode.type]?.label || '导出') : '导出';
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const groupName = `${srcLabel} 导出 ${hh}:${mm}`;

    // 子节点先入画布，拿到它们的 id 再建 group
    const childIds = imgs.map(() => genId(NODE_TYPES.imageDisplay));
    setNodes((prev) => {
      const base = prev.length;
      const startX = 420 + base * 6;
      const startY = 120;
      const additions = imgs.map((url, i) => {
        const id = childIds[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        return {
          id,
          type: NODE_TYPES.imageDisplay,
          position: { x: startX + col * (size.w + 20), y: startY + row * (size.h + 20) },
          width: size.w, height: size.h,
          style: { width: size.w, height: size.h },
          data: { ...initialData(NODE_TYPES.imageDisplay), images: [url], source: 'export', tags, label: meta.label },
        };
      });
      return [...prev, ...additions];
    });
    // 新增一条 group 数据（WorkflowGroup 结构）
    setGroups((prev) => [...prev, {
      id: genId('group'),
      name: groupName,
      childNodeIds: childIds,
      childGroupIds: [],
      locked: false,
      disabled: false,
      savedNodeStates: {},
    }]);
  }, [addImageNodesFromUrls, setNodes, setGroups]);

  // 删除分组（仅删 group 数据，保留其中的图片子节点）
  const deleteGroup = useCallback((groupId) => {
    if (!groupId) return;
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }, [setGroups]);

  // 更新分组（重命名/颜色/锁定等，WorkflowGroupOverlay 回调）
  const updateGroup = useCallback((groupId, updates) => {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, ...updates } : g)));
  }, [setGroups]);

  // 合并选中节点为一个分组（底部 toolbar 触发）：取当前选中节点 id 建 group 数据，
  // 分组名 = 「分组 N」（N = 当前分组数 + 1）。建完清空选中，避免工具栏持续显示。
  const createGroupFromSelection = useCallback(() => {
    const ids = nodes.filter((n) => n.selected).map((n) => n.id);
    if (ids.length < 2) return;
    const name = `分组 ${groups.length + 1}`;
    setGroups((prev) => [...prev, {
      id: genId('group'),
      name,
      childNodeIds: ids,
      childGroupIds: [],
      locked: false,
      disabled: false,
      savedNodeStates: {},
    }]);
    // 清空选中（ReactFlow 原生：把所有节点 selected 置 false）
    setNodes((prev) => prev.map((n) => (n.selected ? { ...n, selected: false } : n)));
  }, [nodes, groups.length, setGroups, setNodes]);

  // —— 对齐分布选中节点（底部 toolbar 触发）——
  // mode: left/right/top/bottom/center-h/center-v（对齐）| h-dist/v-dist（等距分布）
  // 节点宽高取 style 或顶层 width/height（NodeResizer 要求），兜底 200x100。
  const nodeSize = (n) => ({
    w: n.width || n.style?.width || 200,
    h: n.height || n.style?.height || 100,
  });
  const alignDistribute = useCallback((mode) => {
    const sel = nodes.filter((n) => n.selected);
    if (sel.length < 2) return;
    const ids = new Set(sel.map((n) => n.id));
    // 参考值（均值 / 极值），分布需排序后按序号重排
    if (mode === 'left') {
      const m = Math.min(...sel.map((n) => n.position.x));
      setNodes((p) => p.map((n) => ids.has(n.id) ? { ...n, position: { ...n.position, x: m } } : n));
    } else if (mode === 'right') {
      const m = Math.min(...sel.map((n) => n.position.x + nodeSize(n).w));
      setNodes((p) => p.map((n) => ids.has(n.id) ? { ...n, position: { ...n.position, x: m - nodeSize(n).w } } : n));
    } else if (mode === 'top') {
      const m = Math.min(...sel.map((n) => n.position.y));
      setNodes((p) => p.map((n) => ids.has(n.id) ? { ...n, position: { ...n.position, y: m } } : n));
    } else if (mode === 'bottom') {
      const m = Math.max(...sel.map((n) => n.position.y + nodeSize(n).h));
      setNodes((p) => p.map((n) => ids.has(n.id) ? { ...n, position: { ...n.position, y: m - nodeSize(n).h } } : n));
    } else if (mode === 'center-h') {
      const m = sel.reduce((s, n) => s + n.position.x + nodeSize(n).w / 2, 0) / sel.length;
      setNodes((p) => p.map((n) => ids.has(n.id) ? { ...n, position: { ...n.position, x: m - nodeSize(n).w / 2 } } : n));
    } else if (mode === 'center-v') {
      const m = sel.reduce((s, n) => s + n.position.y + nodeSize(n).h / 2, 0) / sel.length;
      setNodes((p) => p.map((n) => ids.has(n.id) ? { ...n, position: { ...n.position, y: m - nodeSize(n).h / 2 } } : n));
    } else if (mode === 'h-dist') {
      // 水平等距分布：按 x 排序，首尾不动，中间均分
      const sorted = [...sel].sort((a, b) => a.position.x - b.position.x);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const start = first.position.x + nodeSize(first).w;
      const end = last.position.x;
      const span = end - start;
      const gap = sorted.length > 2 ? span / (sorted.length - 1) : 0;
      let cursor = start;
      const newById = new Map();
      sorted.forEach((n, i) => {
        if (i === 0 || i === sorted.length - 1) return;
        newById.set(n.id, cursor);
        cursor += gap + nodeSize(n).w;
      });
      setNodes((p) => p.map((n) => {
        if (!newById.has(n.id)) return n;
        return { ...n, position: { ...n.position, x: newById.get(n.id) } };
      }));
    } else if (mode === 'v-dist') {
      const sorted = [...sel].sort((a, b) => a.position.y - b.position.y);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const start = first.position.y + nodeSize(first).h;
      const end = last.position.y;
      const span = end - start;
      const gap = sorted.length > 2 ? span / (sorted.length - 1) : 0;
      let cursor = start;
      const newById = new Map();
      sorted.forEach((n, i) => {
        if (i === 0 || i === sorted.length - 1) return;
        newById.set(n.id, cursor);
        cursor += gap + nodeSize(n).h;
      });
      setNodes((p) => p.map((n) => {
        if (!newById.has(n.id)) return n;
        return { ...n, position: { ...n.position, y: newById.get(n.id) } };
      }));
    }
  }, [nodes, setNodes]);

  // 批量删除选中节点（含相关边 + 清理 groups 悬空引用），删完清空选中
  const deleteSelectedNodes = useCallback(() => {
    const ids = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    if (ids.size === 0) return;
    setNodes((prev) => prev.filter((n) => !ids.has(n.id)));
    setEdges((prev) => prev.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
    setGroups((prev) => prev.map((g) => ({ ...g, childNodeIds: g.childNodeIds.filter((id) => !ids.has(id)) })));
    setSelectedId(null);
  }, [nodes, setNodes, setEdges, setGroups]);

  // 生成记录「用作输入」
  const handleUseImage = useCallback((url) => {
    addImageNodesFromUrls([url], { tags: [IMAGE_TAGS.history] });
  }, [addImageNodesFromUrls]);

  // —— 复制粘贴节点（Ctrl+C / Ctrl+V）——
  // 剪贴板为模块级内存（utils/clipboard.js），切换工作区后仍可粘贴 → 跨工作区复制。
  // 焦点在 input/textarea/contenteditable 时不拦截，让浏览器走原生复制/粘贴。
  const handleCopy = useCallback(() => {
    const selected = nodes.filter((n) => n.selected);
    if (!selected.length) return;
    copyNodes(selected, edges);
  }, [nodes, edges]);

  const handlePaste = useCallback(() => {
    if (!hasClipboard()) return;
    const result = pasteNodes({ genId });
    if (!result) return;
    setNodes((prev) => [...prev, ...result.nodes]);
    setEdges((prev) => [...prev, ...result.edges]);
  }, [setNodes, setEdges]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const t = e.target;
      const tag = t?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || t?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || isEditable) return;
      if (e.key === 'c' || e.key === 'C') {
        const selected = nodes.filter((n) => n.selected);
        if (selected.length) { e.preventDefault(); handleCopy(); }
      } else if (e.key === 'v' || e.key === 'V') {
        if (hasClipboard()) { e.preventDefault(); handlePaste(); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nodes, handleCopy, handlePaste]);

  // 图片加载完成后自动调整节点尺寸：按图片自然宽高比 + 节点内边距，
  // 在 [minW, maxW] 范围内取合适宽度，按比例算高度，让图片完整展示。
  // 由图片展示节点 <img onLoad> 触发。
  const handleAutoSize = useCallback((nodeId, naturalWidth, naturalHeight) => {
    if (!naturalWidth || !naturalHeight) return;
    const minW = 220, maxW = 520;
    // 节点内边距（左右）+ 下方来源/按钮行高度 + 标题栏高度
    const padX = 32, chromeH = 80;
    // 以自然宽度为基准，但限制在 [minW, maxW]
    const w = Math.max(minW, Math.min(maxW, Math.round(naturalWidth)));
    // 图片区域高度（max 320），加上 chrome 高度得到节点高度
    const imgH = Math.min(320, Math.round((w - padX) * naturalHeight / naturalWidth));
    const h = Math.max(160, imgH + chromeH);
    setNodes((prev) => prev.map((nd) => {
      if (nd.id !== nodeId) return nd;
      return { ...nd, width: w, height: h, style: { ...nd.style, width: w, height: h } };
    }));
  }, [setNodes]);

  // 首次内容高度自适应：由 NodeShell 用 ResizeObserver 测得「标题栏+内容区」真实高度后上报。
  // 仅在节点首次挂载触发一次（NodeShell 端 disconnect），用户后续手动 NodeResizer 拖拽不会被覆盖。
  // 保留原 width，只更新 height；限幅 [120, 800] 避免异常值。
  const handleAutoSizeToContent = useCallback((nodeId, height) => {
    const h = Math.max(120, Math.min(800, Math.round(height)));
    setNodes((prev) => prev.map((nd) => {
      if (nd.id !== nodeId) return nd;
      return { ...nd, height: h, style: { ...nd.style, height: h } };
    }));
  }, [setNodes]);

  // 从右侧表单弹窗提交：根据 nodeType 用 settings 的工作流 ID。
  // 参考 handleProcessImage：提交瞬间即创建 loading 占位节点，工作流跑完后填充该节点，
  // 而非等工作流跑完才插入图片。tag 按节点类型区分（文生图/编辑图片）。
  const handleFormSubmit = useCallback((task) => {
    const workflowId = task.nodeType === NODE_TYPES.textToImage
      ? (settings.textToImageWorkflowId || WORKFLOWS.text_to_image)
      : (settings.editImageWorkflowId || WORKFLOWS.edit_image);
    const tag = task.nodeType === NODE_TYPES.editImage ? IMAGE_TAGS.editImage : IMAGE_TAGS.textToImage;
    // 创建 loading 占位节点（图片展示），完成后由 onComplete 填充
    const placeholderNodeId = createNodeAt(
      NODE_TYPES.imageDisplay,
      null,
      { images: [], source: 'queue', loading: true, error: undefined, tags: [tag] },
    );
    submit({ ...task, workflowId, placeholderNodeId, tags: [tag] });
  }, [settings, submit, createNodeAt]);

  // 节点工具栏「抠图」「放大」：调用抠图和放大工作流（image_enchanter），
  // 把处理后的图片作为独立图片展示节点加到画布，并写入生成记录。
  // 多图批量：image_enchanter 工作流 input 为单图 image_url，对每张图并发调用，合并所有产出。
  // processType: 'segment'(抠图) | 'enhance'(放大)
  const handleProcessImage = useCallback(async (sourceImages, processType) => {
    if (!sourceImages?.length) return;
    const workflowId = settings.imageEnchanterWorkflowId || WORKFLOWS.image_enchanter;
    const tag = processType === 'segment' ? IMAGE_TAGS.segment : IMAGE_TAGS.enhance;
    // 结果节点：loading 占位，完成后刷新为结果图
    const resultId = createNodeAt(NODE_TYPES.imageDisplay, null);
    updateNodeData(resultId, { images: [], source: 'processing', loading: true, error: undefined, tags: [tag] });
    try {
      // 批量并发：每张图一次工作流调用（input 是单图）
      const results = await Promise.allSettled(
        sourceImages.map((url) =>
          runWorkflow(workflowId, { image_url: url, process_type: processType }, resultId)
            .then(({ urls }) => urls || []),
        ),
      );
      const allUrls = results
        .filter((r) => r.status === 'fulfilled')
        .flatMap((r) => r.value)
        .filter(Boolean);
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (!allUrls.length) throw new Error(failed ? `${failed} 张图片处理全部失败` : '未返回图片');
      updateNodeData(resultId, {
        images: allUrls,
        source: processType === 'segment' ? 'segment' : 'enhance',
        loading: false,
        error: failed ? `${failed} 张失败` : undefined,
        tags: [tag],
      });
      addHistory({
        id: genId('hist'),
        nodeId: null,
        nodeType: NODE_TYPES.imageDisplay,
        prompt: processType === 'segment' ? '抠图' : '放大',
        model: 'image_enchanter',
        images: allUrls,
        createdAt: Date.now(),
      }).catch((e) => console.error('processImage addHistory failed:', e));
    } catch (err) {
      console.error('processImage failed:', err);
      updateNodeData(resultId, { source: 'error', loading: false, error: err?.message || String(err) });
    }
  }, [settings, runWorkflow, createNodeAt, updateNodeData, addHistory]);

  // 图像处理节点「执行」：调本地算法（utils/image-ops），不走工作流。
  // 流程：上游 URL → runProcessor（内部按需 CDN 加载库）→ 产出 http URL → 回填本节点 data.output.images。
  // processorId 对应 IMAGE_PROCESSORS 的 id；sourceImages 由节点传入（连线派生的 data.images）。
  //
  // 取消机制：用模块级 AbortController Map 跟踪每个节点的处理任务，Promise.race 让取消信号先 resolve，
  // UI 立即解除「处理中」。底层 fetch 无法真正中断（CDN 跨域 fetch 不支持 abort），结果会丢弃。
  const handleProcessLocal = useCallback(async (nodeId, processorId, processorParams, sourceImages) => {
    if (!sourceImages?.length) return;
    // 清理旧 controller（同节点重复执行时覆盖）
    processingControllers.get(nodeId)?.abort();
    const controller = new AbortController();
    processingControllers.set(nodeId, controller);

    updateNodeData(nodeId, { status: 'running', error: undefined, output: { images: [] } });
    try {
      const urls = await runProcessor(processorId, sourceImages, processorParams || {});
      // 取消竞速：被取消则丢弃结果
      if (controller.signal.aborted) return;
      if (!urls.length) throw new Error('处理未返回图片');
      updateNodeData(nodeId, { status: 'done', output: { images: urls } });
      addHistory({
        id: genId('hist'),
        nodeId,
        nodeType: NODE_TYPES.imageProcess,
        prompt: processorId,
        model: 'local',
        images: urls,
        createdAt: Date.now(),
      }).catch((e) => console.error('processLocal addHistory failed:', e));
    } catch (err) {
      if (controller.signal.aborted) return; // 已取消，不报错
      console.error('processLocal failed:', err);
      updateNodeData(nodeId, { status: 'error', error: err?.message || String(err) });
    } finally {
      // 只在未被取消覆盖时清理 controller（取消时 handleCancelProcess 已清理）
      if (processingControllers.get(nodeId) === controller) {
        processingControllers.delete(nodeId);
      }
    }
  }, [updateNodeData, addHistory]);

  // 取消图像处理：abort signal + 置 status='cancelled'（写入节点 data，可观测/持久化）。
  // 底层任务继续跑但结果会被 handleProcessLocal 的 aborted 检查丢弃。
  const handleCancelProcess = useCallback((nodeId) => {
    const controller = processingControllers.get(nodeId);
    if (controller) {
      controller.abort();
      processingControllers.delete(nodeId);
    }
    updateNodeData(nodeId, { status: 'cancelled', error: undefined });
  }, [updateNodeData]);

  // 给每个节点的 data 注入 onUpdate / onGenerate / onExportImages / onProcessImage（节点内部需要）。
  // 注意：不要覆盖 node.selected —— 选中状态由 ReactFlow 通过 onNodesChange 的
  // selection 变更 + applyNodeChanges 自行管理；这里强行赋值会破坏点击选中/删除机制。
  // 对「图片接收节点」(editImage/imageDisplay)，有连入边时用 computeInputImages 派生输入图片覆盖 data.images，
  // 无连入边时保留节点自身手动值（粘贴/上传）。ImageDisplay 同时置 source='upstream' 让 UI 区分来源。
  const upstreamMap = useMemo(() => computeInputImages(nodes, edges), [nodes, edges]);
  const decoratedNodes = useMemo(
    () => nodes.map((nd) => {
      const up = upstreamMap.get(nd.id);
      const data = { ...nd.data };
      if (up) {
        data.images = up.images;
        if (up.isDisplay) {
          data.source = 'upstream';
          // 连线派生时补「连线」标签（保留节点原有 tags，去重）
          data.tags = dedupeTags([...(nd.data?.tags || []), IMAGE_TAGS.upstream]);
        }
      }
      return {
        ...nd,
        // 图片展示节点：限定只能从 .image-drag-handle 拖动（图片区域可点选/看大图不触发拖拽）
        dragHandle: nd.type === NODE_TYPES.imageDisplay ? '.image-drag-handle' : nd.dragHandle,
        data: {
          ...data,
          // 当前选中节点总数：多选时隐藏节点 toolbar（避免多选时每个节点都冒出工具栏）
          selectionCount,
          onUpdate: makeOnUpdate(nd.id),
          onGenerate: handleGenerate,
          onExportImages: (imgs) => handleExportImages(nd, imgs),
          onProcessImage: handleProcessImage,
          onProcessLocal: handleProcessLocal,
          onCancelProcess: handleCancelProcess,
          // 工具栏【编辑】按钮：打开编辑图片弹窗，预填当前节点图片
          onEditImages: (imgs) => setFormState({ nodeType: NODE_TYPES.editImage, initialImages: imgs }),
          // 图片加载完成自动调整节点尺寸（仅图片展示节点用）
          onAutoSize: handleAutoSize,
          // 首次内容高度自适应（NodeShell 测量真实表单高度后上报一次）
          onAutoSizeToContent: handleAutoSizeToContent,
        },
      };
    }),
    [nodes, upstreamMap, makeOnUpdate, handleGenerate, handleExportImages, handleProcessImage, handleProcessLocal, handleCancelProcess, handleAutoSize, handleAutoSizeToContent, selectionCount],
  );

  // 分组 overlay 的子节点映射 + 选中态（WorkflowGroupOverlay 需要的 childNodes/isSelected）
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const groupOverlayItems = useMemo(() => groups.map((group) => ({
    group,
    childNodes: nodes
      .filter((n) => group.childNodeIds.includes(n.id))
      .map((n) => ({ id: n.id, position: n.position, width: n.width, height: n.height })),
  })), [groups, nodes]);

  // 拖拽分组时屏幕坐标差 → 画布坐标差（WorkflowGroupOverlay.onMove 需要）
  const screenDeltaToFlowDelta = useCallback((delta) => {
    const a = reactFlow.screenToFlowPosition({ x: 0, y: 0 });
    const b = reactFlow.screenToFlowPosition({ x: delta.x, y: delta.y });
    return { x: b.x - a.x, y: b.y - a.y };
  }, [reactFlow]);

  // 拖拽分组：把整组（含子组）按 delta 平移
  const handleGroupMove = useCallback((groupId, delta) => {
    if (!delta || (delta.x === 0 && delta.y === 0)) return;
    // 收集该组及子组所有子节点 id（WorkflowGroup 支持嵌套）
    const collectIds = (gid, visited = new Set()) => {
      if (visited.has(gid)) return [];
      visited.add(gid);
      const g = groups.find((x) => x.id === gid);
      if (!g) return [];
      return [...g.childNodeIds, ...g.childGroupIds.flatMap((cg) => collectIds(cg, visited))];
    };
    const ids = new Set(collectIds(groupId));
    setNodes((prev) => prev.map((n) => ids.has(n.id)
      ? { ...n, position: { x: n.position.x + delta.x, y: n.position.y + delta.y } }
      : n));
  }, [groups, setNodes]);

  // 分组输出连线：从 group 手柄拖到 targetNodeId 松手时，把组内「末端叶子节点」的输出
  // 连到 targetNodeId。叶子 = 在组范围内没有下游（出边 target 不在组内）的节点。
  // 多选增强（复用 onConnect 语义）：一次建多条边（去重，已有连线不重复加）。
  const handleGroupConnect = useCallback((groupId, targetNodeId) => {
    setEdges((prev) => {
      const g = groups.find((x) => x.id === groupId);
      if (!g) return prev;
      // 收集该组及子组所有子节点 id（复用 collectIds 同款递归，内联避免依赖 handleGroupMove 闭包）
      const groupIds = new Set();
      const collect = (gid, visited = new Set()) => {
        if (visited.has(gid)) return;
        visited.add(gid);
        const cur = groups.find((x) => x.id === gid);
        if (!cur) return;
        cur.childNodeIds.forEach((id) => groupIds.add(id));
        cur.childGroupIds.forEach((cg) => collect(cg, visited));
      };
      collect(groupId);
      // 目标不能是组内节点（否则自连）
      if (groupIds.has(targetNodeId)) return prev;
      // 叶子节点：组内节点中，没有出边 target 也在组内的
      const hasInternalDownstream = (nodeId) => prev.some((e) => e.source === nodeId && groupIds.has(e.target));
      const leafIds = [...groupIds].filter((id) => !hasInternalDownstream(id));
      if (!leafIds.length) return prev;
      const existing = new Set(prev.map((e) => `${e.source}->${e.target}`));
      let next = prev;
      for (const source of leafIds) {
        const key = `${source}->${targetNodeId}`;
        if (existing.has(key)) continue;
        existing.add(key);
        next = addEdge(
          {
            source,
            target: targetNodeId,
            markerEnd: { type: MarkerType.ArrowClosed },
            animated: true,
          },
          next,
        );
      }
      return next;
    });
  }, [groups, setEdges]);

  // 面板布局变化 -> 持久化
  // 面板布局变化 -> 持久化（同时带上当前 showMinimap，避免覆盖）
  const handlePanelLayoutChange = useCallback((layout) => {
    setPanelLayout(layout);
    savePanelLayout(layout, { showMinimap });
  }, [showMinimap]);

  // 切换 MiniMap 显隐 -> 持久化（同时带上当前 layout）
  const toggleMinimap = useCallback(() => {
    setShowMinimap((prev) => {
      const next = !prev;
      savePanelLayout(panelLayout, { showMinimap: next });
      return next;
    });
  }, [panelLayout]);

  const nodeTypes = useMemo(() => NODE_COMPONENTS, []);

  // 工作区未就绪或正在加载：等待 activeId 确定 + canvas 载入完成
  if (!activeId || !loaded) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">加载中…</div>;
  }

  // 工作区操作：切换/创建/删除/重命名都由 useWorkspaces 调服务端写 workspaces.json；
  // 写回广播后 activeId 变化，useCanvasState/useGenerationHistory 自动重载新工作区数据。
  const handleSwitch = (id) => { if (id !== activeId) switchWorkspace(id); };
  const handleCreate = async (name) => {
    const res = await createWorkspace(name);
    // 创建后自动切换到新工作区（空画布）
    const newWs = res?.workspaces?.slice(-1)?.[0];
    if (newWs) switchWorkspace(newWs.id);
  };
  // 删除：支持单个 id 或 id 数组（批量删除）。逐个调 service，最后按清单 activeId 校正。
  const handleDelete = async (ids) => {
    const list = Array.isArray(ids) ? ids : [ids];
    let last = null;
    for (const id of list) {
      if (id === activeId) continue; // 跳过当前激活（DeleteWorkspacesDialog 已限制不可选）
      last = await deleteWorkspace(id);
    }
    if (last?.activeId && last.activeId !== activeId) switchWorkspace(last.activeId);
  };

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="h-full min-h-0"
      // react-resizable-panels@4: defaultLayout/onLayoutChange 用 { panelId: percentage }
      defaultLayout={panelLayout}
      onLayoutChange={handlePanelLayoutChange}
    >
      <ResizablePanel id={PANEL_ID_MAIN} order={1} minSize="40%">
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
          <Toolbar
            onClear={handleClear}
            onAutoLayout={handleAutoLayout}
            onExport={handleExport}
            onOpenSettings={() => setSettingsOpen(true)}
            count={nodes.length}
            workspaceSlot={(
              <WorkspaceSwitcher
                workspaces={workspaces}
                activeId={activeId}
                onSwitch={handleSwitch}
                onCreate={handleCreate}
                onDelete={handleDelete}
                onRename={renameWorkspace}
              />
            )}
            queueSlot={(
              <ExecutionQueuePopover
                jobs={jobs}
                runningCount={runningCount}
                onCancel={cancel}
                onClearFinished={clearFinished}
              />
            )}
          />
          {/* 外层 ref + onDrop/onDragOver 实现拖拽新增节点（参考 reactflow.dev drag-and-drop）。
              右键用 ContextMenu（Base UI）自管浮层：ContextMenuTrigger 用 render prop 把
              画布容器作为 trigger element（Base UI 的 render 自动合并 ref/props/children）。
              onContextMenu 只记录画布坐标供建节点（浮层定位/关闭由 Base UI 管）。 */}
          <ContextMenu>
            <ContextMenuTrigger
              render={
                <div
                  className="relative min-h-0 flex-1"
                  ref={wrappingRef}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onContextMenu={handleContextMenu}
                />
              }
            >
            <ReactFlow
              nodes={decoratedNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              connectionLineComponent={ConnectionLine}
              onSelectionChange={onSelectionChange}
              onNodesDelete={onNodesDelete}
              deleteKeyCode={deleteKeyCode}
              nodeTypes={nodeTypes}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
              <Controls>
                {/* 切换 MiniMap 显示：关闭时按钮高亮提示当前状态 */}
                <ControlButton
                  title={showMinimap ? '隐藏小地图' : '显示小地图'}
                  onClick={toggleMinimap}
                  style={{ background: showMinimap ? undefined : 'var(--accent)' }}
                >
                  <MapPinned className="h-4 w-4" />
                </ControlButton>
              </Controls>
              {showMinimap && (
                <MiniMap
                  pannable
                  zoomable
                  nodeColor={(n) => (NODE_META[n.type]?.color || '#94a3b8')}
                  maskColor="rgb(0 0 0 / 0.05)"
                />
              )}
              {/* 分组 overlay：复用宿主 WorkflowGroupOverlay（与 workflow 编辑器同源），
                  放在 ViewportPortal 内跟随画布 pan/zoom，按子节点包围盒自动贴合 */}
              <ViewportPortal>
                {groupOverlayItems.map(({ group, childNodes }) => (
                  <WorkflowGroupOverlay
                    key={group.id}
                    group={group}
                    childNodes={childNodes}
                    isSelected={selectedGroupId === group.id}
                    onSelect={setSelectedGroupId}
                    onDelete={deleteGroup}
                    onUpdate={updateGroup}
                    onMove={handleGroupMove}
                    onConnect={handleGroupConnect}
                    screenDeltaToFlowDelta={screenDeltaToFlowDelta}
                  />
                ))}
              </ViewportPortal>
            </ReactFlow>
            {/* 底部 toolbar：选中多个节点时浮出，提供「合并成分组/对齐分布/批量删除」。
                absolute 定位在画布容器底部居中，z-index 高于 ReactFlow 内容。
                用 nodrag nopan 防止点击触发画布交互。 */}
            {selectionCount > 1 && (
              <div className="nodrag nopan pointer-events-auto absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
                <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-card-foreground shadow-md">
                  <span className="px-1 text-xs text-muted-foreground">已选 {selectionCount}</span>
                  <div className="mx-1 h-4 w-px bg-border" />
                  <button
                    type="button"
                    onClick={createGroupFromSelection}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    合并成分组
                  </button>
                  {/* 对齐分布下拉菜单 */}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary"
                        >
                          <AlignHorizontalJustifyCenter className="h-3.5 w-3.5" />
                          对齐分布
                        </button>
                      }
                    />
                    <DropdownMenuContent align="center" className="text-xs">
                      <DropdownMenuItem onClick={() => alignDistribute('left')}>左对齐</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => alignDistribute('center-h')}>水平居中</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => alignDistribute('right')}>右对齐</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => alignDistribute('top')}>顶对齐</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => alignDistribute('center-v')}>垂直居中</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => alignDistribute('bottom')}>底对齐</DropdownMenuItem>
                      <div className="my-1 h-px bg-border" />
                      <DropdownMenuItem onClick={() => alignDistribute('h-dist')}>水平等距分布</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => alignDistribute('v-dist')}>垂直等距分布</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button
                    type="button"
                    onClick={deleteSelectedNodes}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    批量删除
                  </button>
                </div>
              </div>
            )}
            {/* 拖拽连线到空白处放手的「添加节点」菜单：复用右键菜单同一份 AddNodeMenuItems。
                用 DropdownMenu（Base UI Menu）受控打开，trigger 用 1x1 span 定位到放手坐标作锚点。
                ContextMenu 无法程序化打开，故这里用 DropdownMenu 组件族。 */}
            {dropNodeMenu && (
              <DropdownMenu
                open
                onOpenChange={(open) => { if (!open) setDropNodeMenu(null); }}
              >
                <DropdownMenuTrigger
                  render={<span style={{ position: 'fixed', left: dropNodeMenu.clientX, top: dropNodeMenu.clientY, width: 1, height: 1, pointerEvents: 'none' }} />}
                />
                <DropdownMenuContent
                  align="start"
                  sideOffset={0}
                  className="w-52"
                >
                  <AddNodeMenuItems
                    onPick={handleAddAtDrop}
                    renderItem={(children, onClick, key) => (
                      <DropdownMenuItem key={key} onClick={onClick}>
                        {children}
                      </DropdownMenuItem>
                    )}
                    renderSub={(triggerLabel, subItems, key) => (
                      <DropdownMenuSub key={key}>
                        <DropdownMenuSubTrigger>{triggerLabel}</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-52">
                          {subItems.map((s) => (
                            s.type === 'label' ? (
                              <p key={s.id} className="px-2 py-0.5 text-[10px] text-muted-foreground">
                                {s.label}
                              </p>
                            ) : (
                              <DropdownMenuItem key={s.id} title={s.desc} onClick={s.onClick}>
                                {s.label}
                              </DropdownMenuItem>
                            )
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </ContextMenuTrigger>
            {/* 画布右键菜单（Base UI ContextMenu）：节点类型列表，点击在右键位置创建节点。
                「图像处理」用 ContextMenuSub 渲染处理器快捷子菜单，点击子项创建预选该处理器的节点。
                浮层定位/关闭/键盘导航全部由 Base UI 管，无需手写 state。 */}
            <ContextMenuContent className="w-52">
              <ContextMenuGroup>
                <AddNodeMenuItems
                  onPick={handleAddAtMenu}
                  renderItem={(children, onClick, key) => (
                    <ContextMenuItem key={key} onClick={onClick}>
                      {children}
                    </ContextMenuItem>
                  )}
                  renderSub={(triggerLabel, subItems, key) => (
                    <ContextMenuSub key={key}>
                      <ContextMenuSubTrigger>{triggerLabel}</ContextMenuSubTrigger>
                      <ContextMenuSubContent className="w-52">
                        {subItems.map((s) => (
                          s.type === 'label' ? (
                            <p key={s.id} className="px-2 py-0.5 text-[10px] text-muted-foreground">
                              {s.label}
                            </p>
                          ) : (
                            <ContextMenuItem key={s.id} title={s.desc} onClick={s.onClick}>
                              {s.label}
                            </ContextMenuItem>
                          )
                        ))}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                  )}
                />
              </ContextMenuGroup>
            </ContextMenuContent>
          </ContextMenu>
        </div>
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel id={PANEL_ID_RIGHT} order={2} minSize="18%" maxSize="48%">
        <RightPanel
          nodes={nodes}
          onSelectNode={handleSelectNode}
          onLocateNode={handleLocateNode}
          onDeleteNode={handleDeleteNode}
          onAdd={handleAdd}
          onDragStartNode={handleDragStartNode}
          onOpenForm={(type) => setFormState({ nodeType: type, initialImages: [] })}
          history={history}
          onRemoveHistory={removeHistory}
          onClearHistory={clearHistory}
          onUseImage={handleUseImage}
          workspaceId={activeId}
        />
      </ResizablePanel>

      <SettingsDialog
        open={settingsOpen}
        value={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={async (cfg) => {
          await saveSettings(cfg);
          setSettingsOpen(false);
        }}
      />

      <NodeFormDialog
        open={!!formState}
        nodeType={formState?.nodeType}
        initialImages={formState?.initialImages}
        onClose={() => setFormState(null)}
        onSubmit={handleFormSubmit}
      />
    </ResizablePanelGroup>
  );
}

/**
 * 添加节点的菜单项列表（右键菜单 / 拖拽落空菜单共用同一份内容）。
 * 用 render-prop 注入对应组件族，使一份逻辑同时适配 ContextMenu 与 DropdownMenu。
 *
 * @param {object} props
 * @param {Function} props.onPick  (type, dataPatch?) => void
 * @param {Function} props.renderItem     普通 item 渲染函数：(children, key) => JSX
 * @param {Function} props.renderSub      子菜单 item 渲染函数：(triggerLabel, items[], key) => JSX，
 *                                        items 为 [{ id, label, desc, onClick }]
 */
function AddNodeMenuItems({ onPick, renderItem, renderSub }) {
  return ADD_NODE_ITEMS.map((it) => {
    const meta = NODE_META[it.type];
    if (it.type === NODE_TYPES.imageProcess) {
      const subItems = [];
      IMAGE_PROCESSOR_CATEGORIES.forEach((cat) => {
        const items = IMAGE_PROCESSORS.filter((p) => p.category === cat.id);
        if (items.length) {
          subItems.push({
            id: `cat-${cat.id}`,
            type: 'label',
            label: `${cat.icon} ${cat.label}`,
          });
          items.forEach((p) => subItems.push({
            id: p.id,
            type: 'item',
            label: p.label,
            desc: p.desc,
            onClick: () => onPick(it.type, {
              params: { processor: p.id, processorParams: defaultProcessorParams(p.id) },
            }),
          }));
        }
      });
      return renderSub(
        <><span>{meta.icon}</span><span>{meta.label}</span></>,
        subItems,
        it.type,
      );
    }
    return renderItem(
      <><span>{meta.icon}</span><span>{meta.label}</span></>,
      () => onPick(it.type),
      it.type,
    );
  });
}

