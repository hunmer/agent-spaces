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
