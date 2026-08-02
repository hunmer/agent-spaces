import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, Controls, ControlButton, MarkerType,
  ReactFlow, addEdge, applyEdgeChanges, applyNodeChanges, useReactFlow,
} from '@xyflow/react';
import {
  ResizablePanelGroup, ResizablePanel, ResizableHandle,
  Images, MapPinned, toast, Checkbox,
  CopyPlus, Crosshair, Trash2,
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
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
import ImageSelectionToolbar from './canvas/ImageSelectionToolbar';
import GroupOverlays from './canvas/GroupOverlays';
import GroupMiniMap from './canvas/GroupMiniMap';
import FloatingEdge from './canvas/FloatingEdge';
import { ImageSelectionContext } from '../context/ImageSelectionContext';
import useImageSelection from '../hooks/useImageSelection';
import AssetLibraryPickerDialog from './AssetLibraryPickerDialog';
import ExportImagesDialog from './ExportImagesDialog';
import GroupConfirmDialog from './GroupConfirmDialog';
import DeleteGroupDialog from './DeleteGroupDialog';
import ConnectionTargetDialog from './ConnectionTargetDialog';
import PastePropertiesDialog from './PastePropertiesDialog';
import BatchRunConfirmDialog from './BatchRunConfirmDialog';
import useAssetLibrary from '../hooks/useAssetLibrary';
import { getConnectionTargets, getNodeOutputType } from '../utils/connection-targets';

import useCanvasState from '../hooks/useCanvasState';
import useWorkflow from '../hooks/useWorkflow';
import useGenerationHistory from '../hooks/useGenerationHistory';
import useSettings from '../hooks/useSettings';
import useExecutionQueue from '../hooks/useExecutionQueue';
import useWorkspaces from '../hooks/useWorkspaces';
import usePanelLayout from '../hooks/usePanelLayout';
import useImageOutputs, { useVideoOutputs } from '../hooks/useImageOutputs';
import useSelectionClipboard from '../hooks/useSelectionClipboard';
import useGroupOperations from '../hooks/useGroupOperations';
import useGroupExecution from '../hooks/useGroupExecution';
import useNodeCrud from '../hooks/useNodeCrud';
import useNodeExecutions from '../hooks/useNodeExecutions';
import useLastParams from '../hooks/useLastParams';
import { runCutout } from '../utils/cutout';
import { WORKFLOWS } from '../utils/constants';
import useCanvasAgentRpc, { buildNodeExecution } from '../hooks/useCanvasAgentRpc';
import useDecoratedNodes from '../hooks/useDecoratedNodes';

import { IMAGE_TAGS, NODE_TYPES, NODE_META } from '../utils/constants';
import { NODE_COMPONENTS, NODE_PARAMS_SCHEMA, PANEL_ID_MAIN, PANEL_ID_RIGHT, dedupeTags } from '../utils/canvas-constants';
import { genId } from '../utils/canvas-id';
import { copyNodes, pasteNodes } from '../utils/clipboard';
import { exportAssetLibraryZip, extractFileNameFromUrl, pickAssetLibraryZipFile, importAssetLibraryZip, exportWorkspaceZip, pickWorkspaceZipFile, importWorkspaceZip } from '../utils/export';
import { canvasConfigPath, historyConfigPath, assetLibraryConfigPath, saveCanvas } from '../utils/storage';
import { decorateEdgesForSelection } from '../utils/edge-display';
import { countNodesWithOutput } from '../utils/batch-run';
import { COMPACT_NODE_ZOOM_THRESHOLD } from './nodes/compact-node';

const EDGE_TYPES = { floating: FloatingEdge };
const DEFAULT_EDGE_OPTIONS = {
  type: 'floating',
  markerEnd: { type: MarkerType.ArrowClosed },
};
const EDGE_PATH_STYLES = ['bezier', 'straight', 'step', 'smoothstep'];
const EDGE_LINE_STYLES = ['solid', 'dashed'];
const SNAP_GRID = [16, 16];

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
    operationHistory, undo, redo, canUndo, canRedo,
  } = useCanvasState(activeId);
  // 落地策略由 directory 驱动：设了则产图落到工作区目录，否则落 data（详见 useWorkflow/generateImages）
  const runWorkflow = useWorkflow(activeWorkspace?.directory);
  const { history, addHistory, removeHistory, clearHistory } = useGenerationHistory(activeId);
  const { settings, saveSettings } = useSettings();
  // 上次提交参数（按工作区+nodeType 隔离）：saveLastParams 给执行回调用，getLastParams 给 createNodeAt 预填用
  const { saveLastParams, getLastParams } = useLastParams(activeId);

  // —— 本组件局部 state ——
  const [selectedId, setSelectedId] = useState(null);
  // 跨节点图片选中状态（单击选中 / ctrl 多选 / 双击预览，选中后顶部浮出 ImageSelectionToolbar）
  const imageSelection = useImageSelection();
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
  const [edgePathStyle, setEdgePathStyle] = useState('bezier');
  const [edgeLineStyle, setEdgeLineStyle] = useState('solid');
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  // 多上传区域目标的待确认连线：选择完成前不写入 edges。
  const [pendingConnection, setPendingConnection] = useState(null);
  // 批量运行目标中已有产出时，暂存候选节点并等待用户确认。
  const [batchRunConfirm, setBatchRunConfirm] = useState(null);
  // 删节点联动历史确认：待删除节点信息 { nodeId, nodeLabel, relatedCount, relatedIds, alsoDeleteHistory } | null。
  // 删节点时若该节点有关联生成记录，弹此确认问是否同时删记录。
  const [deleteNodeHistoryConfirm, setDeleteNodeHistoryConfirm] = useState(null);
  // 右侧面板激活 tab（受控）：节点右键「定位到历史记录」需要切到 history tab。
  const [rightTab, setRightTab] = useState('add');
  // 节点右键菜单：{ nodeId, clientX, clientY } | null。onNodeContextMenu 触发，自定义浮层定位。
  const [nodeContextMenu, setNodeContextMenu] = useState(null);
  // 历史记录定位焦点：节点右键「定位到历史记录」时设为目标节点 id，HistoryTab 滚动+高亮后清空。
  const [historyFocusNodeId, setHistoryFocusNodeId] = useState(null);

  const reactFlow = useReactFlow();
  const wrappingRef = useRef(null);

  // nodes/edges 的 ref 镜像：让「只需读最新值、不需响应式重建」的 callback（onConnect/handleCopy 等）
  // 去掉对 nodes/edges 的依赖，成为稳定 callback，避免触发 nodeCallbacks/decoratedNodes 频繁重算。
  // 同步在每次渲染后更新（useEffect 兜底 + 直接赋值保证同步读取）。
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const reservedBatchNodeIdsRef = useRef(new Set());
  nodesRef.current = nodes;
  edgesRef.current = edges;

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName;
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || event.target?.isContentEditable;
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier || editable || event.defaultPrevented) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, undo]);

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
  // —— 视频节点批量产出（视频导出到画布）——
  const { handleExportVideos } = useVideoOutputs({ setNodes });

  // —— 执行队列（onComplete/onError 用 imageOutputs + updateNodeData + addHistory）——
  const { jobs, submit, cancel, clearFinished, runningCount, queuedCount } = useExecutionQueue({
    directory: activeWorkspace?.directory,
    concurrency: settings.executionConcurrency,
    onComplete: (job, images, histId, resources) => {
      const tag = job.nodeType === NODE_TYPES.editImage ? IMAGE_TAGS.editImage : IMAGE_TAGS.textToImage;
      if (job.placeholderNodeId) {
        updateNodeData(job.placeholderNodeId, {
          images,
          resources,
          source: 'queue',
          loading: false,
          error: undefined,
          tags: dedupeTags([...(job.tags || []), tag]),
        });
      } else {
        addImageNodesFromUrls(images, { tags: [tag], resources });
      }
      // 落地已在 generateImages 内完成（按 directory 决定走工作区目录或 data），这里只记录历史
      addHistory({
        id: histId,
        nodeId: job.placeholderNodeId || null,
        nodeType: job.nodeType,
        prompt: job.input?.prompt || '',
        model: job.input?.model || '',
        images,
        resources,
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
    onCancel: (job) => {
      if (job.placeholderNodeId) {
        updateNodeData(job.placeholderNodeId, {
          loading: false,
          status: 'cancelled',
          error: undefined,
        });
      }
    },
  });
  const activeQueueNodeIds = useMemo(() => new Set(
    jobs
      .filter((job) => job.status === 'queued' || job.status === 'running')
      .map((job) => job.placeholderNodeId)
      .filter(Boolean),
  ), [jobs]);
  useEffect(() => {
    for (const nodeId of reservedBatchNodeIdsRef.current) {
      if (!activeQueueNodeIds.has(nodeId)) reservedBatchNodeIdsRef.current.delete(nodeId);
    }
  }, [activeQueueNodeIds]);
  const queuePositions = useMemo(() => {
    const positions = new Map();
    jobs
      .filter((job) => job.status === 'queued' && job.placeholderNodeId)
      .forEach((job, index) => positions.set(job.placeholderNodeId, index + 1));
    return positions;
  }, [jobs]);
  const queueStatuses = useMemo(() => new Map(
    jobs
      .filter((job) => (job.status === 'queued' || job.status === 'running') && job.placeholderNodeId)
      .map((job) => [job.placeholderNodeId, job.status]),
  ), [jobs]);
  const standaloneRunningNodes = useMemo(
    () => runningNodes.filter((node) => !activeQueueNodeIds.has(node.id)),
    [activeQueueNodeIds, runningNodes],
  );

  // —— 节点 CRUD + 定位/布局/导出 + 尺寸自适应 + 表单提交 ——
  // 画布容器屏幕中心点（供 handleAdd 定位新节点到视口中心）
  const getViewportCenter = useCallback(() => {
    const el = wrappingRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, []);
  const crud = useNodeCrud({
    nodes, edges, groups, setNodes, setEdges, setGroups,
    reactFlow, selectedId, setSelectedId, updateNodeData, settings, submit,
    setDropNodeMenu, setContextMenu, setPendingConnection,
    getViewportCenter, getLastParams, saveLastParams,
  });

  // —— 节点执行回调（工作流/媒体/本地算法/抠图/反推提示词）——
  const executions = useNodeExecutions({
    runWorkflow, updateNodeData, addHistory, settings, createNodeAt: crud.createNodeAt, saveLastParams,
  });

  // —— 选中 + 复制粘贴 + 对齐分布 + 批量删除 ——
  const handlePasteImageFiles = useCallback((files) => {
    const screenCenter = getViewportCenter();
    const position = screenCenter ? reactFlow.screenToFlowPosition(screenCenter) : null;
    return crud.handleDropFiles(files, position);
  }, [crud.handleDropFiles, getViewportCenter, reactFlow]);
  const selection = useSelectionClipboard({
    nodes, edges, groups, setNodes, setEdges, setGroups, setSelectedId, addImageNodesFromUrls,
    onPasteImageFiles: handlePasteImageFiles,
  });

  // —— 分组操作 + overlay 移动/连线 ——
  const groupOps = useGroupOperations({
    groups, nodes, edges, setGroups, setNodes, setEdges, reactFlow, canvasRef: wrappingRef,
  });
  useEffect(() => {
    if (!groupOps.selectedGroupId || groupOps.deleteGroupId) return undefined;
    const handleGroupDeleteKey = (event) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      event.preventDefault();
      event.stopPropagation();
      groupOps.requestDeleteGroup(groupOps.selectedGroupId);
    };
    window.addEventListener('keydown', handleGroupDeleteKey, true);
    return () => window.removeEventListener('keydown', handleGroupDeleteKey, true);
  }, [groupOps.deleteGroupId, groupOps.requestDeleteGroup, groupOps.selectedGroupId]);
  const clearGroupSelection = useCallback(() => {
    groupOps.setSelectedGroupId(null);
    imageSelection.clear();
  }, [groupOps.setSelectedGroupId, imageSelection]);
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
  const addConnections = useCallback((conn, inputTarget, inputType) => {
    setEdges((prev) => {
      const curNodes = nodesRef.current;
      const originOutputType = inputType || getNodeOutputType(
        curNodes.find((node) => node.id === conn.source)?.type,
      );
      const sources = curNodes.some((n) => n.id === conn.source && n.selected)
        ? curNodes
          .filter((n) => n.selected && getNodeOutputType(n.type) === originOutputType)
          .map((n) => n.id)
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
            markerEnd: { type: MarkerType.ArrowClosed },
            data: {
              pathStyle: edgePathStyle,
              lineStyle: edgeLineStyle,
              inputTarget,
              inputType: originOutputType,
            },
          },
          next,
        );
      }
      return next;
    });
  }, [edgeLineStyle, edgePathStyle, setEdges]);

  const onConnect = useCallback((conn) => {
    const sourceNode = nodesRef.current.find((node) => node.id === conn.source);
    const targetNode = nodesRef.current.find((node) => node.id === conn.target);
    const { inputType, targets } = getConnectionTargets(
      sourceNode?.type,
      targetNode?.type,
      NODE_PARAMS_SCHEMA[targetNode?.type] || [],
    );
    if (!targets.length) {
      toast.error(inputType === 'text' ? '目标节点没有可接收文本的输入框' : '目标节点不支持该输入');
      return;
    }
    if (targets.length > 1) {
      setPendingConnection({ conn, targets, inputType });
      return;
    }
    addConnections(conn, targets[0]?.id, inputType);
  }, [addConnections]);

  // 连线拖到空白处放手：弹出「添加节点」菜单
  const onConnectEnd = useCallback((event, connectionState) => {
    setIsConnecting(false);
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
    () => decorateEdgesForSelection(edges, nodes, edgePathStyle, edgeLineStyle),
    [edgeLineStyle, edgePathStyle, edges, nodes],
  );
  const connectionLineStyle = useMemo(() => ({
    pathStyle: edgePathStyle,
    strokeDasharray: edgeLineStyle === 'dashed' ? '6 4' : 'none',
  }), [edgeLineStyle, edgePathStyle]);
  const backgroundVariant = settings.bgVariant === 'lines' ? BackgroundVariant.Lines
    : settings.bgVariant === 'cross' ? BackgroundVariant.Cross
    : BackgroundVariant.Dots;
  const handlePosition = settings.attributionPosition === 'left-right' ? 'left-right' : 'top-bottom';
  const snapEnabled = settings.snapGrid !== false;
  const handleCanvasStyleChange = useCallback(async (patch) => {
    try {
      await saveSettings({ ...settings, ...patch });
    } catch (error) {
      toast.error(`保存画布样式失败：${error?.message || error}`);
    }
  }, [saveSettings, settings]);
  const handleExecutionConcurrencyChange = useCallback(async (value) => {
    const executionConcurrency = Math.max(1, Math.min(10, Number(value) || 3));
    try {
      await saveSettings({ ...settings, executionConcurrency });
    } catch (error) {
      toast.error(`保存队列并发数失败：${error?.message || error}`);
    }
  }, [saveSettings, settings]);

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

  const allNodePreviewsEnabled = nodes.length > 0
    && nodes.every((node) => node.data?.outputPreviewMode === true);

  const enableAllNodePreviews = useCallback(() => {
    // 切换式：全部已开 → 全关；否则全开（修复原来只能开不能关的问题）
    const turnOn = !allNodePreviewsEnabled;
    setNodes((prev) => prev.map((node) => (
      node.data?.outputPreviewMode === turnOn
        ? node
        : { ...node, data: { ...(node.data || {}), outputPreviewMode: turnOn } }
    )));
  }, [setNodes, allNodePreviewsEnabled]);

  // —— 注入到节点 data 的回调集合 ——
  // deps 逐个解构具体 callback（而非整个 executions/crud 对象），任一稳定则 nodeCallbacks 稳定，
  // 避免因 hook 返回对象引用变化触发 decoratedNodes 全量重算。
  const {
    makeOnUpdate, handleGenerate, handleGenerateMedia, handleProcessImage,
    handleProcessLocal, handleCutout, handleCutoutCreate, handleDepth, handleCancelProcess, handlePromptReverse,
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
  const { addAsset, createCategory, categories: assetCategories } = useAssetLibrary(activeId);

  // 导出当前工作区素材库为 zip（按分类转文件夹）。导出时直接调 list_assets service 拿最新全量数据，
  // 避免闭包内 categories 陈旧。onProgress 透传给工具函数，由 Toolbar 侧更新 toast 进度。
  const handleExportAssetLibrary = useCallback(async (onProgress) => {
    const lib = await window.AgentSpaces?.invokeService?.('list_assets', { workspaceId: activeId });
    return exportAssetLibraryZip(lib?.categories || [], {
      workspaceName: activeWorkspace?.name,
      onProgress,
    });
  }, [activeId, activeWorkspace]);

  // 导入素材库 zip：选 zip → 按文件夹建/找分类 → 逐文件上传入库。
  // 分类合并策略（ensureCategory）：先查当前工作区同名分类，有则复用，无则新建（createCategory 返回整个 lib，取末项 id）。
  const handleImportAssetLibrary = useCallback(async (onProgress) => {
    const file = await pickAssetLibraryZipFile();
    if (!file) return null; // 用户取消
    // 找同名分类，无则新建。createCategory 返回完整 lib {categories:[...]}，新建项在末尾。
    const ensureCategory = async (name) => {
      const lib = await window.AgentSpaces?.invokeService?.('list_assets', { workspaceId: activeId });
      const existed = (lib?.categories || []).find((c) => c.name === name);
      if (existed) return existed.id;
      const next = await createCategory(name);
      const created = (next?.categories || []).findLast?.((c) => c.name === name)
        || (next?.categories || []).filter((c) => c.name === name).pop();
      if (!created) throw new Error(`创建分类「${name}」失败`);
      return created.id;
    };
    return importAssetLibraryZip(file, { ensureCategory, addAsset, onProgress });
  }, [activeId, createCategory, addAsset]);

  // 导出当前工作区为 zip（3 个 json + 后端图片落 static/，url 相对化为占位符）。
  // 用 getConfig 同步读三个 path 的缓存（与各 hook 的三重读取同源），传给 exportWorkspaceZip。
  const handleExportWorkspace = useCallback(async (onProgress) => {
    const AS = window.AgentSpaces;
    const canvasState = AS?.getConfig?.(canvasConfigPath(activeId));
    const historyList = AS?.getConfig?.(historyConfigPath(activeId));
    const assetLib = AS?.getConfig?.(assetLibraryConfigPath(activeId));
    return exportWorkspaceZip({
      canvasState,
      historyList: Array.isArray(historyList) ? historyList : null,
      assetLib,
      workspaceName: activeWorkspace?.name,
      onProgress,
    });
  }, [activeId, activeWorkspace]);

  // 导入工作区 zip：重传 static 图片 → 回填 url → 新建工作区写入 canvas/history/asset。
  // 数据写入用 save_canvas（整库覆盖，广播回流自动 setNodes）；history 逐条 add_history；
  // asset 用 save_asset_library（整库写入）。最后 switchWorkspace 切到新工作区。
  const handleImportWorkspace = useCallback(async (onProgress) => {
    const file = await pickWorkspaceZipFile();
    if (!file) return null; // 用户取消
    const { canvasState, historyList, assetLib, stats } = await importWorkspaceZip(file, { onProgress });
    const AS = window.AgentSpaces;
    // 新建工作区（名字带「-导入」后缀），拿新 workspaceId
    const newName = `${activeWorkspace?.name || '工作区'}-导入`;
    const res = await createWorkspace(newName);
    const newWs = Array.isArray(res?.workspaces) ? res.workspaces[res.workspaces.length - 1] : null;
    const newId = newWs?.id;
    if (!newId) throw new Error('创建工作区失败');
    // 写入数据（新工作区此时画布为空、无 dirty，广播回流会自动加载）
    if (canvasState) {
      await saveCanvas(newId, canvasState);
    }
    if (Array.isArray(historyList)) {
      // 倒序 add（add_history 是 unshift，倒序入队保持原顺序）
      for (let i = historyList.length - 1; i >= 0; i--) {
        try { await AS?.invokeService?.('add_history', { workspaceId: newId, item: historyList[i] }); } catch {}
      }
    }
    if (assetLib) {
      try { await AS?.invokeService?.('save_asset_library', { workspaceId: newId, lib: assetLib }); } catch {}
    }
    switchWorkspace(newId);
    return stats;
  }, [activeWorkspace, createWorkspace, switchWorkspace]);

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
        // 优先用调用方传入的语义化 fileName；否则从 url 解析真实文件名（宿主 url 真名藏在 query path= 里，
        // 不能用 url.split('/').pop()——会拿到 local-file 等路由末段甚至带 query 的乱码）。
        const fileName = item.fileName || extractFileNameFromUrl(url);
        const dot = fileName.lastIndexOf('.');
        const title = dot > 0 ? fileName.slice(0, dot) : fileName;
        try {
          await addAsset(grp.id, {
            id: `ast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            url,
            thumb: item.thumb || url,
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
  const completeImageExport = useCallback((sourceNode, imgs, opts) => {
    const nodeIds = handleExportImages(sourceNode, imgs, opts);
    if (!nodeIds?.length) return;
    setTimeout(() => crud.focusNode(nodeIds[0]), 0);
    toast.success(`已导出 ${nodeIds.length} 张图片到画布`);
  }, [handleExportImages, crud.focusNode]);
  const handleExportImagesWithPicker = useCallback((sourceNode, imgs) => {
    if (!imgs?.length) return;
    if (imgs.length === 1) {
      completeImageExport(sourceNode, imgs);
      return;
    }
    setExportState({ sourceNode, images: imgs });
  }, [completeImageExport]);

  // 视频导出到画布（复用 handleExportVideos，视频不分组成独立节点）
  const handleExportVideosWithPicker = useCallback((sourceNode, vids) => {
    if (!vids?.length) return;
    handleExportVideos(sourceNode, vids);
  }, [handleExportVideos]);

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
      const previousResources = Array.isArray(data?.output?.resources) ? data.output.resources : [];
      const byUrl = new Map(previousResources.map((item) => [item?.url, item]));
      const resources = next.map((url) => byUrl.get(url) || { url, thumb: url });
      return { __versionSkip: true, output: { ...(data?.output || {}), images: next, resources } };
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
    console.log('[clear] handleClearOutputImages', nodeId);
    updateNodeData(nodeId, { __versionSkip: true, output: { images: [], resources: [] }, versions: [], activeVersion: undefined, status: 'idle' });
  }, [updateNodeData]);
  // 清空生成记录：可选同时重置画布上所有节点的产出/版本/状态。
  // alsoResetNodes=true 时逐个走 handleClearOutputImages 复用单节点重置字段集。
  const handleClearHistoryAndReset = useCallback((alsoResetNodes) => {
    clearHistory();
    if (alsoResetNodes) {
      for (const n of nodesRef.current) handleClearOutputImages(n.id);
    }
  }, [clearHistory, handleClearOutputImages]);
  // 删节点联动历史：删前查该节点是否有关联生成记录（item.nodeId === nodeId）。
  // 有 → 弹确认框问是否同时删记录；无 → 直接删节点（不打扰用户）。
  // historyRef 读最新 history（避免闭包旧值），crud.handleDeleteNode 是稳定 callback。
  const historyRef = useRef(history);
  historyRef.current = history;
  const handleDeleteNodeWithHistoryCheck = useCallback((nodeId) => {
    const related = historyRef.current.filter((it) => it.nodeId === nodeId);
    if (related.length === 0) {
      crud.handleDeleteNode(nodeId);
      return;
    }
    const node = nodesRef.current.find((n) => n.id === nodeId);
    setDeleteNodeHistoryConfirm({
      nodeId,
      nodeLabel: node ? (NODE_META[node.type]?.label || node.type) : '节点',
      relatedCount: related.length,
      relatedIds: related.map((it) => it.id),
      alsoDeleteHistory: true,
    });
  }, [crud]);
  // 确认删除节点：alsoDeleteHistory=true 时逐条 removeHistory，最后删节点。
  const confirmDeleteNodeWithHistory = useCallback((alsoDeleteHistory) => {
    const info = deleteNodeHistoryConfirm;
    if (!info) return;
    if (alsoDeleteHistory) {
      info.relatedIds.forEach((id) => removeHistory(id));
    }
    crud.handleDeleteNode(info.nodeId);
    setDeleteNodeHistoryConfirm(null);
  }, [deleteNodeHistoryConfirm, crud, removeHistory]);
  // 节点右键菜单：记录右键的节点 id + 屏幕坐标，自定义浮层定位。
  // stopPropagation 阻止冒泡到画布级 ContextMenuTrigger（否则画布菜单也会弹出）。
  const handleNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    event.stopPropagation();
    setNodeContextMenu({ nodeId: node.id, clientX: event.clientX, clientY: event.clientY });
  }, []);
  // 克隆节点：复用 copyNodes + pasteNodes（内存剪贴板，不污染系统剪贴板）。
  // 偏移 {40,40} 避免与原节点重叠；克隆后不自动选中（保持原选中态）。
  const handleCloneNode = useCallback((nodeId) => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    copyNodes([node], edgesRef.current);
    const result = pasteNodes({ genId, offset: { x: 40, y: 40 } });
    if (!result) return;
    setNodes((prev) => [...prev, ...result.nodes]);
    setEdges((prev) => [...prev, ...result.edges]);
    toast.success('已克隆节点');
  }, [setNodes, setEdges]);
  // 定位到历史记录：切到 history tab + 设 focusNodeId 让 HistoryTab 滚动高亮。
  // focusNodeId 用一个新值触发（即使同节点再次定位也能重新滚动）。
  const handleLocateHistory = useCallback((nodeId) => {
    setRightTab('history');
    setHistoryFocusNodeId(`${nodeId}:${Date.now()}`);
  }, []);
  // 节点右键菜单执行 action 后关闭菜单。
  const runNodeContextAction = useCallback((action, nodeId) => {
    setNodeContextMenu(null);
    if (action === 'clone') handleCloneNode(nodeId);
    else if (action === 'locateHistory') handleLocateHistory(nodeId);
    else if (action === 'delete') handleDeleteNodeWithHistoryCheck(nodeId);
  }, [handleCloneNode, handleLocateHistory, handleDeleteNodeWithHistoryCheck]);
  // 临时：从画布节点产出反向重建生成记录（用于误清空历史后恢复）。
  // 遍历所有节点，按 output 类型派生 history 条目；createdAt 用当前时间 + 索引保证单调。
  // 字段约定参考 useNodeExecutions 各 addHistory 调用（images/mediaType/text/prompt/model）。
  const handleRestoreHistoryFromNodes = useCallback(() => {
    const curNodes = nodesRef.current;
    const now = Date.now();
    let restored = 0;
    curNodes.forEach((n, idx) => {
      const out = n?.data?.output;
      if (!out || typeof out !== 'object') return;
      const params = n.data?.params || {};
      const audios = [out.audio, ...(out.audios || [])].filter(Boolean);
      const videos = [out.video, ...(out.videos || [])].filter(Boolean);
      const images = Array.isArray(out.images) ? out.images.filter(Boolean) : [];
      const resources = Array.isArray(out.resources) ? out.resources.filter((item) => item?.url) : [];
      const text = typeof out.text === 'string' ? out.text.trim() : '';
      // imageDisplay/videoDisplay 走 data.images/videos 透传，非 output
      const displayImages = n.type === NODE_TYPES.imageDisplay
        ? (Array.isArray(n.data?.images) ? n.data.images.filter(Boolean) : [])
        : [];
      const displayVideos = n.type === NODE_TYPES.videoDisplay
        ? (Array.isArray(n.data?.videos) ? n.data?.videos.filter(Boolean) : [])
        : [];
      let item = null;
      if (audios.length) {
        item = { mediaType: 'audio', images: audios };
      } else if (videos.length || displayVideos.length) {
        item = { mediaType: 'video', images: videos.length ? videos : displayVideos };
      } else if (text) {
        item = { mediaType: 'text', text: text.slice(0, 5000), images: images.slice(0, 4), resources: resources.slice(0, 4) };
      } else if (images.length) {
        item = { images, resources };
      } else if (displayImages.length) {
        item = { images: displayImages };
      }
      if (!item) return;
      addHistory({
        id: genId('hist'),
        nodeId: n.id,
        nodeType: n.type,
        prompt: params.prompt || '',
        model: params.model || '',
        createdAt: now + idx, // 索引偏移保证恢复出的多条记录时间单调，排序稳定
        ...item,
      }).catch((e) => console.error('restore addHistory failed:', e));
      restored += 1;
    });
    toast.success(`已从 ${restored} 个节点恢复生成记录`);
  }, [addHistory]);

  // 删除节点的一张上游输入图：反查产出该 url 的连入边并删除（与 computeInputImages 的产出判定一致：
  // source 节点 output.images 优先，仅 imageDisplay 透传 data.images）。用 ref 读最新值保持稳定引用。
  const handleDeleteUpstreamImage = useCallback((nodeId, url) => {
    if (!nodeId || !url) return;
    const curNodes = nodesRef.current;
    const curEdges = edgesRef.current;
    const byId = new Map(curNodes.map((n) => [n.id, n]));
    const isDisplayType = (id) => byId.get(id)?.type === NODE_TYPES.imageDisplay;
    // 某 source 节点作为产出给出的图集合
    const sourceImageSet = (srcId) => {
      const n = byId.get(srcId);
      const sd = n?.data || {};
      const out = Array.isArray(sd.output?.images) ? sd.output.images : [];
      if (out.length) return new Set(out);
      // 仅透传类节点无 output 时回退 data.images；生成类节点无 output 视为无产出
      return isDisplayType(srcId) ? new Set(Array.isArray(sd.images) ? sd.images : []) : new Set();
    };
    const toRemove = curEdges
      .filter((e) => e.target === nodeId && sourceImageSet(e.source).has(url))
      .map((e) => e.id);
    if (!toRemove.length) return;
    const removeSet = new Set(toRemove);
    setEdges((prev) => prev.filter((e) => !removeSet.has(e.id)));
  }, [setEdges]);

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
    onDepth: handleDepth,
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
    // 删除一张上游输入图（断开产出该图的连入边）
    onDeleteUpstreamImage: handleDeleteUpstreamImage,
    // 视频导出到画布（生成 videoDisplay 节点）
    onExportVideos: handleExportVideosWithPicker,
  }), [
    makeOnUpdate, handleGenerate, handleGenerateMedia, handleProcessImage,
    handleProcessLocal, handleCutout, handleCutoutCreate, handleDepth, handleCancelProcess, handlePromptReverse,
    handleExportImagesWithPicker, handleAutoSize, handleAutoSizeToContent, handleBBoxCutout, handleResetParams,
    handleAddToAssets, handleAddOutputImages, handleRemoveOutputImage, handleClearOutputImages, handleReorderOutputImages,
    handleSwitchVersion, handleDeleteUpstreamImage, handleExportVideosWithPicker,
  ]);

  // —— Agent RPC（WS message 监听，ref 持有最新值只订阅一次）——
  // 放在 handleGenerate/handleGenerateMedia 解构之后（TDZ：执行回调需先声明）。
  useCanvasAgentRpc({
    nodes, edges, groups,
    createNodeAt: crud.createNodeAt,
    updateNodeData, handleDeleteNode: crud.handleDeleteNode, focusNode: crud.focusNode,
    setNodes, setEdges, setGroups,
    onGenerate: handleGenerate, onGenerateMedia: handleGenerateMedia,
    settings,
  });

  const { decoratedNodes } = useDecoratedNodes({
    nodes, edges, protectedImageUrls: groupExecution.protectedImageUrls,
    selectionCount: selection.selectionCount,
    outputPreviewState,
    onOutputPreviewHeight: handleOutputPreviewHeight,
    onOutputPreviewModeChange: handleOutputPreviewModeChange,
    settings, callbacks: nodeCallbacks,
  });
  const collectBatchRunNodes = useCallback((nodeIds) => {
    const nodeMap = new Map(decoratedNodes.map((node) => [node.id, node]));
    const candidates = [];
    let skipped = 0;
    for (const nodeId of nodeIds || []) {
      const node = nodeMap.get(nodeId);
      if (
        !node
        || node.data?.status === 'running'
        || activeQueueNodeIds.has(nodeId)
        || reservedBatchNodeIdsRef.current.has(nodeId)
      ) {
        skipped += 1;
        continue;
      }
      const spec = buildNodeExecution(node, node.data?.textInputValues);
      if (!spec) {
        skipped += 1;
        continue;
      }
      candidates.push({ node, spec });
    }
    return { candidates, skipped };
  }, [activeQueueNodeIds, decoratedNodes]);

  const submitBatchRun = useCallback((nodeIds) => {
    const { candidates, skipped } = collectBatchRunNodes(nodeIds);
    for (const { node, spec } of candidates) {
      reservedBatchNodeIdsRef.current.add(node.id);
      submit({
        nodeType: node.type,
        label: NODE_META[node.type]?.label || node.data?.label || node.type,
        placeholderNodeId: node.id,
        execute: () => (spec.kind === 'image'
          ? handleGenerate(node.id, node.type, { workflowId: spec.workflowId, input: spec.input })
          : handleGenerateMedia(node.id, node.type, spec.kind, { workflowId: spec.workflowId, input: spec.input })),
        cancel: () => handleCancelProcess(node.id),
      });
    }
    if (candidates.length > 0) {
      toast.success(`已加入 ${candidates.length} 个任务${skipped ? `，跳过 ${skipped} 个不可执行或已运行节点` : ''}`);
    } else {
      toast.warning('分组内没有可执行的生成节点');
    }
  }, [collectBatchRunNodes, handleCancelProcess, handleGenerate, handleGenerateMedia, submit]);

  const requestBatchRun = useCallback((nodeIds) => {
    const { candidates } = collectBatchRunNodes(nodeIds);
    if (!candidates.length) {
      toast.warning('所选范围内没有可执行的生成节点');
      return;
    }
    const outputCount = countNodesWithOutput(candidates.map(({ node }) => node));
    const candidateIds = candidates.map(({ node }) => node.id);
    if (outputCount > 0) {
      setBatchRunConfirm({ nodeIds: candidateIds, outputCount });
      return;
    }
    submitBatchRun(candidateIds);
  }, [collectBatchRunNodes, submitBatchRun]);

  const handleRunGroup = useCallback((groupId) => {
    const group = groups.find((item) => item.id === groupId);
    if (group) requestBatchRun(group.childNodeIds || []);
  }, [groups, requestBatchRun]);

  const handleRunSelected = useCallback(() => {
    requestBatchRun(nodesRef.current.filter((node) => node.selected).map((node) => node.id));
  }, [requestBatchRun]);
  const handleCancelAllTasks = useCallback(() => {
    jobs
      .filter((job) => job.status === 'queued' || job.status === 'running')
      .forEach((job) => cancel(job.id));
    standaloneRunningNodes.forEach((node) => handleCancelProcess(node.id));
  }, [cancel, handleCancelProcess, jobs, standaloneRunningNodes]);
  const compactNodes = (viewport?.zoom ?? 1) < COMPACT_NODE_ZOOM_THRESHOLD;
  const renderedNodes = useMemo(() => decoratedNodes.map((node) => ({
    ...node,
    // ReactFlow 选中节点默认提升 1000；hover 时同步提升，让节点外部的产出卡片不被相邻节点遮挡。
    zIndex: node.id === hoveredNodeId ? Math.max(node.zIndex ?? 1, 1001) : (node.zIndex ?? 1),
    data: {
      ...node.data,
      compactView: compactNodes,
      queuePosition: queuePositions.get(node.id),
      queueStatus: queueStatuses.get(node.id),
    },
    style: {
      ...node.style,
      '--floating-handle-size': (isConnecting || node.id === hoveredNodeId) ? '24px' : '8px',
    },
  })), [compactNodes, decoratedNodes, hoveredNodeId, isConnecting, queuePositions, queueStatuses]);

  const onNodeMouseEnter = useCallback((_event, node) => setHoveredNodeId(node.id), []);
  const onNodeMouseLeave = useCallback((_event, node) => {
    setHoveredNodeId((current) => (current === node.id ? null : current));
  }, []);

  const handleEditSelectedImages = useCallback((urls) => {
    if (!urls?.length) return;
    setFormState({ nodeType: NODE_TYPES.editImage, initialImages: urls });
    imageSelection.clear();
  }, [imageSelection.clear]);
  const handleCutoutSelectedImages = useCallback((urls) => {
    if (!urls?.length) return;
    handleCutoutCreate(urls);
    imageSelection.clear();
  }, [handleCutoutCreate, imageSelection.clear]);
  const handleProcessSelectedImages = useCallback((urls, type) => {
    if (!urls?.length) return;
    handleProcessImage(urls, type);
    imageSelection.clear();
  }, [handleProcessImage, imageSelection.clear]);
  const handleAddSelectedImagesToAssets = useCallback((urls) => {
    if (!urls?.length) return;
    handleAddToAssets(urls);
  }, [handleAddToAssets]);
  const imageSelectionMenuProps = useMemo(() => ({
    selectedCount: imageSelection.selectedCount,
    selectedUrls: imageSelection.selectedUrls,
    onEditImages: handleEditSelectedImages,
    onCutoutCreate: handleCutoutSelectedImages,
    onProcessImage: handleProcessSelectedImages,
    onAddToAssets: handleAddSelectedImagesToAssets,
    onClear: imageSelection.clear,
  }), [
    imageSelection.selectedCount, imageSelection.selectedUrls, imageSelection.clear,
    handleEditSelectedImages, handleCutoutSelectedImages, handleProcessSelectedImages,
    handleAddSelectedImagesToAssets,
  ]);

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
    <ImageSelectionContext.Provider value={imageSelection}>
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
            onExportAssetLibrary={handleExportAssetLibrary}
            onImport={crud.handleImport}
            onImportAssetLibrary={handleImportAssetLibrary}
            onExportWorkspace={handleExportWorkspace}
            onImportWorkspace={handleImportWorkspace}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenPromptManager={() => setPromptManagerOpen(true)}
            edgePathStyle={edgePathStyle}
            edgeLineStyle={edgeLineStyle}
            edgePathStyles={EDGE_PATH_STYLES}
            edgeLineStyles={EDGE_LINE_STYLES}
            onEdgePathStyleChange={setEdgePathStyle}
            onEdgeLineStyleChange={setEdgeLineStyle}
            bgVariant={settings.bgVariant}
            handlePosition={handlePosition}
            snapEnabled={snapEnabled}
            onCanvasStyleChange={handleCanvasStyleChange}
            onSelectAll={selection.handleSelectAll}
            onInvertSelect={selection.handleInvertSelect}
            onClearSelection={selection.handleClearSelection}
            operationHistory={operationHistory}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
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
                runningNodes={standaloneRunningNodes}
                runningCount={runningCount + queuedCount + standaloneRunningNodes.length}
                concurrency={settings.executionConcurrency}
                onConcurrencyChange={handleExecutionConcurrencyChange}
                onCancel={cancel}
                onCancelNode={handleCancelProcess}
                onCancelAll={handleCancelAllTasks}
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
            imageSelectionMenuProps={imageSelectionMenuProps}
            onSelectContextImage={imageSelection.selectForContextMenu}
          >
            <ReactFlow
              key={activeId}
              nodes={renderedNodes}
              edges={floatingEdges}
              viewport={viewport}
              onViewportChange={setViewport}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectStart={() => setIsConnecting(true)}
              onConnectEnd={onConnectEnd}
              onNodeMouseEnter={onNodeMouseEnter}
              onNodeMouseLeave={onNodeMouseLeave}
              onNodeContextMenu={handleNodeContextMenu}
              onPaneClick={clearGroupSelection}
              onNodeClick={clearGroupSelection}
              onEdgeClick={clearGroupSelection}
              onNodeDragStart={groupOps.handleNodeDragStart}
              onNodeDrag={groupOps.handleNodeDrag}
              onNodeDragStop={groupOps.handleNodeDragStop}
              connectionLineComponent={ConnectionLine}
              connectionLineStyle={connectionLineStyle}
              connectionRadius={160}
              onSelectionChange={selection.onSelectionChange}
              onNodesDelete={onNodesDelete}
              deleteKeyCode={(groupOps.selectedGroupId || groupOps.deleteGroupId) ? null : deleteKeyCode}
              nodeTypes={nodeTypes}
              edgeTypes={EDGE_TYPES}
              defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
              snapToGrid={snapEnabled}
              snapGrid={SNAP_GRID}
              minZoom={0.01}
              fitView={!hasSavedViewport}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={backgroundVariant} gap={16} size={1} />
              <Controls>
                <ControlButton
                  title={allNodePreviewsEnabled ? '关闭所有节点的预览模式' : '开启所有节点的预览模式'}
                  aria-label={allNodePreviewsEnabled ? '关闭所有节点的预览模式' : '开启所有节点的预览模式'}
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
                <GroupMiniMap
                  items={groupOps.groupOverlayItems}
                  nodes={decoratedNodes}
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
                dropTargetGroupId={groupOps.dropTargetGroupId}
                onSelect={groupOps.setSelectedGroupId}
                onSelectNodes={groupOps.selectGroupNodes}
                onDelete={groupOps.requestDeleteGroup}
                onUpdate={groupOps.updateGroup}
                onMove={groupOps.handleGroupMove}
                onAutoLayout={crud.handleAutoLayout}
                onConnect={groupOps.handleGroupConnect}
                screenDeltaToFlowDelta={groupOps.screenDeltaToFlowDelta}
                inputSlotCounts={groupExecution.inputSlotCounts}
                runningGroupIds={groupExecution.runningGroupIds}
                onRunGroup={handleRunGroup}
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
              onRunSelected={handleRunSelected}
              onAlignDistribute={selection.alignDistribute}
              onApplyGridLayout={selection.applyGridLayout}
              onDeleteSelected={selection.deleteSelectedNodes}
            />

            {/* 顶部图片选中 toolbar：跨节点选中图片后浮出，编辑/抠图/放大作用于选中图并集 */}
            <ImageSelectionToolbar
              {...imageSelectionMenuProps}
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
          edges={edges}
          groups={groups}
          selectedNodeId={selectedId}
          onSelectNode={crud.handleSelectNode}
          onLocateNode={crud.handleLocateNode}
          onDeleteNode={handleDeleteNodeWithHistoryCheck}
          onAdd={crud.handleAdd}
          onDragStartNode={crud.handleDragStartNode}
          onExecute={(type) => setExecuteState({ nodeType: type })}
          history={history}
          assetCategories={assetCategories}
          onRemoveHistory={removeHistory}
          onClearHistory={handleClearHistoryAndReset}
          onRestoreFromNodes={handleRestoreHistoryFromNodes}
          onUseImage={selection.handleUseImage}
          onInsertHistory={handleInsertHistoryWithMenu}
          onDragStartHistory={crud.handleDragStartHistory}
          onAddToAssets={handleAddToAssets}
          onInsertImagesToCanvas={handleInsertImagesToCanvas}
          activeTab={rightTab}
          onActiveTabChange={setRightTab}
          historyFocusNodeId={historyFocusNodeId}
          workspaceId={activeId}
        />
      </ResizablePanel>

      {/* 节点右键菜单：自定义浮层（克隆 / 定位到历史记录 / 删除）。
          透明遮罩捕获外部点击关闭；菜单项点击后调 runNodeContextAction。 */}
      {nodeContextMenu && (
        <>
          <div
            className="fixed inset-0 z-[40]"
            onPointerDown={() => setNodeContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setNodeContextMenu(null); }}
          />
          <div
            className="nodrag nopan nowheel fixed z-[41] min-w-40 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ left: nodeContextMenu.clientX, top: nodeContextMenu.clientY }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => runNodeContextAction('clone', nodeContextMenu.nodeId)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition hover:bg-accent"
            >
              <CopyPlus className="h-3.5 w-3.5" />
              克隆节点
            </button>
            <button
              type="button"
              onClick={() => runNodeContextAction('locateHistory', nodeContextMenu.nodeId)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition hover:bg-accent"
            >
              <Crosshair className="h-3.5 w-3.5" />
              定位到历史记录
            </button>
            <button
              type="button"
              onClick={() => runNodeContextAction('delete', nodeContextMenu.nodeId)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-500 transition hover:bg-accent"
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除节点
            </button>
          </div>
        </>
      )}

      <SettingsDialog
        open={settingsOpen}
        value={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={async (cfg) => {
          await saveSettings(cfg);
        }}
      />

      <BatchRunConfirmDialog
        open={!!batchRunConfirm}
        outputCount={batchRunConfirm?.outputCount || 0}
        onCancel={() => setBatchRunConfirm(null)}
        onConfirm={() => {
          const pending = batchRunConfirm;
          setBatchRunConfirm(null);
          if (pending?.nodeIds?.length) submitBatchRun(pending.nodeIds);
        }}
      />
      {/* 删节点联动历史确认：该节点有关联生成记录时弹出，问是否同时删记录 */}
      <AlertDialog
        open={!!deleteNodeHistoryConfirm}
        onOpenChange={(next) => { if (!next) setDeleteNodeHistoryConfirm(null); }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除节点？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteNodeHistoryConfirm?.nodeLabel} 有 {deleteNodeHistoryConfirm?.relatedCount} 条关联的生成记录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="nodrag nopan nowheel flex cursor-pointer items-center gap-2 py-1 text-sm">
            <Checkbox
              checked={!!deleteNodeHistoryConfirm?.alsoDeleteHistory}
              onCheckedChange={(checked) => setDeleteNodeHistoryConfirm((cur) => cur ? { ...cur, alsoDeleteHistory: !!checked } : cur)}
            />
            <span>同时删除关联的生成记录</span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => confirmDeleteNodeWithHistory(!!deleteNodeHistoryConfirm?.alsoDeleteHistory)}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
        settings={settings}
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
            completeImageExport(groupState.sourceNode, groupState.urls, { groupName: groupName ?? '' });
          }
        }}
        onCancel={() => {
          // 不分组：独立节点加入画布
          if (groupState?.sourceNode) {
            completeImageExport(groupState.sourceNode, groupState.urls);
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

      <ConnectionTargetDialog
        open={!!pendingConnection}
        targets={pendingConnection?.targets || []}
        inputType={pendingConnection?.inputType}
        onClose={() => setPendingConnection(null)}
        onSelect={(inputTarget) => {
          if (pendingConnection?.conn) {
            addConnections(pendingConnection.conn, inputTarget, pendingConnection.inputType);
          }
          setPendingConnection(null);
        }}
      />

      <PastePropertiesDialog
        state={selection.propertyPaste}
        onClose={selection.cancelPropertyPaste}
        onApply={selection.applyProperties}
        onContinuePaste={selection.continuePaste}
      />
    </ResizablePanelGroup>
    </ImageSelectionContext.Provider>
  );
}
