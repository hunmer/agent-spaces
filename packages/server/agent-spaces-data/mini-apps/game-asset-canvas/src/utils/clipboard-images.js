const IMAGE_EXTENSION_OVERRIDES = {
  jpeg: 'jpg',
  'svg+xml': 'svg',
  'x-icon': 'ico',
};

export function extensionForImageMime(mimeType) {
  const subtype = String(mimeType || '').split('/')[1]?.toLowerCase();
  if (!subtype) return 'png';
  return IMAGE_EXTENSION_OVERRIDES[subtype] || subtype.replace(/[^a-z0-9]/g, '') || 'png';
}

/** 从原生 ClipboardEvent.clipboardData 提取图片文件，无需 clipboard-read 权限。 */
export function imageFilesFromClipboardData(clipboardData) {
  const directFiles = Array.from(clipboardData?.files || [])
    .filter((file) => file.type?.startsWith('image/'));
  if (directFiles.length) return directFiles;

  return Array.from(clipboardData?.items || [])
    .filter((item) => item.kind === 'file' && item.type?.startsWith('image/'))
    .map((item) => item.getAsFile?.())
    .filter(Boolean);
}

/**
 * 按 workflow canvas 的规则读取系统剪贴板：每个 ClipboardItem 取首个 image/* 类型。
 */
export async function readClipboardImageFiles(clipboard, options = {}) {
  if (!clipboard?.read) return [];
  const FileClass = options.FileClass || globalThis.File;
  if (!FileClass) return [];

  const items = await clipboard.read();
  const timestamp = (options.now || Date.now)();
  const files = [];
  for (const item of items) {
    const imageType = item.types?.find((type) => type.startsWith('image/'));
    if (!imageType) continue;
    const blob = await item.getType(imageType);
    const type = blob.type || imageType;
    files.push(new FileClass(
      [blob],
      `clipboard-${timestamp}-${files.length + 1}.${extensionForImageMime(type)}`,
      { type },
    ));
  }
  return files;
}
