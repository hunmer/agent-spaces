import type { HttpClient } from '../client';
import type { Channel, Message } from '@agent-spaces/shared';

export function createChannelApi(http: HttpClient) {
  return {
    list: (workspaceId: string): Promise<Channel[]> =>
      http.get(`/api/workspaces/${workspaceId}/channels`),

    create: (workspaceId: string, data: { id?: string; name: string; type?: string; members?: string[]; teamIds?: string[]; titlePrompt?: string; overwrite?: boolean }): Promise<Channel> =>
      http.post(`/api/workspaces/${workspaceId}/channels`, data),

    get: (workspaceId: string, channelId: string): Promise<Channel> =>
      http.get(`/api/workspaces/${workspaceId}/channels/${channelId}`),

    update: (workspaceId: string, channelId: string, data: Partial<Pick<Channel, 'name' | 'type' | 'issueId' | 'members' | 'teamIds' | 'pinnedMentionId' | 'draft' | 'todos' | 'archived'>>): Promise<Channel> =>
      http.put(`/api/workspaces/${workspaceId}/channels/${channelId}`, data),

    delete_: (workspaceId: string, channelId: string): Promise<void> =>
      http.delete(`/api/workspaces/${workspaceId}/channels/${channelId}`),

    getMessages: (workspaceId: string, channelId: string): Promise<Message[]> =>
      http.get(`/api/workspaces/${workspaceId}/channels/${channelId}/messages`),

    getState: (workspaceId: string, channelId: string): Promise<Record<string, unknown> | null> =>
      http.get(`/api/workspaces/${workspaceId}/channels/${channelId}/state`),

    clearMessages: (workspaceId: string, channelId: string): Promise<void> =>
      http.delete(`/api/workspaces/${workspaceId}/channels/${channelId}/messages`),

    /** 上传附件 */
    uploadAttachment: (workspaceId: string, formData: FormData): Promise<{ url: string }> =>
      http.upload(`/api/workspaces/${workspaceId}/channels/upload`, formData),

    /** Delete a single message */
    deleteMessage: (workspaceId: string, channelId: string, messageId: string): Promise<void> =>
      http.delete(`/api/workspaces/${workspaceId}/channels/${channelId}/messages/${messageId}`),

    /** Get tool call detail data */
    getToolDetail: (workspaceId: string, channelId: string, messageId: string, toolName: string): Promise<unknown> =>
      http.get(`/api/workspaces/${workspaceId}/channels/${channelId}/messages/${messageId}/tool-details/${encodeURIComponent(toolName)}`),
  };
}
