import { useCallback, useRef } from 'react';
import { addEdge, MarkerType } from '@xyflow/react';
import { debugCanvasImageDrag } from '@agent-spaces/ui';
import { NODE_TYPES, NODE_META, IMAGE_TAGS, WORKFLOWS } from '../utils/constants';
import { DEFAULT_SIZE, initialData, NODE_PARAMS_SCHEMA, CANVAS_DROP_MIME, IMAGE_REORDER_MIME } from '../utils/canvas-constants';
import { getConnectionTargets } from '../utils/connection-targets';
import { genId, autoPosition } from '../utils/canvas-id';
import { autoLayout } from '../utils/layout';
import { downloadJson, serializeCanvas, pickAndParseCanvasFile } from '../utils/export';

const debuggedCanvasImageDrags = new WeakSet();

// 历史记录项 → 新节点 dataPatch：
// - 生成类节点（params 含 prompt/model 字段）预填 prompt/model
// - 接收上游图的节点（initialData 含 uploadedImages）把历史产出图作为输入
// - 媒体产出（audio/video）的 images 不作为图片输入（语义不符）
export function historyToNodePatch(item) {
  if (!item || !item.nodeType) return {};
  const base = initialData(item.nodeType);
  if (!base) return {};
  const patch = {};
  if (base.params && typeof base.params === 'object') {
    patch.params = { ...base.params };
    if (item.prompt && 'prompt' in base.params) patch.params.prompt = item.prompt;
    if (item.model && 'model' in base.params) patch.params.model = item.model;
  }
  const isMedia = item.mediaType === 'audio' || item.mediaType === 'video';
  if (!isMedia && item.images?.length && 'uploadedImages' in base) {
    patch.uploadedImages = [...item.images];
  }
  return patch;
}

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
 * @param {Function} deps.setPendingConnection 多目标输入选择对话框 state setter
 * @param {Function} deps.getLastParams  useLastParams().getLastParams —— 读某 nodeType 上次提交参数（稳定 callback，读 ref）
 * @param {Function} deps.saveLastParams useLastParams().saveLastParams —— 表单提交时存参数子集
 */
