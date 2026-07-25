import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, Controls, ControlButton, MarkerType, MiniMap,
  ReactFlow, addEdge, applyEdgeChanges, applyNodeChanges, useReactFlow,
} from '@xyflow/react';
import {
  ResizablePanelGroup, ResizablePanel, ResizableHandle,
  MapPinned,
} from '@agent-spaces/ui';

import Toolbar from './Toolbar';
import RightPanel from './RightPanel';
import ConnectionLine from './ConnectionLine';
import SettingsDialog from './SettingsDialog';
import ExecutionQueuePopover from './ExecutionQueuePopover';
import NodeFormDialog from './NodeFormDialog';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import CanvasContextMenu from './canvas/CanvasContextMenu';
import DropNodeMenu from './canvas/DropNodeMenu';
import MultiSelectToolbar from './canvas/MultiSelectToolbar';
import GroupOverlays from './canvas/GroupOverlays';

import useCanvasState from '../hooks/useCanvasState';
import useWorkflow from '../hooks/useWorkflow';
import useGenerationHistory from '../hooks/useGenerationHistory';
import useSettings from '../hooks/useSettings';
import useExecutionQueue from '../hooks/useExecutionQueue';
import useWorkspaces from '../hooks/useWorkspaces';
import usePanelLayout from '../hooks/usePanelLayout';
import useImageOutputs from '../hooks/useImageOutputs';
import useSelectionClipboard from '../hooks/useSelectionClipboard';
import useGroupOperations from '../hooks/useGroupOperations';
import useNodeCrud from '../hooks/useNodeCrud';
import useNodeExecutions from '../hooks/useNodeExecutions';
import useCanvasAgentRpc from '../hooks/useCanvasAgentRpc';
import useDecoratedNodes from '../hooks/useDecoratedNodes';

import { IMAGE_TAGS, NODE_TYPES, NODE_META, dedupeTags } from '../utils/constants';
import { NODE_COMPONENTS, PANEL_ID_MAIN, PANEL_ID_RIGHT } from '../utils/canvas-constants';
import { genId } from '../utils/canvas-id';

/**
 * 游戏资产生成画布主组件（编排层）。
 *
 * 原 1969 行的「上帝组件」已按功能拆分到 utils/（6文件）+ hooks/（8个）+ components/canvas/（5个），
 * 本文件只负责：hook 装配 + ReactFlow 变更回调 + JSX 编排骨架。
 *
 * 数据流：useCanvasState 是 nodes/edges/groups 的单一数据源；computeInputImages 派生输入图；
 * decoratedNodes 注入回调后喂给 ReactFlow；各 hook 负责具体业务逻辑。
 */
