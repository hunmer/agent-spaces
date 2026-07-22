import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { debounce, loadCanvas, onCanvasChanged, saveCanvas } from '../utils/storage';
import { SAVE_DEBOUNCE } from '../utils/constants';

/**
 * 画布节点/边状态管理 + 持久化（configs/canvas.json，服务端单写者）+ 多端同步。
 * 暴露给 Canvas 组件使用的统一状态层。
 */
export default function useCanvasState() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // 标记本次更新是否来自远端广播，避免收到自己的写入后又回写（无限循环/抖动）
  const remoteRef = useRef(false);
  // 远端同步过来的"最新值"，用于决定是否需要更新本地（去抖比较）
  const lastSavedRef = useRef(null);
  // 标记本地是否已有未保存改动，避免覆盖远端
  const dirtyRef = useRef(false);

  // 初次加载：从 config 缓存读取
  useEffect(() => {
    const state = loadCanvas();
    if (state && Array.isArray(state.nodes)) {
      remoteRef.current = true;
      setNodes(state.nodes);
      setEdges(state.edges || []);
      lastSavedRef.current = state;
    }
    setLoaded(true);
  }, []);

  // 订阅远端变化（多端同步）—— 仅在本地没有未保存改动时套用
  useEffect(() => {
    const unsub = onCanvasChanged((value) => {
      if (!value || !Array.isArray(value.nodes)) return;
      // 简单去重：内容序列化对比
      const sig = JSON.stringify(value);
      if (lastSavedRef.current && JSON.stringify(lastSavedRef.current) === sig) return;
      if (dirtyRef.current) return; // 本地有改动时暂不拉远端，避免冲突覆盖
      remoteRef.current = true;
      lastSavedRef.current = value;
      setNodes(value.nodes);
      setEdges(value.edges || []);
    });
    return () => {
      try { unsub(); } catch {}
    };
  }, []);

  // 防抖保存（本地改动触发）
  const debouncedSave = useMemo(
    () => debounce((n, e) => {
      const state = { nodes: n, edges: e };
      lastSavedRef.current = state;
      dirtyRef.current = false;
      saveCanvas(state).catch((err) => console.warn('saveCanvas failed:', err));
    }, SAVE_DEBOUNCE),
    [],
  );

  // 本地 nodes/edges 变化时保存
  useEffect(() => {
    if (!loaded) return;
    if (remoteRef.current) {
      // 本次变化是远端套用来的，不回写
      remoteRef.current = false;
      return;
    }
    dirtyRef.current = true;
    debouncedSave(nodes, edges);
  }, [nodes, edges, loaded, debouncedSave]);

  useEffect(() => () => debouncedSave.cancel(), [debouncedSave]);

  // 更新单个节点的 data（节点内部表单输入/执行状态用）
  const updateNodeData = useCallback((nodeId, patch) => {
    setNodes((prev) => prev.map((nd) => {
      if (nd.id !== nodeId) return nd;
      const data = typeof patch === 'function' ? patch(nd.data || {}) : patch;
      return { ...nd, data: { ...(nd.data || {}), ...data } };
    }));
  }, []);

  return {
    nodes, edges, loaded,
    setNodes, setEdges,
    updateNodeData,
  };
}
