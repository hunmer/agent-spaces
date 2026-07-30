import { useCallback, useEffect, useState } from 'react';
import { onAnyConfigChanged } from '../utils/storage';

export const SPINE_RESKIN_HISTORY_PATH = 'spine-reskin-history.json';

function selectHistory(config, assetSignature) {
  const list = config && assetSignature ? config[assetSignature] : null;
  return Array.isArray(list) ? list : [];
}

export default function useSpineReskinHistory(assetSignature) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const AS = window.AgentSpaces;
    const apply = (config) => setHistory(selectHistory(config, assetSignature));
    apply(AS?.getConfig?.(SPINE_RESKIN_HISTORY_PATH));
    const unsubReady = AS?.onConfigReady?.((configs) => {
      apply(configs?.[SPINE_RESKIN_HISTORY_PATH]);
    });
    const unsub = onAnyConfigChanged((path, value) => {
      if (path === SPINE_RESKIN_HISTORY_PATH) apply(value);
    });
    return () => {
      try { unsub(); } catch {}
      try { unsubReady?.(); } catch {}
    };
  }, [assetSignature]);

  const saveHistory = useCallback(async (item) => {
    await window.AgentSpaces?.invokeService?.('save_spine_reskin_history', {
      assetSignature, item,
    });
  }, [assetSignature]);

  const deleteHistory = useCallback(async (id) => {
    await window.AgentSpaces?.invokeService?.('delete_spine_reskin_history', {
      assetSignature, id,
    });
  }, [assetSignature]);

  return { history, saveHistory, deleteHistory };
}
