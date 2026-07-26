import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { debounce, loadCanvas, onCanvasChanged, saveCanvas } from '../utils/storage';
import { SAVE_DEBOUNCE } from '../utils/constants';

/**
 * 画布节点/边/分组状态管理 + 持久化（按工作区隔离到 configs/workspaces/<id>/canvas.json）+ 多端同步。
 * @param {string} workspaceId 当前工作区 id；变化时重新加载该工作区的节点/边/分组
 */
export default function useCanvasState(workspaceId) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [groups, setGroups] = useState([]);
  const [outputPreviewMode, setOutputPreviewMode] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const remoteRef = useRef(false);
  const lastSavedRef = useRef(null);
  const dirtyRef = useRef(false);

  // 初次加载 + 工作区切换时重新读取
  useEffect(() => {
    const state = loadCanvas(workspaceId);
    remoteRef.current = true;
    lastSavedRef.current = state;
    if (state && Array.isArray(state.nodes)) {
      setNodes(state.nodes);
      setEdges(state.edges || []);
      setGroups(Array.isArray(state.groups) ? state.groups : []);
      setOutputPreviewMode(state.outputPreviewMode === true);
    } else {
      // 新工作区：清空，避免上个工作区的节点残留
      setNodes([]);
      setEdges([]);
      setGroups([]);
      setOutputPreviewMode(false);
    }
    setLoaded(true);
  }, [workspaceId]);

  // 订阅远端变化（多端同步）—— 仅在本地没有未保存改动时套用
  useEffect(() => {
    const unsub = onCanvasChanged(workspaceId, (value) => {
      if (!value || !Array.isArray(value.nodes)) return;
      const sig = JSON.stringify(value);
      if (lastSavedRef.current && JSON.stringify(lastSavedRef.current) === sig) return;
      if (dirtyRef.current) return;
      remoteRef.current = true;
      lastSavedRef.current = value;
      setNodes(value.nodes);
      setEdges(value.edges || []);
      setGroups(Array.isArray(value.groups) ? value.groups : []);
      setOutputPreviewMode(value.outputPreviewMode === true);
    });
    return () => { try { unsub(); } catch {} };
  }, [workspaceId]);

  // 防抖保存（本地改动触发）—— 带上 workspaceId 写到对应隔离目录
  const debouncedSave = useMemo(
    () => debounce((n, e, g, previewMode) => {
      const state = { nodes: n, edges: e, groups: g, outputPreviewMode: previewMode };
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
    debouncedSave(nodes, edges, groups, outputPreviewMode);
  }, [nodes, edges, groups, outputPreviewMode, loaded, debouncedSave]);

  useEffect(() => () => debouncedSave.cancel(), [debouncedSave]);

  const updateNodeData = useCallback((nodeId, patch) => {
    setNodes((prev) => prev.map((nd) => {
      if (nd.id !== nodeId) return nd;
      const data = typeof patch === 'function' ? patch(nd.data || {}) : patch;
      return { ...nd, data: { ...(nd.data || {}), ...data } };
    }));
  }, []);

  return {
    nodes, edges, groups, outputPreviewMode, loaded,
    setNodes, setEdges, setGroups,
    setOutputPreviewMode,
    updateNodeData,
  };
}
