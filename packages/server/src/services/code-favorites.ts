import { v4 as uuid } from 'uuid';
import type { CodeFavorite } from '@agent-spaces/shared';
import * as store from '../storage/code-favorites-store.js';

export function listFavorites(workspaceId: string): CodeFavorite[] {
  return store.listFavorites(workspaceId);
}

export function addFavorite(workspaceId: string, fav: Omit<CodeFavorite, 'id' | 'createdAt'>): CodeFavorite {
  const entry: CodeFavorite = {
    ...fav,
    id: `${fav.path}:${fav.line}:${Date.now()}`,
    createdAt: Date.now(),
  };
  const favorites = store.listFavorites(workspaceId);
  favorites.unshift(entry);
  store.saveFavorites(workspaceId, favorites);
  return entry;
}

export function removeFavorite(workspaceId: string, id: string): void {
  const favorites = store.listFavorites(workspaceId).filter(f => f.id !== id);
  store.saveFavorites(workspaceId, favorites);
}

export function clearFavorites(workspaceId: string): void {
  store.saveFavorites(workspaceId, []);
}
