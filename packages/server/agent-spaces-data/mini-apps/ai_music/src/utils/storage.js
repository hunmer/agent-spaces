/**
 * 播放历史本地持久化（纯本地，不落服务端）
 *
 * 经 host AgentSpaces settings API 存入浏览器 localStorage：
 *   - key: workflow_setting_<projectId>（由 host 按 project 隔离，本组件无需感知 projectId）
 *   - sub-key: music-history
 * 参考 packages/web/src/components/mini-apps/use-mini-app-host-api.ts:393~454
 *
 * 取代原先的 window.AgentSpacesUI.readConfigJson / writeConfigJson（走服务端 configs/ 目录）。
 */

const HISTORY_KEY = 'music-history';
const SETTINGS_KEY = 'music-settings';
const LAST_TRACK_KEY = 'music-last';

/** 读取播放历史，恒定返回数组 */
export const readHistory = async () => {
  try {
    const data = window.AgentSpaces?.getUserSetting?.(HISTORY_KEY, []);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

/** 写入播放历史（浅覆盖 music-history 子键） */
export const writeHistory = async (list) => {
  try {
    window.AgentSpaces?.setUserSetting?.(HISTORY_KEY, Array.isArray(list) ? list : []);
  } catch (e) {
    console.error('Failed to persist music history:', e);
  }
};

/** 读取应用设置（默认关闭启动恢复） */
export const readSettings = async () => {
  try {
    const data = window.AgentSpaces?.getUserSetting?.(SETTINGS_KEY, { restoreOnStart: false });
    return data && typeof data === 'object' ? { restoreOnStart: !!data.restoreOnStart } : { restoreOnStart: false };
  } catch {
    return { restoreOnStart: false };
  }
};

/** 写入应用设置 */
export const writeSettings = async (settings) => {
  try {
    window.AgentSpaces?.setUserSetting?.(SETTINGS_KEY, settings || {});
  } catch (e) {
    console.error('Failed to persist settings:', e);
  }
};

/** 读取上次播放的歌曲（用于启动恢复） */
export const readLastTrack = async () => {
  try {
    const data = window.AgentSpaces?.getUserSetting?.(LAST_TRACK_KEY, null);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
};

/** 写入上次播放的歌曲；传 null / undefined 清除 */
export const writeLastTrack = async (track) => {
  try {
    window.AgentSpaces?.setUserSetting?.(LAST_TRACK_KEY, track || null);
  } catch (e) {
    console.error('Failed to persist last track:', e);
  }
};
