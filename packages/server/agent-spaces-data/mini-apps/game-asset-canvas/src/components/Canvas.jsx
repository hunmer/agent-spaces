import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackgroundVariant, MarkerType, addEdge, applyEdgeChanges, useReactFlow,
} from '@xyflow/react';
import {
  toast, CopyPlus, FolderPlus, openMediaGallery,
} from '@agent-spaces/ui';

import CanvasWorkspace from './canvas/CanvasWorkspace';
import CanvasOverlayDialogs from './canvas/CanvasOverlayDialogs';
import CanvasVersionPanel from './CanvasVersionPanel';
import { ImageSelectionContext } from '../context/ImageSelectionContext';
import useImageSelection from '../hooks/useImageSelection';
import useAssetLibrary from '../hooks/useAssetLibrary';
import {
  CONNECTION_INPUT_TYPES, getConnectionTargets, getConnectionTargetsByInputType, getNodeOutputType,
  withTextTargetVariables,
} from '../utils/connection-targets';
import { resolveStoryboardHandleAssets } from '../utils/storyboard-assets.js';

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
import useCanvasDragAutoPan from '../hooks/useCanvasDragAutoPan';
import useAlignmentGuides from '../hooks/useAlignmentGuides';
import { runCutout } from '../utils/cutout';
import { generateImageResources, normalizeImageUrls } from '../utils/workflow';
import { WORKFLOWS } from '../utils/constants';
import useCanvasAgentRpc, { buildNodeExecution } from '../hooks/useCanvasAgentRpc';
import useDecoratedNodes from '../hooks/useDecoratedNodes';
import useNodePresets from '../hooks/useNodePresets';
import useCharacterLibrary from '../hooks/useCharacterLibrary';
import useStoryboardOperations from '../hooks/useStoryboardOperations';

import { IMAGE_TAGS, NODE_TYPES, NODE_META } from '../utils/constants';
import {
  DEFAULT_SIZE, NODE_COMPONENTS, NODE_PARAMS_SCHEMA, dedupeTags, NODE_PRESET_MIME,
} from '../utils/canvas-constants';
import { genId } from '../utils/canvas-id';
import { copyNodes, pasteNodes } from '../utils/clipboard';
import { serializePreset, instantiatePreset, presetBoundingBox } from '../utils/node-preset';
import { exportAssetLibraryZip, extractFileNameFromUrl, pickAssetLibraryZipFile, importAssetLibraryZip, exportWorkspaceZip, pickWorkspaceZipFile, importWorkspaceZip } from '../utils/export';
import { canvasConfigPath, historyConfigPath, assetLibraryConfigPath, saveCanvas } from '../utils/storage';
import { decorateEdgesForSelection } from '../utils/edge-display';
import { countNodesWithOutput } from '../utils/batch-run';
import { collectGroupNodeIds } from '../utils/group-helpers';
import { CanvasGalleryContextProvider } from '../utils/canvas-gallery';
import { createOutputAssetItems, createOutputResourceId, removeOutputAssetItems, removeOutputVersionImages, updateOutputVersion } from '../utils/output-resources';
import { COMPACT_NODE_ZOOM_THRESHOLD } from './nodes/compact-node';

const EDGE_PATH_STYLES = ['bezier', 'straight', 'step', 'smoothstep'];
const EDGE_LINE_STYLES = ['solid', 'dashed'];

function waitForCanvasState() {
  return new Promise((resolve) => {
    const schedule = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (callback) => setTimeout(callback, 0);
    schedule(() => schedule(resolve));
  });
}

async function writeClipboardText(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error('当前环境不支持写入剪贴板');
}

/**
 * 游戏资产生成画布主组件（编排层）。
 *
 * 原 1969 行的「上帝组件」已按功能拆分到 utils/（6文件）+ hooks/（8个）+ components/canvas/（5个），
 * 本文件只负责：hook 装配 + ReactFlow 变更回调 + JSX 编排骨架。
 *
 * 数据流：useCanvasState 是 nodes/edges/groups 的单一数据源；computeInputImages 派生输入图；
 * decoratedNodes 注入回调后喂给 ReactFlow；各 hook 负责具体业务逻辑。
 */
