import { NODE_META } from './constants';
import { getJSZip } from '../spine/runtime';

const CANVAS_FORMAT = 'game-asset-canvas';

/**
 * 从图片 URL 提取「真实文件名」。
 *
 * 宿主产出的图片 URL 形如（见 use-mini-app-host-api.tsx）：
 *   http://host/api/mini-apps/<id>/local-file?path=output%2F<uuid>.png&token=xxx
 *   http://host/api/mini-apps/<id>/data/file?path=<uuid>.png&token=xxx
 *   http://host/api/mini-apps/<id>/src/file?path=refs%2Fhero.png&token=xxx
 *   http://host/api/mini-apps/<id>/proxy-image?url=<外链>&token=xxx
 *
 * 真实文件名藏在 query 参数 path= 或 url= 里（URL 编码），
 * 直接 url.split('/').pop() 会拿到路由末段（如 local-file）甚至带 query 的乱码。
 *
 * 提取优先级：
 *   1. path= 参数解码后取末段（如 output%2F<uuid>.png → <uuid>.png）
 *   2. url= 参数解码后取末段（proxy-image 外链）
 *   3. 回退 pathname 末段（普通直链 / data: URL 无效时）
 *   4. 兜底 'untitled'
 *
 * @param {string} url
 * @returns {string} 干净的文件名（含扩展名，无 query/路径前缀）
 */
export function extractFileNameFromUrl(url) {
  if (!url || typeof url !== 'string') return 'untitled';
  try {
    const u = new URL(url, window.location.origin);
    // 优先：后端代理 URL 的 path= / url= query 参数
    const fromPath = u.searchParams.get('path');
    const fromUrl = u.searchParams.get('url');
    const candidate = fromPath || fromUrl;
    if (candidate) {
      const decoded = decodeURIComponent(candidate);
      const seg = decoded.split(/[\\/]/).filter(Boolean).pop();
      if (seg && /\.[A-Za-z0-9]{1,8}$/.test(seg)) return seg; // 含扩展名才算合法
    }
    // 回退：pathname 末段（普通直链）
    const last = u.pathname.split('/').filter(Boolean).pop();
    if (last && /\.[A-Za-z0-9]{1,8}$/.test(last)) return last;
    if (last) return last;
  } catch {
    // 非 URL 字符串，按分隔符取末段
    const seg = String(url).split(/[\\/]/).filter(Boolean).pop();
    if (seg) return seg.split(/[?#]/)[0] || 'untitled';
  }
  return 'untitled';
}

/**
 * 把画布节点/边序列化为可导出的干净 JSON（去掉注入的函数回调）。
 * @param {Array} nodes
 * @param {Array} edges
 * @returns {object} { format, exportedAt, nodes, edges }
 */
export function serializeCanvas(nodes, edges) {
  const cleanNodes = (nodes || []).map((n) => {
    const { onUpdate, onGenerate, ...restData } = n.data || {};
    void onUpdate; void onGenerate;
    return {
      id: n.id,
      type: n.type,
      position: n.position,
      data: restData,
      meta: NODE_META[n.type] ? { label: NODE_META[n.type].label } : undefined,
    };
  });
  return {
    format: CANVAS_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    nodes: cleanNodes,
    edges: edges || [],
  };
}

/**
 * 解析导入的画布 JSON：校验格式、过滤多余字段，返回可直接 setNodes/setEdges 的 {nodes, edges}。
 * 校验失败抛 Error，调用方负责 catch + 提示。
 *
 * @param {string} text  - 文件文本内容
 * @returns {{ nodes: Array, edges: Array }}
 */
export function parseCanvasJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('JSON 格式无效：' + e.message);
  }
  if (!data || typeof data !== 'object') throw new Error('文件内容不是合法的 JSON 对象');
  if (data.format !== CANVAS_FORMAT) throw new Error(`格式不匹配（期望 ${CANVAS_FORMAT}，实际 ${data.format || '未知'}）`);
  if (!Array.isArray(data.nodes)) throw new Error('nodes 字段缺失或非数组');
  if (!Array.isArray(data.edges)) throw new Error('edges 字段缺失或非数组');

  // 保留 ReactFlow 运行所需字段，剔除注入回调 / selected / 等 UI 态（避免污染目标画布选中态）
  const nodes = data.nodes.map((n) => {
    const data0 = n.data || {};
    // 反序列化 data 内的函数回调字段本就不可能存在（导出时已剥），保险起见再剥一次
    const { onUpdate, onGenerate, selected, ...restData } = data0;
    void onUpdate; void onGenerate; void selected;
    return {
      id: String(n.id),
      type: n.type,
      position: n.position || { x: 0, y: 0 },
      data: restData,
    };
  });
  const edges = data.edges.map((e) => ({
    id: String(e.id),
    source: String(e.source),
    target: String(e.target),
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
  }));
  return { nodes, edges };
}

