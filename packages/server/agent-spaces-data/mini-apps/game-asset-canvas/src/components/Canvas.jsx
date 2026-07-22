import { useCallback, useMemo } from 'react';
import {
  Background, BackgroundVariant, Controls, MarkerType, MiniMap, ReactFlow,
  addEdge, applyEdgeChanges, applyNodeChanges,
} from '@xyflow/react';
import Toolbar from './Toolbar';
import TextToImageNode from './nodes/TextToImageNode';
import EditImageNode from './nodes/EditImageNode';
import PreviewNode from './nodes/PreviewNode';
import NoteNode from './nodes/NoteNode';
import useCanvasState from '../hooks/useCanvasState';
import useWorkflow from '../hooks/useWorkflow';
import { NODE_META, NODE_TYPES } from '../utils/constants';
import { autoLayout } from '../utils/layout';
import { downloadJson, serializeCanvas } from '../utils/export';

// 节点类型 -> 渲染组件
const NODE_COMPONENTS = {
  [NODE_TYPES.textToImage]: TextToImageNode,
  [NODE_TYPES.editImage]: EditImageNode,
  [NODE_TYPES.preview]: PreviewNode,
  [NODE_TYPES.note]: NoteNode,
};

let seq = 0;
function genId(prefix) {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

// 每种节点的初始 data
function initialData(type) {
  if (type === NODE_TYPES.note) return { text: '' };
  const base = { status: 'idle', output: { images: [] } };
  if (type === NODE_TYPES.preview) return { ...base, images: [] };
  return { ...base, params: { prompt: '', model: 'gpt-image-1', aspect: '1:1', size: '1k' } };
}

export default function Canvas() {
  const { nodes, edges, loaded, setNodes, setEdges, updateNodeData } = useCanvasState();
  const runWorkflow = useWorkflow();

  // ReactFlow 直接以 useCanvasState 的 nodes/edges 为单一数据源
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
        // 编辑图片节点：作为输入图片（替换）
        if (nd.type === NODE_TYPES.editImage) {
          return { ...nd, data: { ...data, images } };
        }
        // 预览节点：展示（多上游累加去重）
        if (nd.type === NODE_TYPES.preview) {
          const merged = Array.from(new Set([...(data.images || []), ...images]));
          return { ...nd, data: { ...data, images: merged } };
        }
        return nd;
      });
    });
  }, [edges, setNodes]);

  // 节点点击"生成"
  const handleGenerate = useCallback(async (nodeId, _nodeType, { workflowId, input }) => {
    updateNodeData(nodeId, { status: 'running', error: undefined });
    try {
      const { urls } = await runWorkflow(workflowId, input, nodeId);
      if (!urls.length) throw new Error('未返回图片');
      updateNodeData(nodeId, { status: 'done', output: { images: urls } });
      propagateDownstream(nodeId, urls);
    } catch (err) {
      console.error('generate failed:', err);
      updateNodeData(nodeId, { status: 'error', error: err?.message || String(err) });
    }
  }, [runWorkflow, updateNodeData, propagateDownstream]);

  // 添加节点
  const handleAdd = useCallback((type) => {
    const id = genId(type);
    const meta = NODE_META[type] || {};
    const offset = nodes.length * 30;
    const node = {
      id,
      type,
      position: { x: 120 + offset, y: 120 + offset },
      data: { ...initialData(type), label: meta.label },
    };
    setNodes((prev) => [...prev, node]);
  }, [nodes.length, setNodes]);

  const handleClear = useCallback(() => {
    setNodes([]);
    setEdges([]);
  }, [setNodes, setEdges]);

  // 自动布局（dagre）
  const handleAutoLayout = useCallback(() => {
    setNodes((prev) => autoLayout(prev, edges));
  }, [edges, setNodes]);

  // 导出画布 JSON
  const handleExport = useCallback(() => {
    downloadJson(serializeCanvas(nodes, edges));
  }, [nodes, edges]);

  // 给每个节点的 data 注入 onUpdate / onGenerate（节点内部需要）
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

  const nodeTypes = useMemo(() => NODE_COMPONENTS, []);

  if (!loaded) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">加载中…</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <Toolbar
        onAdd={handleAdd}
        onClear={handleClear}
        onAutoLayout={handleAutoLayout}
        onExport={handleExport}
        count={nodes.length}
      />
      <div className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={decoratedNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
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
  );
}
