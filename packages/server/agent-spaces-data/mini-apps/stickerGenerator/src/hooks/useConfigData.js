// 统一管理 configs 内存快照与变更订阅
// 历史记录 / 自定义风格 / 设置 都走 getConfig + onConfigChanged
import { HISTORY_PATH, CUSTOM_STYLES_PATH, SETTINGS_PATH } from '../services/store';
import { DEFAULT_SETTINGS } from '../utils/settings';

function mergeSettings(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...value };
}

export function useConfigData() {
  const AS = window.AgentSpaces;

  const [history, setHistory] = React.useState([]);
  const [customStyles, setCustomStyles] = React.useState([]);
  const [settings, setSettings] = React.useState(() => ({ ...DEFAULT_SETTINGS }));

  React.useEffect(() => {
    const initHistory = AS.getConfig?.(HISTORY_PATH);
    if (Array.isArray(initHistory)) setHistory(initHistory);
    const initStyles = AS.getConfig?.(CUSTOM_STYLES_PATH);
    if (Array.isArray(initStyles)) setCustomStyles(initStyles);
    const initSettings = AS.getConfig?.(SETTINGS_PATH);
    setSettings(mergeSettings(initSettings));

    const off = AS.onConfigChanged?.((path, value) => {
      if (path === HISTORY_PATH) setHistory(Array.isArray(value) ? value : []);
      if (path === CUSTOM_STYLES_PATH) setCustomStyles(Array.isArray(value) ? value : []);
      if (path === SETTINGS_PATH) setSettings(mergeSettings(value));
    });
    return () => off?.();
  }, []);

  // 保存设置：通过 service 单点写入，写入后 onConfigChanged 会自动回灌
  const saveSettings = React.useCallback((patch) => {
    AS.invokeService('save_settings', { settings: patch });
  }, [AS]);

  return { history, customStyles, settings, saveSettings };
}
