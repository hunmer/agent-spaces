import { CANVAS_CONFIG, HISTORY_CONFIG, ASSET_LIBRARY_CONFIG, LAST_PARAMS_CONFIG } from './constants';

const AS = () => window.AgentSpaces;

/**
 * 读取画布状态（从服务端 config 缓存）。
 * @param {string} workspaceId 当前工作区 id（决定读取哪个隔离的 canvas.json）
 */
export function loadCanvas(workspaceId) {
  const as = AS();
  if (!as?.getConfig) return null;
  return as.getConfig(canvasConfigPath(workspaceId)) || null;
}

/**
 * 保存画布状态（走服务端单写者，多端同步）。
 * @param {string} workspaceId
 * @param {{ nodes: any[], edges: any[] }} state
 */
export async function saveCanvas(workspaceId, state) {
  const as = AS();
  if (!as?.invokeService) return;
  await as.invokeService('save_canvas', { workspaceId, state });
}

/** 工作区隔离的 canvas.json 路径（兼容旧版：无 workspaceId 时回落顶层 canvas.json） */
export function canvasConfigPath(workspaceId) {
  return workspaceId ? `workspaces/${workspaceId}/${CANVAS_CONFIG}` : CANVAS_CONFIG;
}

/** 工作区隔离的 generation-history.json 路径 */
export function historyConfigPath(workspaceId) {
  return workspaceId ? `workspaces/${workspaceId}/${HISTORY_CONFIG}` : HISTORY_CONFIG;
}

/** 工作区隔离的 asset-library.json 路径 */
export function assetLibraryConfigPath(workspaceId) {
  return workspaceId ? `workspaces/${workspaceId}/${ASSET_LIBRARY_CONFIG}` : ASSET_LIBRARY_CONFIG;
}

/** 工作区隔离的 last-params.json 路径（每节点类型上次提交参数） */
export function lastParamsConfigPath(workspaceId) {
  return workspaceId ? `workspaces/${workspaceId}/${LAST_PARAMS_CONFIG}` : LAST_PARAMS_CONFIG;
}

/** 订阅任意 config 变化（多端同步），回调签名 (path, value) */
export function onAnyConfigChanged(callback) {
  const as = AS();
  if (!as?.onConfigChanged) return () => {};
  return as.onConfigChanged((path, value) => callback(path, value));
}

/** 订阅某工作区的画布状态变化（多端同步） */
export function onCanvasChanged(workspaceId, callback) {
  const target = canvasConfigPath(workspaceId);
  return onAnyConfigChanged((path, value) => {
    if (path === target) callback(value);
  });
}

/** 防抖 */
export function debounce(fn, wait) {
  let timer = null;
  const wrapped = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}

// ============ 面板布局 / 视图偏好持久化 ============
// react-resizable-panels@4: Layout = { [panelId]: number(percentage) }
// 同文件存其它全局视图偏好（不按工作区隔离），如 MiniMap 显隐。
const PANEL_LAYOUT_CONFIG = 'panel-layout.json';

/**
 * 读取面板布局（{ panelId: percentage } 形式）。
 * @returns {Record<string, number> | null}
 */
export function loadPanelLayout() {
  const as = AS();
  const v = as?.getConfig?.(PANEL_LAYOUT_CONFIG);
  if (v && v.layout && typeof v.layout === 'object') return v.layout;
  return null;
}

/**
 * 读取 MiniMap 显隐偏好（缺省视为 true 显示）。
 * @returns {boolean}
 */
export function loadShowMinimap() {
  const as = AS();
  const v = as?.getConfig?.(PANEL_LAYOUT_CONFIG);
  return v?.showMinimap !== false; // 仅显式 false 才隐藏
}

/**
 * 保存面板布局 + 视图偏好到同一文件。
 * @param {Record<string, number>} layout { panelId: percentage }
 * @param {object} [extra] 额外视图偏好字段（如 { showMinimap }），与 layout 合并存储
 */
export function savePanelLayout(layout, extra = {}) {
  const as = AS();
  if (!as?.writeConfigJson) return;
  as.writeConfigJson(PANEL_LAYOUT_CONFIG, { layout, ...extra, savedAt: Date.now() }).catch(() => {});
}

