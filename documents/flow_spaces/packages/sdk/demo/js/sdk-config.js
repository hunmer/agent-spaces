/**
 * demo 公共模块 —— SDK 实例化、配置持久化、UI 辅助工具
 *
 * 所有 demo 页面的 js 均通过 `import { sdk, run, renderJSON, ... } from './sdk-config.js'`
 * 复用同一套工具。SDK 产物从 `../../dist/index.js` 以原生 ESM 方式加载。
 */
import { createSDK } from '../../dist/index.js';

// ---- localStorage 持久化 key ----
const K_BASE = 'demo:baseUrl';
const K_TOKEN = 'demo:token';

/** 配置存取 */
export const store = {
  getBaseUrl: () => localStorage.getItem(K_BASE) || 'http://localhost:3100',
  setBaseUrl: (v) => localStorage.setItem(K_BASE, v),
  getToken: () => localStorage.getItem(K_TOKEN),
  setToken: (v) => (v ? localStorage.setItem(K_TOKEN, v) : localStorage.removeItem(K_TOKEN)),
};

// ---- SDK 单例 ----
let _sdk = null;

/** 获取 SDK 单例（首次调用按当前 baseUrl / token 创建） */
export function sdk() {
  if (!_sdk) {
    _sdk = createSDK({
      baseUrl: store.getBaseUrl(),
      getToken: () => store.getToken(),
      onUnauthorized: () => showBanner('鉴权失败（401/403）：请先在首页登录获取 token', 'error'),
      debug: true, // 开启后浏览器 Console 可看到 [SDK →] / [SDK ←] 彩色请求日志
    });
  }
  return _sdk;
}

/** 切换服务器后重置实例，使新 baseUrl 生效 */
export function resetSdk() {
  _sdk = null;
}
export function applyBaseUrl(url) {
  store.setBaseUrl(url);
  if (_sdk) _sdk.updateConfig({ baseUrl: url });
}

// ---- DOM helpers ----
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** 把任意数据美化输出到目标 <pre> */
export function renderJSON(target, data) {
  target.classList.remove('output--error');
  target.textContent = JSON.stringify(data, null, 2);
}

/**
 * 统一执行一个 SDK 调用：自动管理按钮禁用态、loading 文案、错误渲染。
 * @param {HTMLButtonElement} btn 触发按钮
 * @param {HTMLElement} out 输出 <pre>
 * @param {() => Promise} fn 真正的 SDK 调用
 * @param {{ onDone?: (r:any)=>void }} opts
 */
export async function run(btn, out, fn, opts = {}) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = '执行中…';
  out.classList.remove('output--error');
  out.textContent = '请求中…';
  try {
    const result = await fn();
    renderJSON(out, result ?? '(空响应 / void)');
    if (opts.onDone) opts.onDone(result);
  } catch (err) {
    out.classList.add('output--error');
    if (err && typeof err === 'object' && 'status' in err) {
      // ApiError: { status, statusText, body, url, method }
      out.textContent =
        `❌ API 错误 [${err.status} ${err.statusText}]\n` +
        `${(err.body || err.message || '').slice(0, 800)}\n\n` +
        `${err.method} ${err.url}`;
    } else {
      out.textContent =
        `❌ ${err?.message || String(err)}\n\n` +
        `（若是网络错误，请检查：\n` +
        ` 1) 服务器 baseUrl 是否可达\n` +
        ` 2) 是否通过 HTTP 服务打开本页面（file:// 下 ESM 相对 import 会被 CORS 拦截））`;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

// ---- 全局横幅 ----
let bannerEl = null;
export function showBanner(msg, type = 'info') {
  if (!bannerEl) {
    bannerEl = document.createElement('div');
    bannerEl.className = 'banner';
    document.body.prepend(bannerEl);
  }
  bannerEl.textContent = msg;
  bannerEl.className = `banner banner--${type}`;
  bannerEl.style.display = msg ? 'block' : 'none';
  if (msg) setTimeout(() => {
    if (bannerEl.textContent === msg) bannerEl.style.display = 'none';
  }, 4000);
}

/**
 * 用一个 <select> 装载当前服务器的工作区列表（多个 demo 页共用）。
 * @param {HTMLSelectElement} select
 * @returns {Promise<void>}
 */
export async function loadWorkspaceOptions(select) {
  select.disabled = true;
  select.innerHTML = '<option value="">加载中…</option>';
  try {
    const list = await sdk().workspace.list();
    select.innerHTML =
      '<option value="">— 选择工作区 —</option>' +
      list
        .map((w) => `<option value="${w.id}">${escapeHtml(w.name || w.id)}</option>`)
        .join('');
  } catch (err) {
    select.innerHTML = '<option value="">加载失败</option>';
  } finally {
    select.disabled = false;
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 当前页面顶栏的连通状态徽章更新 */
export function setBadge(el, ok, text) {
  if (!el) return;
  el.textContent = text;
  el.className = 'badge ' + (ok ? 'ok' : 'err');
}
