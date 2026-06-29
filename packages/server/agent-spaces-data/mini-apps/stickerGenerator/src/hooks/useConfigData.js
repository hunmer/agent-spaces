// 统一管理 configs 内存快照与变更订阅
// 历史记录 / 自定义风格 / 共享配置都走 getConfig + onConfigChanged
import { HISTORY_PATH, CUSTOM_STYLES_PATH, SHARED_CONFIG_PATH } from '../services/store';

export function useConfigData() {
  const AS = window.AgentSpaces;

  const [history, setHistory] = React.useState([]);
  const [customStyles, setCustomStyles] = React.useState([]);
  const [sharedConfig, setSharedConfig] = React.useState({ defaultModel: '', defaultAgentPresetId: '' });

  React.useEffect(() => {
    const initHistory = AS.getConfig?.(HISTORY_PATH);
    if (Array.isArray(initHistory)) setHistory(initHistory);
    const initStyles = AS.getConfig?.(CUSTOM_STYLES_PATH);
    if (Array.isArray(initStyles)) setCustomStyles(initStyles);
    const initCfg = AS.getConfig?.(SHARED_CONFIG_PATH);
    if (initCfg && typeof initCfg === 'object') setSharedConfig(initCfg);

    const off = AS.onConfigChanged?.((path, value) => {
      if (path === HISTORY_PATH) setHistory(Array.isArray(value) ? value : []);
      if (path === CUSTOM_STYLES_PATH) setCustomStyles(Array.isArray(value) ? value : []);
      if (path === SHARED_CONFIG_PATH && value && typeof value === 'object') setSharedConfig(value);
    });
    return () => off?.();
  }, []);

  return { history, customStyles, sharedConfig, setSharedConfig };
}
