import { create } from 'zustand';
import type { LLMModel, LLMProvider } from '@agent-spaces/shared';

interface LLMStore {
  models: LLMModel[];
  providers: LLMProvider[];
  loaded: boolean;
  ensure: () => Promise<void>;
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
  ensure: async () => {
    if (get().loaded) return;
    try {
      const [models, providers] = await Promise.all([
        fetch('/api/models').then(r => r.json()),
        fetch('/api/providers').then(r => r.json()),
      ]);
      set({ models, providers, loaded: true });
    } catch { /* ignore */ }
  },
  addModel: (model) => set(s => ({ models: [...s.models, model] })),
  updateModel: (model) => set(s => ({ models: s.models.map(m => m.id === model.id ? model : m) })),
  removeModel: (id) => set(s => ({ models: s.models.filter(m => m.id !== id) })),
  addProvider: (provider) => set(s => ({ providers: [...s.providers, provider] })),
  updateProvider: (provider) => set(s => ({ providers: s.providers.map(p => p.id === provider.id ? provider : p) })),
  removeProvider: (id) => set(s => ({ providers: s.providers.filter(p => p.id !== id) })),
}));