export default function Canvas({ hostConfig }) {
  // —— 工作区 + 画布状态 + 设置 + 历史（基础数据源）——
  const { workspaces, activeId, createWorkspace, renameWorkspace, switchWorkspace, deleteWorkspace } = useWorkspaces();
  const activeWorkspace = workspaces.find((ws) => ws.id === activeId);
  const {
    nodes, edges, groups, viewport, hasSavedViewport, loaded,
    setNodes, setEdges, setGroups, setViewport, updateCanvasData, updateNodeData,
    operationHistory, undo, redo, canUndo, canRedo,
  } = useCanvasState(activeId);
  // 落地策略由 directory 驱动：设了则产图落到工作区目录，否则落 data（详见 useWorkflow/generateImages）
  const runWorkflow = useWorkflow(activeWorkspace?.directory);
  const { history, addHistory, removeHistory, clearHistory } = useGenerationHistory(activeId);
  const characterLibrary = useCharacterLibrary(activeId);
  const { settings, saveSettings } = useSettings();
  // 节点预设库（全局共享，存顶层 node-presets.json）
  const { presets, addPreset, removePreset } = useNodePresets();
  const presetsRef = useRef(presets);
  presetsRef.current = presets;
  // 上次提交参数（按工作区+nodeType 隔离）：saveLastParams 给执行回调用，getLastParams 给 createNodeAt 预填用
  const { saveLastParams, getLastParams } = useLastParams(activeId);

  // —— 本组件局部 state ——
  const [selectedId, setSelectedId] = useState(null);
  // 跨节点图片选中状态（单击选中 / ctrl 多选 / 双击预览，选中后顶部浮出 ImageSelectionToolbar）
  const imageSelection = useImageSelection();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
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
  // 保存预设对话框：{ pendingNodes, groupCount } | null。底部多选工具栏【保存预设】触发。
  const [savePresetState, setSavePresetState] = useState(null);

  const reactFlow = useReactFlow();
  const wrappingRef = useRef(null);

  // nodes/edges 的 ref 镜像：让「只需读最新值、不需响应式重建」的 callback（onConnect/handleCopy 等）
  // 去掉对 nodes/edges 的依赖，成为稳定 callback，避免触发 nodeCallbacks/decoratedNodes 频繁重算。
  // 同步在每次渲染后更新（useEffect 兜底 + 直接赋值保证同步读取）。
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const decoratedNodesRef = useRef([]);
  const activeQueueNodeIdsRef = useRef(new Set());
  const reservedBatchNodeIdsRef = useRef(new Set());
  nodesRef.current = nodes;
  edgesRef.current = edges;

  useEffect(() => {
    const subscribe = window.AgentSpaces?.subscribeTaskEvents;
    if (typeof subscribe !== 'function') return undefined;
    return subscribe((event, data) => {
      if (event !== 'miniApp.background.completed') return;
      const result = data?.result;
      if (!Array.isArray(result?.originalUrls) || !Array.isArray(result?.urls)) return;
      const localFileUrl = window.AgentSpaces?.localFileUrl;
      if (typeof localFileUrl !== 'function') return;
      const replacements = new Map(result.originalUrls.map((url, i) => [url, localFileUrl(result.urls[i])]));
      nodesRef.current.forEach((node) => {
        const output = node.data?.output;
        const images = output?.images;
        if (!Array.isArray(images)) return;
        const nextImages = images.map((url) => replacements.get(url) || url);
        if (nextImages.every((url, i) => url === images[i])) return;
        const resources = Array.isArray(output.resources)
          ? output.resources.map((item) => ({ ...item, url: replacements.get(item.url) || item.url, thumb: replacements.get(item.thumb) || item.thumb }))
          : output.resources;
        updateCanvasData({
          source: 'background-persist',
          targetType: 'node',
          targetId: node.id,
          key: 'data.output',
          value: { ...output, images: nextImages, resources },
          method: 'replace',
        });
      });
    });
  }, [updateCanvasData]);

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
  const { panelLayout, showMinimap, handlePanelLayoutChange, toggleMinimap, layoutReady } = usePanelLayout();

  // —— 图片节点批量产出（先抽，被执行队列 onComplete 前向引用）——
  const { addImageNodesFromUrls, addImageNodesGrouped, handleExportImages } = useImageOutputs({ setNodes, setGroups });
  // —— 视频节点批量产出（视频导出到画布）——
  const { addVideoNodesFromUrls, handleExportVideos } = useVideoOutputs({ setNodes });
  const storyboardOperations = useStoryboardOperations({
    updateNodeData,
    characters: characterLibrary.characters,
    saveCharacters: characterLibrary.saveCharacters,
    settings,
    directory: activeWorkspace?.directory,
  });
  const groupExecution = useGroupExecution({ groups, nodes, edges, updateCanvasData });

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
        const patch = {
          loading: false,
          status: 'cancelled',
          error: undefined,
        };
        if (job.executionTarget) groupExecution.updateExecutionNodeData(job.executionTarget, patch);
        else updateNodeData(job.placeholderNodeId, patch);
      }
    },
  });
  const activeQueueNodeIds = useMemo(() => new Set(
    jobs
      .filter((job) => job.status === 'queued' || job.status === 'running')
      .map((job) => job.executionNodeId || job.placeholderNodeId)
      .filter(Boolean),
  ), [jobs]);
  activeQueueNodeIdsRef.current = activeQueueNodeIds;
  useEffect(() => {
    for (const nodeId of reservedBatchNodeIdsRef.current) {
      if (!activeQueueNodeIds.has(nodeId)) reservedBatchNodeIdsRef.current.delete(nodeId);
    }
  }, [activeQueueNodeIds]);
  const queuePositions = useMemo(() => {
    const positions = new Map();
    jobs
      .filter((job) => job.status === 'queued' && job.placeholderNodeId)
      .filter((job) => !job.executionTarget
        || groupExecution.getExecutionTargetForNode(job.placeholderNodeId)?.nodeId === job.executionNodeId)
      .forEach((job, index) => positions.set(job.placeholderNodeId, index + 1));
    return positions;
  }, [groupExecution.getExecutionTargetForNode, jobs]);
  const queueStatuses = useMemo(() => new Map(
    jobs
      .filter((job) => (job.status === 'queued' || job.status === 'running') && job.placeholderNodeId)
      .filter((job) => !job.executionTarget
        || groupExecution.getExecutionTargetForNode(job.placeholderNodeId)?.nodeId === job.executionNodeId)
      .map((job) => [job.placeholderNodeId, job.status]),
  ), [groupExecution.getExecutionTargetForNode, jobs]);
  const standaloneRunningNodes = useMemo(
    () => runningNodes.filter((node) => !activeQueueNodeIds.has(
      groupExecution.getExecutionTargetForNode(node.id)?.nodeId || node.id,
    )),
    [activeQueueNodeIds, groupExecution.getExecutionTargetForNode, runningNodes],
  );

  // —— 节点 CRUD + 定位/布局/导出 + 尺寸自适应 + 表单提交 ——
  // 画布容器屏幕中心点（供 handleAdd 定位新节点到视口中心）
  const getViewportCenter = useCallback(() => {
    const el = wrappingRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, []);

  // —— 节点预设：实例化（视口中心 / 拖拽落点）——
  // 把预设还原为节点+内部连线+分组。offset 为左上角落点（flow 坐标）。
  const instantiatePresetAt = useCallback((preset, offset) => {
    if (!preset?.nodes?.length) return;
    const { nodes: newNodes, edges: newEdges, groups: newGroups } = instantiatePreset(preset, { genId, offset });
    setNodes((prev) => [...prev, ...newNodes]);
    setEdges((prev) => [...prev, ...newEdges]);
    if (newGroups.length) setGroups((prev) => [...prev, ...newGroups]);
    return newNodes.map((n) => n.id);
  }, [setNodes, setEdges, setGroups]);

  // 预设卡片「+」点击：实例化到视口中心（按预设包围盒居中）
  const handleAddPreset = useCallback((presetId) => {
    const preset = presetsRef.current.find((p) => p.id === presetId);
    if (!preset) return;
    let offset = { x: 120, y: 120 };
    if (reactFlow.screenToFlowPosition) {
      const center = getViewportCenter();
      if (center) {
        const flowCenter = reactFlow.screenToFlowPosition(center);
        const box = presetBoundingBox(preset);
        offset = { x: flowCenter.x - box.width / 2, y: flowCenter.y - box.height / 2 };
      }
    }
    const ids = instantiatePresetAt(preset, offset);
    if (ids?.length) {
      toast.success(`已添加预设「${preset.name}」（${ids.length} 个节点）`);
      requestAnimationFrame(() => reactFlow.fitView({ nodes: ids.map((id) => ({ id })), padding: 0.2, duration: 300 }));
    }
  }, [getViewportCenter, instantiatePresetAt, reactFlow]);

  // 预设卡片拖拽起始：写 MIME（payload = 预设 id）
  const handleDragStartPreset = useCallback((presetId, event) => {
    try { event.dataTransfer.setData(NODE_PRESET_MIME, presetId); } catch {}
    event.dataTransfer.setData('application/reactflow', '__preset__');
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  // 拖拽落到画布：在落点实例化预设（左上角对齐落点）
  const handleDropPreset = useCallback((presetId, position) => {
    const preset = presetsRef.current.find((p) => p.id === presetId);
    if (!preset) return;
    instantiatePresetAt(preset, position);
    toast.success(`已添加预设「${preset.name}」`);
  }, [instantiatePresetAt]);

  const crud = useNodeCrud({
    nodes, edges, groups, setNodes, setEdges, setGroups,
    reactFlow, selectedId, setSelectedId, updateCanvasData, updateNodeData, settings, submit,
    setDropNodeMenu, setContextMenu, setPendingConnection,
    getViewportCenter, getLastParams, saveLastParams,
    onDropPreset: handleDropPreset,
  });
  const panCanvasBy = useCallback(({ x, y }) => {
    setViewport((current) => ({ ...current, x: current.x + x, y: current.y + y }));
  }, [setViewport]);
  const dragAutoPan = useCanvasDragAutoPan({ canvasRef: wrappingRef, onPan: panCanvasBy });
  const handleCanvasDragOver = useCallback((event) => {
    crud.handleDragOver(event);
    dragAutoPan.handleDragOver(event);
  }, [crud.handleDragOver, dragAutoPan.handleDragOver]);
  const handleCanvasDrop = useCallback((event) => {
    dragAutoPan.stop();
    crud.handleDrop(event);
  }, [crud.handleDrop, dragAutoPan.stop]);

  // —— 节点执行回调（工作流/媒体/本地算法/抠图/反推提示词）——
  const executions = useNodeExecutions({
    runWorkflow,
    updateNodeData,
    updateExecutionNodeData: groupExecution.updateExecutionNodeData,
    addHistory,
    settings,
    createNodeAt: crud.createNodeAt,
    saveLastParams,
  });

  // —— 分组操作 + overlay 移动/连线 ——
  const groupOps = useGroupOperations({
    groups, nodes, edges, setGroups, setNodes, setEdges, updateCanvasData,
    reactFlow, canvasRef: wrappingRef,
  });

  // —— 选中 + 复制粘贴 + 对齐分布 + 批量删除 ——
  const handlePasteImageFiles = useCallback((files) => {
    const screenCenter = getViewportCenter();
    const position = screenCenter ? reactFlow.screenToFlowPosition(screenCenter) : null;
    return crud.handleDropFiles(files, position);
  }, [crud.handleDropFiles, getViewportCenter, reactFlow]);
  const getPasteCenter = useCallback(() => {
    const screenCenter = getViewportCenter();
    return screenCenter ? reactFlow.screenToFlowPosition(screenCenter) : null;
  }, [getViewportCenter, reactFlow]);
  const selection = useSelectionClipboard({
    nodes, edges, groups, setNodes, setEdges, setGroups, setSelectedId, addImageNodesFromUrls,
    onPasteImageFiles: handlePasteImageFiles,
    getPasteCenter,
    activeGroupId: groupOps.selectedGroupId,
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
  // —— ReactFlow 节点拖拽 + 辅助线对齐 ——
  const alignment = useAlignmentGuides({
    nodes,
    setNodes,
    enabled: settings.snapGrid !== false,
    zoom: viewport.zoom,
  });
  const onNodesChange = alignment.onNodesChange;
  const handleNodeDragStop = useCallback((event, node) => {
    alignment.clearGuides();
    groupOps.handleNodeDragStop(event, node);
  }, [alignment.clearGuides, groupOps.handleNodeDragStop]);

  const onEdgesChange = useCallback((changes) => {
    setEdges((prev) => applyEdgeChanges(changes, prev));
  }, [setEdges]);

  // 连线：多选增强（参考 xyflow MultiConnect）——若 source 选中，把所有选中节点都连到 target。
  // 用 nodesRef 读最新 nodes（多选判断），callback deps 不含 nodes → 稳定引用。
  const addConnections = useCallback((
    conn, inputTarget, inputType, sourceAsset, inputVariable, multiSource = true,
  ) => {
    setEdges((prev) => {
      const curNodes = nodesRef.current;
      const originOutputType = inputType || getNodeOutputType(
        curNodes.find((node) => node.id === conn.source)?.type,
      );
      const sources = multiSource && !sourceAsset && curNodes.some((n) => n.id === conn.source && n.selected)
        ? curNodes
          .filter((n) => n.selected && getNodeOutputType(n.type) === originOutputType)
          .map((n) => n.id)
        : [conn.source];
      let next = prev;
      const edgeKey = (source, sourceHandle, target, targetHandle, targetInput, targetVariable) => (
        [source, sourceHandle, target, targetHandle, targetInput, targetVariable].map((value) => String(value || '')).join('\u0000')
      );
      const existing = new Set(prev.map((e) => edgeKey(
        e.source, e.sourceHandle, e.target, e.targetHandle, e.data?.inputTarget,
        e.data?.inputVariable,
      )));
      for (const source of sources) {
        const key = edgeKey(source, conn.sourceHandle, conn.target, conn.targetHandle, inputTarget, inputVariable);
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
              ...(inputVariable ? { inputVariable } : {}),
              ...(sourceAsset ? { sourceAsset } : {}),
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
    const targetParamsSchema = NODE_PARAMS_SCHEMA[targetNode?.type] || [];
    const storyboardAssets = resolveStoryboardHandleAssets(sourceNode, conn.sourceHandle);
    if (storyboardAssets?.length === 0) {
      toast.error('该分镜暂无可连接素材');
      return;
    }
    if (storyboardAssets?.length > 1) {
      setPendingConnection({
        conn,
        assets: storyboardAssets,
        inputType: storyboardAssets[0]?.type,
        targetsByInputType: getConnectionTargetsByInputType(
          storyboardAssets.map((asset) => asset.type),
          targetNode?.type,
          targetParamsSchema,
        ),
      });
      return;
    }
    const sourceAsset = storyboardAssets?.[0] || null;
    const connection = getConnectionTargets(
      sourceNode?.type,
      targetNode?.type,
      targetParamsSchema,
      sourceAsset?.type,
    );
    const { inputType } = connection;
    const targets = inputType === CONNECTION_INPUT_TYPES.text
      ? withTextTargetVariables(connection.targets, targetNode?.data?.params)
      : connection.targets;
    if (!targets.length) {
      toast.error(inputType === 'text' ? '目标节点没有可接收文本的输入框' : '目标节点不支持该输入');
      return;
    }
    if (targets.length > 1 || targets.some((target) => target.variables?.length)) {
      setPendingConnection({ conn, targets, inputType, assets: sourceAsset ? [sourceAsset] : [] });
      return;
    }
    addConnections(conn, targets[0]?.id, inputType, sourceAsset);
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
    () => decorateEdgesForSelection(
      edges, nodes, edgePathStyle, edgeLineStyle, NODE_PARAMS_SCHEMA, hoveredNodeId,
    ),
    [edgeLineStyle, edgePathStyle, edges, hoveredNodeId, nodes],
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
    const patch = { outputPreviewMode: enabled === true };
    const target = groupExecution.getExecutionTargetForNode(id);
    if (target) groupExecution.updateExecutionNodeData(target, patch);
    else updateNodeData(id, patch);
  }, [groupExecution.getExecutionTargetForNode, groupExecution.updateExecutionNodeData, updateNodeData]);

  const allNodePreviewsEnabled = nodes.length > 0
    && nodes.every((node) => node.data?.outputPreviewMode === true);

  const enableAllNodePreviews = useCallback(() => {
    // 切换式：全部已开 → 全关；否则全开（修复原来只能开不能关的问题）
    const turnOn = !allNodePreviewsEnabled;
    nodesRef.current.forEach((node) => {
      if (node.data?.outputPreviewMode === turnOn) return;
      updateCanvasData({
        source: 'preview-mode',
        targetType: 'node',
        targetId: node.id,
        key: 'data.outputPreviewMode',
        value: turnOn,
        method: 'replace',
      });
    });
  }, [allNodePreviewsEnabled, updateCanvasData]);

  // —— 注入到节点 data 的回调集合 ——
  // deps 逐个解构具体 callback（而非整个 executions/crud 对象），任一稳定则 nodeCallbacks 稳定，
  // 避免因 hook 返回对象引用变化触发 decoratedNodes 全量重算。
  const {
    makeOnUpdate, handleGenerate, handleGenerateMedia, handleProcessImage,
    handleProcessLocal, handleCutout, handleCutoutCreate, handleDepth, handleCancelProcess, handlePromptReverse,
  } = executions;
  const handleScopedGenerate = useCallback((nodeId, nodeType, options) => (
    handleGenerate(nodeId, nodeType, {
      ...options,
      executionTarget: groupExecution.getExecutionTargetForNode(nodeId),
    })
  ), [groupExecution.getExecutionTargetForNode, handleGenerate]);
  const handleScopedGenerateMedia = useCallback((nodeId, nodeType, kind, options) => (
    handleGenerateMedia(nodeId, nodeType, kind, {
      ...options,
      executionTarget: groupExecution.getExecutionTargetForNode(nodeId),
    })
  ), [groupExecution.getExecutionTargetForNode, handleGenerateMedia]);
  const handleScopedPromptReverse = useCallback((nodeId, inputImages) => (
    handlePromptReverse(
      nodeId,
      inputImages,
      groupExecution.getExecutionTargetForNode(nodeId),
    )
  ), [groupExecution.getExecutionTargetForNode, handlePromptReverse]);
  const handleScopedProcessLocal = useCallback((
    nodeId, processorId, processorParams, sourceImages, nodeType,
  ) => handleProcessLocal(
    nodeId,
    processorId,
    processorParams,
    sourceImages,
    nodeType,
    groupExecution.getExecutionTargetForNode(nodeId),
  ), [groupExecution.getExecutionTargetForNode, handleProcessLocal]);
  const handleScopedCutout = useCallback((nodeId, mode, modeParams, sourceImages) => (
    handleCutout(
      nodeId,
      mode,
      modeParams,
      sourceImages,
      groupExecution.getExecutionTargetForNode(nodeId),
    )
  ), [groupExecution.getExecutionTargetForNode, handleCutout]);
  const handleScopedDepth = useCallback((nodeId, params, sourceImages) => (
    handleDepth(
      nodeId,
      params,
      sourceImages,
      groupExecution.getExecutionTargetForNode(nodeId),
    )
  ), [groupExecution.getExecutionTargetForNode, handleDepth]);
  const handleScopedCancelProcess = useCallback((nodeId) => {
    const target = groupExecution.getExecutionTargetForNode(nodeId);
    handleCancelProcess(nodeId, target);
  }, [groupExecution.getExecutionTargetForNode, handleCancelProcess]);
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

  // 调试工具：为当前工作区的节点、生成记录、素材库补齐 resources[].thumb / asset.thumb。
  // 按原图 URL 去重生成；已有任一有效 thumb 时直接复用，不重复调用 sharp。
  const handleBackfillThumbnails = useCallback(async (onProgress) => {
    const AS = window.AgentSpaces;
    if (typeof AS?.generateThumbnail !== 'function') throw new Error('宿主缩略图能力不可用');

    const knownThumbs = new Map();
    const needsBackfill = new Set();
    const register = (images, resources) => {
      const list = Array.isArray(images) ? images.filter(Boolean) : [];
      const byUrl = new Map((Array.isArray(resources) ? resources : []).map((item) => [item?.url, item]));
      list.forEach((url) => {
        const thumb = byUrl.get(url)?.thumb;
        if (thumb && thumb !== url) knownThumbs.set(url, thumb);
        else needsBackfill.add(url);
      });
    };

    nodesRef.current.forEach((node) => {
      register(node.data?.output?.images, node.data?.output?.resources);
      register(node.data?.images, node.data?.resources);
    });
    history.forEach((item) => register(item?.images, item?.resources));
    assetCategories.forEach((category) => {
      (category.assets || []).forEach((asset) => register([asset.url], [{ url: asset.url, thumb: asset.thumb }]));
    });

    const targets = Array.from(needsBackfill);
    const total = targets.length;
    let done = 0;
    let failed = 0;
    for (const url of targets) {
      if (knownThumbs.has(url)) done += 1;
    }
    onProgress?.(done, total);

    const generateTargets = targets.filter((url) => !knownThumbs.has(url));
    const concurrency = 4;
    for (let start = 0; start < generateTargets.length; start += concurrency) {
      const batch = generateTargets.slice(start, start + concurrency);
      const results = await Promise.all(batch.map(async (url) => {
        const [resource] = await generateImageResources([url], { historyId: `backfill-${activeId}` });
        return resource;
      }));
      results.forEach((resource, index) => {
        const url = batch[index];
        if (resource?.thumb && resource.thumb !== url) knownThumbs.set(url, resource.thumb);
        else failed += 1;
        done += 1;
      });
      onProgress?.(done, total);
    }

    const mergeResources = (images, resources) => {
      const list = Array.isArray(images) ? images.filter(Boolean) : [];
      const byUrl = new Map((Array.isArray(resources) ? resources : []).map((item) => [item?.url, item]));
      return list.map((url) => ({
        ...(byUrl.get(url) || {}),
        url,
        thumb: knownThumbs.get(url) || byUrl.get(url)?.thumb || url,
      }));
    };

    const nextNodes = nodesRef.current.map((node) => {
      const data = node.data || {};
      let nextData = data;
      if (Array.isArray(data.output?.images) && data.output.images.length) {
        nextData = {
          ...nextData,
          output: { ...data.output, resources: mergeResources(data.output.images, data.output.resources) },
        };
      }
      if (Array.isArray(data.images) && data.images.length) {
        nextData = { ...nextData, resources: mergeResources(data.images, data.resources) };
      }
      return nextData === data ? node : { ...node, data: nextData };
    });

    // 用最新配置快照回写，避免回填期间新增的记录或素材被旧闭包覆盖。
    const latestHistory = AS.getConfig?.(historyConfigPath(activeId));
    const historyList = Array.isArray(latestHistory) ? latestHistory : history;
    const nextHistory = historyList.map((item) => (
      Array.isArray(item?.images) && item.images.length
        ? { ...item, resources: mergeResources(item.images, item.resources) }
        : item
    ));
    const latestAssetLibrary = AS.getConfig?.(assetLibraryConfigPath(activeId));
    const library = latestAssetLibrary?.categories ? latestAssetLibrary : { categories: assetCategories };
    const nextLibrary = {
      ...library,
      categories: (library.categories || []).map((category) => ({
        ...category,
        assets: (category.assets || []).map((asset) => ({
          ...asset,
          thumb: knownThumbs.get(asset.url) || asset.thumb || asset.url,
        })),
      })),
    };

    setNodes(nextNodes);
    await Promise.all([
      saveCanvas(activeId, { nodes: nextNodes, edges: edgesRef.current, groups, viewport }),
      AS.invokeService?.('save_generation_history', { workspaceId: activeId, history: nextHistory }),
      AS.invokeService?.('save_asset_library', { workspaceId: activeId, lib: nextLibrary }),
    ]);

    return { total, updated: total - failed, failed };
  }, [activeId, assetCategories, groups, history, setNodes, viewport]);

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
          console.error('addAsset failed:', err, { url });
        }
      }
    }
  }, [addAsset, assetsPickerImages]);

  // —— 图片全屏预览统一入口（包装 openMediaGallery，注入「收藏到素材库 / 导入到画布」）——
  // 复用 handleAddToAssets（走 AssetLibraryPickerDialog 分组选择 → addAsset）和
  // addImageNodesFromUrls（建 imageDisplay 节点）；actions 始终作用于当前可见图（lgAfterSlide 同步 index）。
  const openCanvasGallery = useCallback((items, startIndex = 0) => {
    if (!Array.isArray(items) || items.length === 0) return;
    openMediaGallery(items, startIndex, [
      {
        label: '收藏到素材库',
        icon: <FolderPlus size={22} />,
        onClick: ({ item }) => {
          handleAddToAssets({ url: item.src, fileName: item.fileName, thumb: item.thumb });
        },
      },
      {
        label: '导入到画布',
        icon: <CopyPlus size={22} />,
        onClick: ({ item }) => {
          addImageNodesFromUrls([item.src], { source: 'gallery' });
          toast.success('已导入到画布');
        },
      },
    ]);
  }, [handleAddToAssets, addImageNodesFromUrls]);

  // —— 导出图片流程：多图选择 → 分组确认 → 落到画布 ——
  // exportState: 多图时打开选择对话框 { sourceNode, images }
  // groupState: 选完图后打开分组确认 { sourceNode, urls }
  const [exportState, setExportState] = useState(null);
  const [groupState, setGroupState] = useState(null);
  const completeImageExport = useCallback((sourceNode, imgs, opts) => {
    const nodeIds = handleExportImages(sourceNode, imgs, {
      ...opts,
      onAdded: (addedIds) => crud.focusNode(addedIds[0]),
    });
    if (!nodeIds?.length) return;
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

  // —— 文件菜单「导入图片」：把本地图片文件上传到后端拿 http URL，每张图建一个 imageDisplay 节点。
  // 上传走 window.AgentSpaces.uploadFile（返回 {url}），URL 用 normalizeImageUrls 补全 origin。
  const handleImportImages = useCallback(async (files) => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) {
      throw new Error('宿主 uploadFile 能力不可用');
    }
    let ok = 0;
    let failed = 0;
    const urls = [];
    await Promise.all(files.map(async (file) => {
      try {
        const res = await AS.uploadFile(file);
        const url = normalizeImageUrls(res?.url);
        if (url) {
          urls.push(url);
          ok += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    }));
    if (urls.length) {
      addImageNodesFromUrls(urls, { source: 'import' });
    }
    return { ok, failed };
  }, [addImageNodesFromUrls]);

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
    const patch = (data) => {
      const prev = Array.isArray(data?.output?.images) ? data.output.images : [];
      const next = mutator(prev);
      const previousResources = Array.isArray(data?.output?.resources) ? data.output.resources : [];
      // 按 URL 出现顺序匹配资源，不能用 Map<url, resource>：重复 URL 可能属于不同产出分组。
      const resources = createOutputAssetItems(next, previousResources).map((item) => (
        item.resource?.id
          ? item.resource
          : { ...item.resource, id: createOutputResourceId(), url: item.url, thumb: item.url }
      ));
      return { __versionSkip: true, output: { ...(data?.output || {}), images: next, resources } };
    };
    const target = groupExecution.getExecutionTargetForNode(nodeId);
    if (target) groupExecution.updateExecutionNodeData(target, patch);
    else updateNodeData(nodeId, patch);
  }, [groupExecution.getExecutionTargetForNode, groupExecution.updateExecutionNodeData, updateNodeData]);
  const handleAddOutputImages = useCallback((nodeId, urls) => {
    if (!Array.isArray(urls) || !urls.length) return;
    handleOutputImagesChange(nodeId, (prev) => [...prev, ...urls.filter(Boolean)]);
  }, [handleOutputImagesChange]);
  const handleRemoveOutputImage = useCallback((nodeId, ids) => {
    const patchOutput = (data) => {
      const images = Array.isArray(data?.output?.images) ? data.output.images : [];
      const resources = Array.isArray(data?.output?.resources) ? data.output.resources : [];
      const next = removeOutputAssetItems(images, resources, ids);
      const activeVersion = Number.isInteger(data?.activeVersion)
        ? data.activeVersion
        : (Array.isArray(data?.versions) && data.versions.length ? data.versions.length - 1 : undefined);
      const versions = updateOutputVersion(data?.versions, activeVersion, next);
      return {
        __versionSkip: true,
        output: {
          ...(data?.output || {}),
          images: next.images,
          resources: next.resources,
        },
        ...(versions !== data?.versions ? { versions } : {}),
      };
    };
    const target = groupExecution.getExecutionTargetForNode(nodeId);
    if (target) groupExecution.updateExecutionNodeData(target, patchOutput);
    else updateNodeData(nodeId, patchOutput);
  }, [groupExecution.getExecutionTargetForNode, groupExecution.updateExecutionNodeData, updateNodeData]);
  const handleRemoveVersionImages = useCallback((nodeId, versionIndex, ids) => {
    const patchVersion = (data) => {
      const versions = Array.isArray(data?.versions) ? data.versions : [];
      const targetVersion = versions[versionIndex];
      if (!targetVersion?.output) return { __versionSkip: true };
      const nextVersions = removeOutputVersionImages(versions, versionIndex, ids);
      const patch = { __versionSkip: true, versions: nextVersions };
      const activeVersion = Number.isInteger(data?.activeVersion) ? data.activeVersion : -1;
      if (activeVersion === versionIndex) {
        // 当前 output 可能不是传入的历史快照，必须基于当前 output 自身删除，不能用历史 next 覆盖。
        const currentOutput = data?.output || {};
        const currentNext = removeOutputAssetItems(
          currentOutput.images,
          currentOutput.resources,
          ids,
        );
        patch.output = { ...currentOutput, images: currentNext.images, resources: currentNext.resources };
      }
      return patch;
    };
    const target = groupExecution.getExecutionTargetForNode(nodeId);
    if (target) groupExecution.updateExecutionNodeData(target, patchVersion);
    else updateNodeData(nodeId, patchVersion);
  }, [groupExecution.getExecutionTargetForNode, groupExecution.updateExecutionNodeData, updateNodeData]);
  // 产出图重排序：拖拽调整顺序，写回 data.output.images
  const handleReorderOutputImages = useCallback((nodeId, next, nextResources) => {
    if (!Array.isArray(next)) return;
    const patch = (data) => ({
      __versionSkip: true,
      output: {
        ...(data?.output || {}),
        images: next,
        resources: Array.isArray(nextResources)
          ? nextResources
          : createOutputAssetItems(next, data?.output?.resources).map((item) => item.resource),
      },
    });
    const target = groupExecution.getExecutionTargetForNode(nodeId);
    if (target) groupExecution.updateExecutionNodeData(target, patch);
    else updateNodeData(nodeId, patch);
  }, [groupExecution.getExecutionTargetForNode, groupExecution.updateExecutionNodeData, updateNodeData]);
  const handleClearOutputImages = useCallback((nodeId) => {
    // 清空产出同时清空版本历史：避免清空后 versions 残留，刷新页面版本按钮又出现
    const patch = {
      __versionSkip: true,
      output: { images: [], resources: [] },
      versions: [],
      activeVersion: undefined,
      status: 'idle',
    };
    const target = groupExecution.getExecutionTargetForNode(nodeId);
    if (target) groupExecution.updateExecutionNodeData(target, patch);
    else updateNodeData(nodeId, patch);
  }, [groupExecution.getExecutionTargetForNode, groupExecution.updateExecutionNodeData, updateNodeData]);
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
  // 节点内部部分组件（如图片 ContextMenuTrigger）会截获右键事件，
  // 在画布容器捕获阶段统一处理，确保任意节点内容区域都能打开节点菜单。
  const handleNodeContextMenuCapture = useCallback((event) => {
    const nodeElement = event.target?.closest?.('.react-flow__node');
    const nodeId = nodeElement?.dataset?.id;
    if (!nodeId) return;
    const node = nodesRef.current.find((item) => item.id === nodeId);
    if (node) handleNodeContextMenu(event, node);
  }, [handleNodeContextMenu]);
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
    const clonedIds = new Set(result.nodes.map((item) => item.id));
    setGroups((prev) => prev.map((group) => (
      group.childNodeIds?.includes(nodeId)
        ? { ...group, childNodeIds: [...group.childNodeIds, ...clonedIds] }
        : group
    )));
    toast.success('已克隆节点');
  }, [setNodes, setEdges, setGroups]);
  // 定位到历史记录：切到 history tab + 设 focusNodeId 让 HistoryTab 滚动高亮。
  // focusNodeId 用一个新值触发（即使同节点再次定位也能重新滚动）。
  const handleLocateHistory = useCallback((nodeId) => {
    setRightTab('history');
    setHistoryFocusNodeId(`${nodeId}:${Date.now()}`);
  }, []);
  const handleCopyNodeInfo = useCallback(async (nodeId) => {
    const node = nodesRef.current.find((item) => item.id === nodeId);
    if (!node) return;
    const typeLabel = NODE_META[node.type]?.label || node.type;
    const info = {
      id: node.id,
      type: node.type,
      typeLabel,
      title: node.data?.title || node.data?.label || typeLabel,
      position: node.position,
      data: node.data || {},
    };
    try {
      await writeClipboardText(JSON.stringify(info, null, 2));
      toast.success('已复制节点信息');
    } catch (error) {
      toast.error(error?.message || '复制节点信息失败');
    }
  }, []);
  const handleCreateDownstreamImageDisplay = useCallback((nodeId) => {
    const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
    if (!sourceNode) return;
    const targetSize = DEFAULT_SIZE[NODE_TYPES.imageDisplay];
    const sourceWidth = Number(sourceNode.measured?.width || sourceNode.width || sourceNode.style?.width) || 260;
    const sourceHeight = Number(sourceNode.measured?.height || sourceNode.height || sourceNode.style?.height) || targetSize.h;
    const targetId = crud.createNodeAt(NODE_TYPES.imageDisplay, {
      x: sourceNode.position.x + sourceWidth + 80,
      y: sourceNode.position.y + (sourceHeight - targetSize.h) / 2,
    });
    addConnections(
      { source: nodeId, target: targetId },
      'images',
      CONNECTION_INPUT_TYPES.image,
      undefined,
      undefined,
      false,
    );
    setGroups((prev) => prev.map((group) => (
      group.childNodeIds?.includes(nodeId)
        ? { ...group, childNodeIds: [...group.childNodeIds, targetId] }
        : group
    )));
    toast.success('已创建并连接图片展示节点');
  }, [addConnections, crud.createNodeAt, setGroups]);
  // 保存为预设：收集当前选中节点（用 ref 读最新值），暂存快照后弹对话框。
  // 统计涉及的分组数（任一子节点在选中集合内）。
  const handleSavePreset = useCallback(() => {
    const curNodes = nodesRef.current;
    const selected = curNodes.filter((n) => n.selected);
    if (selected.length < 1) {
      toast.warning('请先选中节点');
      return;
    }
    const idSet = new Set(selected.map((n) => n.id));
    const groupCount = groups.filter((g) => (g.childNodeIds || []).some((id) => idSet.has(id))).length;
    setSavePresetState({ pendingNodes: selected, groupCount });
  }, [groups]);
  // 对话框确认：序列化选中快照 + 入库 + 切到预设 tab。
  const confirmSavePreset = useCallback((name) => {
    const info = savePresetState;
    if (!info?.pendingNodes?.length) return;
    const preset = serializePreset(info.pendingNodes, edgesRef.current, groups, name);
    if (preset) {
      addPreset(preset);
      setRightTab('presets');
      toast.success(`已保存预设「${preset.name}」`);
    }
    setSavePresetState(null);
  }, [addPreset, groups, savePresetState]);
  // 节点右键菜单执行 action 后关闭菜单。
  const runNodeContextAction = useCallback((action, nodeId) => {
    setNodeContextMenu(null);
    if (action === 'clone') handleCloneNode(nodeId);
    else if (action === 'copyProperties') selection.handleCopyProperties(nodeId);
    else if (action === 'copyInfo') void handleCopyNodeInfo(nodeId);
    else if (action === 'pasteProperties') selection.requestPropertyPaste(nodeId);
    else if (action === 'locateHistory') handleLocateHistory(nodeId);
    else if (action === 'createImageDisplay') handleCreateDownstreamImageDisplay(nodeId);
    else if (action === 'delete') handleDeleteNodeWithHistoryCheck(nodeId);
  }, [
    handleCloneNode, handleCopyNodeInfo, handleCreateDownstreamImageDisplay,
    handleLocateHistory, handleDeleteNodeWithHistoryCheck,
    selection.handleCopyProperties, selection.requestPropertyPaste,
  ]);
  // 临时：从画布节点产出反向重建生成记录（用于误清空历史后恢复）。
  // 字段约定参考 useNodeExecutions 各 addHistory 调用（images/mediaType/text/prompt/model）。
  // 一个 output 快照派生一条 history item（audio/video/text/images 任一命中）。
  const pickOutputItem = (out) => {
    if (!out || typeof out !== 'object') return null;
    const audios = [out.audio, ...(out.audios || [])].filter(Boolean);
    const videos = [out.video, ...(out.videos || [])].filter(Boolean);
    const images = Array.isArray(out.images) ? out.images.filter(Boolean) : [];
    const resources = Array.isArray(out.resources) ? out.resources.filter((item) => item?.url) : [];
    const text = typeof out.text === 'string' ? out.text.trim() : '';
    if (audios.length) return { mediaType: 'audio', images: audios };
    if (videos.length) return { mediaType: 'video', images: videos };
    if (text) return { mediaType: 'text', text: text.slice(0, 5000), images: images.slice(0, 4), resources: resources.slice(0, 4) };
    if (images.length) return { images, resources };
    return null;
  };
  const handleRestoreHistoryFromNodes = useCallback(() => {
    const curNodes = nodesRef.current;
    const now = Date.now();
    let restored = 0;
    let timeOffset = 0; // 跨节点累计，保证恢复出的多条记录时间单调、排序稳定
    curNodes.forEach((n) => {
      const data = n?.data || {};
      const nodeType = n.type;
      // 收集要派生的「产出快照」列表：每条快照 → 一条 history 记录。
      // - 生成类节点：遍历 data.versions 全部历史版本（含当前激活版本），逐版本派生；
      //   无 versions（如音频/视频/文本节点不会存档）回退到当前 data.output。
      // - 透传类节点（imageDisplay/videoDisplay）：data.images/videos 是节点级透传字段，
      //   不在 versions 里，单独从 data 派生一条。
      let snapshots = [];
      if (nodeType === NODE_TYPES.imageDisplay || nodeType === NODE_TYPES.videoDisplay) {
        const displayImages = nodeType === NODE_TYPES.imageDisplay
          ? (Array.isArray(data.images) ? data.images.filter(Boolean) : [])
          : [];
        const displayVideos = nodeType === NODE_TYPES.videoDisplay
          ? (Array.isArray(data.videos) ? data.videos.filter(Boolean) : [])
          : [];
        if (displayVideos.length) snapshots.push({ item: { mediaType: 'video', images: displayVideos }, params: data.params || {}, createdAt: undefined });
        else if (displayImages.length) snapshots.push({ item: { images: displayImages }, params: data.params || {}, createdAt: undefined });
      } else {
        const versions = Array.isArray(data.versions) ? data.versions : [];
        const sources = versions.length
          ? versions.map((v) => ({ out: v.output, params: v.params || {}, createdAt: v.createdAt }))
          : [{ out: data.output, params: data.params || {}, createdAt: undefined }];
        sources.forEach(({ out, params, createdAt }) => {
          const item = pickOutputItem(out);
          if (item) snapshots.push({ item, params, createdAt });
        });
      }
      snapshots.forEach(({ item, params, createdAt }) => {
        addHistory({
          id: genId('hist'),
          nodeId: n.id,
          nodeType,
          prompt: params.prompt || '',
          model: params.model || '',
          createdAt: createdAt || now + (timeOffset++),
          ...item,
        }).catch((e) => console.error('restore addHistory failed:', e));
        restored += 1;
      });
    });
    if (restored) toast.success(`已从节点恢复 ${restored} 条生成记录`);
    else toast.info('画布上没有可恢复的产出');
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

  const handleDeleteEdgeById = useCallback((edgeId) => {
    if (!edgeId) return;
    setEdges((prev) => prev.filter((edge) => edge.id !== edgeId));
  }, [setEdges]);

  // 连线 toolbar 操作：删除直接移除；插入节点打开现有添加节点菜单，选中后由
  // useNodeCrud.handleAddAtDrop 负责创建节点并重连原连线两端。
  useEffect(() => {
    const onDelete = (event) => handleDeleteEdgeById(event.detail?.edgeId);
    const onInsert = (event) => {
      const detail = event.detail || {};
      if (!detail.edgeId || !detail.source || !detail.target) return;
      const sourceNode = nodesRef.current.find((node) => node.id === detail.source);
      const targetNode = nodesRef.current.find((node) => node.id === detail.target);
      if (!sourceNode || !targetNode) return;
      const sourceW = sourceNode.width || sourceNode.style?.width || 280;
      const sourceH = sourceNode.height || sourceNode.style?.height || 220;
      const targetW = targetNode.width || targetNode.style?.width || 280;
      const targetH = targetNode.height || targetNode.style?.height || 220;
      const flowPoint = {
        x: (sourceNode.position.x + sourceW / 2 + targetNode.position.x + targetW / 2) / 2,
        y: (sourceNode.position.y + sourceH / 2 + targetNode.position.y + targetH / 2) / 2,
      };
      const screenPoint = reactFlow.flowToScreenPosition(flowPoint);
      setDropNodeMenu({
        clientX: screenPoint.x,
        clientY: screenPoint.y,
        source: detail.source,
        target: detail.target,
        edgeId: detail.edgeId,
        sourceHandle: detail.sourceHandle || null,
      });
    };
    window.addEventListener('workflow:delete-edge', onDelete);
    window.addEventListener('workflow:edge-insert-node', onInsert);
    return () => {
      window.removeEventListener('workflow:delete-edge', onDelete);
      window.removeEventListener('workflow:edge-insert-node', onInsert);
    };
  }, [handleDeleteEdgeById, reactFlow]);

  // 版本切换：把节点 params/output/status 还原到指定历史版本。加 __switchVersion 标记，
  // updateNodeData 不会把这次写入当作新版本存档，仅更新 activeVersion。
  const handleSwitchVersion = useCallback((nodeId, versionIndex) => {
    const patchVersion = (data) => {
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
    };
    const target = groupExecution.getExecutionTargetForNode(nodeId);
    if (target) groupExecution.updateExecutionNodeData(target, patchVersion);
    else updateNodeData(nodeId, patchVersion);
  }, [groupExecution.getExecutionTargetForNode, groupExecution.updateExecutionNodeData, updateNodeData]);

  const nodeCallbacks = useMemo(() => ({
    makeOnUpdate,
    onGenerate: handleScopedGenerate,
    onGenerateMedia: handleScopedGenerateMedia,
    onExportImages: handleExportImagesWithPicker,
    onProcessImage: handleProcessImage,
    onProcessLocal: handleScopedProcessLocal,
    onCutout: handleScopedCutout,
    onCutoutCreate: handleCutoutCreate,
    onDepth: handleScopedDepth,
    onCancelProcess: handleScopedCancelProcess,
    onPromptReverse: handleScopedPromptReverse,
    onEditImages: (imgs) => setFormState({ nodeType: NODE_TYPES.editImage, initialImages: imgs }),
    onAutoSize: handleAutoSize,
    onAutoSizeToContent: handleAutoSizeToContent,
    onBBoxCutout: handleBBoxCutout,
    onResetParams: handleResetParams,
    onAddToAssets: handleAddToAssets,
    // 产出区操作（写 data.output.images）
    onAddOutputImages: handleAddOutputImages,
    onRemoveOutputImage: handleRemoveOutputImage,
    onRemoveVersionImages: handleRemoveVersionImages,
    onClearOutputImages: handleClearOutputImages,
    onReorderOutputImages: handleReorderOutputImages,
    // 版本切换（还原 params/output/status 到指定历史版本）
    onSwitchVersion: handleSwitchVersion,
    // 删除一张上游输入图（断开产出该图的连入边）
    onDeleteUpstreamImage: handleDeleteUpstreamImage,
    // 视频导出到画布（生成 videoDisplay 节点）
    onExportVideos: handleExportVideosWithPicker,
    onApplyToGroup: groupExecution.requestPropertyApply,
    onImportStoryboard: storyboardOperations.importStoryboard,
    onGenerateStoryboardMedia: storyboardOperations.generateSceneMedia,
    onSaveStoryboardCharacter: characterLibrary.saveCharacter,
    onDeleteStoryboardCharacter: characterLibrary.deleteCharacter,
    onDeleteEdge: handleDeleteEdgeById,
  }), [
    makeOnUpdate, handleScopedGenerate, handleScopedGenerateMedia, handleProcessImage,
    handleScopedProcessLocal, handleScopedCutout, handleCutoutCreate, handleScopedDepth,
    handleScopedCancelProcess, handleScopedPromptReverse,
    handleExportImagesWithPicker, handleAutoSize, handleAutoSizeToContent, handleBBoxCutout, handleResetParams,
    handleAddToAssets, handleAddOutputImages, handleRemoveOutputImage, handleRemoveVersionImages, handleClearOutputImages, handleReorderOutputImages,
    handleSwitchVersion, handleDeleteUpstreamImage, handleExportVideosWithPicker,
    groupExecution.requestPropertyApply,
    storyboardOperations.importStoryboard, storyboardOperations.generateSceneMedia,
    characterLibrary.saveCharacter, characterLibrary.deleteCharacter, handleDeleteEdgeById,
  ]);

  // —— Agent RPC（WS message 监听，ref 持有最新值只订阅一次）——
  // 放在 handleGenerate/handleGenerateMedia 解构之后（TDZ：执行回调需先声明）。
  const focusCanvasNodes = useCallback((nodeIds) => {
    if (!nodeIds?.length) return;
    requestAnimationFrame(() => {
      reactFlow.fitView({
        nodes: nodeIds.map((id) => ({ id })),
        padding: 0.2,
        duration: 300,
      });
    });
  }, [reactFlow]);

  useCanvasAgentRpc({
    nodes, edges, groups,
    createNodeAt: crud.createNodeAt,
    updateNodeData, handleDeleteNode: crud.handleDeleteNode,
    focusNode: crud.focusNode, focusNodes: focusCanvasNodes,
    setNodes, setEdges, setGroups,
    onGenerate: handleScopedGenerate, onGenerateMedia: handleScopedGenerateMedia,
    settings,
  });

  const { decoratedNodes } = useDecoratedNodes({
    nodes, edges, propertyApplyNodeIds: groupExecution.propertyApplyNodeIds,
    protectedImageUrls: groupExecution.protectedImageUrls,
    selectionCount: selection.selectionCount,
    outputPreviewState,
    onOutputPreviewHeight: handleOutputPreviewHeight,
    onOutputPreviewModeChange: handleOutputPreviewModeChange,
    settings, callbacks: nodeCallbacks, storyboardCharacters: characterLibrary.characters,
  });
  decoratedNodesRef.current = decoratedNodes;
  const collectBatchRunNodes = useCallback((nodeIds) => {
    const nodeMap = new Map(decoratedNodesRef.current.map((node) => [node.id, node]));
    const candidates = [];
    let skipped = 0;
    for (const nodeId of nodeIds || []) {
      const node = nodeMap.get(nodeId);
      const executionNodeId = groupExecution.getExecutionTargetForNode(nodeId)?.nodeId || nodeId;
      if (
        !node
        || node.data?.status === 'running'
        || activeQueueNodeIdsRef.current.has(executionNodeId)
        || reservedBatchNodeIdsRef.current.has(executionNodeId)
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
  }, [groupExecution.getExecutionTargetForNode]);

  const executeCurrentGroupRun = useCallback(async (nodeIds, runId = null) => {
    const { candidates } = collectBatchRunNodes(nodeIds);
    if (!candidates.length) throw new Error('分组内没有可执行的生成节点');
    const requests = candidates.map(({ node, spec }) => ({
      node,
      spec,
      target: groupExecution.getExecutionTargetForNode(node.id, runId),
    }));
    await Promise.all(requests.map(({ node, spec, target }) => (
      spec.kind === 'image'
        ? handleGenerate(node.id, node.type, {
          workflowId: spec.workflowId, input: spec.input, executionTarget: target,
        })
        : handleGenerateMedia(node.id, node.type, spec.kind, {
          workflowId: spec.workflowId, input: spec.input, executionTarget: target,
        })
    )));
    await waitForCanvasState();
    const failed = requests.filter(({ node, target }) => (
      (target ? groupExecution.getExecutionNodeData(target) : nodesRef.current.find((item) => item.id === node.id)?.data)
        ?.status === 'error'
    ));
    if (failed.length) throw new Error(`${failed.length} 个节点执行失败`);
  }, [collectBatchRunNodes, groupExecution.getExecutionNodeData, groupExecution.getExecutionTargetForNode, handleGenerate, handleGenerateMedia]);

  const handleRunAllGroup = useCallback((groupId, runIds) => {
    void groupExecution.runAllRuns(groupId, runIds, executeCurrentGroupRun);
  }, [executeCurrentGroupRun, groupExecution.runAllRuns]);

  const handleStopAllGroup = useCallback((groupId) => {
    if (groupExecution.runAllStates[groupId]?.running) groupExecution.stopAllRuns(groupId);
    const nodeIds = new Set(collectGroupNodeIds(groupsRef.current, groupId));
    const groupJobs = jobs.filter((job) => (
        (job.status === 'queued' || job.status === 'running')
        && nodeIds.has(job.placeholderNodeId)
      ));
    const queuedNodeIds = new Set(groupJobs.map((job) => job.placeholderNodeId).filter(Boolean));
    groupJobs.forEach((job) => cancel(job.id));
    nodesRef.current
      .filter((node) => (
        nodeIds.has(node.id)
        && !queuedNodeIds.has(node.id)
        && (node.data?.status === 'running' || node.data?.loading)
      ))
      .forEach((node) => handleScopedCancelProcess(node.id));
  }, [cancel, groupExecution.runAllStates, groupExecution.stopAllRuns, handleScopedCancelProcess, jobs]);

  const submitBatchRun = useCallback((nodeIds) => {
    const { candidates, skipped } = collectBatchRunNodes(nodeIds);
    for (const { node, spec } of candidates) {
      const executionTarget = groupExecution.getExecutionTargetForNode(node.id);
      reservedBatchNodeIdsRef.current.add(executionTarget?.nodeId || node.id);
      submit({
        nodeType: node.type,
        label: NODE_META[node.type]?.label || node.data?.label || node.type,
        placeholderNodeId: node.id,
        executionNodeId: executionTarget?.nodeId || node.id,
        executionTarget,
        execute: async () => {
          if (spec.kind === 'image') {
            await handleGenerate(node.id, node.type, {
              workflowId: spec.workflowId,
              input: spec.input,
              executionTarget,
            });
          } else {
            await handleGenerateMedia(node.id, node.type, spec.kind, {
              workflowId: spec.workflowId,
              input: spec.input,
              executionTarget,
            });
          }
        },
        cancel: () => handleCancelProcess(node.id, executionTarget),
      });
    }
    if (candidates.length > 0) {
      toast.success(`已加入 ${candidates.length} 个任务${skipped ? `，跳过 ${skipped} 个不可执行或已运行节点` : ''}`);
    } else {
      toast.warning('分组内没有可执行的生成节点');
    }
  }, [collectBatchRunNodes, groupExecution.getExecutionTargetForNode, handleCancelProcess, handleGenerate, handleGenerateMedia, submit]);

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
  const handleImportSelectedImagesToCanvas = useCallback((urls) => {
    if (!urls?.length) return;
    addImageNodesFromUrls(urls, { source: 'import' });
    imageSelection.clear();
  }, [addImageNodesFromUrls, imageSelection.clear]);
  const imageSelectionMenuProps = useMemo(() => ({
    selectedCount: imageSelection.selectedCount,
    selectedUrls: imageSelection.selectedUrls,
    onEditImages: handleEditSelectedImages,
    onCutoutCreate: handleCutoutSelectedImages,
    onProcessImage: handleProcessSelectedImages,
    onAddToAssets: handleAddSelectedImagesToAssets,
    onImportToCanvas: handleImportSelectedImagesToCanvas,
    onClear: imageSelection.clear,
  }), [
    imageSelection.selectedCount, imageSelection.selectedUrls, imageSelection.clear,
    handleEditSelectedImages, handleCutoutSelectedImages, handleProcessSelectedImages,
    handleAddSelectedImagesToAssets, handleImportSelectedImagesToCanvas,
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
  if (!activeId || !loaded || !layoutReady) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">加载中…</div>;
  }

  return (
    <CanvasGalleryContextProvider value={openCanvasGallery}>
      <ImageSelectionContext.Provider value={imageSelection}>
        <CanvasWorkspace
          activeId={activeId}
          panelLayout={panelLayout}
          onPanelLayoutChange={handlePanelLayoutChange}
          toolbarProps={{
            onClear: crud.handleClear,
            onAutoLayout: crud.handleAutoLayout,
            onExport: crud.handleExport,
            onExportAssetLibrary: handleExportAssetLibrary,
            onImport: crud.handleImport,
            onImportAssetLibrary: handleImportAssetLibrary,
            onExportWorkspace: handleExportWorkspace,
            onImportWorkspace: handleImportWorkspace,
            onImportImages: handleImportImages,
            onOpenSettings: () => setSettingsOpen(true),
            onOpenVersions: () => setVersionsOpen(true),
            onOpenPromptManager: () => setPromptManagerOpen(true),
            onBackfillThumbnails: handleBackfillThumbnails,
            edgePathStyle,
            edgeLineStyle,
            edgePathStyles: EDGE_PATH_STYLES,
            edgeLineStyles: EDGE_LINE_STYLES,
            onEdgePathStyleChange: setEdgePathStyle,
            onEdgeLineStyleChange: setEdgeLineStyle,
            bgVariant: settings.bgVariant,
            handlePosition,
            snapEnabled,
            onCanvasStyleChange: handleCanvasStyleChange,
            onSelectAll: selection.handleSelectAll,
            onInvertSelect: selection.handleInvertSelect,
            onClearSelection: selection.handleClearSelection,
            operationHistory,
            onUndo: undo,
            onRedo: redo,
            canUndo,
            canRedo,
          }}
          workspaceSwitcherProps={{
            workspaces,
            activeId,
            onSwitch: handleSwitch,
            onCreate: handleCreate,
            onDelete: handleDelete,
            onRename: renameWorkspace,
          }}
          queueProps={{
            jobs,
            runningNodes: standaloneRunningNodes,
            runningCount: runningCount + queuedCount + standaloneRunningNodes.length,
            concurrency: settings.executionConcurrency,
            onConcurrencyChange: handleExecutionConcurrencyChange,
            onCancel: cancel,
            onCancelNode: handleCancelProcess,
            onCancelAll: handleCancelAllTasks,
            onClearFinished: clearFinished,
          }}
          canvasContainerProps={{
            ref: wrappingRef,
            onDrop: handleCanvasDrop,
            onDragOver: handleCanvasDragOver,
            onDragLeave: dragAutoPan.handleDragLeave,
            onContextMenuCapture: handleNodeContextMenuCapture,
            onContextMenu: crud.handleContextMenu,
          }}
          canvasContextMenuProps={{
            onPick: crud.handleAddAtMenu,
            imageSelectionMenuProps,
            onSelectContextImage: imageSelection.selectForContextMenu,
          }}
          reactFlowProps={{
            nodes: renderedNodes,
            edges: floatingEdges,
            viewport,
            onViewportChange: setViewport,
            onNodesChange,
            onEdgesChange,
            onConnect,
            onConnectStart: () => setIsConnecting(true),
            onConnectEnd,
            onNodeMouseEnter,
            onNodeMouseLeave,
            onNodeContextMenu: handleNodeContextMenu,
            onPaneClick: clearGroupSelection,
            onNodeClick: clearGroupSelection,
            onEdgeClick: clearGroupSelection,
            onNodeDragStart: groupOps.handleNodeDragStart,
            onNodeDrag: groupOps.handleNodeDrag,
            onNodeDragStop: handleNodeDragStop,
            connectionLineStyle,
            onSelectionChange: selection.onSelectionChange,
            onNodesDelete,
            deleteKeyCode: (groupOps.selectedGroupId || groupOps.deleteGroupId) ? null : deleteKeyCode,
            nodeTypes,
            snapToGrid: snapEnabled,
            fitView: !hasSavedViewport,
          }}
          backgroundVariant={backgroundVariant}
          alignmentProps={{ guides: alignment.guides, viewport }}
          previewControl={{
            enabled: allNodePreviewsEnabled,
            title: allNodePreviewsEnabled ? '关闭所有节点的预览模式' : '开启所有节点的预览模式',
            onToggle: enableAllNodePreviews,
          }}
          minimapControl={{ visible: showMinimap, onToggle: toggleMinimap }}
          minimapProps={{ items: groupOps.groupOverlayItems, nodes: decoratedNodes }}
          groupOverlayProps={{
            items: groupOps.groupOverlayItems,
            groups,
            nodes,
            selectedGroupId: groupOps.selectedGroupId,
            dropTargetGroupId: groupOps.dropTargetGroupId,
            onSelect: groupOps.setSelectedGroupId,
            onSelectNodes: groupOps.selectGroupNodes,
            onDelete: groupOps.requestDeleteGroup,
            onUpdate: groupOps.updateGroup,
            onMove: groupOps.handleGroupMove,
            onAutoLayout: crud.handleAutoLayout,
            onConnect: groupOps.handleGroupConnect,
            screenDeltaToFlowDelta: groupOps.screenDeltaToFlowDelta,
            inputSlotCounts: groupExecution.inputSlotCounts,
            runningGroupIds: groupExecution.runningGroupIds,
            onRunGroup: handleRunGroup,
            onRunAllExecution: handleRunAllGroup,
            onStopAllExecution: handleStopAllGroup,
            runAllStates: groupExecution.runAllStates,
            onSetExecutionMode: groupExecution.setMode,
            onSetExecutionCount: groupExecution.setCount,
            onSwitchExecutionRun: groupExecution.switchRun,
            onUploadExecutionAssets: groupExecution.uploadAssets,
            onRemoveExecutionAsset: groupExecution.removeAsset,
            onSetOutputBinding: groupExecution.setOutputBinding,
            onDisconnectOutputBinding: groupExecution.disconnectOutputBinding,
          }}
          multiSelectProps={{
            selectionCount: selection.selectionCount,
            onCreateGroup: groupOps.createGroupFromSelection,
            onRunSelected: handleRunSelected,
            onAlignDistribute: selection.alignDistribute,
            onApplyGridLayout: selection.applyGridLayout,
            onDeleteSelected: selection.deleteSelectedNodes,
            onSavePreset: handleSavePreset,
          }}
          imageSelectionMenuProps={imageSelectionMenuProps}
          dropNodeMenuProps={{
            dropNodeMenu,
            onClose: () => setDropNodeMenu(null),
            onPick: crud.handleAddAtDrop,
          }}
          rightPanelProps={{
            nodes,
            edges,
            groups,
            selectedNodeId: selectedId,
            onSelectNode: crud.handleSelectNode,
            onLocateNode: crud.handleLocateNode,
            onDeleteNode: handleDeleteNodeWithHistoryCheck,
            onAdd: crud.handleAdd,
            onDragStartNode: crud.handleDragStartNode,
            onExecute: (type) => setExecuteState({ nodeType: type }),
            presets,
            onAddPreset: handleAddPreset,
            onDragStartPreset: handleDragStartPreset,
            onDeletePreset: removePreset,
            history,
            assetCategories,
            onRemoveHistory: removeHistory,
            onClearHistory: handleClearHistoryAndReset,
            onRestoreFromNodes: handleRestoreHistoryFromNodes,
            onUseImage: selection.handleUseImage,
            onInsertHistory: handleInsertHistoryWithMenu,
            onDragStartHistory: crud.handleDragStartHistory,
            onAddToAssets: handleAddToAssets,
            onInsertImagesToCanvas: handleInsertImagesToCanvas,
            activeTab: rightTab,
            onActiveTabChange: setRightTab,
            historyFocusNodeId,
            workspaceId: activeId,
            agentChatPlacement: hostConfig?.agentChatPlacement,
          }}
        >
          <CanvasOverlayDialogs
            nodeContextMenu={nodeContextMenu}
            onCloseNodeContextMenu={() => setNodeContextMenu(null)}
            onNodeContextAction={runNodeContextAction}
            settingsDialog={{
              open: settingsOpen,
              value: settings,
              onClose: () => setSettingsOpen(false),
              onSave: saveSettings,
            }}
            batchRunDialog={{
              open: !!batchRunConfirm,
              outputCount: batchRunConfirm?.outputCount || 0,
              onCancel: () => setBatchRunConfirm(null),
              onConfirm: () => {
                const pending = batchRunConfirm;
                setBatchRunConfirm(null);
                if (pending?.nodeIds?.length) submitBatchRun(pending.nodeIds);
              },
            }}
            deleteNodeDialog={{
              state: deleteNodeHistoryConfirm,
              onClose: () => setDeleteNodeHistoryConfirm(null),
              onToggleHistory: (checked) => setDeleteNodeHistoryConfirm((current) => (
                current ? { ...current, alsoDeleteHistory: !!checked } : current
              )),
              onConfirm: confirmDeleteNodeWithHistory,
            }}
            promptManagerDialog={{
              open: promptManagerOpen,
              onClose: () => setPromptManagerOpen(false),
            }}
            assetPickerDialog={{
              open: assetsPickerOpen,
              onClose: () => setAssetsPickerOpen(false),
              workspaceId: activeId,
              title: '添加到素材库（选择目标分组）',
              confirmLabel: '添加 ' + assetsPickerImages.length + ' 张图',
              onConfirm: handleAssetsPickerConfirm,
            }}
            nodeFormDialog={{
              open: !!formState,
              nodeType: formState?.nodeType,
              initialImages: formState?.initialImages,
              settings,
              onClose: () => setFormState(null),
              onSubmit: crud.handleFormSubmit,
            }}
            nodeExecuteDialog={{
              open: !!executeState,
              nodeType: executeState?.nodeType,
              executions,
              settings,
              onClose: () => setExecuteState(null),
            }}
            exportImagesDialog={{
              open: !!exportState,
              images: exportState?.images || [],
              onClose: () => setExportState(null),
              onExport: (urls) => {
                setExportState(null);
                handleExportSelection(urls);
              },
            }}
            groupConfirmDialog={{
              state: groupState,
              onClose: () => setGroupState(null),
              onComplete: completeImageExport,
            }}
            deleteGroupDialog={{
              open: !!groupOps.deleteGroupId,
              group: groups.find((group) => group.id === groupOps.deleteGroupId) || null,
              nodeCount: groupOps.deleteGroupNodeCount,
              onClose: groupOps.cancelDeleteGroup,
              onConfirm: groupOps.confirmDeleteGroup,
            }}
            connectionTargetDialog={{
              state: pendingConnection,
              onClose: () => setPendingConnection(null),
              onConnect: addConnections,
            }}
            selectionPropertyPaste={{
              state: selection.propertyPaste,
              onClose: selection.cancelPropertyPaste,
              onApply: selection.applyProperties,
              onContinuePaste: selection.continuePaste,
            }}
            groupPropertyPaste={{
              state: groupExecution.propertyApply,
              onClose: groupExecution.cancelPropertyApply,
              onApply: groupExecution.applyPropertiesToRuns,
            }}
            savePresetDialog={{
              open: !!savePresetState,
              pendingNodes: savePresetState?.pendingNodes,
              groupCount: savePresetState?.groupCount || 0,
              onClose: () => setSavePresetState(null),
              onConfirm: confirmSavePreset,
            }}
          />
        </CanvasWorkspace>
      </ImageSelectionContext.Provider>
      <CanvasVersionPanel
        open={versionsOpen}
        workspaceId={activeId}
        nodes={nodes}
        edges={edges}
        groups={groups}
        setNodes={setNodes}
        setEdges={setEdges}
        setGroups={setGroups}
        onClose={() => setVersionsOpen(false)}
      />
    </CanvasGalleryContextProvider>
  );
}
