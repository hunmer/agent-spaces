import { create } from 'zustand';

export interface CodeFavorite {
  id: string;
  path: string;
  line: number;
  column: number;
  label?: string;
  snippet?: string;
  createdAt: number;
  workspaceId: string;
}

interface CodeFavoritesState {
  favorites: CodeFavorite[];
  loadedWorkspaceId: string | null;
  load: (workspaceId: string) => void;
  addFavorite: (fav: Omit<CodeFavorite, 'id' | 'createdAt'>) => void;
  removeFavorite: (id: string) => void;
  clearFavorites: (workspaceId: string) => void;
}

const STORAGE_KEY_PREFIX = 'code-favorites-';

export const useCodeFavoritesStore = create<CodeFavoritesState>((set, get) => ({
  favorites: [],
  loadedWorkspaceId: null,

  load: (workspaceId) => {
    const { loadedWorkspaceId } = get();
    if (loadedWorkspaceId === workspaceId) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PREFIX + workspaceId);
      const favorites = raw ? JSON.parse(raw) : [];
      set({ favorites, loadedWorkspaceId: workspaceId });
    } catch {
      set({ favorites: [], loadedWorkspaceId: workspaceId });
    }
  },

  addFavorite: (fav) => {
    const id = `${fav.path}:${fav.line}:${Date.now()}`;
    const entry: CodeFavorite = { ...fav, id, createdAt: Date.now() };
    set((s) => {
      const favorites = [entry, ...s.favorites];
      if (s.loadedWorkspaceId) {
        localStorage.setItem(STORAGE_KEY_PREFIX + s.loadedWorkspaceId, JSON.stringify(favorites));
      }
      return { favorites };
    });
  },

  removeFavorite: (id) => {
    set((s) => {
      const favorites = s.favorites.filter((f) => f.id !== id);
      if (s.loadedWorkspaceId) {
        localStorage.setItem(STORAGE_KEY_PREFIX + s.loadedWorkspaceId, JSON.stringify(favorites));
      }
      return { favorites };
    });
  },

  clearFavorites: (workspaceId) => {
    localStorage.removeItem(STORAGE_KEY_PREFIX + workspaceId);
    set({ favorites: [], loadedWorkspaceId: workspaceId });
  },
}));
