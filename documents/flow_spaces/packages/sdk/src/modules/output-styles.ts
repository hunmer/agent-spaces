import type { HttpClient } from '../client';

export interface OutputStyleTemplate {
  id: string;
  name: string;
  content: string;
  description?: string;
  storeId?: string;
  createdAt: string;
  updatedAt: string;
}

export function createOutputStylesApi(http: HttpClient) {
  return {
    list: (): Promise<OutputStyleTemplate[]> =>
      http.get('/api/output-styles'),

    listAgents: (): Promise<{ id: string; name: string }[]> =>
      http.get('/api/output-styles/agents'),

    create: (data: { name: string; content: string; description?: string; storeId?: string }): Promise<OutputStyleTemplate> =>
      http.post('/api/output-styles', data),

    update: (id: string, data: { name?: string; content?: string; description?: string }): Promise<OutputStyleTemplate> =>
      http.put(`/api/output-styles/${id}`, data),

    delete_: (id: string): Promise<void> =>
      http.delete(`/api/output-styles/${id}`),

    apply: (id: string, agentIds: string[]): Promise<void> =>
      http.postVoid(`/api/output-styles/${id}/apply`, { agentIds }),
  };
}
