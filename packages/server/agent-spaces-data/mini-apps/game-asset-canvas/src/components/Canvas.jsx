import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, Controls, MarkerType, MiniMap, ReactFlow,
  addEdge, applyEdgeChanges, applyNodeChanges, useReactFlow,
} from '@xyflow/react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@agent-spaces/ui';
import Toolbar from './Toolbar';
import RightPanel from './RightPanel';
import SettingsDialog from './SettingsDialog';
import ExecutionQueuePopover from './ExecutionQueuePopover';
import NodeFormDialog from './NodeFormDialog';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import TextToImageNode from './nodes/TextToImageNode';
import EditImageNode from './nodes/EditImageNode';
import ImageDisplayNode from './nodes/ImageDisplayNode';
import NoteNode from './nodes/NoteNode';
import useCanvasState from '../hooks/useCanvasState';
import useWorkflow from '../hooks/useWorkflow';
import useGenerationHistory from '../hooks/useGenerationHistory';
import useSettings from '../hooks/useSettings';
import useExecutionQueue from '../hooks/useExecutionQueue';
import useWorkspaces from '../hooks/useWorkspaces';
import { IMAGE_TAGS, NODE_META, NODE_TYPES, WORKFLOWS } from '../utils/constants';
import { autoLayout } from '../utils/layout';
import { downloadJson, serializeCanvas } from '../utils/export';
import { copyNodes, hasClipboard, pasteNodes } from '../utils/clipboard';
import { loadPanelLayout, onAnyConfigChanged, savePanelLayout } from '../utils/storage';

// 节点类型 -> 渲染组件
const NODE_COMPONENTS = {
  [NODE_TYPES.textToImage]: TextToImageNode,
  [NODE_TYPES.editImage]: EditImageNode,
  [NODE_TYPES.imageDisplay]: ImageDisplayNode,
  [NODE_TYPES.note]: NoteNode,
};

// 右键菜单的节点类型列表（与 RightPanel 新增节点 tab 保持一致）
const ADD_NODE_ITEMS = [
  { type: NODE_TYPES.textToImage },
  { type: NODE_TYPES.editImage },
  { type: NODE_TYPES.imageDisplay },
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
    if (node.type !== NODE_TYPES.editImage && node.type !== NODE_TYPES.imageDisplay) continue;
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
  const base = { status: 'idle', output: { images: [] } };
  return { ...base, params: { prompt: '', model: 'gpt-image-1', aspect: '1:1', size: '1k' } };
}