export default function useNodeCrud({
  nodes, edges, setNodes, setEdges, setGroups,
  reactFlow, selectedId, setSelectedId, updateNodeData, settings, submit,
  setDropNodeMenu, setContextMenu, setPendingConnection,
  getViewportCenter, getLastParams, saveLastParams,
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
  // params 合并优先级：dataPatch.params（显式） > getLastParams(type)（上次提交） > initialData.params（默认）。
  // 无 lastParams 时行为与原逻辑一致（零侵入）。
  const createNodeAt = useCallback((type, position, dataPatch) => {
    const id = genId(type);
    const meta = NODE_META[type] || {};
    const size = DEFAULT_SIZE[type] || DEFAULT_SIZE.default;
    const baseData = { ...initialData(type), label: meta.label };
    const patch = dataPatch || {};
    // 仅当 baseData 有 params 且显式 patch 未带 params 时，用上次提交参数补默认值
    const last = patch.params ? null : getLastParams?.(type);
    const data = last
      ? { ...baseData, params: { ...(baseData.params || {}), ...last }, ...patch }
      : { ...baseData, ...patch };
    const node = {
      id,
      type,
      position: position || autoPosition(nodes.length),
      width: size.w,
      height: size.h,
      style: { width: size.w, height: size.h },
      data,
    };
    setNodes((prev) => [...prev, node]);
    return id;
  }, [nodes.length, setNodes, getLastParams]);

  // 「添加节点」菜单选中类型后：在落点创建节点（居中），并连一条 edge
  const handleAddAtDrop = useCallback((type, dataPatch) => {
    setDropNodeMenu((cur) => {
      if (!cur) return null;
      const flow = reactFlow.screenToFlowPosition({ x: cur.clientX, y: cur.clientY });
      const size = DEFAULT_SIZE[type] || DEFAULT_SIZE.default;
      // 节点中心落在落点
      const position = { x: flow.x - size.w / 2, y: flow.y - size.h / 2 };
      const newId = createNodeAt(type, position, dataPatch);
      const sourceNode = nodesRef.current.find((node) => node.id === cur.source);
      const connection = getConnectionTargets(
        sourceNode?.type,
        type,
        NODE_PARAMS_SCHEMA[type] || [],
      );
      if (connection.targets.length > 1) {
        setPendingConnection?.({
          conn: { source: cur.source, target: newId, sourceHandle: cur.sourceHandle },
          targets: connection.targets,
          inputType: connection.inputType,
        });
        return null;
      }
      setEdges((prev) => {
        if (!connection.targets.length) return prev;
        const key = `${cur.source}->${newId}`;
        if (prev.some((e) => `${e.source}->${e.target}` === key)) return prev;
        return addEdge(
          {
            source: cur.source,
            target: newId,
            sourceHandle: cur.sourceHandle,
            markerEnd: { type: MarkerType.ArrowClosed },
            animated: true,
            data: {
              inputType: connection.inputType,
              inputTarget: connection.targets[0].id,
            },
          },
          prev,
        );
      });
      return null; // 关闭菜单
    });
  }, [reactFlow, createNodeAt, setEdges, setDropNodeMenu, setPendingConnection]);

  // 点击添加：定位到画布可视区域中心（由调用方提供屏幕中心坐标，hook 内转 flow 坐标）
  const handleAdd = useCallback((type) => {
    let position = null;
    if (getViewportCenter && reactFlow.screenToFlowPosition) {
      const center = getViewportCenter();
      if (center) position = reactFlow.screenToFlowPosition(center);
    }
    createNodeAt(type, position);
  }, [createNodeAt, reactFlow, getViewportCenter]);

  // 拖拽起始（右侧新增节点列表的 button 上 onDragStart 调用）—— 记录类型
  const handleDragStartNode = useCallback((type, event) => {
    dragTypeRef.current = type;
    event.dataTransfer.setData('application/reactflow', type);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  // 历史记录「插入到画布」：在视口中心创建新节点，预填历史参数 + 产出图作输入
  // 返回新节点 id（供调用方做分组等后续操作）
  const handleInsertHistory = useCallback((item) => {
    const patch = historyToNodePatch(item);
    let position = null;
    if (getViewportCenter && reactFlow.screenToFlowPosition) {
      const center = getViewportCenter();
      if (center) position = reactFlow.screenToFlowPosition(center);
    }
    return createNodeAt(item.nodeType, position, patch);
  }, [createNodeAt, reactFlow, getViewportCenter]);

  // 历史项拖拽起始：dataTransfer 写 patch JSON，drop 时 createNodeAt(type, position, patch)
  const handleDragStartHistory = useCallback((item, event) => {
    const patch = historyToNodePatch(item);
    dragTypeRef.current = item.nodeType;
    try {
      event.dataTransfer.setData('application/x-history-patch', JSON.stringify({ type: item.nodeType, patch }));
    } catch {}
    event.dataTransfer.setData('application/reactflow', item.nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  // 拖拽经过画布：必须 preventDefault 才能触发 drop
  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    const isImageDrag = Array.from(event.dataTransfer.types || []).includes(CANVAS_DROP_MIME);
    event.dataTransfer.dropEffect = isImageDrag ? 'copy' : 'move';
    if (isImageDrag && !debuggedCanvasImageDrags.has(event.dataTransfer)) {
      debuggedCanvasImageDrags.add(event.dataTransfer);
      debugCanvasImageDrag('canvas:dragover', event.dataTransfer, { isImageDrag });
    }
  }, []);

  // 按 URL 在落点批量建图片展示节点（历史记录/素材库图片拖入画布复用）。
  // 多张时网格排列；source 统一标记为 'drop'（拖拽落点来源）。
  const addImageNodesAt = useCallback((urls, position) => {
    if (!urls?.length) return;
    const size = DEFAULT_SIZE[NODE_TYPES.imageDisplay];
    const meta = NODE_META[NODE_TYPES.imageDisplay];
    const gap = 20;
    const cols = 3;
    setNodes((prev) => {
      const additions = urls.map((url, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = position?.x ?? 120;
        const cy = position?.y ?? 120;
        return {
          id: genId(NODE_TYPES.imageDisplay),
          type: NODE_TYPES.imageDisplay,
          position: { x: cx + col * (size.w + gap) - size.w / 2, y: cy + row * (size.h + gap) - size.h / 2 },
          width: size.w, height: size.h,
          style: { width: size.w, height: size.h },
          data: { ...initialData(NODE_TYPES.imageDisplay), images: [url], source: 'drop', label: meta.label },
        };
      });
      return [...prev, ...additions];
    });
  }, [setNodes]);

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

  // 放下：区分系统图片文件 / 历史项 / 节点类型
  const handleDrop = useCallback((event) => {
    event.preventDefault();
    const imgRaw = event.dataTransfer.getData(CANVAS_DROP_MIME);
    const isReorder = Boolean(event.dataTransfer.getData(IMAGE_REORDER_MIME));
    debugCanvasImageDrag('canvas:drop', event.dataTransfer, {
      hasImagePayload: Boolean(imgRaw),
      isReorder,
      insideNode: event.target instanceof Element && Boolean(event.target.closest('.react-flow__node')),
    });
    // 节点内/弹窗内图片列表拖拽排序的标记：直接放行，不建节点（否则 img 默认被浏览器转成文件会误建 imageDisplay）
    // 若同时有明确的画布图片 payload，则表示图片被拖出了排序列表，应按跨区域复制处理。
    if (isReorder && !imgRaw) return;
    // drop 落在节点内（含节点内 FileUpload/dropzone）：交给节点自行处理，画布不建节点。
    // 否则事件冒泡到这里会因 dataTransfer.files 非空误建 imageDisplay，且 FileUpload 的 onChange 也被触发导致重复消费。
    if (event.target instanceof Element && event.target.closest('.react-flow__node')) return;
    if (event.dataTransfer.files?.length) {
      const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      handleDropFiles(event.dataTransfer.files, position);
      return;
    }
    const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    // 历史项拖拽：携带预填 patch
    const histRaw = event.dataTransfer.getData('application/x-history-patch');
    if (histRaw) {
      try {
        const { type, patch } = JSON.parse(histRaw);
        if (type) { createNodeAt(type, position, patch); return; }
      } catch {}
    }
    // 历史记录/素材库的图片缩略图拖入：按图片 URL 在落点建 imageDisplay 节点
    if (imgRaw) {
      try {
        const parsed = JSON.parse(imgRaw);
        const urls = Array.isArray(parsed?.urls) ? parsed.urls.filter(Boolean)
          : (typeof parsed === 'string' ? [parsed] : []);
        if (urls.length) {
          addImageNodesAt(urls, position);
          return;
        }
      } catch {}
    }
    const type = event.dataTransfer.getData('application/reactflow') || dragTypeRef.current;
    dragTypeRef.current = null;
    if (!type) return;
    createNodeAt(type, position);
  }, [reactFlow, createNodeAt, handleDropFiles, addImageNodesAt]);

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

  // 导入画布 JSON：选文件 → 解析 → 二次确认（清空当前画布）→ 替换。
  // 解析失败弹原生 alert，用户取消选文件静默无操作。
  const handleImport = useCallback(async () => {
    let parsed;
    try {
      parsed = await pickAndParseCanvasFile();
    } catch (e) {
      window.alert(`导入失败：${e.message || e}`);
      return;
    }
    if (!parsed) return; // 用户取消
    const { nodes: inNodes, edges: inEdges } = parsed;
    if (inNodes.length > 0 && !window.confirm(`导入将清空当前画布（${nodesRef.current.length} 个节点）并用文件中的 ${inNodes.length} 个节点替换，确定？`)) {
      return;
    }
    setNodes(inNodes);
    setEdges(inEdges);
    setGroups([]);
  }, [setNodes, setEdges, setGroups]);

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

  // 重置节点参数：表单回 initialData(type).params 默认值 + 持久化记忆覆盖为默认（下次新建同类型不再预填旧值）。
  // 无 params 的节点（imageDisplay/note/uiSplitter 等）调用方不会注入 onResetParams，这里不判空。
  const handleResetParams = useCallback((nodeId, nodeType) => {
    if (!nodeType) return;
    const defaults = initialData(nodeType)?.params;
    if (!defaults || typeof defaults !== 'object') return;
    // 同步状态重置；saveLastParams 失败不阻塞重置动作
    updateNodeData(nodeId, { params: defaults });
    try { saveLastParams?.(nodeType, defaults); }
    catch (e) { console.error('resetParams saveLastParams failed:', e); }
  }, [updateNodeData, saveLastParams]);

  // 从右侧表单弹窗提交：建 loading 占位节点 + submit 入队
  const handleFormSubmit = useCallback((task) => {
    const workflowId = task.nodeType === NODE_TYPES.textToImage
      ? (settings.textToImageWorkflowId || WORKFLOWS.text_to_image)
      : (settings.editImageWorkflowId || WORKFLOWS.edit_image);
    const tag = task.nodeType === NODE_TYPES.editImage ? IMAGE_TAGS.editImage : IMAGE_TAGS.textToImage;
    // 记忆上次提交参数（剥离图片，按工作区+nodeType）—— 失败不阻塞
    try {
      const { prompt, model, aspect, size } = task.input || {};
      saveLastParams?.(task.nodeType, { prompt, model, aspect, size });
    } catch (e) { console.error('saveLastParams failed:', e); }
    const placeholderNodeId = createNodeAt(
      NODE_TYPES.imageDisplay,
      null,
      { images: [], source: 'queue', loading: true, error: undefined, tags: [tag] },
    );
    submit({ ...task, workflowId, placeholderNodeId, tags: [tag] });
  }, [settings, submit, createNodeAt, saveLastParams]);

  return {
    createNodeAt,
    handleAdd, handleAddAtDrop, handleAddAtMenu,
    handleDragStartNode, handleDragOver, handleDrop, handleDropFiles,
    handleInsertHistory, handleDragStartHistory,
    handleContextMenu, handleClear,
    handleDeleteNode, focusNode, handleSelectNode, handleLocateNode,
    handleAutoLayout, handleExport, handleImport,
    handleAutoSize, handleAutoSizeToContent, handleFormSubmit, handleResetParams,
  };
}
