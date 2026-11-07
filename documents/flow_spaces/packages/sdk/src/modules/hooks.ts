import type { HttpClient } from '../client';
import type { HookConfig } from '@agent-spaces/shared';

export function createHooksApi(http: HttpClient) {
  return {
    list: (workspaceId: string): Promise<HookConfig[]> =>
      http.get(`/api/workspaces/${workspaceId}/hooks`),

    create: (workspaceId: string, config: HookConfig): Promise<void> =>
      http.postVoid(`/api/workspaces/${workspaceId}/hooks`, config),

    update: (workspaceId: string, name: string, config: HookConfig): Promise<void> =>
      http.putVoid(`/api/workspaces/${workspaceId}/hooks/${name}`, config),

    delete_: (workspaceId: string, name: string): Promise<void> =>
      http.delete(`/api/workspaces/${workspaceId}/hooks/${name}`),

    upload: (workspaceId: string, content: string): Promise<HookConfig> =>
      http.post(`/api/workspaces/${workspaceId}/hooks/upload`, { content }),

    applyToWorkspace: (workspaceId: string, name: string, targetWorkspaceId: string): Promise<void> =>
      http.postVoid(`/api/workspaces/${workspaceId}/hooks/${name}/apply`, { targetWorkspaceId }),
  };
}
