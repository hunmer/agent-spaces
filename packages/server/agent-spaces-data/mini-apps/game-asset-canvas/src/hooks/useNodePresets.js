import { useCallback, useEffect, useState } from 'react';
import { NODE_PRESETS_CONFIG } from '../utils/constants';
import { onAnyConfigChanged } from '../utils/storage';

/**
 * 节点预设库 CRUD + 持久化（全局共享，存顶层 node-presets.json）。
 *
 * 预设是「选中节点子图 + 内部连线 + 相关分组」的可复用模板，跨工作区共享。
 * 持久化走项目标准的三重读取（getConfig + onConfigReady + onAnyConfigChanged）
 * + writeConfigJson 单写者，与 usePanelLayout 同范式。
 *
 * @returns {{presets: Array, addPreset: Function, removePreset: Function, renamePreset: Function}}
 */
export default function useNodePresets() {
  const as = () => window.AgentSpaces;
  const [presets, setPresets] = useState(() => {
    const v = as()?.getConfig?.(NODE_PRESETS_CONFIG);
    return Array.isArray(v) ? v : [];
  });

  const apply = useCallback((value) => {
    setPresets(Array.isArray(value) ? value : []);
  }, []);

  // 三重读取：挂载时 config 可能未 ready，等 onConfigReady 补读
  useEffect(() => {
    const agentSpaces = as();
    if (!agentSpaces) return undefined;
    const ready = agentSpaces.isConfigReady?.();
    if (ready === false) {
      return agentSpaces.onConfigReady?.((configs) => apply(configs?.[NODE_PRESETS_CONFIG]));
    }
    apply(agentSpaces.getConfig?.(NODE_PRESETS_CONFIG));
    return undefined;
  }, [apply]);

  // 订阅变化（多端同步）
  useEffect(() => {
    const unsub = onAnyConfigChanged((path, value) => {
      if (path === NODE_PRESETS_CONFIG) apply(value);
    });
    return () => { try { unsub(); } catch {} };
  }, [apply]);

  const persist = useCallback((next) => {
    setPresets(next);
    const agentSpaces = as();
    agentSpaces?.writeConfigJson?.(NODE_PRESETS_CONFIG, next).catch(() => {});
  }, []);

  // 新增预设（serializePreset 产出的完整对象）
  const addPreset = useCallback((preset) => {
    if (!preset) return;
    persist([...presets, preset]);
  }, [presets, persist]);

  const removePreset = useCallback((presetId) => {
    persist(presets.filter((p) => p.id !== presetId));
  }, [presets, persist]);

  const renamePreset = useCallback((presetId, name) => {
    persist(presets.map((p) => (p.id === presetId ? { ...p, name } : p)));
  }, [presets, persist]);

  return { presets, addPreset, removePreset, renamePreset };
}
