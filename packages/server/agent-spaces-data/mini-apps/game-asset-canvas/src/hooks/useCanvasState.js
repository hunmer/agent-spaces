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
      setNodes(migrateLegacyPreviewMode(state));
      setEdges(state.edges || []);
      setGroups(Array.isArray(state.groups) ? state.groups : []);
    } else {
      // 新工作区：清空，避免上个工作区的节点残留
      setNodes([]);
      setEdges([]);
      setGroups([]);
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
      setNodes(migrateLegacyPreviewMode(value));
      setEdges(value.edges || []);
      setGroups(Array.isArray(value.groups) ? value.groups : []);
    });
    return () => { try { unsub(); } catch {} };
  }, [workspaceId]);

  // 防抖保存（本地改动触发）—— 带上 workspaceId 写到对应隔离目录
  const debouncedSave = useMemo(
    () => debounce((n, e, g) => {
      const state = { nodes: n, edges: e, groups: g };
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
    debouncedSave(nodes, edges, groups);
  }, [nodes, edges, groups, loaded, debouncedSave]);

  useEffect(() => () => debouncedSave.cancel(), [debouncedSave]);

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
      return { ...nd, data: { ...oldData, ...merged } };
    }));
  }, []);

  return {
    nodes, edges, groups, loaded,
    setNodes, setEdges, setGroups,
    updateNodeData,
  };
}

function migrateLegacyPreviewMode(state) {
  if (state?.outputPreviewMode !== true) return state.nodes;
  return state.nodes.map((node) => (
    node.data?.outputPreviewMode != null
      ? node
      : { ...node, data: { ...(node.data || {}), outputPreviewMode: true } }
  ));
}