export default function Canvas() {
  // —— 工作区 + 画布状态 + 设置 + 历史（基础数据源）——
  const { workspaces, activeId, createWorkspace, renameWorkspace, switchWorkspace, deleteWorkspace } = useWorkspaces();
  const { nodes, edges, groups, loaded, setNodes, setEdges, setGroups, updateNodeData } = useCanvasState(activeId);
  const runWorkflow = useWorkflow();
  const { history, addHistory, removeHistory, clearHistory } = useGenerationHistory(activeId);
  const { settings, saveSettings } = useSettings();

  // —— 本组件局部 state ——
  const [selectedId, setSelectedId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 节点表单弹窗（右侧新增节点 tab 触发，或节点工具栏【编辑】按钮触发）：{ nodeType, initialImages } | null
  const [formState, setFormState] = useState(null);
  // 右键菜单位置：ContextMenu 自管浮层定位，这里只记录右键处的画布坐标供建节点
  const [contextMenu, setContextMenu] = useState(null);
  // 拖拽连线到空白处放手的「添加节点」菜单：{ clientX, clientY, source, sourceHandle } | null
  const [dropNodeMenu, setDropNodeMenu] = useState(null);

  const reactFlow = useReactFlow();
  const wrappingRef = useRef(null);

  // —— 面板布局持久化 ——
  const { panelLayout, showMinimap, handlePanelLayoutChange, toggleMinimap } = usePanelLayout();

  // —— 图片节点批量产出（先抽，被执行队列 onComplete 前向引用）——
  const { addImageNodesFromUrls, handleExportImages } = useImageOutputs({ setNodes, setGroups });

  // —— 执行队列（onComplete/onError 用 imageOutputs + updateNodeData + addHistory）——
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
      if (job.placeholderNodeId) {
        updateNodeData(job.placeholderNodeId, {
          loading: false,
          source: 'error',
          error: err?.message || String(err),
        });
      }
    },
  });

  // —— 节点 CRUD + 定位/布局/导出 + 尺寸自适应 + 表单提交 ——
  const crud = useNodeCrud({
    nodes, edges, setNodes, setEdges, setGroups,
    reactFlow, selectedId, setSelectedId, updateNodeData, settings, submit,
    setDropNodeMenu, setContextMenu,
  });

  // —— 节点执行回调（工作流/媒体/本地算法/抠图/反推提示词）——
  const executions = useNodeExecutions({
    runWorkflow, updateNodeData, addHistory, settings, createNodeAt: crud.createNodeAt,
  });

  // —— 选中 + 复制粘贴 + 对齐分布 + 批量删除 ——
  const selection = useSelectionClipboard({
    nodes, edges, setNodes, setEdges, setGroups, setSelectedId, addImageNodesFromUrls,
  });

  // —— 分组操作 + overlay 移动/连线 ——
  const groupOps = useGroupOperations({ groups, nodes, edges, setGroups, setNodes, setEdges, reactFlow });

  // —— Agent RPC（WS message 监听，ref 持有最新值只订阅一次）——
  useCanvasAgentRpc({
    nodes, edges,
    createNodeAt: crud.createNodeAt,
    updateNodeData, handleDeleteNode: crud.handleDeleteNode, focusNode: crud.focusNode,
    setNodes, setEdges,
  });

  // —— ReactFlow 变更回调（逻辑简单，留在编排层）——
  const onNodesChange = useCallback((changes) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
  }, [setNodes]);

  const onEdgesChange = useCallback((changes) => {
    setEdges((prev) => applyEdgeChanges(changes, prev));
  }, [setEdges]);

  // 连线：多选增强（参考 xyflow MultiConnect）——若 source 选中，把所有选中节点都连到 target
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
            source, target: conn.target,
            sourceHandle: conn.sourceHandle, targetHandle: conn.targetHandle,
            markerEnd: { type: MarkerType.ArrowClosed }, animated: true,
          },
          next,
        );
      }
      return next;
    });
  }, [nodes, setEdges]);

  // 连线拖到空白处放手：弹出「添加节点」菜单
  const onConnectEnd = useCallback((event, connectionState) => {
    if (connectionState.isValid) return;
    if (!connectionState.fromNode) return;
    const { clientX, clientY } = 'changedTouches' in event ? event.changedTouches[0] : event;
    setDropNodeMenu({
      clientX, clientY,
      source: connectionState.fromNode.id,
      sourceHandle: connectionState.fromHandle?.id ?? null,
    });
  }, []);

  // 节点删除时同步清理相关连线 + 分组悬空引用
  const onNodesDelete = useCallback((deleted) => {
    if (!deleted?.length) return;
    const ids = new Set(deleted.map((n) => n.id));
    setEdges((prev) => prev.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
    setGroups((prev) => prev.map((g) => ({
      ...g,
      childNodeIds: g.childNodeIds.filter((id) => !ids.has(id)),
    })));
  }, [setEdges, setGroups]);

  const deleteKeyCode = useMemo(() => (['Backspace', 'Delete']), []);
  const nodeTypes = useMemo(() => NODE_COMPONENTS, []);

  // —— 注入到节点 data 的回调集合（useMemo 稳定引用，避免 decoratedNodes 频繁重算）——
  const nodeCallbacks = useMemo(() => ({
    makeOnUpdate: executions.makeOnUpdate,
    onGenerate: executions.handleGenerate,
    onGenerateMedia: executions.handleGenerateMedia,
    onExportImages: handleExportImages,
    onProcessImage: executions.handleProcessImage,
    onProcessLocal: executions.handleProcessLocal,
    onCutout: executions.handleCutout,
    onCutoutCreate: executions.handleCutoutCreate,
    onCancelProcess: executions.handleCancelProcess,
    onPromptReverse: executions.handlePromptReverse,
    onEditImages: (imgs) => setFormState({ nodeType: NODE_TYPES.editImage, initialImages: imgs }),
    onAutoSize: crud.handleAutoSize,
    onAutoSizeToContent: crud.handleAutoSizeToContent,
  }), [executions, handleExportImages, crud.handleAutoSize, crud.handleAutoSizeToContent]);

  const { decoratedNodes } = useDecoratedNodes({
    nodes, edges,
    selectionCount: selection.selectionCount,
    settings, callbacks: nodeCallbacks,
  });

  // —— 工作区操作（切换/创建/删除）——
  const handleSwitch = (id) => { if (id !== activeId) switchWorkspace(id); };
  const handleCreate = async (name) => {
    const res = await createWorkspace(name);
    const newWs = res?.workspaces?.slice(-1)?.[0];
    if (newWs) switchWorkspace(newWs.id);
  };
  const handleDelete = async (ids) => {
    const list = Array.isArray(ids) ? ids : [ids];
    let last = null;
    for (const id of list) {
      if (id === activeId) continue;
      last = await deleteWorkspace(id);
    }
    if (last?.activeId && last.activeId !== activeId) switchWorkspace(last.activeId);
  };

  // —— loading guard ——
  if (!activeId || !loaded) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">加载中…</div>;
  }

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="h-full min-h-0"
      defaultLayout={panelLayout}
      onLayoutChange={handlePanelLayoutChange}
    >
      <ResizablePanel id={PANEL_ID_MAIN} order={1} minSize="40%">
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
          <Toolbar
            onClear={crud.handleClear}
            onAutoLayout={crud.handleAutoLayout}
            onExport={crud.handleExport}
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
          {/* 右键菜单：ContextMenuTrigger 用 render prop 包裹画布容器（Base UI render 合并 ref/props/children） */}
          <CanvasContextMenu
            triggerElement={
              <div
                className="relative min-h-0 flex-1"
                ref={wrappingRef}
                onDrop={crud.handleDrop}
                onDragOver={crud.handleDragOver}
                onContextMenu={crud.handleContextMenu}
              />
            }
            onPick={crud.handleAddAtMenu}
          >
            <ReactFlow
              nodes={decoratedNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              connectionLineComponent={ConnectionLine}
              onSelectionChange={selection.onSelectionChange}
              onNodesDelete={onNodesDelete}
              deleteKeyCode={deleteKeyCode}
              nodeTypes={nodeTypes}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
              <Controls>
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
              {/* 分组 overlay：ViewportPortal 内跟随画布 pan/zoom */}
              <GroupOverlays
                items={groupOps.groupOverlayItems}
                selectedGroupId={groupOps.selectedGroupId}
                onSelect={groupOps.setSelectedGroupId}
                onDelete={groupOps.deleteGroup}
                onUpdate={groupOps.updateGroup}
                onMove={groupOps.handleGroupMove}
                onConnect={groupOps.handleGroupConnect}
                screenDeltaToFlowDelta={groupOps.screenDeltaToFlowDelta}
              />
            </ReactFlow>

            {/* 底部多选 toolbar */}
            <MultiSelectToolbar
              selectionCount={selection.selectionCount}
              onCreateGroup={groupOps.createGroupFromSelection}
              onAlignDistribute={selection.alignDistribute}
              onDeleteSelected={selection.deleteSelectedNodes}
            />

            {/* 拖拽连线到空白处的「添加节点」菜单 */}
            <DropNodeMenu
              dropNodeMenu={dropNodeMenu}
              onClose={() => setDropNodeMenu(null)}
              onPick={crud.handleAddAtDrop}
            />
          </CanvasContextMenu>
        </div>
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel id={PANEL_ID_RIGHT} order={2} minSize="18%" maxSize="48%">
        <RightPanel
          nodes={nodes}
          onSelectNode={crud.handleSelectNode}
          onLocateNode={crud.handleLocateNode}
          onDeleteNode={crud.handleDeleteNode}
          onAdd={crud.handleAdd}
          onDragStartNode={crud.handleDragStartNode}
          onOpenForm={(type) => setFormState({ nodeType: type, initialImages: [] })}
          history={history}
          onRemoveHistory={removeHistory}
          onClearHistory={clearHistory}
          onUseImage={selection.handleUseImage}
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
        onSubmit={crud.handleFormSubmit}
      />
    </ResizablePanelGroup>
  );
}
