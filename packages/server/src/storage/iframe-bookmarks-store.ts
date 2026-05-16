import { join } from 'node:path';
import { readJsonFile, writeJsonFile, ensureDir, getDataDir } from './json-store.js';

export type IframeSize = '9:16' | '4:3' | 'full';

export interface IframeBookmark {
  id: string;
  title: string;
  url: string;
  size: IframeSize;
  createdAt: string;
}

function filePath() {
  const dir = join(getDataDir());
  ensureDir(dir);
  return join(dir, 'iframe-bookmarks.json');
}

export function listBookmarks(): IframeBookmark[] {
  return readJsonFile<IframeBookmark[]>(filePath()) ?? [];
}

export function addBookmark(data: { title: string; url: string; size?: IframeSize }): IframeBookmark {
  const bookmarks = listBookmarks();
  const bookmark: IframeBookmark = {
    id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: data.title.trim(),
    url: data.url.trim(),
    size: data.size || 'full',
    createdAt: new Date().toISOString(),
  };
  bookmarks.push(bookmark);
  writeJsonFile(filePath(), bookmarks);
  return bookmark;
}

export function removeBookmark(id: string): boolean {
  const bookmarks = listBookmarks();
  const next = bookmarks.filter((b) => b.id !== id);
  if (next.length === bookmarks.length) return false;
  writeJsonFile(filePath(), next);
  return true;
}
