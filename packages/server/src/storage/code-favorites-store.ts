import { ensureDir, readJsonFile, writeJsonFile } from './json-store.js';
import path from 'node:path';
import { getDataDir } from './json-store.js';
import type { CodeFavorite } from '@agent-spaces/shared';

function favoritesFile(workspaceId: string) {
  return path.join(getDataDir(), 'workspaces', workspaceId, 'code-favorites.json');
}

export function listFavorites(workspaceId: string): CodeFavorite[] {
  return readJsonFile<CodeFavorite[]>(favoritesFile(workspaceId)) ?? [];
}

export function saveFavorites(workspaceId: string, favorites: CodeFavorite[]): void {
  const file = favoritesFile(workspaceId);
  ensureDir(path.dirname(file));
  writeJsonFile(file, favorites);
}