export default function Canvas() {
  // 工作区管理（activeId 驱动后续节点/历史的隔离加载）
  const { workspaces, activeId, createWorkspace, renameWorkspace, switchWorkspace, deleteWorkspace } = useWorkspaces();
  // hooks 依赖 activeId：切换工作区时自动重载该工作区的节点/历史
  const { nodes, edges, loaded, setNodes, setEdges, updateNodeData } = useCanvasState(activeId);
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
  // 右键菜单：{ x,y } 屏幕坐标定位浮层，{ flowX,flowY } 画布坐标用于在该处建节点
  const [contextMenu, setContextMenu] = useState(null);
  const reactFlow = useReactFlow();
  // 拖拽到画布时记录拖入的节点类型（参考 reactflow.dev drag-and-drop）
  const dragTypeRef = useRef(null);
  const wrappingRef = useRef(null);

  // 面板布局（持久化）
  const [panelLayout, setPanelLayout] = useState(() => loadPanelLayout() || DEFAULT_PANEL_LAYOUT);
  useEffect(() => {
    const unsub = onAnyConfigChanged((path, value) => {
      if (path === 'panel-layout.json' && value?.layout && typeof value.layout === 'object') {
        setPanelLayout(value.layout);
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

  const onConnect = useCallback((conn) => {
    setEdges((prev) => addEdge(
      { ...conn, markerEnd: { type: MarkerType.ArrowClosed }, animated: true },
      prev,
    ));
  }, [setEdges]);

  const onSelectionChange = useCallback(({ nodes: selNodes }) => {
    setSelectedId(selNodes.length === 1 ? selNodes[0].id : null);
  }, []);

  // 键盘删除节点：Backspace / Delete（v12 默认含 Backspace，显式补 Delete）
  const deleteKeyCode = useMemo(() => (['Backspace', 'Delete']), []);

  // 节点删除时同步清理相关连线（ReactFlow 默认会删 selected edges，这里兜底）
  const onNodesDelete = useCallback((deleted) => {
    if (!deleted?.length) return;
    const ids = new Set(deleted.map((n) => n.id));
    setEdges((prev) => prev.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
  }, [setEdges]);

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
            x: (position?.x || 120) + col * (size.w + gap),
            y: (position?.y || 120) + row * (size.h + gap) + base * 10,
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

  // 画布右键：阻止浏览器默认菜单，记录屏幕坐标（浮层定位）+ 画布坐标（建节点位置）
  const handleContextMenu = useCallback((event) => {
    event.preventDefault();
    const flow = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setContextMenu({ x: event.clientX, y: event.clientY, flowX: flow.x, flowY: flow.y });
  }, [reactFlow]);

  // 右键菜单点击某节点类型：在右键位置创建节点并关闭菜单
  const handleAddAtMenu = useCallback((type) => {
    if (!contextMenu) return;
    createNodeAt(type, { x: contextMenu.flowX, y: contextMenu.flowY });
    setContextMenu(null);
  }, [contextMenu, createNodeAt]);

  const handleClear = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedId(null);
  }, [setNodes, setEdges]);

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
        data: {
          ...data,
          onUpdate: makeOnUpdate(nd.id),
          onGenerate: handleGenerate,
          onExportImages: (imgs) => addImageNodesFromUrls(imgs, { tags: [IMAGE_TAGS.export] }),
          onProcessImage: handleProcessImage,
          // 工具栏【编辑】按钮：打开编辑图片弹窗，预填当前节点图片
          onEditImages: (imgs) => setFormState({ nodeType: NODE_TYPES.editImage, initialImages: imgs }),
          // 图片加载完成自动调整节点尺寸（仅图片展示节点用）
          onAutoSize: handleAutoSize,
        },
      };
    }),
    [nodes, upstreamMap, makeOnUpdate, handleGenerate, addImageNodesFromUrls, handleProcessImage, handleAutoSize],
  );

  // 面板布局变化 -> 持久化
  const handlePanelLayoutChange = useCallback((layout) => {
    setPanelLayout(layout);
    savePanelLayout(layout);
  }, []);

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
          {/* 外层 ref + onDrop/onDragOver 实现拖拽新增节点（参考 reactflow.dev drag-and-drop） */}
          <div className="relative min-h-0 flex-1" ref={wrappingRef} onDrop={handleDrop} onDragOver={handleDragOver} onContextMenu={handleContextMenu}>
            <ReactFlow
              nodes={decoratedNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelectionChange={onSelectionChange}
              onNodesDelete={onNodesDelete}
              deleteKeyCode={deleteKeyCode}
              nodeTypes={nodeTypes}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
              <Controls />
              <MiniMap
                pannable
                zoomable
                nodeColor={(n) => (NODE_META[n.type]?.color || '#94a3b8')}
                maskColor="rgb(0 0 0 / 0.05)"
              />
            </ReactFlow>
          </div>
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

      {/* 画布右键菜单：节点类型列表，点击在右键位置创建节点。
          外层透明遮罩吃掉点击/右键，内层 fixed 浮层定位到鼠标坐标。
          z-index 高于 ReactFlow，样式对齐 PopoverContent。 */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-[999]"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
        >
          <div
            className="absolute w-44 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
          >
            <p className="px-2 py-1 text-[10px] text-muted-foreground">添加节点</p>
            {ADD_NODE_ITEMS.map((it) => {
              const meta = NODE_META[it.type];
              return (
                <button
                  key={it.type}
                  type="button"
                  onClick={() => handleAddAtMenu(it.type)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition hover:bg-accent hover:text-accent-foreground"
                >
                  <span>{meta.icon}</span>
                  <span>{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </ResizablePanelGroup>
  );
}
