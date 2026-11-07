import type { HttpClient } from '../client';

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export function createPromptsApi(http: HttpClient) {
  return {
    list: (): Promise<PromptTemplate[]> =>
      http.get('/api/prompt-templates'),

    listAgents: (): Promise<{ id: string; name: string }[]> =>
      http.get('/api/prompt-templates/agents'),

    create: (data: { name: string; content: string; storeId?: string }): Promise<PromptTemplate> =>
      http.post('/api/prompt-templates', data),

    update: (id: string, data: { name?: string; content?: string }): Promise<PromptTemplate> =>
      http.put(`/api/prompt-templates/${id}`, data),

    delete_: (id: string): Promise<void> =>
      http.delete(`/api/prompt-templates/${id}`),

    apply: (id: string, agentIds: string[]): Promise<void> =>
      http.postVoid(`/api/prompt-templates/${id}/apply`, { agentIds }),
  };
}
