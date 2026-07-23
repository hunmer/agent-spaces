/**
 * 第三方算法库本地加载（vendor 目录，无 CDN 依赖）。
 *
 * 历史问题：
 * 1. esm.sh CDN 在 webpack/turbopack 运行时下动态 import/script tag 均失效
 *    （load/error 事件不触发，namespace 为空）
 * 2. 用 import 静态导入 vendor 会触发 babel transform-modules-commonjs，把已编译的第三方库
 *    再次编译，require 被 localRequire 替换，找不到 node 内建 → EventEmitter undefined
 *
 * 正确做法：vendor 作为运行时资源，通过 `window.AgentSpaces.srcFileUrl` 拿到 src 文件的 http URL，
 * fetch 源码 → Blob URL → 浏览器原生 dynamic import。整个链路不经 babel/webpack，
 * 由浏览器 ESM loader 100% 原生解析，node polyfill 正常工作。
 *
 * vendor 文件来源（自包含 ESM bundle）：
 * - gifenc.js       — GIF 编码 + 调色板量化（官方 ESM build）
 * - gifuct-js.js    — GIF 解码（esm.sh ?bundle，js-binary-schema-parser 已内联）
 * - image-q.js      — Wu 色彩量化（esm.sh ?bundle + node polyfill）
 * - jszip.js        — ZIP 打包（esm.sh ?bundle + node polyfill，预留未用）
 * - node-process.js / node-buffer.js — image-q/jszip 的 node polyfill
 */
const VENDOR_BASE = 'vendor/';

const moduleCache = new Map();

/**
 * fetch 源码 → Blob URL → 浏览器原生 dynamic import。
 * 结果按 URL 缓存（模块只求值一次）。
 */
async function loadVendor(fileName) {
  if (moduleCache.has(fileName)) return moduleCache.get(fileName);
  const AS = window.AgentSpaces;
  if (!AS?.srcFileUrl) throw new Error('宿主未提供 srcFileUrl 能力（需更新 web 服务）');
  const url = AS.srcFileUrl(VENDOR_BASE + fileName);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`vendor 加载失败(${resp.status}): ${fileName}`);
  const code = await resp.text();
  // Blob URL：浏览器原生 ESM loader 求值，不经 babel/webpack，node polyfill 正常
  const blob = new Blob([code], { type: 'text/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  // 用 new Function 包裹 import，防止 webpack 静态分析改写 import() 为 require
  const dynImport = new Function('u', 'return import(u)');
  const mod = await dynImport(blobUrl);
  console.log('[cdn] loaded', fileName, 'keys:', Object.keys(mod));
  moduleCache.set(fileName, mod);
  return mod;
}

/**
 * 归一化模块导出：合并 default 与命名导出。
 * esm.sh 的 CJS→ESM 转译常把命名导出收进 default，unwrap 保证调用方能直接解构。
 * - `{ default: {A,B} }` → `{A,B}`
 * - `{ A, B, default: {C} }` → `{A,B,C}`
 */
function unwrap(mod) {
  if (!mod || typeof mod !== 'object') return mod;
  const d = mod.default;
  if (d && typeof d === 'object') {
    const { default: _drop, ...rest } = mod;
    return { ...d, ...rest };
  }
  return mod;
}

/** gifenc：GIF 编码 + 调色板量化（GIFEncoder/quantize/applyPalette） */
export async function getGifEnc() {
  const mod = unwrap(await loadVendor('gifenc.js'));
  if (typeof mod.GIFEncoder !== 'function' && typeof mod.default === 'function') {
    return { ...mod, GIFEncoder: mod.default };
  }
  return mod;
}

/** gifuct-js：GIF 解码（parseGIF / decompressFrames） */
export async function getGifUct() {
  return unwrap(await loadVendor('gifuct-js.js'));
}

/** image-q：Wu 色彩量化（buildPaletteSync / applyPaletteSync） */
export async function getImageQ() {
  return unwrap(await loadVendor('image-q.js'));
}

/** jszip：ZIP 打包（GIF 拆帧后批量下载用，预留） */
export async function getJsZip() {
  return unwrap(await loadVendor('jszip.js'));
}
