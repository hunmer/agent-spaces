import { useCallback, useEffect, useState } from 'react';
import { historyConfigPath, onAnyConfigChanged } from '../utils/storage';

/**
 * 生成记录：按工作区隔离到 configs/workspaces/<id>/generation-history.json。
 * 通过服务端单写者持久化，getConfig 读取 + onAnyConfigChanged 多端同步。
 * @param {string} workspaceId 当前工作区 id
 * @returns {{ history: array, addHistory: (item)=>Promise, removeHistory: (id)=>Promise, clearHistory: ()=>Promise }}
 */
export default function useGenerationHistory(workspaceId) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const as = window.AgentSpaces;
    const target = historyConfigPath(workspaceId);
    const apply = (value) => setHistory(Array.isArray(value) ? value : []);
    const snapshot = as?.getConfig?.(target);
    if (Array.isArray(snapshot)) apply(snapshot);
    const unsubReady = as?.onConfigReady?.((configs) => {
      apply(configs?.[target]);
    });
    const unsub = onAnyConfigChanged((path, value) => {
      if (path !== target) return;
      apply(value);
    });
    return () => {
      try { unsub(); } catch {}
      try { unsubReady?.(); } catch {}
    };
  }, [workspaceId]);

  const addHistory = useCallback(async (item) => {
    await window.AgentSpaces?.invokeService?.('add_history', { workspaceId, item });
  }, [workspaceId]);

  const removeHistory = useCallback(async (id) => {
    await window.AgentSpaces?.invokeService?.('remove_history', { workspaceId, id });
  }, [workspaceId]);

  const clearHistory = useCallback(async () => {
    await window.AgentSpaces?.invokeService?.('clear_history', { workspaceId });
  }, [workspaceId]);

  return { history, addHistory, removeHistory, clearHistory };
}
