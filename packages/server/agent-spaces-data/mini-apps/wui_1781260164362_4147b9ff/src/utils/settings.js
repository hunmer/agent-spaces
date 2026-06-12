// JSON 配置读写（configs/settings.json）—— 记录上次筛选偏好，下次打开恢复。
// 单用户场景直接 readConfigJson / writeConfigJson 即可。

const SETTINGS_PATH = 'settings.json';

export const DEFAULT_SETTINGS = {
  keyword: '',
  type: '',
  tag: '',
  durationSort: '', // '' | 'asc' | 'desc'
};

export async function loadSettings() {
  const v = await window.AgentSpacesUI.readConfigJson(SETTINGS_PATH);
  return { ...DEFAULT_SETTINGS, ...(v && typeof v === 'object' ? v : {}) };
}

export async function saveSettings(next) {
  await window.AgentSpacesUI.writeConfigJson(SETTINGS_PATH, next);
}
