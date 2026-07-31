import { NODE_META } from './constants';
import { getJSZip } from '../spine/runtime';

const CANVAS_FORMAT = 'game-asset-canvas';

// 后端图片路由特征（与 utils/workflow.js 同步：data/file | src/file | local-file | proxy-image）。
// 注意：proxy-image 的真图是外链（query url=），跨机器不可移植，导出时按 data/file/src/local-file 同等下载。
const BACKEND_PATH_RE = /\/api\/mini-apps\/[^/]+\/(data\/file|src\/file|local-file|proxy-image)/;
// 本机静态文件相对路径（server express.static 暴露，如 /static/uploads/xxx.png，无需 token）
const STATIC_RELATIVE_RE = /^\/static\//;

/**
 * 判定字符串是否为「本机可下载的图片 url」（需下载落 zip）。识别两类：
 * 1. 本机后端路由 http url：http(s)://host/api/mini-apps/<id>/(data/file|src/file|local-file|proxy-image)
 * 2. 本机静态文件相对路径：/static/uploads/xxx.png（fetch 时补 origin）
 * 排除 data:/blob:（内联，不下载）、其他外链 https（不可移植，保留原样）。
 *
 * 不做严格同源判定（持久化 url 可能是 127.0.0.1，而 window.location.origin 可能是 localhost，
 * 二者 host 不等会导致同源判定漏判）。
 */
function isLocalAssetUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (/^(data:|blob:)/i.test(url)) return false;
  // 相对路径静态文件
  if (STATIC_RELATIVE_RE.test(url)) return true;
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const u = new URL(url, window.location.origin);
    return BACKEND_PATH_RE.test(u.pathname);
  } catch {
    return false;
  }
}

// 把任意本机图片 url 补全为可 fetch 的绝对 http url（相对路径 /static/... 补 origin）。
function toAbsoluteFetchUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `${window.location.origin}${url}`;
}

/**
 * 递归收集 json 里所有「本机可下载图片 url」，返回去重数组（保持首次出现顺序）。
 * 含本机后端路由 http url（/api/mini-apps/...）和本机静态相对路径（/static/uploads/...）。
 * 遍历对象值/数组元素/字符串字段。
 * @param {*} value
 * @returns {string[]}
 */
export function collectBackendUrls(value) {
  const seen = new Set();
  const out = [];
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === 'string') {
      if (isLocalAssetUrl(v) && !seen.has(v)) { seen.add(v); out.push(v); }
      return;
    }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === 'object') {
      for (const k in v) { if (Object.prototype.hasOwnProperty.call(v, k)) walk(v[k]); }
    }
  };
  walk(value);
  return out;
}

// url → 稳定的 zip 内文件名（去 origin/token/path，用 hash + 扩展名）。同 url 同名 → 去重存盘。
// hash 来源：url 的 path= / url= query 末段优先（保留语义），否则 pathname 末段，兜底整体 hash。
function urlToStaticName(url) {
  try {
    const u = new URL(url, window.location.origin);
    const fromPath = u.searchParams.get('path');
    const fromUrl = u.searchParams.get('url');
    let base = '';
    if (fromPath) base = decodeURIComponent(fromPath).split(/[\\/]/).filter(Boolean).pop() || '';
    if (!base && fromUrl) base = decodeURIComponent(fromUrl).split(/[\\/]/).filter(Boolean).pop() || '';
    if (!base) base = u.pathname.split('/').filter(Boolean).pop() || '';
    base = base.split(/[?#]/)[0] || 'asset';
    // 无扩展名时按 image 兜底
    if (!/\.[A-Za-z0-9]{1,8}$/.test(base)) base += '.png';
    // 文件名可能含非法字符，清洗
    base = base.replace(/[^\w.\-]/g, '_');
    return base;
  } catch {
    return `asset-${Math.random().toString(36).slice(2, 8)}.png`;
  }
}

// 占位符协议：{{zip:static/<name>}}。双花括号+zip: 前缀，与真实 URL/相对路径绝不冲突，
// normalizeImageUrl 见到非 http/data//开头字符串会原样返回，不会误补 origin。
const ZIP_PLACEHOLDER_RE = /\{\{zip:([^}]+)\}\}/g;
function makePlaceholder(staticName) {
  return `{{zip:static/${staticName}}}`;
}

/**
 * 深度克隆 json，把命中的后端 url 字符串替换为占位符 {{zip:static/<name>}}。
 * @param {*} value
 * @param {Map<string,string>} urlToPlaceholder - url → 占位符
 * @returns {*} 克隆后的纯净 json
 */
export function relativizeUrls(value, urlToPlaceholder) {
  if (value == null) return value;
  if (typeof value === 'string') {
    return urlToPlaceholder.get(value) || value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => relativizeUrls(v, urlToPlaceholder));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const k in value) {
      if (Object.prototype.hasOwnProperty.call(value, k)) out[k] = relativizeUrls(value[k], urlToPlaceholder);
    }
    return out;
  }
  return value;
}

