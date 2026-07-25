import { useCallback, useRef } from 'react';
import { addEdge, MarkerType } from '@xyflow/react';
import { NODE_TYPES, NODE_META, IMAGE_TAGS, WORKFLOWS } from '../utils/constants';
import { DEFAULT_SIZE, initialData } from '../utils/canvas-constants';
import { genId, autoPosition } from '../utils/canvas-id';
import { autoLayout } from '../utils/layout';
import { downloadJson, serializeCanvas } from '../utils/export';

/**
 * 节点 CRUD + 定位/布局/导出 + 尺寸自适应 + 表单提交。
 * 从 Canvas.jsx 抽出（原 B5 创建/拖拽/右键 + B6 删除/定位/布局/导出 + B12 尺寸自适应/表单提交）。
 *
 * createNodeAt 是核心，被多处复用（菜单/RPC/表单提交/handleCutoutCreate 等）。
 *
 * focusNode/handleExport/handleAutoLayout 只需读 nodes/edges 当前值，不需响应式重建，
 * 故用 ref 持有最新值，deps 去掉 nodes/edges → 稳定 callback。
 *
 * @param {object} deps
 * @param {Array} deps.nodes
 * @param {Array} deps.edges
 * @param {Function} deps.setNodes
 * @param {Function} deps.setEdges
 * @param {Function} deps.setGroups
 * @param {object} deps.reactFlow
 * @param {*} deps.selectedId
 * @param {Function} deps.setSelectedId
 * @param {Function} deps.updateNodeData
 * @param {object} deps.settings
 * @param {Function} deps.submit  useExecutionQueue 的 submit
 * @param {Function} deps.setDropNodeMenu  落空菜单 state setter
 * @param {Function} deps.setContextMenu    右键菜单 state setter
 */
