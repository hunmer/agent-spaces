// 浏览器下载工具：把 url（http 或 dataURL）转成 blob，触发浏览器原生下载
// 注意：AS.downloadFile 是「保存到服务端 data 目录」，不会触发浏览器下载；
// AS.downloadZip 走 triggerDownload 才会。这里复刻 triggerDownload 逻辑做单文件下载。

export async function downloadToBrowser(url, filename = 'download.png') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载失败：${response.status} ${response.statusText}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  return { ok: true, filename, size: blob.size };
}

// 把单张远程图片保存到本地 data 目录（原图存 output/，缩略图存 thumbs/）。
// name 用于生成文件名（建议含 taskId 等唯一标识）。失败回退到远程 url，不抛错。
// 返回 { url, thumbUrl }：优先本地副本的 HTTP URL。
export async function localizeImage(AS, remoteUrl, name) {
  const baseName = `${name}.jpg`;
  const outPath = `output/${baseName}`;
  const thumbTarget = `thumbs/${baseName}`;
  let url = remoteUrl;
  let thumbUrl = remoteUrl;
  try {
    const dl = await AS.downloadImage(remoteUrl, outPath);
    url = dl.httpUrl;
    // 缩略图优先用已下载的本地源图（source），避免二次下载
    const thumb = await AS.generateThumbnail({ source: outPath, target: thumbTarget, width: 400, quality: 80 });
    thumbUrl = thumb.httpUrl;
  } catch (err) {
    console.warn('[stickerGenerator] localizeImage failed, fallback to remote', err);
  }
  return { url, thumbUrl };
}

// 批量本地化：并发下载 + 生成缩略图。返回 [{ url, thumbUrl }]。
export async function localizeImages(AS, remoteImages, namePrefix) {
  const list = Array.isArray(remoteImages) ? remoteImages : [];
  return Promise.all(list.map((img, i) => localizeImage(AS, img.url, `${namePrefix}-${i}`)));
}

