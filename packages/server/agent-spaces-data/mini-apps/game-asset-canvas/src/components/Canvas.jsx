import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, Controls, ControlButton, MarkerType, MiniMap,
  ReactFlow, addEdge, applyEdgeChanges, applyNodeChanges, useReactFlow,
} from '@xyflow/react';
import {
  ResizablePanelGroup, ResizablePanel, ResizableHandle,
  Images, MapPinned,
} from '@agent-spaces/ui';

import Toolbar from './Toolbar';
import RightPanel from './RightPanel';
import ConnectionLine from './ConnectionLine';
import SettingsDialog from './SettingsDialog';
import ExecutionQueuePopover from './ExecutionQueuePopover';
import NodeFormDialog from './NodeFormDialog';
import NodeExecuteDialog from './NodeExecuteDialog';
import PromptPickerDialog from './PromptPickerDialog';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import CanvasContextMenu from './canvas/CanvasContextMenu';
import DropNodeMenu from './canvas/DropNodeMenu';
import MultiSelectToolbar from './canvas/MultiSelectToolbar';
import GroupOverlays from './canvas/GroupOverlays';
import FloatingEdge from './canvas/FloatingEdge';
import AssetLibraryPickerDialog from './AssetLibraryPickerDialog';
import ExportImagesDialog from './ExportImagesDialog';
import GroupConfirmDialog from './GroupConfirmDialog';
import DeleteGroupDialog from './DeleteGroupDialog';
import useAssetLibrary from '../hooks/useAssetLibrary';

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
import useGroupExecution from '../hooks/useGroupExecution';
import useNodeCrud from '../hooks/useNodeCrud';
import useNodeExecutions from '../hooks/useNodeExecutions';
import useLastParams from '../hooks/useLastParams';
import { runCutout } from '../utils/cutout';
import { WORKFLOWS } from '../utils/constants';
import useCanvasAgentRpc from '../hooks/useCanvasAgentRpc';
import useDecoratedNodes from '../hooks/useDecoratedNodes';

import { IMAGE_TAGS, NODE_TYPES, NODE_META, dedupeTags } from '../utils/constants';
import { NODE_COMPONENTS, PANEL_ID_MAIN, PANEL_ID_RIGHT } from '../utils/canvas-constants';
import { genId } from '../utils/canvas-id';

