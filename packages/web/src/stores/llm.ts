import { create } from 'zustand';
import type { LLMModel, LLMProvider } from '@agent-spaces/shared';
import { sdk } from '@/lib/sdk';

export interface CatalogModel {
  id: string;
  name?: string;
  limit?: { context?: number; output?: number };
  cost?: { input?: number; output?: number };
  modalities?: { input?: string[]; output?: string[] };
  attachment?: boolean;
  reasoning?: boolean;
  [k: string]: unknown;
}

export interface CatalogProvider {
  id: string;
  name?: string;
  api?: string;
  models?: Record<string, CatalogModel>;
  [k: string]: unknown;
}

export interface ModelCatalog {
  providers: Record<string, CatalogProvider>;
  models: Record<string, CatalogModel>;
}

interface LLMStore {
  models: LLMModel[];
  providers: LLMProvider[];
  loaded: boolean;
  catalog: ModelCatalog | null;
  catalogLoaded: boolean;
  ensure: () => Promise<void>;
  loadCatalog: () => Promise<ModelCatalog | null>;
  setCatalog: (catalog: ModelCatalog | null) => void;
  addModel: (model: LLMModel) => void;
  updateModel: (model: LLMModel) => void;
  removeModel: (id: string) => void;
  addProvider: (provider: LLMProvider) => void;
  updateProvider: (provider: LLMProvider) => void;
  removeProvider: (id: string) => void;
}

export const useLLMStore = create<LLMStore>((set, get) => ({
  models: [],
  providers: [],
  loaded: false,
  catalog: null,
  catalogLoaded: false,
  ensure: async () => {
    if (get().loaded) return;
    try {
      const [models, providers] = await Promise.all([
        sdk.llm.listModels(),
        sdk.llm.listProviders(),
      ]);
      set({ models, providers, loaded: true });
    } catch { /* ignore */ }
  },
  loadCatalog: async () => {
    if (get().catalogLoaded) return get().catalog;
    try {
      const catalog = await sdk.llm.getCatalog() as ModelCatalog;
      set({ catalog, catalogLoaded: true });
      return catalog;
    } catch { /* ignore */ }
    return null;
  },
  setCatalog: (catalog) => set({ catalog, catalogLoaded: true }),
  addModel: (model) => set(s => ({ models: [...s.models, model] })),
  updateModel: (model) => set(s => ({ models: s.models.map(m => m.id === model.id ? model : m) })),
  removeModel: (id) => set(s => ({ models: s.models.filter(m => m.id !== id) })),
  addProvider: (provider) => set(s => ({ providers: [...s.providers, provider] })),
  updateProvider: (provider) => set(s => ({ providers: s.providers.map(p => p.id === provider.id ? provider : p) })),
  removeProvider: (id) => set(s => ({ providers: s.providers.filter(p => p.id !== id) })),
}));
