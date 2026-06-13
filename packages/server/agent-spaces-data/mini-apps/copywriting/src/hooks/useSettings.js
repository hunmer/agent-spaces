import { useCallback, useEffect, useState } from 'react';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../utils/settings';

// 上次筛选偏好的持久化（configs/settings.json），下次打开恢复。
export function useSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try { setSettings(await loadSettings()); } catch { /* noop */ }
      finally { setReady(true); }
    })();
  }, []);

  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next).catch(() => {});
      return next;
    });
  }, []);

  return { settings, ready, update };
}
