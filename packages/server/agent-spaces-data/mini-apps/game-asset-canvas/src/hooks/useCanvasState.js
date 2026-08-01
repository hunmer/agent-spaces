import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  canvasConfigPath, debounce, loadCanvas, onCanvasChanged, saveCanvas,
} from '../utils/storage';
import { SAVE_DEBOUNCE } from '../utils/constants';
import {
  canvasHistorySignature, createCanvasSnapshot, describeCanvasChange, restoreHistoryNodes,
} from '../utils/canvas-history';

const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 };
const MAX_OPERATION_HISTORY = 50;
const FORM_CHANGE_MERGE_MS = 700;

/**
 * 画布节点/边/分组/视口状态管理 + 持久化（按工作区隔离到 configs/workspaces/<id>/canvas.json）+ 多端同步。
 * @param {string} workspaceId 当前工作区 id；变化时重新加载该工作区的画布状态
 */
export default function useCanvasState(workspaceId) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [groups, setGroups] = useState([]);
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const [hasSavedViewport, setHasSavedViewport] = useState(false);
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState(null);
  const [operationHistory, setOperationHistory] = useState({ entries: [], index: -1 });

  const remoteRef = useRef(false);
  const lastSavedRef = useRef(null);
  const dirtyRef = useRef(false);
  const operationHistoryRef = useRef(operationHistory);
  const resetOperationHistoryRef = useRef(true);
  const applyingOperationHistoryRef = useRef(false);
  operationHistoryRef.current = operationHistory;

  // 初次加载 + 工作区切换时重新读取
  useEffect(() => {
    const applyState = (state) => {
      remoteRef.current = true;
      resetOperationHistoryRef.current = true;
      lastSavedRef.current = state;
      if (state && Array.isArray(state.nodes)) {
        setNodes(migrateLegacyPreviewMode(state));
        setEdges(state.edges || []);
        setGroups(Array.isArray(state.groups) ? state.groups : []);
      } else {
        // 新工作区：清空，避免上个工作区的节点残留
        setNodes([]);
        setEdges([]);
        setGroups([]);
      }
      const savedViewport = normalizeViewport(state?.viewport);
      setViewport(savedViewport || DEFAULT_VIEWPORT);
      setHasSavedViewport(Boolean(savedViewport));
      setLoadedWorkspaceId(workspaceId);
    };

    const agentSpaces = window.AgentSpaces;
    if (agentSpaces?.isConfigReady?.() === false) {
      const path = canvasConfigPath(workspaceId);
      return agentSpaces.onConfigReady?.((configs) => applyState(configs?.[path] || null));
    }
    applyState(loadCanvas(workspaceId));
    return undefined;
  }, [workspaceId]);

  const loaded = loadedWorkspaceId === workspaceId;

  // 订阅远端变化（多端同步）—— 仅在本地没有未保存改动时套用
  useEffect(() => {
    const unsub = onCanvasChanged(workspaceId, (value) => {
      if (!value || !Array.isArray(value.nodes)) return;
      const sig = JSON.stringify(value);
      if (lastSavedRef.current && JSON.stringify(lastSavedRef.current) === sig) return;
      if (dirtyRef.current) return;
      remoteRef.current = true;
      resetOperationHistoryRef.current = true;
      lastSavedRef.current = value;
      setNodes(migrateLegacyPreviewMode(value));
      setEdges(value.edges || []);
      setGroups(Array.isArray(value.groups) ? value.groups : []);
      const savedViewport = normalizeViewport(value.viewport);
      setViewport(savedViewport || DEFAULT_VIEWPORT);
      setHasSavedViewport(Boolean(savedViewport));
    });
    return () => { try { unsub(); } catch {} };
  }, [workspaceId]);

  // 防抖保存（本地改动触发）—— 带上 workspaceId 写到对应隔离目录
  const debouncedSave = useMemo(
    () => debounce((n, e, g, v) => {
      const state = { nodes: n, edges: e, groups: g, viewport: v };
      lastSavedRef.current = state;
      dirtyRef.current = false;
      saveCanvas(workspaceId, state).catch((err) => console.warn('saveCanvas failed:', err));
    }, SAVE_DEBOUNCE),
    [workspaceId],
  );

  useEffect(() => {
    if (!loaded) return;
    if (remoteRef.current) {
      remoteRef.current = false;
      return;
    }
    dirtyRef.current = true;
    debouncedSave(nodes, edges, groups, viewport);
  }, [nodes, edges, groups, viewport, loaded, debouncedSave]);

  useEffect(() => () => debouncedSave.cancel(), [debouncedSave]);

  useEffect(() => {
    if (!loaded) return;
    const snapshot = createCanvasSnapshot(nodes, edges, groups);
    const signature = canvasHistorySignature(snapshot);
    const current = operationHistoryRef.current;

    if (resetOperationHistoryRef.current || current.index < 0) {
      resetOperationHistoryRef.current = false;
      const next = { entries: [{ id: 'initial', snapshot, signature, at: Date.now() }], index: 0 };
      operationHistoryRef.current = next;
      setOperationHistory(next);
      return;
    }
    if (applyingOperationHistoryRef.current) {
      applyingOperationHistoryRef.current = false;
      return;
    }

    const previousEntry = current.entries[current.index];
    if (!previousEntry || previousEntry.signature === signature) return;

    const change = describeCanvasChange(previousEntry.snapshot, snapshot);
    const now = Date.now();
    const entries = current.entries.slice(0, current.index + 1);
    const last = entries[entries.length - 1];
    if (change.key.startsWith('update-node:') && last?.key === change.key && now - last.at < FORM_CHANGE_MERGE_MS) {
      entries[entries.length - 1] = { ...last, snapshot, signature, at: now };
    } else {
      entries.push({ id: `op-${now}-${entries.length}`, ...change, snapshot, signature, at: now });
    }
    const limited = entries.slice(-(MAX_OPERATION_HISTORY + 1));
    const next = { entries: limited, index: limited.length - 1 };
    operationHistoryRef.current = next;
    setOperationHistory(next);
  }, [nodes, edges, groups, loaded]);

  const applyOperationHistory = useCallback((nextIndex) => {
    const current = operationHistoryRef.current;
    const entry = current.entries[nextIndex];
    if (!entry) return;
    applyingOperationHistoryRef.current = true;
    setNodes((liveNodes) => restoreHistoryNodes(liveNodes, entry.snapshot.nodes));
    setEdges(entry.snapshot.edges);
    setGroups(entry.snapshot.groups);
    const next = { ...current, index: nextIndex };
    operationHistoryRef.current = next;
    setOperationHistory(next);
  }, []);

  const undo = useCallback(() => {
    const { index } = operationHistoryRef.current;
    if (index > 0) applyOperationHistory(index - 1);
  }, [applyOperationHistory]);

  const redo = useCallback(() => {
    const { entries, index } = operationHistoryRef.current;
    if (index < entries.length - 1) applyOperationHistory(index + 1);
  }, [applyOperationHistory]);

  const updateNodeData = useCallback((nodeId, patch) => {
    setNodes((prev) => prev.map((nd) => {
      if (nd.id !== nodeId) return nd;
      const oldData = nd.data || {};
      const merged = typeof patch === 'function' ? patch(oldData) : { ...(oldData || {}), ...patch };
      // 自动版本存档：仅当状态从非 done 转为 done 且本次有产出图时，存一个完整快照。
      // 用「状态转换」而非「done 出现」作为触发条件，避免 setNodes updater 被多次调用
      // （ReactFlow batching / 重渲染）导致同一批产出重复加版本。
      // 版本切换走专用回调（带 __switchVersion 标记），不会触发新增版本。
      const isDone = merged?.status === 'done';
      const wasNotDone = oldData?.status !== 'done';
      const hasOutputImages = Array.isArray(merged?.output?.images) && merged.output.images.length > 0;
      const isSwitch = merged?.__switchVersion === true;
      if (isDone && wasNotDone && hasOutputImages && !isSwitch && !merged.__versionSkip) {
        const versions = Array.isArray(oldData.versions) ? [...oldData.versions] : [];
        versions.push({
          params: merged.params ? { ...merged.params } : undefined,
          output: { ...merged.output },
          createdAt: Date.now(),
        });
        merged.versions = versions;
        merged.activeVersion = versions.length - 1;
      }
      // 清理内部标记，避免持久化
      delete merged.__switchVersion;
      delete merged.__versionSkip;
      // [debug-clear] 监控 output.images / versions 的变化，定位清空后旧产出回来的来源
      const prevImgs = Array.isArray(oldData?.output?.images) ? oldData.output.images : [];
      const nextImgs = Array.isArray(merged?.output?.images) ? merged.output.images : [];
      if (prevImgs.length === 0 && nextImgs.length > 0 || prevImgs.length > 0 && nextImgs.length === 0) {
        console.log('[clear-debug] updateNodeData image-count change', nodeId, {
          prevImgCount: prevImgs.length, nextImgCount: nextImgs.length,
          prevVersions: Array.isArray(oldData?.versions) ? oldData.versions.length : 0,
          nextVersions: Array.isArray(merged?.versions) ? merged.versions.length : 0,
          patchKeys: typeof patch === 'function' ? '(function)' : Object.keys(patch || {}),
        });
      }
      return { ...nd, data: { ...oldData, ...merged } };
    }));
  }, []);

  return {
    nodes, edges, groups, viewport, hasSavedViewport, loaded,
    setNodes, setEdges, setGroups, setViewport,
    updateNodeData, undo, redo,
    canUndo: operationHistory.index > 0,
    canRedo: operationHistory.index >= 0 && operationHistory.index < operationHistory.entries.length - 1,
    operationHistory: operationHistory.entries.slice(1).map((entry, index) => ({
      id: entry.id,
      label: entry.label,
      at: entry.at,
      applied: index + 1 <= operationHistory.index,
      current: index + 1 === operationHistory.index,
    })),
  };
}

function normalizeViewport(viewport) {
  if (!viewport || !Number.isFinite(viewport.x) || !Number.isFinite(viewport.y)
    || !Number.isFinite(viewport.zoom) || viewport.zoom <= 0) return null;
  return { x: viewport.x, y: viewport.y, zoom: viewport.zoom };
}

function migrateLegacyPreviewMode(state) {
  if (state?.outputPreviewMode !== true) return state.nodes;
  return state.nodes.map((node) => (
    node.data?.outputPreviewMode != null
      ? node
      : { ...node, data: { ...(node.data || {}), outputPreviewMode: true } }
  ));
}
