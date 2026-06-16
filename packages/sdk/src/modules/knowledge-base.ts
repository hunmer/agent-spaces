import type { HttpClient } from '../client';
import type {
  KnowledgeBase, KbFile, KnowledgeBaseStats, KbQueryResult, KbAddFileBody,
} from '@agent-spaces/shared';

export function createKnowledgeBaseApi(http: HttpClient) {
  return {
    list: (workspaceId: string): Promise<KnowledgeBase[]> =>
      http.get(`/api/workspaces/${workspaceId}/knowledge-bases`),

    create: (workspaceId: string, data: { name: string; description?: string; chunkSize?: number; chunkOverlap?: number }): Promise<KnowledgeBase> =>
      http.post(`/api/workspaces/${workspaceId}/knowledge-bases`, data),

    update: (workspaceId: string, kbId: string, data: Partial<Pick<KnowledgeBase, 'name' | 'description' | 'embeddingModelId' | 'chunkSize' | 'chunkOverlap'>>): Promise<KnowledgeBase> =>
      http.put(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}`, data),

    delete_: (workspaceId: string, kbId: string): Promise<void> =>
      http.delete(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}`),

    stats: (workspaceId: string, kbId: string): Promise<KnowledgeBaseStats> =>
      http.get(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}/stats`),

    bindEmbeddingModel: (workspaceId: string, kbId: string, embeddingModelId: string | null): Promise<KnowledgeBase> =>
      http.put(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}/embedding-model`, { embeddingModelId }),

    listFiles: (workspaceId: string, kbId: string): Promise<KbFile[]> =>
      http.get(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}/files`),

    addFile: (workspaceId: string, kbId: string, body: KbAddFileBody): Promise<KbFile> =>
      http.post(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}/files`, body),

    getFile: (workspaceId: string, kbId: string, fileId: string): Promise<KbFile> =>
      http.get(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}/files/${fileId}`),

    deleteFile: (workspaceId: string, kbId: string, fileId: string): Promise<void> =>
      http.delete(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}/files/${fileId}`),

    reindexFile: (workspaceId: string, kbId: string, fileId: string): Promise<KbFile> =>
      http.post(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}/files/${fileId}/reindex`),

    query: (workspaceId: string, kbId: string, body: { query: string; topK?: number }): Promise<KbQueryResult> =>
      http.post(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}/query`, body),
  };
}
