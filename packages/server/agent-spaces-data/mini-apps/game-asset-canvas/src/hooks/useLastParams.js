import { useCallback, useEffect, useRef, useState } from 'react';
import { lastParamsConfigPath, onAnyConfigChanged } from '../utils/storage';

/**
 * 每工作区、每节点类型的「上次提交参数」：隔离到 configs/workspaces/<id>/last-params.json。
 * 模式同 useGenerationHistory：getConfig + onConfigReady + onAnyConfigChanged 三重读取。
 *
 * data 流：
 * - 写：各执行回调在提交时调 saveLastParams(nodeType, paramsSubset)（剥离图片字段）。
 * - 读：createNodeAt 合并 params 时优先级 dataPatch.params > lastParams > initialData.params。
 *
 * @param {string} workspaceId 当前工作区 id
 * @returns {{
 *   lastParams: Record<string, object>,
 *   saveLastParams: (nodeType: string, params: object) => Promise<void>,
 *   getLastParams: (nodeType: string) => object|null,
 * }}
 */
export default function useLastParams(workspaceId) {
  const [lastParams, setLastParams] = useState({});

  // ref 镜像：让 createNodeAt 的 getLastParams 读最新值，deps 不含 lastParams → 稳定 callback，
  // 避免 save 触发 createNodeAt 重建（进而触发依赖它的 nodeCallbacks/decoratedNodes 全量重算）。
  const lastParamsRef = useRef(lastParams);
  lastParamsRef.current = lastParams;

  useEffect(() => {
    const as = window.AgentSpaces;
    const target = lastParamsConfigPath(workspaceId);
    const apply = (value) => setLastParams(value && typeof value === 'object' && !Array.isArray(value) ? value : {});
    const snapshot = as?.getConfig?.(target);
    if (snapshot && typeof snapshot === 'object') apply(snapshot);
    const unsubReady = as?.onConfigReady?.((configs) => apply(configs?.[target]));
    const unsub = onAnyConfigChanged((path, value) => {
      if (path !== target) return;
      apply(value);
    });
    return () => {
      try { unsub(); } catch {}
      try { unsubReady?.(); } catch {}
    };
  }, [workspaceId]);

  // 保存：整体交给服务端 updateConfig 做 nodeType 级 upsert（前端不读改写，避免竞态）
  const saveLastParams = useCallback(async (nodeType, params) => {
    if (!nodeType) return;
    await window.AgentSpaces?.invokeService?.('save_last_params', { workspaceId, nodeType, params });
  }, [workspaceId]);

  // 同步读：createNodeAt 在合并 params 时调（稳定 callback，读 ref）
  const getLastParams = useCallback((nodeType) => {
    const map = lastParamsRef.current;
    const v = map?.[nodeType];
    return v && typeof v === 'object' ? v : null;
  }, []);

  return { lastParams, saveLastParams, getLastParams };
}
