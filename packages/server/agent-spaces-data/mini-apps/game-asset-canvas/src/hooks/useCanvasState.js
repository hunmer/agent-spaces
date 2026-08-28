import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  canvasConfigPath, debounce, loadCanvas, onCanvasChanged, saveCanvas,
} from '../utils/storage';
import { SAVE_DEBOUNCE } from '../utils/constants';
import {
  canvasHistorySignature, canvasStateSyncSignature, createCanvasSnapshot, describeCanvasChange,
  restoreHistoryNodes,
} from '../utils/canvas-history';
import { ensureEdgeIds } from '../utils/canvas-edges';
import {
  applyCanvasCollectionUpdate,
  summarizeCanvasUpdateValue,
  UPDATE_METHODS,
} from '../utils/canvas-state-updates';
import { removeEmptyOutputVersions } from '../utils/output-resources';

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

  // 统一数据更新入口的 refs：执行队列可能在 React 提交前连续发起多次局部更新。
  const nodesRef = useRef(nodes);
  const groupsRef = useRef(groups);
  nodesRef.current = nodes;
  groupsRef.current = groups;

  // 初次加载 + 工作区切换时重新读取
  useEffect(() => {
    const applyState = (state) => {
      const normalizedState = normalizeCanvasEdgeIds(state);
      remoteRef.current = true;
      resetOperationHistoryRef.current = true;
      lastSavedRef.current = normalizedState;
      if (normalizedState && Array.isArray(normalizedState.nodes)) {
        setNodes(migrateLegacyPreviewMode(normalizedState));
        setEdges(normalizedState.edges || []);
        setGroups(Array.isArray(normalizedState.groups) ? normalizedState.groups : []);
        if (normalizedState !== state) {
          saveCanvas(workspaceId, normalizedState).catch((err) => console.warn('edge ID migration failed:', err));
        }
      } else {
        // 新工作区：清空，避免上个工作区的节点残留
        setNodes([]);
        setEdges([]);
        setGroups([]);
      }
      const savedViewport = normalizeViewport(normalizedState?.viewport);
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
      const normalizedValue = normalizeCanvasEdgeIds(value);
      const sig = canvasStateSyncSignature(normalizedValue);
      if (lastSavedRef.current && canvasStateSyncSignature(lastSavedRef.current) === sig) return;
      if (dirtyRef.current) return;
      if (normalizedValue !== value) {
        saveCanvas(workspaceId, normalizedValue).catch((err) => console.warn('edge ID migration failed:', err));
      }
      remoteRef.current = true;
      resetOperationHistoryRef.current = true;
      lastSavedRef.current = normalizedValue;
      setNodes(migrateLegacyPreviewMode(normalizedValue));
      setEdges(normalizedValue.edges || []);
      setGroups(Array.isArray(normalizedValue.groups) ? normalizedValue.groups : []);
      const savedViewport = normalizeViewport(normalizedValue.viewport);
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

  const updateCanvasData = useCallback((request) => {
    const {
      source,
      targetType = 'node',
      targetId,
      key,
      value,
      method = 'merge',
    } = request || {};
    if (typeof source !== 'string' || !source.trim()
      || (targetType !== 'node' && targetType !== 'group')
      || typeof targetId !== 'string' || !targetId
      || typeof key !== 'string' || !key.trim()
      || !UPDATE_METHODS.has(method)) {
      return false;
    }

    console.debug('[CanvasStateUpdate]', {
      source,
      targetType,
      targetId,
      key,
      method,
      valueSummary: summarizeCanvasUpdateValue(value),
    });

    if (targetType === 'group') {
      setGroups((prev) => {
        const next = applyCanvasCollectionUpdate(prev, request);
        groupsRef.current = next;
        return next;
      });
      return true;
    }
    setNodes((prev) => {
      const next = applyCanvasCollectionUpdate(prev, request);
      nodesRef.current = next;
      return next;
    });
    return true;
  }, [setGroups, setNodes]);

  const updateNodeData = useCallback((nodeId, patch) => {
    updateCanvasData({
      source: 'node-data',
      targetType: 'node',
      targetId: nodeId,
      key: 'data',
      method: 'update',
      value: (oldData = {}) => {
        const merged = typeof patch === 'function' ? patch(oldData) : { ...oldData, ...patch };
        const nextData = { ...oldData, ...(merged || {}) };
        // 自动版本存档：仅当状态从非 done 转为 done 且本次有产出图时，存一个完整快照。
        const isDone = nextData?.status === 'done';
        const wasNotDone = oldData?.status !== 'done';
        const hasOutputImages = Array.isArray(nextData?.output?.images)
          && nextData.output.images.length > 0;
        const isSwitch = nextData?.__switchVersion === true;
        if (isDone && wasNotDone && hasOutputImages && !isSwitch && !nextData.__versionSkip) {
          const versions = Array.isArray(oldData.versions) ? [...oldData.versions] : [];
          versions.push({
            params: nextData.params ? { ...nextData.params } : undefined,
            output: { ...nextData.output },
            createdAt: Date.now(),
          });
          nextData.versions = versions;
          nextData.activeVersion = versions.length - 1;
        }
        delete nextData.__switchVersion;
        delete nextData.__versionSkip;
        return nextData;
      },
    });
  }, [updateCanvasData]);

  return {
    nodes, edges, groups, viewport, hasSavedViewport, loaded,
    setNodes, setEdges, setGroups, setViewport,
    updateCanvasData, updateNodeData, undo, redo,
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

function normalizeCanvasEdgeIds(state) {
  if (!state || !Array.isArray(state.edges)) return state;
  const edges = ensureEdgeIds(state.edges);
  const nodes = Array.isArray(state.nodes) ? state.nodes.map((node) => {
    const data = node?.data;
    if (!Array.isArray(data?.versions)) return node;
    const result = removeEmptyOutputVersions(data.versions, data.activeVersion);
    if (result.versions === data.versions) return node;
    const activeOutput = result.versions[result.activeVersion]?.output;
    return {
      ...node,
      data: {
        ...data,
        versions: result.versions,
        activeVersion: result.activeVersion,
        output: activeOutput ? { ...activeOutput } : { images: [], resources: [] },
      },
    };
  }) : state.nodes;
  const nodesChanged = nodes.some((node, index) => node !== state.nodes[index]);
  return edges === state.edges && !nodesChanged ? state : { ...state, edges, nodes };
}

function migrateLegacyPreviewMode(state) {
  if (state?.outputPreviewMode !== true) return state.nodes;
  return state.nodes.map((node) => (
    node.data?.outputPreviewMode != null
      ? node
      : { ...node, data: { ...(node.data || {}), outputPreviewMode: true } }
  ));
}
