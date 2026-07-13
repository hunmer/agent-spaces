import type { HttpClient } from '../client';
import type { Workspace, CreateWorkspaceInput, WorkspaceNotificationSettings } from '@agent-spaces/shared';

export function createWorkspaceApi(http: HttpClient) {
  return {
    list: (): Promise<Workspace[]> =>
      http.get('/api/workspaces'),

    get: (id: string): Promise<Workspace> =>
      http.get(`/api/workspaces/${id}`),

    create: (data: CreateWorkspaceInput): Promise<Workspace> =>
      http.post('/api/workspaces', data),

    update: (id: string, data: Partial<Pick<Workspace, 'name' | 'boundDirs' | 'agentspaceDir' | 'autoProcessIssues' | 'editorSettings' | 'notificationSettings' | 'hooksEnabled' | 'miniAppIds'>>): Promise<Workspace> =>
      http.put(`/api/workspaces/${id}`, data),

    delete: (id: string): Promise<void> =>
      http.delete(`/api/workspaces/${id}`),

    /** 获取工作空间通知配置 */
    getNotificationSettings: (id: string): Promise<WorkspaceNotificationSettings> =>
      http.get(`/api/workspaces/${id}/notification-settings`),

    /** 更新工作空间通知配置 */
    updateNotificationSettings: (id: string, settings: Partial<WorkspaceNotificationSettings>): Promise<WorkspaceNotificationSettings> =>
      http.put(`/api/workspaces/${id}/notification-settings`, settings),

    /** 获取工作空间 Prompt */
    getPrompt: (id: string): Promise<{ prompt: string }> =>
      http.get(`/api/workspaces/${id}/prompt`),

    /** 更新工作空间 Prompt */
    updatePrompt: (id: string, prompt: string): Promise<{ prompt: string }> =>
      http.put(`/api/workspaces/${id}/prompt`, { prompt }),

    /** 文件夹浏览 */
    browseFolder: (path?: string): Promise<{ name: string; path: string; isDirectory: boolean }[]> =>
      http.get(`/api/folder/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`),

    /** Git Clone (SSE) */
    cloneSse: (url: string, targetDir: string): Promise<Response> =>
      http.sse('/api/workspaces/clone', { url, targetDir }),

    /** Reveal workspace directory in OS file manager */
    reveal: (id: string): Promise<void> =>
      http.postVoid(`/api/workspaces/${id}/reveal`),

    /** Check folder permissions */
    checkPermissions: (path: string): Promise<{ readable: boolean; writable: boolean }> =>
      http.get(`/api/folder/check-permissions?path=${encodeURIComponent(path)}`),

    /** Create a new folder */
    createFolder: (path: string): Promise<void> =>
      http.postVoid('/api/folder/create', { path }),

    /** Read file from disk (for reading package.json etc.) */
    readFile: (path: string): Promise<unknown> =>
      http.get(`/api/folder/read-file?path=${encodeURIComponent(path)}`),

    /** Start notification bot */
    startNotifications: (id: string): Promise<{ workspace?: import('@agent-spaces/shared').Workspace }> =>
      http.post(`/api/workspaces/${id}/notifications/start`),

    /** Stop notification bot */
    stopNotifications: (id: string): Promise<{ workspace?: import('@agent-spaces/shared').Workspace }> =>
      http.post(`/api/workspaces/${id}/notifications/stop`),

    /** Send test notification */
    testNotification: (id: string): Promise<void> =>
      http.postVoid(`/api/workspaces/${id}/notifications/test`),
  };
}