export default function useNodeCrud({
  nodes, edges, setNodes, setEdges, setGroups,
  reactFlow, selectedId, setSelectedId, updateNodeData, settings, submit,
  setDropNodeMenu, setContextMenu,
}) {
  const dragTypeRef = useRef(null);

  // nodes/edges 的 ref 镜像：让「读最新值」的 callback（focusNode/handleExport/handleAutoLayout）
  // 去掉对 nodes/edges 的依赖，成为稳定 callback。
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // 创建节点到指定位置（点击添加 / 拖拽放下 / Agent add_node 共用）
  // dataPatch: 可选，覆盖/扩展初始 data（如预填 loading/images）
  // position 不传时自动错落：基于「实际当前节点数 + 本轮新增序号」算网格位置，
  // 用模块级 seq 计数器保证连续 add_node 不叠加（不依赖 React state 的过期闭包值）。
  const createNodeAt = useCallback((type, position, dataPatch) => {
    const id = genId(type);
    const meta = NODE_META[type] || {};
    const size = DEFAULT_SIZE[type] || DEFAULT_SIZE.default;
    const node = {
      id,
      type,
      position: position || autoPosition(nodes.length),
      width: size.w,
      height: size.h,
      style: { width: size.w, height: size.h },
      data: { ...initialData(type), label: meta.label, ...(dataPatch || {}) },
    };
    setNodes((prev) => [...prev, node]);
    return id;
  }, [nodes.length, setNodes]);

  // 「添加节点」菜单选中类型后：在落点创建节点（居中），并连一条 edge
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
  }, [reactFlow, createNodeAt, setEdges, setDropNodeMenu]);

  // 点击添加（默认位置，偏移错落）
  const handleAdd = useCallback((type) => {
    createNodeAt(type, null);
  }, [createNodeAt]);

  // 拖拽起始（右侧新增节点列表的 button 上 onDragStart 调用）—— 记录类型
  const handleDragStartNode = useCallback((type, event) => {
    dragTypeRef.current = type;
    event.dataTransfer.setData('application/reactflow', type);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  // 拖拽经过画布：必须 preventDefault 才能触发 drop
  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // 系统图片文件拖入画布：在落点建图片展示节点（loading 占位），串行上传
  const handleDropFiles = useCallback(async (fileList, position) => {
    const files = Array.from(fileList || []).filter((f) => f.type?.startsWith('image/'));
    if (!files.length) return;
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) return;

    const size = DEFAULT_SIZE[NODE_TYPES.imageDisplay];
    const gap = 20;
    const cols = 3;
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
    if (event.dataTransfer.files?.length) {
      const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      handleDropFiles(event.dataTransfer.files, position);
      return;
    }
    const type = event.dataTransfer.getData('application/reactflow') || dragTypeRef.current;
    dragTypeRef.current = null;
    if (!type) return;
    const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    createNodeAt(type, position);
  }, [reactFlow, createNodeAt, handleDropFiles]);

  // 画布右键：记录右键处的画布坐标供建节点
  const handleContextMenu = useCallback((event) => {
    const flow = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setContextMenu({ flowX: flow.x, flowY: flow.y });
  }, [reactFlow, setContextMenu]);

  // 右键菜单点击某节点类型：在右键位置创建节点
  const handleAddAtMenu = useCallback((type, dataPatch) => {
    setContextMenu((cur) => {
      const p = cur ? { x: cur.flowX, y: cur.flowY } : null;
      createNodeAt(type, p, dataPatch);
      return null;
    });
  }, [createNodeAt, setContextMenu]);

  const handleClear = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setGroups([]);
    setSelectedId(null);
  }, [setNodes, setEdges, setGroups, setSelectedId]);

  // 删除单个节点（含相关连线）
  const handleDeleteNode = useCallback((nodeId) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedId === nodeId) setSelectedId(null);
  }, [setNodes, setEdges, selectedId, setSelectedId]);

  // 选中并聚焦节点：设置 ReactFlow 原生 node.selected + setCenter 居中 + 同步面板高亮。
  // 不在 decoratedNodes 里覆盖 selected（见 handoff 第1条），改 useCanvasState 真值。
  // 用 nodesRef 读最新值，deps 不含 nodes → 稳定 callback。
  const focusNode = useCallback((nodeId) => {
    const target = nodesRef.current.find((n) => n.id === nodeId);
    if (!target) return;
    setNodes((prev) => prev.map((n) => ({ ...n, selected: n.id === nodeId })));
    const w = target.width || target.style?.width || 280;
    const h = target.height || target.style?.height || 220;
    reactFlow.setCenter(target.position.x + w / 2, target.position.y + h / 2, { zoom: 1, duration: 400 });
    setSelectedId(nodeId);
  }, [setNodes, reactFlow, setSelectedId]);

  const handleSelectNode = useCallback((nodeId) => { focusNode(nodeId); }, [focusNode]);
  const handleLocateNode = useCallback((nodeId) => { focusNode(nodeId); }, [focusNode]);

  // 自动布局（dagre）：用 edgesRef 读最新值
  const handleAutoLayout = useCallback(() => {
    setNodes((prev) => autoLayout(prev, edgesRef.current));
  }, [setNodes]);

  // 导出画布 JSON：用 ref 读最新值
  const handleExport = useCallback(() => {
    downloadJson(serializeCanvas(nodesRef.current, edgesRef.current));
  }, []);

  // 图片加载完成后自动调整节点尺寸（图片展示节点 <img onLoad> 触发）
  const handleAutoSize = useCallback((nodeId, naturalWidth, naturalHeight) => {
    if (!naturalWidth || !naturalHeight) return;
    const minW = 220, maxW = 520;
    const padX = 32, chromeH = 80;
    const w = Math.max(minW, Math.min(maxW, Math.round(naturalWidth)));
    const imgH = Math.min(320, Math.round((w - padX) * naturalHeight / naturalWidth));
    const h = Math.max(160, imgH + chromeH);
    setNodes((prev) => prev.map((nd) => {
      if (nd.id !== nodeId) return nd;
      return { ...nd, width: w, height: h, style: { ...nd.style, width: w, height: h } };
    }));
  }, [setNodes]);

  // 首次内容高度自适应（NodeShell ResizeObserver 上报，仅首次触发）
  const handleAutoSizeToContent = useCallback((nodeId, height) => {
    const h = Math.max(120, Math.min(800, Math.round(height)));
    setNodes((prev) => prev.map((nd) => {
      if (nd.id !== nodeId) return nd;
      return { ...nd, height: h, style: { ...nd.style, height: h } };
    }));
  }, [setNodes]);

  // 从右侧表单弹窗提交：建 loading 占位节点 + submit 入队
  const handleFormSubmit = useCallback((task) => {
    const workflowId = task.nodeType === NODE_TYPES.textToImage
      ? (settings.textToImageWorkflowId || WORKFLOWS.text_to_image)
      : (settings.editImageWorkflowId || WORKFLOWS.edit_image);
    const tag = task.nodeType === NODE_TYPES.editImage ? IMAGE_TAGS.editImage : IMAGE_TAGS.textToImage;
    const placeholderNodeId = createNodeAt(
      NODE_TYPES.imageDisplay,
      null,
      { images: [], source: 'queue', loading: true, error: undefined, tags: [tag] },
    );
    submit({ ...task, workflowId, placeholderNodeId, tags: [tag] });
  }, [settings, submit, createNodeAt]);

  return {
    createNodeAt,
    handleAdd, handleAddAtDrop, handleAddAtMenu,
    handleDragStartNode, handleDragOver, handleDrop, handleDropFiles,
    handleContextMenu, handleClear,
    handleDeleteNode, focusNode, handleSelectNode, handleLocateNode,
    handleAutoLayout, handleExport,
    handleAutoSize, handleAutoSizeToContent, handleFormSubmit,
  };
}
