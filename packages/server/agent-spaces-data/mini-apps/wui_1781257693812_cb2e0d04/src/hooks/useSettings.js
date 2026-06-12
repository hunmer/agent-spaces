import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../utils/settings';

// 持久化用户偏好到 configs/settings.json（JSON config 能力）。
export function useSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadSettings()
      .then(setSettings)
      .catch((e) => console.error('[settings] load failed', e))
      .finally(() => setReady(true));
  }, []);

  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next).catch((e) => console.error('[settings] save failed', e));
      return next;
    });
  }, []);

  return { settings, ready, update };
}
