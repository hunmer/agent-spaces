// 动态加载 Live2D 相关的 CDN 脚本到当前 document（React 模式预览无 HTML 入口，必须运行时注入）。
// pixi.js、pixi-live2d-display 都不在 renderer allowlist，无法 import；live2d core 只能通过 script 加载。
//
// 依赖顺序：live2d core (cubism2) -> cubism4 core -> pixi.js -> pixi-live2d-display
// 加载完成后：
//   window.PIXI                       — pixi.js v6 全局
//   window.Live2DCubismCore           — Cubism 4 Core
//   PIXI.live2d.Live2DModel           — 模型类（pixi-live2d-display UMD 挂到 PIXI.live2d）
//   Live2D (legacy cubism2 全局)      — 由 live2d.min.js 提供

const SCRIPTS = [
  // Cubism 2 (legacy) core
  'https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js',
  // Cubism 4 core
  'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
  // pixi.js v6 UMD（必须 v6，pixi-live2d-display@0.4.0 不兼容 v7）
  'https://cdn.jsdelivr.net/npm/pixi.js@6.5.10/dist/browser/pixi.min.js',
  // pixi-live2d-display UMD（同时支持 cubism2+cubism4，挂到 PIXI.live2d）
  'https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/index.min.js',
];

const loaded = new Map(); // src -> Promise<void>

function loadOne(src) {
  if (loaded.has(src)) return loaded.get(src);
  const p = new Promise((resolve, reject) => {
    // 同源同 src 的 <script> 只创建一次；重复加载会直接 resolve
    const existing = document.querySelector(`script[data-cdn-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === '1') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`Failed to load: ${src}`)));
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = false; // 保持顺序
    el.dataset.cdnSrc = src;
    el.addEventListener('load', () => {
      el.dataset.loaded = '1';
      resolve();
    });
    el.addEventListener('error', () => reject(new Error(`Failed to load: ${src}`)));
    document.head.appendChild(el);
  });
  loaded.set(src, p);
  return p;
}

// 加载全部依赖，返回 PIXI 全局；重复调用幂等。
export async function loadLive2DDeps() {
  for (const src of SCRIPTS) {
    await loadOne(src);
  }
  const PIXI = window.PIXI;
  if (!PIXI) throw new Error('PIXI global missing after CDN load');
  return PIXI;
}
