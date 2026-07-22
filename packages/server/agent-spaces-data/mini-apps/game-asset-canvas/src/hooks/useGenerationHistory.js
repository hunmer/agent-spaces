import { useCallback, useEffect, useState } from 'react';
import { onAnyConfigChanged } from '../utils/storage';

const HISTORY_CONFIG = 'generation-history.json';

/**
 * 生成记录：通过服务端单写者持久化，getConfig 读取 + onAnyConfigChanged 多端同步。
 * @returns {{ history: array, addHistory: (item)=>Promise, removeHistory: (id)=>Promise, clearHistory: ()=>Promise }}
 */
export default function useGenerationHistory() {
  const [history, setHistory] = useState([]);

  // 初始加载 + 订阅 generation-history.json 变化
  useEffect(() => {
    const as = window.AgentSpaces;
    const apply = (value) => setHistory(Array.isArray(value) ? value : []);
    // config 可能尚未 ready（getConfig 返回 null），用 onConfigReady 兜底取一次快照
    const snapshot = as?.getConfig?.(HISTORY_CONFIG);
    if (Array.isArray(snapshot)) apply(snapshot);
    const unsubReady = as?.onConfigReady?.((configs) => {
      apply(configs?.[HISTORY_CONFIG]);
    });
    const unsub = onAnyConfigChanged((path, value) => {
      if (path !== HISTORY_CONFIG) return;
      apply(value);
    });
    return () => {
      try { unsub(); } catch {}
      try { unsubReady?.(); } catch {}
    };
  }, []);

  const addHistory = useCallback(async (item) => {
    await window.AgentSpaces?.invokeService?.('add_history', { item });
  }, []);

  const removeHistory = useCallback(async (id) => {
    await window.AgentSpaces?.invokeService?.('remove_history', { id });
  }, []);

  const clearHistory = useCallback(async () => {
    await window.AgentSpaces?.invokeService?.('clear_history');
  }, []);

  return { history, addHistory, removeHistory, clearHistory };
}
