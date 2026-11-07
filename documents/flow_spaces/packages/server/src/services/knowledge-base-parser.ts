import { readFileSync } from 'node:fs';

export class UnsupportedFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedFormatError';
  }
}

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.html', '.htm',
  '.json', '.log', '.xml', '.yaml', '.yml',
]);

const TEXT_MIME_PREFIXES = ['text/', 'application/json', 'application/xml', 'application/javascript'];

function extOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i >= 0 ? fileName.slice(i).toLowerCase() : '';
}

/** 首版仅支持文本类文件；二进制(pdf/docx/...)抛 UnsupportedFormatError。留扩展点。 */
export function extractText(filePath: string, mimeType: string, fileName: string): string {
  const ext = extOf(fileName);
  const isTextByExt = TEXT_EXTENSIONS.has(ext);
  const isTextByMime = TEXT_MIME_PREFIXES.some((p) => mimeType.toLowerCase().startsWith(p));
  if (!isTextByExt && !isTextByMime) {
    throw new UnsupportedFormatError(`暂不支持该格式解析: ${ext || mimeType || '未知'}`);
  }
  return readFileSync(filePath, 'utf8');
}

/** 字符滑窗分块。size=块大小, overlap=重叠。步长 = max(1, size - overlap)。 */
export function chunkText(text: string, size: number, overlap: number): string[] {
  const s = Math.max(1, Math.floor(size));
  const o = Math.max(0, Math.min(Math.floor(overlap), s - 1));
  const step = Math.max(1, s - o);
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += step) {
    chunks.push(text.slice(i, i + s));
    if (i + s >= text.length) break;
  }
  return chunks.length ? chunks : [''];
}
