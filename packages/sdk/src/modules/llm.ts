import type { HttpClient } from "../client";
import type { AgentConfig, LLMModel, LLMProvider } from "@agent-spaces/shared";

export interface ModelCatalogMeta {
  updatedAt: string | null;
  providers: number;
  models: number;
}

export interface ModelCatalogProviderIconsResult {
  saved: string[];
  failed: string[];
  removed: string[];
  total: number;
}

export interface AgentIconResult {
  kind: "image" | "emoji";
  value: string;
  providerId?: string;
}

export interface ModelSyncResult {
  total: number;
  updated: number;
  skipped: number;
  details: Array<{
    id: string;
    name: string;
    modelId: string;
    from: { input: number; output: number };
    to: { input: number; output: number };
  }>;
}

export function createLlmApi(http: HttpClient) {
  return {
    listModels: (): Promise<LLMModel[]> =>
      http.get("/api/models"),

    createModel: (data: Partial<LLMModel>): Promise<LLMModel> =>
      http.post("/api/models", data),

    updateModel: (id: string, data: Partial<LLMModel>): Promise<LLMModel> =>
      http.put(`/api/models/${id}`, data),

    deleteModel: (id: string): Promise<void> =>
      http.delete(`/api/models/${id}`),

    syncModelPrices: (): Promise<ModelSyncResult> =>
      http.post("/api/models/sync-prices"),

    listProviders: (): Promise<LLMProvider[]> =>
      http.get("/api/providers"),

    createProvider: (data: Partial<LLMProvider>): Promise<LLMProvider> =>
      http.post("/api/providers", data),

    updateProvider: (id: string, data: Partial<LLMProvider>): Promise<LLMProvider> =>
      http.put(`/api/providers/${id}`, data),

    deleteProvider: (id: string): Promise<void> =>
      http.delete(`/api/providers/${id}`),

    testProvider: (data: { apiBase: string; apiKey?: string }): Promise<{ success: boolean; message: string }> =>
      http.post("/api/providers/test", data),

    getAgentIcon: (data: Partial<AgentConfig>): Promise<AgentIconResult | null> =>
      http.post("/api/providers/agent-icon", data),

    getCatalog: (): Promise<unknown> =>
      http.get("/api/model-catalog"),

    getCatalogMeta: (): Promise<ModelCatalogMeta> =>
      http.get("/api/model-catalog/meta"),

    refreshCatalog: (): Promise<ModelCatalogMeta> =>
      http.post("/api/model-catalog/refresh"),

    refreshProviderIcons: (): Promise<ModelCatalogProviderIconsResult> =>
      http.post("/api/model-catalog/refresh-icons"),
  };
}
