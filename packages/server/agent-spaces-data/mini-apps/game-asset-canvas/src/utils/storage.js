import { CANVAS_CONFIG } from './constants';

const AS = () => window.AgentSpaces;

/** 读取画布状态（从服务端 config 缓存） */
export function loadCanvas() {
  const as = AS();
  if (!as?.getConfig) return null;
  return as.getConfig(CANVAS_CONFIG) || null;
}

/**
 * 保存画布状态（走服务端单写者，多端同步）。
 * @param {{ nodes: any[], edges: any[] }} state
 */
export async function saveCanvas(state) {
  const as = AS();
  if (!as?.invokeService) return;
  await as.invokeService('save_canvas', state);
}

/** 订阅画布状态变化（多端同步） */
export function onCanvasChanged(callback) {
  const as = AS();
  if (!as?.onConfigChanged) return () => {};
  return as.onConfigChanged((path, value) => {
    if (path === CANVAS_CONFIG) callback(value);
  });
}

/**
 * 下载远程图片到 data/ 目录，返回本地路径数组（失败则跳过）。
 * @param {string[]} urls
 * @param {string} nodeId
 * @returns {Promise<string[]>} 本地相对路径
 */
export async function downloadImages(urls, nodeId) {
  const as = AS();
  const local = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (!url) continue;
    const ext = matchExt(url) || 'png';
    const name = `gen/${nodeId}-${Date.now()}-${i}.${ext}`;
    try {
      if (as?.downloadFile) {
        await as.downloadFile(url, name);
      } else if (window.AgentSpacesUI?.downloadFile) {
        await window.AgentSpacesUI.downloadFile(url, name);
      }
      local.push(name);
    } catch (err) {
      // 单张失败不影响整体，保留原始 URL 供展示
      console.warn('downloadImage failed:', url, err);
    }
  }
  return local;
}

function matchExt(url) {
  const m = String(url).split('?')[0].match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : '';
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
