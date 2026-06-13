import type { HttpClient } from '../client';
import type { RequestOptions } from '../types';

export interface MiniAppProject {
  id: string;
  name: string;
  description?: string;
  version: string;
  type: 'react' | 'html';
  tags?: string[];
  enabledPlugins?: string[];
  agentConfigId?: string;
  enableAgents?: boolean;
  mainFile: string;
  icon?: string;
  avatarUrl?: string;
  backgroundUrl?: string;
  createdAt: string;
  updatedAt: string;
  storeUrl?: string;
  storeChecksum?: string;
}

export interface MiniAppAgentConfig {
  id: string;
  name: string;
  avatar?: string;
  /** 引用全局 Agent Preset id，复用其密钥（可选） */
  agentId?: string;
  modelProvider?: string;
  modelId?: string;
  apiKey?: string;
  apiBase?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: { api?: boolean; plugin?: boolean };
}

export interface MiniAppChatMessage {
  id: string;
  sessionId: string;
  agentId: string;
  role: 'user' | 'agent';
  content: string;
  route?: string;
  toolCalls?: Array<{ name: string; input: unknown; result: unknown }>;
  timestamp: string;
}

export function createMiniAppApi(http: HttpClient) {
  return {
    list: (): Promise<MiniAppProject[]> =>
      http.get('/api/mini-apps'),

    get: (id: string): Promise<MiniAppProject> =>
      http.get(`/api/mini-apps/${id}`),

    create: (data: { name: string; type: 'react' | 'html'; description?: string; tags?: string[] }): Promise<MiniAppProject> =>
      http.post('/api/mini-apps', data),

    update: (id: string, data: Partial<Pick<MiniAppProject, 'name' | 'description' | 'tags' | 'enabledPlugins' | 'agentConfigId' | 'mainFile' | 'icon' | 'avatarUrl' | 'backgroundUrl'>>): Promise<MiniAppProject> =>
      http.put(`/api/mini-apps/${id}`, data),

    delete_: (id: string): Promise<void> =>
      http.delete(`/api/mini-apps/${id}`),

    getFileTree: (id: string): Promise<string[]> =>
      http.get(`/api/mini-apps/${id}/files`),

    getFileManifest: (id: string): Promise<{ path: string; mtimeMs: number }[]> =>
      http.get(`/api/mini-apps/${id}/files/manifest`),

    readFile: (id: string, filePath: string): Promise<{ content: string }> =>
      http.get(`/api/mini-apps/${id}/files/content?path=${encodeURIComponent(filePath)}`),

    writeFile: (id: string, filePath: string, content: string): Promise<void> =>
      http.putVoid(`/api/mini-apps/${id}/files/content`, { path: filePath, content }),

    uploadFiles: (id: string, formData: FormData): Promise<{ ok: true; files: { path: string; size: number }[] }> =>
      http.upload(`/api/mini-apps/${id}/files/upload`, formData),

    deleteFile: (id: string, filePath: string): Promise<void> =>
      http.delete(`/api/mini-apps/${id}/files?path=${encodeURIComponent(filePath)}`),

    renameFile: (id: string, from: string, to: string): Promise<void> =>
      http.postVoid(`/api/mini-apps/${id}/files/rename`, { from, to }),

    createFolder: (id: string, dirPath: string): Promise<void> =>
      http.postVoid(`/api/mini-apps/${id}/files/folder`, { path: dirPath }),

    readConfig: <T = unknown>(id: string, filePath: string): Promise<{ value: T | null }> =>
      http.get(`/api/mini-apps/${id}/configs/content?path=${encodeURIComponent(filePath)}`),

    writeConfig: (id: string, filePath: string, value: unknown): Promise<void> =>
      http.putVoid(`/api/mini-apps/${id}/configs/content`, { path: filePath, value }),

    writeDataFile: (id: string, filePath: string, content: string, encoding?: 'base64'): Promise<{ ok: true; path: string; size: number }> =>
      http.put(`/api/mini-apps/${id}/data/content`, { path: filePath, content, encoding }),

    importZip: (data: { zip: string; name?: string; type?: 'react' | 'html'; description?: string }): Promise<MiniAppProject> =>
      http.post('/api/mini-apps/import', data),

    exportZip: (id: string): Promise<Blob> =>
      http.raw(`/api/mini-apps/${id}/export`).then(r => r.blob()),

    uploadAvatar: (id: string, dataUrl: string): Promise<{ url: string }> =>
      http.post(`/api/mini-apps/${id}/avatar`, { dataUrl }),

    getAvatarUrl: (id: string): string =>
      `/api/mini-apps/${id}/avatar`,

    uploadBackground: (id: string, dataUrl: string): Promise<{ url: string }> =>
      http.post(`/api/mini-apps/${id}/background`, { dataUrl }),

    getBackgroundUrl: (id: string): string =>
      `/api/mini-apps/${id}/background`,

    /** Reveal project folder in OS file manager */
    revealFolder: (id: string): Promise<{ ok: true; path: string }> =>
      http.post(`/api/mini-apps/${id}/reveal`),

    // ---- Agents (preview chat) ----

    listAgents: (id: string): Promise<{ enableAgents: boolean; agents: Array<{ id: string; name: string; avatar?: string }> }> =>
      http.get(`/api/mini-apps/${id}/agents`),

    /** 读取单条 agent 的完整配置（含 apiKey，供编辑器加载） */
    getAgent: (id: string, agentId: string): Promise<MiniAppAgentConfig> =>
      http.get(`/api/mini-apps/${id}/agents/${encodeURIComponent(agentId)}`),

    /** 更新单条 agent 配置（整体替换） */
    updateAgent: (id: string, agentId: string, data: MiniAppAgentConfig): Promise<MiniAppAgentConfig> =>
      http.put(`/api/mini-apps/${id}/agents/${encodeURIComponent(agentId)}`, data),

    agentHistory: (id: string, sessionId: string, agentId?: string): Promise<{ messages: MiniAppChatMessage[] }> =>
      http.get(`/api/mini-apps/${id}/agents/chat?sessionId=${encodeURIComponent(sessionId)}${agentId ? `&agentId=${encodeURIComponent(agentId)}` : ''}`),

    /**
     * SSE 流式聊天。返回原始 Response，调用方用 reader 解析 `event:` / `data:` 行。
     * body: { sessionId, message, route? }
     */
    agentChat: (id: string, agentId: string, body: { sessionId: string; message: string; route?: string }, opts?: RequestOptions): Promise<Response> =>
      http.sse(`/api/mini-apps/${id}/agents/${encodeURIComponent(agentId)}/chat`, body, opts),
  };
}
