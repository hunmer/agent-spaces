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