const EDGE_TYPES = { floating: FloatingEdge };
const DEFAULT_EDGE_OPTIONS = { type: 'floating' };

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
  const activeWorkspace = workspaces.find((ws) => ws.id === activeId);
  const {
    nodes, edges, groups, viewport, hasSavedViewport, loaded,
    setNodes, setEdges, setGroups, setViewport, updateNodeData,
  } = useCanvasState(activeId);
  // 落地策略由 directory 驱动：设了则产图落到工作区目录，否则落 data（详见 useWorkflow/generateImages）
  const runWorkflow = useWorkflow(activeWorkspace?.directory);
  const { history, addHistory, removeHistory, clearHistory } = useGenerationHistory(activeId);
  const { settings, saveSettings } = useSettings();
  // 上次提交参数（按工作区+nodeType 隔离）：saveLastParams 给执行回调用，getLastParams 给 createNodeAt 预填用
  const { saveLastParams, getLastParams } = useLastParams(activeId);

  // —— 本组件局部 state ——
  const [selectedId, setSelectedId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 顶部菜单「提示词管理」入口：pickerMode=false 纯管理（不填充、不关闭）
  const [promptManagerOpen, setPromptManagerOpen] = useState(false);
  // 预览高度仅影响当前展示；预览模式由各节点 data.outputPreviewMode 独立持久化。
  const [outputPreviewState, setOutputPreviewState] = useState({});
  // 节点表单弹窗（右侧新增节点 tab 触发，或节点工具栏【编辑】按钮触发）：{ nodeType, initialImages } | null
  const [formState, setFormState] = useState(null);
  // 节点执行弹窗（右侧新增节点卡片 ⚡ 图标触发，不创建画布节点，产出只写生成记录）：{ nodeType } | null
  const [executeState, setExecuteState] = useState(null);
  // 右键菜单位置：ContextMenu 自管浮层定位，这里只记录右键处的画布坐标供建节点
  const [contextMenu, setContextMenu] = useState(null);
  // 拖拽连线到空白处放手的「添加节点」菜单：{ clientX, clientY, source, sourceHandle } | null
  const [dropNodeMenu, setDropNodeMenu] = useState(null);

  const reactFlow = useReactFlow();
  const wrappingRef = useRef(null);

  // nodes/edges 的 ref 镜像：让「只需读最新值、不需响应式重建」的 callback（onConnect/handleCopy 等）
  // 去掉对 nodes/edges 的依赖，成为稳定 callback，避免触发 nodeCallbacks/decoratedNodes 频繁重算。
  // 同步在每次渲染后更新（useEffect 兜底 + 直接赋值保证同步读取）。
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // 画布中「运行中」的节点（data.status==='running'）：在执行队列 popover 一并展示，支持中断。
  const runningNodes = useMemo(
    () => nodes
      .filter((n) => n.data?.status === 'running')
      .map((n) => ({
        id: n.id,
        nodeType: n.type,
        label: NODE_META[n.type]?.label || n.data?.label || n.type,
      })),
    [nodes],
  );

  // —— 面板布局持久化 ——
  const { panelLayout, showMinimap, handlePanelLayoutChange, toggleMinimap } = usePanelLayout();

  // —— 图片节点批量产出（先抽，被执行队列 onComplete 前向引用）——
  const { addImageNodesFromUrls, addImageNodesGrouped, handleExportImages } = useImageOutputs({ setNodes, setGroups });

  // —— 执行队列（onComplete/onError 用 imageOutputs + updateNodeData + addHistory）——
  const { jobs, submit, cancel, clearFinished, runningCount } = useExecutionQueue({
    directory: activeWorkspace?.directory,
    onComplete: (job, images, histId) => {
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
      // 落地已在 generateImages 内完成（按 directory 决定走工作区目录或 data），这里只记录历史
      addHistory({
        id: histId,
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
  // 画布容器屏幕中心点（供 handleAdd 定位新节点到视口中心）
  const getViewportCenter = useCallback(() => {
    const el = wrappingRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, []);
  const crud = useNodeCrud({
    nodes, edges, setNodes, setEdges, setGroups,
    reactFlow, selectedId, setSelectedId, updateNodeData, settings, submit,
    setDropNodeMenu, setContextMenu,
    getViewportCenter, getLastParams, saveLastParams,
  });

  // —— 节点执行回调（工作流/媒体/本地算法/抠图/反推提示词）——
  const executions = useNodeExecutions({
    runWorkflow, updateNodeData, addHistory, settings, createNodeAt: crud.createNodeAt, saveLastParams,
  });

  // —— 选中 + 复制粘贴 + 对齐分布 + 批量删除 ——
  const selection = useSelectionClipboard({
    nodes, edges, setNodes, setEdges, setGroups, setSelectedId, addImageNodesFromUrls,
  });

  // —— 分组操作 + overlay 移动/连线 ——
  const groupOps = useGroupOperations({ groups, nodes, edges, setGroups, setNodes, setEdges, reactFlow });
  const groupExecution = useGroupExecution({ groups, nodes, edges, setGroups, setNodes });

  // —— ReactFlow 变更回调（逻辑简单，留在编排层）——
  const onNodesChange = useCallback((changes) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
  }, [setNodes]);

  const onEdgesChange = useCallback((changes) => {
    setEdges((prev) => applyEdgeChanges(changes, prev));
  }, [setEdges]);

  // 连线：多选增强（参考 xyflow MultiConnect）——若 source 选中，把所有选中节点都连到 target。
  // 用 nodesRef 读最新 nodes（多选判断），callback deps 不含 nodes → 稳定引用。
  const onConnect = useCallback((conn) => {
    setEdges((prev) => {
      const curNodes = nodesRef.current;
      const sources = curNodes.some((n) => n.id === conn.source && n.selected)
        ? curNodes.filter((n) => n.selected).map((n) => n.id)
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
  }, [setEdges]);

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
  const floatingEdges = useMemo(
    () => edges.map((edge) => (edge.type === 'floating' ? edge : { ...edge, type: 'floating' })),
    [edges],
  );

  const handleOutputPreviewHeight = useCallback((id, height) => {
    if (!id || !Number.isFinite(height) || height <= 0) return;
    setOutputPreviewState((prev) => {
      const current = prev[id];
      if (current?.height === height) return prev;
      return { ...prev, [id]: { ...current, height } };
    });
  }, []);

  const handleOutputPreviewModeChange = useCallback((id, enabled) => {
    if (!id) return;
    updateNodeData(id, { outputPreviewMode: enabled === true });
  }, [updateNodeData]);

  const enableAllNodePreviews = useCallback(() => {
    setNodes((prev) => prev.map((node) => (
      node.data?.outputPreviewMode === true
        ? node
        : { ...node, data: { ...(node.data || {}), outputPreviewMode: true } }
    )));
  }, [setNodes]);

  const allNodePreviewsEnabled = nodes.length > 0
    && nodes.every((node) => node.data?.outputPreviewMode === true);

  // —— 注入到节点 data 的回调集合 ——
  // deps 逐个解构具体 callback（而非整个 executions/crud 对象），任一稳定则 nodeCallbacks 稳定，
  // 避免因 hook 返回对象引用变化触发 decoratedNodes 全量重算。
  const {
    makeOnUpdate, handleGenerate, handleGenerateMedia, handleProcessImage,
    handleProcessLocal, handleCutout, handleCutoutCreate, handleCancelProcess, handlePromptReverse,
  } = executions;
  const { handleAutoSize, handleAutoSizeToContent } = crud;
  const { handleResetParams } = crud;

  // BBox 查看器「元素拆分」抠图回调：直接调 runCutout（不经节点状态机），注入 workflow 依赖。
  // 签名 (mode, modeParams, urls) => Promise<string[]|null>，与 CutoutDialog.onRun 对齐。
  const handleBBoxCutout = useCallback(async (mode, modeParams, urls) => {
    const extraCtx = mode === 'workflow'
      ? { workflowId: settings.imageEnchanterWorkflowId || WORKFLOWS.image_enchanter, runWorkflowFn: runWorkflow }
      : {};
    try {
      return await runCutout(mode, urls || [], modeParams || {}, extraCtx);
    } catch (err) {
      console.error('[canvas] bbox cutout failed:', err);
      return null;
    }
  }, [settings, runWorkflow]);

  // —— 添加到素材库：节点产出图 / 生成记录图 共用的分组选择器 ——
  const { addAsset } = useAssetLibrary(activeId);
  const [assetsPickerOpen, setAssetsPickerOpen] = useState(false);
  // 统一归一化为 {url, fileName?}：兼容旧调用方传 string / string[]，以及新调用方传 {url,fileName} / 该类对象数组
  const [assetsPickerImages, setAssetsPickerImages] = useState([]);

  // 入口：传入一张或多张图（url 字符串或 {url,fileName?} 对象），打开分组选择器
  const handleAddToAssets = useCallback((payload) => {
    const list = (Array.isArray(payload) ? payload : [payload])
      .map((it) => (typeof it === 'string' ? { url: it } : it))
      .filter((it) => it && it.url);
    if (!list.length) return;
    setAssetsPickerImages(list);
    setAssetsPickerOpen(true);
  }, []);

  // 确认：把待加图片逐张写入所有选中分组（add_asset 服务端已按 url 去重）
  // fileName 同时作为入库 name（文件名）和 title（去掉扩展名的可读标题）
  const handleAssetsPickerConfirm = useCallback(async (pickedGroups) => {
    if (!pickedGroups?.length) return;
    for (const grp of pickedGroups) {
      for (const item of assetsPickerImages) {
        const url = item.url;
        const fileName = item.fileName || url.split('/').pop() || 'untitled';
        const dot = fileName.lastIndexOf('.');
        const title = dot > 0 ? fileName.slice(0, dot) : fileName;
        try {
          await addAsset(grp.id, {
            id: `ast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            url,
            name: fileName,
            title,
            size: 0,
            uploadedAt: Date.now(),
          });
        } catch (err) {
          console.error('addAsset failed:', err);
        }
      }
    }
  }, [addAsset, assetsPickerImages]);

  // —— 导出图片流程：多图选择 → 分组确认 → 落到画布 ——
  // exportState: 多图时打开选择对话框 { sourceNode, images }
  // groupState: 选完图后打开分组确认 { sourceNode, urls }
  const [exportState, setExportState] = useState(null);
  const [groupState, setGroupState] = useState(null);
  const handleExportImagesWithPicker = useCallback((sourceNode, imgs) => {
    if (!imgs?.length) return;
    if (imgs.length === 1) {
      handleExportImages(sourceNode, imgs);
      return;
    }
    setExportState({ sourceNode, images: imgs });
  }, [handleExportImages]);

  // ExportImages 选完后：弹分组确认框（询问是否分组 + 分组名）
  const handleExportSelection = useCallback((urls) => {
    if (!urls?.length || !exportState?.sourceNode) return;
    setGroupState({ sourceNode: exportState.sourceNode, urls });
  }, [exportState]);

  // —— 插入一组图片到画布（素材库「插入到画布」复用）——
  // opts.group=true 时建一条 WorkflowGroup 把所有图片节点归组；否则每张图独立节点。
  // opts.groupName 指定分组名（缺省用时间戳）。
  // 位置统一走 addImageNodesGrouped（内部用 findFreePositions 避让已有节点，不重叠）。
  const handleInsertImagesToCanvas = useCallback((urls, opts = {}) => {
    const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
    if (!list.length) return;
    if (!opts.group) {
      addImageNodesFromUrls(list, { source: 'assets' });
      return;
    }
    addImageNodesGrouped(list, { source: 'assets', groupName: opts.groupName || '' });
  }, [addImageNodesFromUrls, addImageNodesGrouped]);

  // —— 生成记录「插入到画布」菜单：包装 crud.handleInsertHistory 支持分组 ——
  // opts.group=true 时，先建节点（crud.handleInsertHistory 返回新节点 id），再建一条 WorkflowGroup。
  const handleInsertHistoryWithMenu = useCallback((item, opts = {}) => {
    const newId = crud.handleInsertHistory(item);
    if (opts.group && newId) {
      const meta = NODE_META[item.nodeType];
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      setGroups((prev) => [...prev, {
        id: genId('group'),
        name: opts.groupName || `${meta?.label || '记录'} ${hh}:${mm}`,
        childNodeIds: [newId],
        childGroupIds: [],
        locked: false,
        disabled: false,
        savedNodeStates: {},
      }]);
    }
  }, [crud, setGroups]);

  // 产出区「添加/删除单张/清空」：统一写回 data.output.images（基于最新 data 用函数式 patch）。
  // 这些是用户对当前产出图的手动编辑，不是新生成，加 __versionSkip 避免被版本存档误捕获。
  // makeOnUpdate 是浅合并整对象，这里需要读旧 images 增删，故直接调 updateNodeData 传函数 patch。
  const handleOutputImagesChange = useCallback((nodeId, mutator) => {
    updateNodeData(nodeId, (data) => {
      const prev = Array.isArray(data?.output?.images) ? data.output.images : [];
      const next = mutator(prev);
      return { __versionSkip: true, output: { ...(data?.output || {}), images: next } };
    });
  }, [updateNodeData]);
  const handleAddOutputImages = useCallback((nodeId, urls) => {
    if (!Array.isArray(urls) || !urls.length) return;
    handleOutputImagesChange(nodeId, (prev) => [...prev, ...urls.filter(Boolean)]);
  }, [handleOutputImagesChange]);
  const handleRemoveOutputImage = useCallback((nodeId, index) => {
    handleOutputImagesChange(nodeId, (prev) => prev.filter((_, i) => i !== index));
  }, [handleOutputImagesChange]);
  // 产出图重排序：拖拽调整顺序，写回 data.output.images
  const handleReorderOutputImages = useCallback((nodeId, next) => {
    if (!Array.isArray(next)) return;
    handleOutputImagesChange(nodeId, () => next);
  }, [handleOutputImagesChange]);
  const handleClearOutputImages = useCallback((nodeId) => {
    // 清空产出同时清空版本历史：避免清空后 versions 残留，刷新页面版本按钮又出现
    updateNodeData(nodeId, { __versionSkip: true, output: { images: [] }, versions: [], activeVersion: undefined, status: 'idle' });
  }, [updateNodeData]);

  // 版本切换：把节点 params/output/status 还原到指定历史版本。加 __switchVersion 标记，
  // updateNodeData 不会把这次写入当作新版本存档，仅更新 activeVersion。
  const handleSwitchVersion = useCallback((nodeId, versionIndex) => {
    updateNodeData(nodeId, (data) => {
      const versions = Array.isArray(data?.versions) ? data.versions : [];
      const v = versions[versionIndex];
      if (!v) return { __switchVersion: true };
      return {
        __switchVersion: true,
        params: v.params ? { ...v.params } : (data.params ? { ...data.params } : undefined),
        output: { ...v.output },
        status: 'done',
        activeVersion: versionIndex,
      };
    });
  }, [updateNodeData]);

  const nodeCallbacks = useMemo(() => ({
    makeOnUpdate,
    onGenerate: handleGenerate,
    onGenerateMedia: handleGenerateMedia,
    onExportImages: handleExportImagesWithPicker,
    onProcessImage: handleProcessImage,
    onProcessLocal: handleProcessLocal,
    onCutout: handleCutout,
    onCutoutCreate: handleCutoutCreate,
    onCancelProcess: handleCancelProcess,
    onPromptReverse: handlePromptReverse,
    onEditImages: (imgs) => setFormState({ nodeType: NODE_TYPES.editImage, initialImages: imgs }),
    onAutoSize: handleAutoSize,
    onAutoSizeToContent: handleAutoSizeToContent,
    onBBoxCutout: handleBBoxCutout,
    onResetParams: handleResetParams,
    onAddToAssets: handleAddToAssets,
    // 产出区操作（写 data.output.images）
    onAddOutputImages: handleAddOutputImages,
    onRemoveOutputImage: handleRemoveOutputImage,
    onClearOutputImages: handleClearOutputImages,
    onReorderOutputImages: handleReorderOutputImages,
    // 版本切换（还原 params/output/status 到指定历史版本）
    onSwitchVersion: handleSwitchVersion,
  }), [
    makeOnUpdate, handleGenerate, handleGenerateMedia, handleProcessImage,
    handleProcessLocal, handleCutout, handleCutoutCreate, handleCancelProcess, handlePromptReverse,
    handleExportImagesWithPicker, handleAutoSize, handleAutoSizeToContent, handleBBoxCutout, handleResetParams,
    handleAddToAssets, handleAddOutputImages, handleRemoveOutputImage, handleClearOutputImages, handleReorderOutputImages,
    handleSwitchVersion,
  ]);

  // —— Agent RPC（WS message 监听，ref 持有最新值只订阅一次）——
  // 放在 handleGenerate/handleGenerateMedia 解构之后（TDZ：执行回调需先声明）。
  useCanvasAgentRpc({
    nodes, edges,
    createNodeAt: crud.createNodeAt,
    updateNodeData, handleDeleteNode: crud.handleDeleteNode, focusNode: crud.focusNode,
    setNodes, setEdges, setGroups,
    onGenerate: handleGenerate, onGenerateMedia: handleGenerateMedia,
  });

  const { decoratedNodes } = useDecoratedNodes({
    nodes, edges,
    selectionCount: selection.selectionCount,
    outputPreviewState,
    onOutputPreviewHeight: handleOutputPreviewHeight,
    onOutputPreviewModeChange: handleOutputPreviewModeChange,
    settings, callbacks: nodeCallbacks,
  });

  // —— 工作区操作（切换/创建/删除）——
  const handleSwitch = (id) => { if (id !== activeId) switchWorkspace(id); };
  const handleCreate = async ({ name, directory }) => {
    const res = await createWorkspace(name, directory);
    const newWs = res?.workspaces?.slice(-1)?.[0];
    if (newWs) switchWorkspace(newWs.id);
  };
  const handleDelete = async (id) => {
    const last = await deleteWorkspace(id);
    // 服务端会保证至少留一个工作区；若删的是激活项，activeId 已回退，这里同步切换
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
            onImport={crud.handleImport}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenPromptManager={() => setPromptManagerOpen(true)}
            onSelectAll={selection.handleSelectAll}
            onInvertSelect={selection.handleInvertSelect}
            onClearSelection={selection.handleClearSelection}
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
                runningNodes={runningNodes}
                runningCount={runningCount + runningNodes.length}
                onCancel={cancel}
                onCancelNode={handleCancelProcess}
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
              key={activeId}
              nodes={decoratedNodes}
              edges={floatingEdges}
              viewport={viewport}
              onViewportChange={setViewport}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              connectionLineComponent={ConnectionLine}
              onSelectionChange={selection.onSelectionChange}
              onNodesDelete={onNodesDelete}
              deleteKeyCode={(groupOps.selectedGroupId || groupOps.deleteGroupId) ? null : deleteKeyCode}
              nodeTypes={nodeTypes}
              edgeTypes={EDGE_TYPES}
              defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
              fitView={!hasSavedViewport}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
              <Controls>
                <ControlButton
                  title="设置画布的每个节点的预览模式为开"
                  aria-label="设置画布的每个节点的预览模式为开"
                  aria-pressed={allNodePreviewsEnabled}
                  onClick={enableAllNodePreviews}
                  style={{ background: allNodePreviewsEnabled ? 'var(--accent)' : undefined }}
                >
                  <Images className="h-4 w-4" />
                </ControlButton>
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
                onDelete={groupOps.requestDeleteGroup}
                onUpdate={groupOps.updateGroup}
                onMove={groupOps.handleGroupMove}
                onConnect={groupOps.handleGroupConnect}
                screenDeltaToFlowDelta={groupOps.screenDeltaToFlowDelta}
                inputSlotCounts={groupExecution.inputSlotCounts}
                runningGroupIds={groupExecution.runningGroupIds}
                onSetExecutionMode={groupExecution.setMode}
                onSetExecutionCount={groupExecution.setCount}
                onSwitchExecutionRun={groupExecution.switchRun}
                onUploadExecutionAssets={groupExecution.uploadAssets}
                onRemoveExecutionAsset={groupExecution.removeAsset}
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
          onExecute={(type) => setExecuteState({ nodeType: type })}
          history={history}
          onRemoveHistory={removeHistory}
          onClearHistory={clearHistory}
          onUseImage={selection.handleUseImage}
          onInsertHistory={handleInsertHistoryWithMenu}
          onDragStartHistory={crud.handleDragStartHistory}
          onAddToAssets={handleAddToAssets}
          onInsertImagesToCanvas={handleInsertImagesToCanvas}
          workspaceId={activeId}
        />
      </ResizablePanel>

      <SettingsDialog
        open={settingsOpen}
        value={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={async (cfg) => {
          await saveSettings(cfg);
        }}
      />

      {/* 顶部菜单「提示词管理」入口：pickerMode=false 纯管理（不填充、不关闭） */}
      <PromptPickerDialog
        open={promptManagerOpen}
        pickerMode={false}
        onClose={() => setPromptManagerOpen(false)}
      />

      <AssetLibraryPickerDialog
        open={assetsPickerOpen}
        onClose={() => setAssetsPickerOpen(false)}
        workspaceId={activeId}
        mode="group"
        multi
        title="添加到素材库（选择目标分组）"
        confirmLabel={`添加 ${assetsPickerImages.length} 张图`}
        onConfirm={handleAssetsPickerConfirm}
      />

      <NodeFormDialog
        open={!!formState}
        nodeType={formState?.nodeType}
        initialImages={formState?.initialImages}
        onClose={() => setFormState(null)}
        onSubmit={crud.handleFormSubmit}
      />

      <NodeExecuteDialog
        open={!!executeState}
        nodeType={executeState?.nodeType}
        executions={executions}
        settings={settings}
        onClose={() => setExecuteState(null)}
      />

      <ExportImagesDialog
        open={!!exportState}
        images={exportState?.images || []}
        onClose={() => setExportState(null)}
        onExport={(urls) => {
          // 多图选完 → 关闭选择框 → 弹分组确认框
          setExportState(null);
          handleExportSelection(urls);
        }}
      />

      <GroupConfirmDialog
        open={!!groupState}
        count={groupState?.urls?.length}
        defaultGroupName={groupState?.sourceNode
          ? `${NODE_META[groupState.sourceNode.type]?.label || '导出'} ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
          : ''}
        onClose={() => setGroupState(null)}
        onConfirm={(groupName) => {
          // 创建分组（groupName 为 null 表示用户未填名，用默认）
          if (groupState?.sourceNode) {
            handleExportImages(groupState.sourceNode, groupState.urls, { groupName: groupName ?? '' });
          }
        }}
        onCancel={() => {
          // 不分组：独立节点加入画布
          if (groupState?.sourceNode) {
            handleExportImages(groupState.sourceNode, groupState.urls);
          }
        }}
      />

      <DeleteGroupDialog
        open={!!groupOps.deleteGroupId}
        group={groups.find((group) => group.id === groupOps.deleteGroupId) || null}
        nodeCount={groupOps.deleteGroupNodeCount}
        onClose={groupOps.cancelDeleteGroup}
        onConfirm={groupOps.confirmDeleteGroup}
      />
    </ResizablePanelGroup>
  );
}