/**
 * 触发文件选择 → 读取 → 解析 → 返回 {nodes, edges}。
 * 用户取消选文件时 resolve(null)（不抛错，调用方按 null 处理）。
 * @returns {Promise<{nodes:Array, edges:Array} | null>}
 */
export function pickAndParseCanvasFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(parseCanvasJson(String(reader.result)));
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    };
    input.click();
  });
}

/**
 * 触发浏览器下载 JSON 文件。
 * @param {object} data
 * @param {string} filename
 */
export function downloadJson(data, filename = 'game-asset-canvas.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 触发浏览器下载 Blob（zip 等二进制）。
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 把任意字符串规整为合法的文件夹名：替换非法字符 / 控制字符为 _，trim，空回退「未分类」。
 * Windows/Linux 通用非法字符：/ \ : * ? " < > | 及 U+0000-U+001F 控制字符。
 * @param {string} name
 * @returns {string}
 */
export function sanitizeFolderName(name) {
  const cleaned = String(name ?? '').replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').trim();
  return cleaned || '未分类';
}

// 给重复文件名加 _2/_3 后缀去重。ext 含点（如 .png），无扩展名时传空串。
function dedupeName(base, ext, used) {
  let candidate = `${base}${ext}`;
  if (!used.has(candidate)) { used.add(candidate); return candidate; }
  let i = 2;
  while (used.has(`${base}_${i}${ext}`)) i++;
  const result = `${base}_${i}${ext}`;
  used.add(result);
  return result;
}

/**
 * 导出当前工作区素材库为 zip：每个分类一个文件夹，内含原图文件。
 * 复用 spine/runtime 的 getJSZip（vendor/spine/jszip-3.10.1.min.js，(0,eval) 全局求值）。
 *
 * 文件名提取：asset.name 可能是错的（入库时 url.split('/').pop() 残留），优先用
 * extractFileNameFromUrl(asset.url) 从 url query 重新解析真实文件名，asset.name 仅兜底。
 *
 * @param {Array<{name:string, assets:Array<{url:string,name:string}>}>} categories
 * @param {{workspaceName?:string, onProgress?:(done:number,total:number)=>void}} [opts]
 *   - onProgress: 每张图处理完回调（用于 toast 进度展示）
 * @returns {Promise<{total:number, ok:number, failed:number}>} 统计信息
 * @throws {Error} 素材库为空 / 全部失败时抛错（调用方负责 toast）
 */
export async function exportAssetLibraryZip(categories, opts = {}) {
  const list = Array.isArray(categories) ? categories : [];
  const totalAssets = list.reduce((n, c) => n + (Array.isArray(c?.assets) ? c.assets.length : 0), 0);
  if (list.length === 0 || totalAssets === 0) {
    throw new Error('素材库为空，没有可导出的素材');
  }

  const JSZip = await getJSZip();
  const zip = new JSZip();
  let ok = 0;
  let failed = 0;
  let done = 0;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

  for (const cat of list) {
    const assets = Array.isArray(cat?.assets) ? cat.assets : [];
    if (assets.length === 0) continue;
    const folderName = sanitizeFolderName(cat.name);
    const folder = zip.folder(folderName);
    if (!folder) { done += assets.length; continue; }
    // 文件夹内同名文件去重（不同分类互不影响）
    const used = new Set();
    for (const asset of assets) {
      try {
        if (!asset?.url) throw new Error('url 缺失');
        const res = await fetch(asset.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        // 优先从 url 解析真实文件名（asset.name 可能是入库时的脏数据），name 兜底
        const rawName = extractFileNameFromUrl(asset.url) || asset.name || 'untitled';
        const dot = rawName.lastIndexOf('.');
        const base = dot > 0 ? rawName.slice(0, dot) : rawName;
        const ext = dot > 0 ? rawName.slice(dot) : '';
        const fileName = dedupeName(base, ext, used);
        folder.file(fileName, blob);
        ok++;
      } catch {
        failed++;
      } finally {
        done++;
        if (onProgress) onProgress(done, totalAssets);
      }
    }
  }

  if (ok === 0) {
    throw new Error('素材全部下载失败，无法生成 zip');
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const wsName = String(opts.workspaceName || 'game-asset-canvas').replace(/[\\/:*?"<>|]/g, '_');
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  downloadBlob(blob, `素材库-${wsName}-${stamp}.zip`);

  return { total: totalAssets, ok, failed };
}