// 反向替换：把占位符换回新 http url（导入用）。str.replaceAll 需要全局正则。
function restoreUrls(text, placeholderToUrl) {
  if (typeof text !== 'string') return text;
  return text.replace(ZIP_PLACEHOLDER_RE, (m, name) => placeholderToUrl.get(name) || m);
}

/**
 * 递归遍历 json，把字符串里的占位符替换回真实 url（导入回填）。
 * @param {*} value
 * @param {Map<string,string>} placeholderToUrl - static/<name> → 新 http url
 * @returns {*} 还原后的 json
 */
export function restoreUrlsInJson(value, placeholderToUrl) {
  if (value == null) return value;
  if (typeof value === 'string') return restoreUrls(value, placeholderToUrl);
  if (Array.isArray(value)) return value.map((v) => restoreUrlsInJson(v, placeholderToUrl));
  if (typeof value === 'object') {
    const out = {};
    for (const k in value) {
      if (Object.prototype.hasOwnProperty.call(value, k)) out[k] = restoreUrlsInJson(value[k], placeholderToUrl);
    }
    return out;
  }
  return value;
}

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
    data: e.data && typeof e.data === 'object' ? { ...e.data } : undefined,
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

/**
 * 触发文件选择器，让用户选一个 .zip 文件。
 * 用户取消返回 null（不抛错）。
 * @returns {Promise<File | null>}
 */
export function pickAssetLibraryZipFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip,application/x-zip-compressed';
    input.onchange = () => {
      const file = input.files && input.files[0];
      resolve(file || null);
    };
    input.click();
  });
}

/**
 * 导入素材库 zip：zip 内「顶级文件夹名 → 分类」，文件夹下的文件逐个上传后入库。
 * 分类合并：已有同名分类则复用，否则新建（由 ensureCategory 决定，见 Canvas 实现）。
 * 去重：add_asset 服务端按 url 去重（重新上传会拿到新 url，实质不去重，这是现状）。
 *
 * @param {File} file - zip 文件
 * @param {{
 *   ensureCategory: (name:string)=>Promise<string>,  // 返回分类 id（找同名/新建）
 *   addAsset: (categoryId:string, asset:{url:string,name:string,title?:string,size:number,uploadedAt:number})=>Promise,
 *   onProgress?: (done:number, total:number)=>void,
 * }} handlers
 * @returns {Promise<{total:number, ok:number, failed:number, categories:number}>}
 * @throws {Error} zip 解析失败 / 无可导入文件时抛错（调用方 toast）
 */
