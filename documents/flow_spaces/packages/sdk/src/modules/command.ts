import type { HttpClient } from '../client';
import type { QuickCommand } from '@agent-spaces/shared';

export function createCommandApi(http: HttpClient) {
  return {
    list: (workspaceId: string): Promise<QuickCommand[]> =>
      http.get(`/api/workspaces/${workspaceId}/commands`),

    create: (workspaceId: string, data: Partial<QuickCommand>): Promise<QuickCommand> =>
      http.post(`/api/workspaces/${workspaceId}/commands`, data),

    update: (workspaceId: string, id: string, data: Partial<QuickCommand>): Promise<QuickCommand> =>
      http.put(`/api/workspaces/${workspaceId}/commands/${id}`, data),

    delete_: (workspaceId: string, id: string): Promise<void> =>
      http.delete(`/api/workspaces/${workspaceId}/commands/${id}`),

    start: (workspaceId: string, id: string): Promise<void> =>
      http.postVoid(`/api/workspaces/${workspaceId}/commands/${id}/start`),

    stop: (workspaceId: string, id: string): Promise<void> =>
      http.postVoid(`/api/workspaces/${workspaceId}/commands/${id}/stop`),
  };
}
