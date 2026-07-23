/**
 * 统一图像 I/O：所有算法只认 ImageData，canvas 转换收口在此。
 *
 * 来源：FrameRonin frontend/src 里散落的 `document.createElement('canvas') + drawImage/getImageData/toBlob`
 * 三段式调用，这里抽成 (url → ImageData) 和 (ImageData → blob/dataUrl) 的纯函数。
 */

/**
 * 把图片 URL（http/data/blob）转成 ImageData。
 * 跨域图片需服务端代理（hostApi.proxyImageUrl），否则 canvas 会污染导致 getImageData 失败。
 * @param {string} url
 * @returns {Promise<ImageData>}
 */
export function urlToImageData(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas 2d 不可用');
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error(`图片加载失败：${url}`));
    img.src = url;
  });
}

/**
 * ImageData → PNG Blob。GIF 编码 / 上传持久化前用。
 * @param {ImageData} imageData
 * @param {string} [type='image/png'] MIME 类型
 * @param {number} [quality] 0-1，仅 image/jpeg/image/webp 有效
 * @returns {Promise<Blob>}
 */
export function imageDataToBlob(imageData, type = 'image/png', quality) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('canvas 2d 不可用'));
  ctx.putImageData(imageData, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob 失败'))),
      type,
      quality,
    );
  });
}

/**
 * ImageData → data URL。小图预览 / 不需持久化的场景用。
 * @param {ImageData} imageData
 * @param {string} [type='image/png']
 * @returns {string}
 */
export function imageDataToDataUrl(imageData, type = 'image/png') {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d 不可用');
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL(type);
}

/**
 * ArrayBuffer → ImageData（GIF 解码后合成帧用）。
 * @param {Uint8ClampedArray} rgba 宽×高×4 的 RGBA 缓冲
 * @param {number} width
 * @param {number} height
 * @returns {ImageData}
 */
export function rgbaToImageData(rgba, width, height) {
  return new ImageData(new Uint8ClampedArray(rgba), width, height);
}

/**
 * 上传 ImageData 到宿主拿 http URL（持久化到 data/uploads/）。
 * @param {ImageData} imageData
 * @returns {Promise<string>} http URL
 */
export async function imageDataToUrl(imageData) {
  const blob = await imageDataToBlob(imageData);
  const file = new File([blob], `proc-${Date.now()}.png`, { type: 'image/png' });
  const AS = window.AgentSpaces;
  if (!AS?.uploadFile) throw new Error('宿主 uploadFile 不可用');
  const uploaded = await AS.uploadFile(file);
  const httpUrl = uploaded?.url || uploaded?.httpPath;
  if (!httpUrl) throw new Error('上传未返回 URL');
  return httpUrl;
}
