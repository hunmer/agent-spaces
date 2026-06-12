// JSON 配置读写（configs/settings.json）。
//
// 演示 window.AgentSpacesUI.readConfigJson / writeConfigJson —— 简单项目可直接用，
// 配置文件落盘到 项目 configs/ 目录。多客户端并发写场景应改用 invokeService + server
// services 单写，本 demo 为单用户演示，直接读写即可。

const SETTINGS_PATH = 'settings.json';

export const LANGUAGES = ['javascript', 'typescript', 'python', 'css', 'text'];

export const DEFAULT_SETTINGS = {
  lastLanguageFilter: 'all', // 下次打开时恢复的语言过滤
};

export async function loadSettings() {
  const v = await window.AgentSpacesUI.readConfigJson(SETTINGS_PATH);
  return { ...DEFAULT_SETTINGS, ...(v && typeof v === 'object' ? v : {}) };
}

export async function saveSettings(next) {
  await window.AgentSpacesUI.writeConfigJson(SETTINGS_PATH, next);
}
