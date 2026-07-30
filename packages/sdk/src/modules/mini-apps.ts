import type { HttpClient } from '../client';
import type { RequestOptions } from '../types';
import type { FileNode, WorkflowAgentTimelineItem } from '@agent-spaces/shared';

export interface MiniAppProject {
  id: string;
  name: string;
  description?: string;
  version: string;
  type: 'react' | 'html';
  tags?: string[];
  extensions?: 'workspace'[];
  enabledPlugins?: string[];
  pluginConfigSchemes?: Record<string, string>;
  agentPermissions?: string[];
  agentConfigId?: string;
  enableAgents?: boolean;
  mainFile: string;
  /** 支持的设备类型，如 ['mobile', 'ipad', 'pc'] */
  devices?: string[];
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
  /** 空态展示的介绍文本（agent 对话无消息时显示） */
  introduction?: string;
  /** 引用全局 Agent Preset id，复用其密钥（可选） */
  agentId?: string;
  runtimeKind?: 'open-agent-sdk' | 'claude-code' | 'codex' | 'grok' | 'gemini-cli' | 'langchain' | 'hermes' | 'pi';
  modelProvider?: string;
  providerId?: string;
  modelId?: string;
  apiKey?: string;
  apiBase?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  hideInAgentList?: boolean;
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
  timeline?: WorkflowAgentTimelineItem[];
  timestamp: string;
}

