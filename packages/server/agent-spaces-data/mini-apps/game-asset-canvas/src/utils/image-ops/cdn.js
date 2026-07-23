/**
 * CDN ESM 模块加载封装。
 *
 * 所有第三方算法库（gif 编解码 / 色彩量化 / zip 打包）通过宿主 `window.AgentSpaces.loadCdnModule`
 * 从 CDN 动态加载，结果按 URL 缓存。web 的 package.json 无需声明这些依赖，mini-app 自包含。
 *
 * 宿主 loader 实现：packages/web/src/components/mini-apps/use-mini-app-host-api.tsx 的 loadCdnModule，
 * 用 `new Function('u','return import(u)')(url)` 绕过打包器静态分析，交给浏览器运行时从 CDN 拉取。
 *
 * CDN 源用 esm.sh（自动 CJS→ESM 转译，带 ?v 版本锁定）。如某库转译失败，可换 jsdelivr/unpkg。
 */

const CDN = {
  gifEnc: 'https://esm.sh/gifenc@1.0.3',
  gifUct: 'https://esm.sh/gifuct-js@2.1.2',
  imageQ: 'https://esm.sh/image-q@4.0.0',
  jszip: 'https://esm.sh/jszip@3.10.1',
};

async function load(url) {
  const loader = window.AgentSpaces?.loadCdnModule;
  if (!loader) throw new Error('宿主未提供 loadCdnModule 能力（需更新 web 服务）');
  return loader(url);
}

/** gifenc：GIF 编码 + 调色板量化 */
export async function getGifEnc() {
  return load(CDN.gifEnc);
}

/** gifuct-js：GIF 解码（parseGIF / decompressFrames） */
export async function getGifUct() {
  return load(CDN.gifUct);
}

/** image-q：Wu 色彩量化（buildPaletteSync / applyPaletteSync） */
export async function getImageQ() {
  return load(CDN.imageQ);
}

/** jszip：ZIP 打包（GIF 拆帧后批量下载用） */
export async function getJsZip() {
  return load(CDN.jszip);
}
