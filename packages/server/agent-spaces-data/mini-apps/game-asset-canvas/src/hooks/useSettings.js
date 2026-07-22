import { useEffect, useState } from 'react';
import { mergeSettings, SETTINGS_PATH } from '../utils/settings';
import { onAnyConfigChanged } from '../utils/storage';

/**
 * 设置：getConfig 读取 + onAnyConfigChanged 多端订阅 + invokeService('save_settings') 单写者。
 * @returns {{ settings: object, saveSettings: (patch)=>Promise }}
 */
export default function useSettings() {
  const [settings, setSettings] = useState(() => ({ ...mergeSettings(null) }));

  useEffect(() => {
    const as = window.AgentSpaces;
    // 初始从内存快照读取
    const init = as?.getConfig?.(SETTINGS_PATH);
    setSettings(mergeSettings(init));

    // 订阅变更（多端同步）
    const unsub = onAnyConfigChanged((path, value) => {
      if (path === SETTINGS_PATH) setSettings(mergeSettings(value));
    });
    return () => { try { unsub(); } catch {} };
  }, []);

  // 保存（整体覆盖；写入后 onConfigChanged 自动回灌本地 state）
  const saveSettings = async (patch) => {
    await window.AgentSpaces?.invokeService?.('save_settings', { settings: patch });
  };

  return { settings, saveSettings };
}
