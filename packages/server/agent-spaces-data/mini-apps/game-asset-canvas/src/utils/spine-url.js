/**
 * Spine 资源 URL → dataUrl 转换（公共工具）。
 *
 * loadSpine 内部只认 dataUrl / 原文文本 / ArrayBuffer，
 * 不主动 fetch http URL（除 png 交给 PIXI.BaseTexture.from）。
 * 因此上游传来 http URL 时，调用方需先经此函数转成 dataUrl 再喂给 loadSpine。
 *
 * 抽自 SpineEditorDialog.jsx，供 SpineEditorDialog 和 SpineDisplayNode 共用。
 */

/**
 * 把任意资源 URL（http(s) / data:）统一转成 base64 dataUrl。
 * - 已是 data: 直接返回
 * - http URL 优先走宿主代理（proxyImageUrl，处理跨域/CORS），失败则直连
 * @param {string} url
 * @returns {Promise<string>} dataUrl
 */
export default async function urlToDataUrl(url) {
  if (!url) throw new Error('Spine 资源 URL 为空');
  if (url.startsWith('data:')) return url;
  const AS = window.AgentSpaces;
  const requestUrl = AS?.proxyImageUrl ? AS.proxyImageUrl(url) : url;
  const response = await fetch(requestUrl);
  if (!response.ok) throw new Error(`资源加载失败 (${response.status}): ${url}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('资源转 data URL 失败'));
    reader.readAsDataURL(blob);
  });
}
