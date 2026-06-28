import type { HttpClient } from '../client';
import type { LLMModel, LLMProvider } from '@agent-spaces/shared';

export interface ModelCatalogMeta {
  updatedAt: string | null;
  providers: number;
  models: number;
}

export interface ModelCatalogProviderIconsResult {
  saved: string[];
  failed: string[];
  total: number;
}

export function createLlmApi(http: HttpClient) {
  return {
    listModels: (): Promise<LLMModel[]> =>
      http.get('/api/models'),

    createModel: (data: Partial<LLMModel>): Promise<LLMModel> =>
      http.post('/api/models', data),

    updateModel: (id: string, data: Partial<LLMModel>): Promise<LLMModel> =>
      http.put(`/api/models/${id}`, data),

    deleteModel: (id: string): Promise<void> =>
      http.delete(`/api/models/${id}`),

    listProviders: (): Promise<LLMProvider[]> =>
      http.get('/api/providers'),

    createProvider: (data: Partial<LLMProvider>): Promise<LLMProvider> =>
      http.post('/api/providers', data),

    updateProvider: (id: string, data: Partial<LLMProvider>): Promise<LLMProvider> =>
      http.put(`/api/providers/${id}`, data),

    deleteProvider: (id: string): Promise<void> =>
      http.delete(`/api/providers/${id}`),

    /** models.dev 模型目录（catalog.json） */
    getCatalog: (): Promise<unknown> =>
      http.get('/api/model-catalog'),

    /** 目录元信息（更新时间 / 数量） */
    getCatalogMeta: (): Promise<ModelCatalogMeta> =>
      http.get('/api/model-catalog/meta'),

    /** 强制刷新 catalog（重新请求 models.dev） */
    refreshCatalog: (): Promise<ModelCatalogMeta> =>
      http.post('/api/model-catalog/refresh'),

    /** 一键下载所有 provider 图标到 public/provider-icons/ */
    refreshProviderIcons: (): Promise<ModelCatalogProviderIconsResult> =>
      http.post('/api/model-catalog/refresh-icons'),
  };
}