/** 会话摘要（不含消息体） */
export interface MiniAppChatSessionSummary {
  id: string;
  agentId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export function createMiniAppApi(http: HttpClient) {
  return {
    list: (): Promise<MiniAppProject[]> =>
      http.get('/api/mini-apps'),

    get: (id: string): Promise<MiniAppProject> =>
      http.get(`/api/mini-apps/${encodeURIComponent(id)}`),

    listTools: (id: string): Promise<{ tools: Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }> }> =>
      http.get(`/api/mini-apps/${encodeURIComponent(id)}/tools`),

    create: (data: { name: string; type: 'react' | 'html'; description?: string; tags?: string[] }): Promise<MiniAppProject> =>
      http.post('/api/mini-apps', data),

    update: (id: string, data: Partial<Pick<MiniAppProject, 'name' | 'description' | 'tags' | 'enabledPlugins' | 'pluginConfigSchemes' | 'agentPermissions' | 'agentConfigId' | 'mainFile' | 'icon' | 'avatarUrl' | 'backgroundUrl' | 'devices'>>): Promise<MiniAppProject> =>
      http.put(`/api/mini-apps/${encodeURIComponent(id)}`, data),

    delete_: (id: string): Promise<void> =>
      http.delete(`/api/mini-apps/${encodeURIComponent(id)}`),

    getFileTree: (id: string): Promise<string[]> =>
      http.get(`/api/mini-apps/${encodeURIComponent(id)}/files`),

    getFileManifest: (id: string): Promise<{ path: string; mtimeMs: number }[]> =>
      http.get(`/api/mini-apps/${encodeURIComponent(id)}/files/manifest`),

    readFile: (id: string, filePath: string): Promise<{ content: string }> =>
      http.get(`/api/mini-apps/${encodeURIComponent(id)}/files/content?path=${encodeURIComponent(filePath)}`),

    writeFile: (id: string, filePath: string, content: string): Promise<void> =>
      http.putVoid(`/api/mini-apps/${encodeURIComponent(id)}/files/content`, { path: filePath, content }),

    uploadFiles: (id: string, formData: FormData): Promise<{ ok: true; files: { path: string; size: number }[] }> =>
      http.upload(`/api/mini-apps/${encodeURIComponent(id)}/files/upload`, formData),

    deleteFile: (id: string, filePath: string): Promise<void> =>
      http.delete(`/api/mini-apps/${encodeURIComponent(id)}/files?path=${encodeURIComponent(filePath)}`),

    renameFile: (id: string, from: string, to: string): Promise<void> =>
      http.postVoid(`/api/mini-apps/${encodeURIComponent(id)}/files/rename`, { from, to }),

    createFolder: (id: string, dirPath: string): Promise<void> =>
      http.postVoid(`/api/mini-apps/${encodeURIComponent(id)}/files/folder`, { path: dirPath }),

    readConfig: <T = unknown>(id: string, filePath: string): Promise<{ value: T | null }> =>
      http.get(`/api/mini-apps/${encodeURIComponent(id)}/configs/content?path=${encodeURIComponent(filePath)}`),

    writeConfig: (id: string, filePath: string, value: unknown): Promise<void> =>
      http.putVoid(`/api/mini-apps/${encodeURIComponent(id)}/configs/content`, { path: filePath, value }),

    writeDataFile: (id: string, filePath: string, content: string, encoding?: 'base64'): Promise<{ ok: true; path: string; size: number }> =>
      http.put(`/api/mini-apps/${encodeURIComponent(id)}/data/content`, { path: filePath, content, encoding }),

    getAgentFilesTree: (id: string, path = '', depth = 1, scope: 'preview' | 'editor' = 'preview'): Promise<FileNode[]> =>
      http.get(`/api/mini-apps/${encodeURIComponent(id)}/agent-files/tree?path=${encodeURIComponent(path)}&depth=${depth}&scope=${encodeURIComponent(scope)}`),

    readAgentFile: (id: string, filePath: string, scope: 'preview' | 'editor' = 'preview'): Promise<{ content: string; encoding: string }> =>
      http.get(`/api/mini-apps/${encodeURIComponent(id)}/agent-files/content?path=${encodeURIComponent(filePath)}&scope=${encodeURIComponent(scope)}`),

    writeAgentFile: (id: string, filePath: string, content: string, scope: 'preview' | 'editor' = 'preview'): Promise<void> =>
      http.putVoid(`/api/mini-apps/${encodeURIComponent(id)}/agent-files/content`, { path: filePath, content, scope }),

    deleteAgentFile: (id: string, filePath: string, scope: 'preview' | 'editor' = 'preview'): Promise<void> =>
      http.delete(`/api/mini-apps/${encodeURIComponent(id)}/agent-files?path=${encodeURIComponent(filePath)}&scope=${encodeURIComponent(scope)}`),

    renameAgentFile: (id: string, from: string, to: string, scope: 'preview' | 'editor' = 'preview'): Promise<void> =>
      http.postVoid(`/api/mini-apps/${encodeURIComponent(id)}/agent-files/rename`, { from, to, scope }),

    uploadAgentFiles: (id: string, formData: FormData): Promise<{ ok: true; files: { path: string; size: number }[] }> =>
      http.upload(`/api/mini-apps/${encodeURIComponent(id)}/agent-files/upload`, formData),

    importZip: (data: { zip: string; name?: string; type?: 'react' | 'html'; description?: string; id?: string; storeUrl?: string; storeChecksum?: string }): Promise<MiniAppProject> =>
      http.post('/api/mini-apps/import', data),

    exportZip: (id: string): Promise<Blob> =>
      http.raw(`/api/mini-apps/${encodeURIComponent(id)}/export`).then(r => r.blob()),

    uploadAvatar: (id: string, dataUrl: string): Promise<{ url: string }> =>
      http.post(`/api/mini-apps/${encodeURIComponent(id)}/avatar`, { dataUrl }),

    getAvatarUrl: (id: string): string =>
      `/api/mini-apps/${encodeURIComponent(id)}/avatar`,

    uploadBackground: (id: string, dataUrl: string): Promise<{ url: string }> =>
      http.post(`/api/mini-apps/${encodeURIComponent(id)}/background`, { dataUrl }),

    getBackgroundUrl: (id: string): string =>
      `/api/mini-apps/${encodeURIComponent(id)}/background`,

    /** Reveal project folder in OS file manager */
    revealFolder: (id: string): Promise<{ ok: true; path: string }> =>
      http.post(`/api/mini-apps/${encodeURIComponent(id)}/reveal`),

    // ---- Agents (preview chat) ----

    listAgents: (id: string): Promise<{ enableAgents: boolean; agents: Array<{ id: string; name: string; avatar?: string; introduction?: string; suggestions?: string[] }> }> =>
      http.get(`/api/mini-apps/${encodeURIComponent(id)}/agents`),

    /** 用 manifest.agents 种子重置 agents.json（保留 provider/model/runtimeKind 配置） */
    resetAgents: (id: string): Promise<{ ok: true; count: number }> =>
      http.post(`/api/mini-apps/${encodeURIComponent(id)}/agents/reset`),

    /** 读取单条 agent 的完整配置（含 apiKey，供编辑器加载） */
    getAgent: (id: string, agentId: string): Promise<MiniAppAgentConfig> =>
      http.get(`/api/mini-apps/${encodeURIComponent(id)}/agents/${encodeURIComponent(agentId)}`),

    /** 更新单条 agent 配置（整体替换） */
    updateAgent: (id: string, agentId: string, data: MiniAppAgentConfig): Promise<MiniAppAgentConfig> =>
      http.put(`/api/mini-apps/${encodeURIComponent(id)}/agents/${encodeURIComponent(agentId)}`, data),

    agentHistory: (id: string, sessionId: string, agentId?: string): Promise<{ messages: MiniAppChatMessage[] }> =>
      http.get(`/api/mini-apps/${encodeURIComponent(id)}/agents/chat?sessionId=${encodeURIComponent(sessionId)}${agentId ? `&agentId=${encodeURIComponent(agentId)}` : ''}`),

    /** 列出所有会话摘要（可选按 agentId 过滤） */
    listAgentSessions: (id: string, agentId?: string): Promise<{ sessions: MiniAppChatSessionSummary[] }> =>
      http.get(`/api/mini-apps/${encodeURIComponent(id)}/agents/sessions${agentId ? `?agentId=${encodeURIComponent(agentId)}` : ''}`),

    /** 重命名会话标题 */
    renameAgentSession: (id: string, sessionId: string, title: string): Promise<{ session: MiniAppChatSessionSummary & { messages?: MiniAppChatMessage[] } }> =>
      http.patch(`/api/mini-apps/${encodeURIComponent(id)}/agents/sessions/${encodeURIComponent(sessionId)}`, { title }),

    /** 清空某 session 的历史（可选按 agentId 过滤）。 */
    clearAgentHistory: (id: string, sessionId: string, agentId?: string): Promise<void> =>
      http.delete(`/api/mini-apps/${encodeURIComponent(id)}/agents/chat?sessionId=${encodeURIComponent(sessionId)}${agentId ? `&agentId=${encodeURIComponent(agentId)}` : ''}`),

    /** 删除单条消息 */
    deleteAgentMessage: (id: string, sessionId: string, messageId: string): Promise<void> =>
      http.delete(`/api/mini-apps/${encodeURIComponent(id)}/agents/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}`),

    /**
     * SSE 流式聊天。返回原始 Response，调用方用 reader 解析 `event:` / `data:` 行。
     * body: { sessionId, message, route? }
     */
    agentChat: (id: string, agentId: string, body: { sessionId: string; message: string; route?: string }, opts?: RequestOptions): Promise<Response> =>
      http.sse(`/api/mini-apps/${encodeURIComponent(id)}/agents/${encodeURIComponent(agentId)}/chat`, body, opts),

    answerAgentQuestion: (id: string, agentId: string, questionId: string, answer: string): Promise<void> =>
      http.postVoid(`/api/mini-apps/${encodeURIComponent(id)}/agents/${encodeURIComponent(agentId)}/questions/${encodeURIComponent(questionId)}/answer`, { answer }),
  };
}