export async function importAssetLibraryZip(file, handlers) {
  if (!file) throw new Error('未选择文件');
  const { ensureCategory, addAsset, onProgress } = handlers || {};
  if (typeof ensureCategory !== 'function' || typeof addAsset !== 'function') {
    throw new Error('缺少 ensureCategory / addAsset 回调');
  }

  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(file);
  // 只取文件夹下的文件（跳过顶级散文件、空目录、macOS 元数据 __MACOSX/、.DS_Store）
  const entries = Object.values(zip.files).filter((e) => !e.dir);
  const tasks = [];
  for (const e of entries) {
    // path 形如 "角色/hero.png" 或 "角色/子目录/x.png"；顶级文件夹名 = 第一段
    const parts = e.name.split('/').filter(Boolean);
    if (parts.length < 2) continue; // 顶级散文件，无分类归属，跳过
    if (parts[0] === '__MACOSX') continue;
    if (parts[parts.length - 1].startsWith('.')) continue; // .DS_Store 等隐藏文件
    tasks.push({ entry: e, folderName: parts[0], fileName: parts[parts.length - 1] });
  }
  if (tasks.length === 0) throw new Error('zip 内没有可导入的素材（需按文件夹组织）');

  // 分类缓存：同名分类只建/找一次
  const categoryCache = new Map();
  const total = tasks.length;
  let ok = 0;
  let failed = 0;
  let done = 0;
  const AS = window.AgentSpaces;
  const progress = typeof onProgress === 'function' ? onProgress : null;

  for (const { entry, folderName, fileName } of tasks) {
    try {
      let categoryId = categoryCache.get(folderName);
      if (!categoryId) {
        categoryId = await ensureCategory(folderName);
        categoryCache.set(folderName, categoryId);
      }
      const blob = await entry.async('blob');
      // uploadFile 需要 File 类型（FormData.append），用文件名构造
      const fileObj = new File([blob], fileName, { type: blob.type || 'image/png' });
      const res = await AS.uploadFile(fileObj);
      const url = res?.url || res?.httpPath;
      if (!url) throw new Error('上传未返回 url');
      const dot = fileName.lastIndexOf('.');
      const title = dot > 0 ? fileName.slice(0, dot) : fileName;
      await addAsset(categoryId, {
        id: `ast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        url,
        name: fileName,
        title,
        size: fileObj.size || 0,
        uploadedAt: Date.now(),
      });
      ok++;
    } catch {
      failed++;
    } finally {
      done++;
      if (progress) progress(done, total);
    }
  }

  if (ok === 0) throw new Error('导入失败：所有素材均未成功');
  return { total, ok, failed, categories: categoryCache.size };
}

// ─────────────────────────── 工作区导出/导入 ───────────────────────────

/**
 * 导出整个工作区为 zip：3 个 json（canvas/history/asset-library）+ 所有后端图片落 static/，
 * json 内后端 url 全部相对化为占位符 {{zip:static/<name>}}，外链 https / data:/blob: 原样保留。
 *
 * @param {{ canvasState?:object, historyList?:Array, assetLib?:object, workspaceName?:string, onProgress?:(done:number,total:number)=>void }} opts
 * @returns {Promise<{ jsons:number, assets:number, assetsOk:number, assetsFailed:number }>}
 * @throws {Error} 三个数据全空时抛错
 */
export async function exportWorkspaceZip(opts = {}) {
  const { canvasState, historyList, assetLib, workspaceName, onProgress } = opts;
  const hasCanvas = canvasState && Array.isArray(canvasState.nodes) && canvasState.nodes.length > 0;
  const hasHistory = Array.isArray(historyList) && historyList.length > 0;
  const hasAsset = assetLib && Array.isArray(assetLib.categories) && assetLib.categories.length > 0;
  if (!hasCanvas && !hasHistory && !hasAsset) {
    throw new Error('工作区为空（没有画布节点/生成记录/素材库），无可导出内容');
  }

  // 1. 收集三个数据里所有后端 url（去重）
  const urls = [];
  const urlSeen = new Set();
  const pushUrls = (data) => {
    for (const u of collectBackendUrls(data)) {
      if (!urlSeen.has(u)) { urlSeen.add(u); urls.push(u); }
    }
  };
  pushUrls(canvasState);
  pushUrls(historyList);
  pushUrls(assetLib);
  // 调试输出：定位资源未下载问题
  console.debug('[exportWorkspaceZip] canvas nodes:', canvasState?.nodes?.length,
    'history:', historyList?.length, 'assetCats:', assetLib?.categories?.length,
    '收集到后端 url:', urls.length);
  if (urls.length > 0) console.debug('[exportWorkspaceZip] 首个 url 样本:', urls[0]);

  const JSZip = await getJSZip();
  const zip = new JSZip();
  const urlToPlaceholder = new Map();
  const progress = typeof onProgress === 'function' ? onProgress : null;
  let assetsOk = 0;
  let assetsFailed = 0;
  const total = urls.length;
  let done = 0;

  // 2. 逐个下载本机图片落 static/，建 url→占位符 映射
  for (const url of urls) {
    const staticName = urlToStaticName(url);
    // 同名去重（不同 url 映射到同 staticName 时，第一个成功即落盘，后续复用）
    try {
      const res = await fetch(toAbsoluteFetchUrl(url));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      // 同名文件已被写入则不覆盖（多个 url 派生同名时复用首份）
      if (!zip.file(`static/${staticName}`)) {
        zip.file(`static/${staticName}`, blob);
      }
      urlToPlaceholder.set(url, makePlaceholder(staticName));
      assetsOk++;
    } catch (e) {
      console.warn('[exportWorkspaceZip] 下载失败:', url, e?.message || e);
      assetsFailed++;
      // 下载失败：不建映射，relativize 时该 url 原样保留（导入时也无映射，占位符保留为破图）
    } finally {
      done++;
      if (progress) progress(done, total);
    }
  }

  // 3. 相对化三个 json
  let jsons = 0;
  if (hasCanvas) {
    zip.file('canvas.json', JSON.stringify(relativizeUrls(canvasState, urlToPlaceholder), null, 2));
    jsons++;
  }
  if (hasHistory) {
    zip.file('generation-history.json', JSON.stringify(relativizeUrls(historyList, urlToPlaceholder), null, 2));
    jsons++;
  }
  if (hasAsset) {
    zip.file('asset-library.json', JSON.stringify(relativizeUrls(assetLib, urlToPlaceholder), null, 2));
    jsons++;
  }

  // 4. 打包下载
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const wsName = String(workspaceName || 'workspace').replace(/[\\/:*?"<>|]/g, '_');
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  downloadBlob(blob, `工作区-${wsName}-${stamp}.zip`);

  return { jsons, assets: total, assetsOk, assetsFailed };
}

/**
 * 触发文件选择器，选一个工作区 zip。
 * @returns {Promise<File | null>}
 */
export function pickWorkspaceZipFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip,application/x-zip-compressed';
    input.onchange = () => {
      const file = input.files && input.files[0];
      resolve(file || null);
    };
    input.click();
  });
}

/**
 * 解析工作区 zip：读 3 个 json + 重传 static/ 图片拿新 url + 回填占位符。
 *
 * @param {File} file
 * @param {{ onProgress?:(done:number,total:number)=>void }} [opts]
 * @returns {Promise<{ canvasState?:object, historyList?:Array, assetLib?:object, stats:{ uploaded:number, failed:number } }>}
 * @throws {Error} zip 无效 / 无可识别 json 时抛错
 */
export async function importWorkspaceZip(file, opts = {}) {
  if (!file) throw new Error('未选择文件');
  const { onProgress } = opts;
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(file);

  // 1. 读三个 json（缺失则跳过）
  let canvasState = null;
  let historyList = null;
  let assetLib = null;
  const readJson = async (path) => {
    const entry = zip.file(path);
    if (!entry) return null;
    try { return JSON.parse(await entry.async('string')); } catch { return null; }
  };
  canvasState = await readJson('canvas.json');
  historyList = await readJson('generation-history.json');
  assetLib = await readJson('asset-library.json');

  if (!canvasState && !historyList && !assetLib) {
    throw new Error('zip 内没有找到工作区数据（canvas.json / generation-history.json / asset-library.json）');
  }

  // 2. 扫所有 json 里的占位符，去重
  const placeholders = new Set();
  const scan = (text) => {
    if (typeof text !== 'string') return;
    const matches = text.match(ZIP_PLACEHOLDER_RE);
    if (matches) for (const m of matches) placeholders.add(m);
  };
  // 用 JSON.stringify 把对象扁平成字符串扫一遍，够用且快
  if (canvasState) scan(JSON.stringify(canvasState));
  if (historyList) scan(JSON.stringify(historyList));
  if (assetLib) scan(JSON.stringify(assetLib));

  const AS = window.AgentSpaces;
  const progress = typeof onProgress === 'function' ? onProgress : null;
  const placeholderToUrl = new Map(); // key = "static/<name>"（不带花括号），value = 新 url
  const total = placeholders.size;
  let done = 0;
  let uploaded = 0;
  let failed = 0;

  // 3. 逐个上传 static 文件拿新 url
  for (const ph of placeholders) {
    // ph 形如 {{zip:static/<name>}}，提取 static/<name>
    const inner = ph.slice('{{zip:'.length, -2); // "static/<name>"
    try {
      const entry = zip.file(inner);
      if (!entry) { failed++; continue; }
      const blob = await entry.async('blob');
      const fileName = inner.split('/').pop() || 'asset.png';
      const fileObj = new File([blob], fileName, { type: blob.type || 'image/png' });
      const res = await AS.uploadFile(fileObj);
      const url = res?.url || res?.httpPath;
      if (!url) throw new Error('上传未返回 url');
      placeholderToUrl.set(inner, url);
      uploaded++;
    } catch {
      failed++;
    } finally {
      done++;
      if (progress) progress(done, total);
    }
  }

  // 4. 回填占位符（restoreUrlsInJson 的 key 是 "static/<name>"，与占位符内部一致）
  return {
    canvasState: canvasState ? restoreUrlsInJson(canvasState, placeholderToUrl) : null,
    historyList: historyList ? restoreUrlsInJson(historyList, placeholderToUrl) : null,
    assetLib: assetLib ? restoreUrlsInJson(assetLib, placeholderToUrl) : null,
    stats: { uploaded, failed, total },
  };
}
