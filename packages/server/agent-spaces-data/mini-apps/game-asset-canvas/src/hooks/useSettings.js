import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeSettings, SETTINGS_PATH } from '../utils/settings';
import { onAnyConfigChanged } from '../utils/storage';

/**
 * 设置：getConfig 读取 + onAnyConfigChanged 多端订阅 + invokeService('save_settings') 单写者。
 * @returns {{ settings: object, saveSettings: (patch)=>Promise }}
 */
export default function useSettings() {
  const [settings, setSettings] = useState(() => ({ ...mergeSettings(null) }));
  const settingsRef = useRef(settings);

  useEffect(() => {
    const as = window.AgentSpaces;
    const apply = (value) => {
      const next = mergeSettings(value);
      settingsRef.current = next;
      setSettings(next);
    };

    // 三重读取：初始快照 + config ready 兜底 + 多端变更同步。
    apply(as?.getConfig?.(SETTINGS_PATH));
    const unsubReady = as?.onConfigReady?.((configs) => apply(configs?.[SETTINGS_PATH]));

    const unsub = onAnyConfigChanged((path, value) => {
      if (path === SETTINGS_PATH) apply(value);
    });
    return () => {
      try { unsubReady?.(); } catch {}
      try { unsub(); } catch {}
    };
  }, []);

  // 先更新本地状态，让画布交互立即生效；服务端保存失败时再回滚。
  const saveSettings = useCallback(async (patch) => {
    const previous = settingsRef.current;
    const next = mergeSettings({ ...previous, ...(patch || {}) });
    settingsRef.current = next;
    setSettings(next);
    try {
      const result = await window.AgentSpaces?.invokeService?.('save_settings', { settings: next });
      if (result?.ok === false) throw new Error('保存设置失败');
    } catch (error) {
      // 只回滚本次保存，避免覆盖期间到达的更新设置。
      if (settingsRef.current === next) {
        settingsRef.current = previous;
        setSettings(previous);
      }
      throw error;
    }
  }, []);

  return { settings, saveSettings };
}
