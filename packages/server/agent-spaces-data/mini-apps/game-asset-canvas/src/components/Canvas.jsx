import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, Controls, MarkerType, MiniMap, ReactFlow,
  addEdge, applyEdgeChanges, applyNodeChanges, useReactFlow,
} from '@xyflow/react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@agent-spaces/ui';
import Toolbar from './Toolbar';
import RightPanel from './RightPanel';
import SettingsDialog from './SettingsDialog';
import TextToImageNode from './nodes/TextToImageNode';
import EditImageNode from './nodes/EditImageNode';
import ImageDisplayNode from './nodes/ImageDisplayNode';
import NoteNode from './nodes/NoteNode';
import useCanvasState from '../hooks/useCanvasState';
import useWorkflow from '../hooks/useWorkflow';
import useGenerationHistory from '../hooks/useGenerationHistory';
import useSettings from '../hooks/useSettings';
import { NODE_META, NODE_TYPES } from '../utils/constants';
import { autoLayout } from '../utils/layout';
import { downloadJson, serializeCanvas } from '../utils/export';
import { loadPanelLayout, onAnyConfigChanged, savePanelLayout } from '../utils/storage';

// 节点类型 -> 渲染组件
const NODE_COMPONENTS = {
  [NODE_TYPES.textToImage]: TextToImageNode,
  [NODE_TYPES.editImage]: EditImageNode,
  [NODE_TYPES.imageDisplay]: ImageDisplayNode,
  [NODE_TYPES.note]: NoteNode,
};

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

// 每种节点的初始 data
function initialData(type) {
  if (type === NODE_TYPES.note) return { text: '' };
  if (type === NODE_TYPES.imageDisplay) return { images: [], source: '' };
  const base = { status: 'idle', output: { images: [] } };
  return { ...base, params: { prompt: '', model: 'gpt-image-1', aspect: '1:1', size: '1k' } };
}

export default function Canvas() {
  const { nodes, edges, loaded, setNodes, setEdges, updateNodeData } = useCanvasState();
  const runWorkflow = useWorkflow();
  const { history, addHistory, removeHistory, clearHistory } = useGenerationHistory();
  const { settings, saveSettings } = useSettings();
  const [selectedId, setSelectedId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  // 节点完成后，把产出图片沿连线推给下游节点
  const propagateDownstream = useCallback((sourceId, images) => {
    if (!images.length) return;
    setNodes((prevNodes) => {
      const targets = edges.filter((e) => e.source === sourceId).map((e) => e.target);
      if (!targets.length) return prevNodes;
      const targetSet = new Set(targets);
      return prevNodes.map((nd) => {
        if (!targetSet.has(nd.id)) return nd;
        const data = nd.data || {};
        if (nd.type === NODE_TYPES.editImage) {
          return { ...nd, data: { ...data, images } };
        }
        if (nd.type === NODE_TYPES.imageDisplay) {
          return { ...nd, data: { ...data, images, source: 'upstream' } };
        }
        return nd;
      });
    });
  }, [edges, setNodes]);

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
      propagateDownstream(nodeId, urls);
      addHistory({
        id: genId('hist'),
        nodeId,
        nodeType,
        prompt: input?.prompt || '',
        model: input?.model || '',
        images: urls,
        createdAt: Date.now(),
      }).catch((e) => console.warn('addHistory failed:', e));
    } catch (err) {
      console.error('generate failed:', err);
      updateNodeData(nodeId, { status: 'error', error: err?.message || String(err) });
    }
  }, [runWorkflow, updateNodeData, propagateDownstream, addHistory, settings]);

  // 添加节点：显式 width/height（NodeResizer 依赖）
  // 创建节点到指定位置（点击添加 / 拖拽放下共用）
  const createNodeAt = useCallback((type, position) => {
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
      data: { ...initialData(type), label: meta.label },
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

  // 拖拽经过画布：必须 preventDefault 才能触发 drop
  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // 放下：用 screenToFlowPosition 把鼠标坐标转成画布坐标，创建节点
  const handleDrop = useCallback((event) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow') || dragTypeRef.current;
    dragTypeRef.current = null;
    if (!type) return;
    const position = reactFlow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    createNodeAt(type, position);
  }, [reactFlow, createNodeAt]);

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

  // 选中节点（从右侧面板点击，仅同步 selectedId 用于面板高亮）
  const handleSelectNode = useCallback((nodeId) => {
    setSelectedId(nodeId);
  }, []);

  // 定位/跳转到节点：用 setCenter 把画布视口居中到该节点
  const handleLocateNode = useCallback((nodeId) => {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target) return;
    const w = target.width || target.style?.width || 280;
    const h = target.height || target.style?.height || 220;
    reactFlow.setCenter(target.position.x + w / 2, target.position.y + h / 2, { zoom: 1, duration: 400 });
    setSelectedId(nodeId);
  }, [nodes, reactFlow]);

  // 自动布局（dagre）
  const handleAutoLayout = useCallback(() => {
    setNodes((prev) => autoLayout(prev, edges));
  }, [edges, setNodes]);

  // 导出画布 JSON
  const handleExport = useCallback(() => {
    downloadJson(serializeCanvas(nodes, edges));
  }, [nodes, edges]);

  // 生成记录「用作输入」
  const handleUseImage = useCallback((url) => {
    const id = genId(NODE_TYPES.imageDisplay);
    const meta = NODE_META[NODE_TYPES.imageDisplay];
    const size = DEFAULT_SIZE[NODE_TYPES.imageDisplay];
    setNodes((prev) => [...prev, {
      id, type: NODE_TYPES.imageDisplay,
      position: { x: 420, y: 120 + prev.length * 30 },
      width: size.w, height: size.h,
      style: { width: size.w, height: size.h },
      data: { ...initialData(NODE_TYPES.imageDisplay), images: [url], source: 'history', label: meta.label },
    }]);
  }, [setNodes]);

  // 给每个节点的 data 注入 onUpdate / onGenerate（节点内部需要）。
  // 注意：不要覆盖 node.selected —— 选中状态由 ReactFlow 通过 onNodesChange 的
  // selection 变更 + applyNodeChanges 自行管理；这里强行赋值会破坏点击选中/删除机制。
  const decoratedNodes = useMemo(
    () => nodes.map((nd) => ({
      ...nd,
      data: {
        ...nd.data,
        onUpdate: makeOnUpdate(nd.id),
        onGenerate: handleGenerate,
      },
    })),
    [nodes, makeOnUpdate, handleGenerate],
  );

  // 面板布局变化 -> 持久化
  const handlePanelLayoutChange = useCallback((layout) => {
    setPanelLayout(layout);
    savePanelLayout(layout);
  }, []);

  const nodeTypes = useMemo(() => NODE_COMPONENTS, []);

  if (!loaded) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">加载中…</div>;
  }

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
          />
          {/* 外层 ref + onDrop/onDragOver 实现拖拽新增节点（参考 reactflow.dev drag-and-drop） */}
          <div className="relative min-h-0 flex-1" ref={wrappingRef} onDrop={handleDrop} onDragOver={handleDragOver}>
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
    </ResizablePanelGroup>
  );
}
