import type { BuiltInAgentToolName, FileNode, WorkflowAgentTimelineItem, WorkflowAgentToolCall } from '@agent-spaces/shared';

export interface ChatAgent {
  id: string;
  name: string;
  role?: 'agent';
  runtimeKind?: 'langchain';
  avatar?: string;
  avatarUrl?: string;
  icon?: string;
  backgroundUrl?: string;
  description?: string;
  systemPrompt?: string;
  modelProvider?: string;
  modelId?: string;
  providerId?: string;
  provider?: string;
  model: string;
  apiKey?: string;
  baseURL?: string;
  apiBase?: string;
  workingDir?: string;
  mcps?: Record<string, unknown>;
  skills?: Array<string | { name: string; content?: string }>;
  tools?: BuiltInAgentToolName[];
  outputStyle?: string;
  temperature?: number;
  maxTokens?: number;
  enabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  agentId: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  thinking?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  toolCalls?: WorkflowAgentToolCall[];
  timeline?: WorkflowAgentTimelineItem[];
}

export interface ChatWorkspace {
  id: string;
  name: string;
  agentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatSession {
  id: string;
  workspaceId: string;
  agentId: string;
  title?: string;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export function createChatApi(http: { get: Function; post: Function; put: Function; patch: Function; delete: Function }) {
  return {
    listAgents: (): Promise<ChatAgent[]> =>
      http.get('/api/chat/agents'),

    createAgent: (data: Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>): Promise<ChatAgent> =>
      http.post('/api/chat/agents', data),

    updateAgent: (id: string, data: Partial<ChatAgent>): Promise<ChatAgent> =>
      http.put(`/api/chat/agents/${id}`, data),

    deleteAgent: (id: string): Promise<void> =>
      http.delete(`/api/chat/agents/${id}`),

    listMessages: (agentId: string, limit?: number, before?: string): Promise<ChatMessage[]> => {
      const params: string[] = [];
      if (limit) params.push(`limit=${limit}`);
      if (before) params.push(`before=${before}`);
      const qs = params.length ? `?${params.join('&')}` : '';
      return http.get(`/api/chat/agents/${agentId}/messages${qs}`);
    },

    clearMessages: (agentId: string): Promise<void> =>
      http.delete(`/api/chat/agents/${agentId}/messages`),

    workspaceTree: (agentId: string, opts?: { path?: string; depth?: number }): Promise<FileNode[]> => {
      const qs = new URLSearchParams();
      if (opts?.path) qs.set('path', opts.path);
      if (opts?.depth != null) qs.set('depth', String(opts.depth));
      return http.get(`/api/chat/agents/${agentId}/workspace/tree${qs.size ? `?${qs}` : ''}`);
    },

    chatWorkspaceTree: (workspaceId: string, opts?: { path?: string; depth?: number }): Promise<FileNode[]> => {
      const qs = new URLSearchParams();
      if (opts?.path) qs.set('path', opts.path);
      if (opts?.depth != null) qs.set('depth', String(opts.depth));
      return http.get(`/api/chat/workspaces/${workspaceId}/tree${qs.size ? `?${qs}` : ''}`);
    },

    workspaceFileContent: (agentId: string, path: string): Promise<{ content: string; encoding: string }> =>
      http.get(`/api/chat/agents/${agentId}/workspace/content?path=${encodeURIComponent(path)}`),

    // Workspace CRUD
    listWorkspaces: (): Promise<ChatWorkspace[]> =>
      http.get('/api/chat/workspaces'),

    createWorkspace: (data: { name: string; agentIds?: string[] }): Promise<ChatWorkspace> =>
      http.post('/api/chat/workspaces', data),

    updateWorkspace: (id: string, data: { name?: string; agentIds?: string[] }): Promise<ChatWorkspace> =>
      http.put(`/api/chat/workspaces/${id}`, data),

    deleteWorkspace: (id: string): Promise<void> =>
      http.delete(`/api/chat/workspaces/${id}`),

    // Session CRUD
    listSessions: (workspaceId: string): Promise<ChatSession[]> =>
      http.get(`/api/chat/workspaces/${workspaceId}/sessions`),

    createSession: (workspaceId: string, agentId: string): Promise<ChatSession> =>
      http.post(`/api/chat/workspaces/${workspaceId}/sessions`, { agentId }),

    renameSession: (workspaceId: string, sessionId: string, title: string): Promise<ChatSession> =>
      http.put(`/api/chat/workspaces/${workspaceId}/sessions/${sessionId}`, { title }),

    updateSession: (workspaceId: string, sessionId: string, data: { title?: string; archived?: boolean }): Promise<ChatSession> =>
      http.patch(`/api/chat/workspaces/${workspaceId}/sessions/${sessionId}`, data),

    deleteSession: (workspaceId: string, sessionId: string): Promise<void> =>
      http.delete(`/api/chat/workspaces/${workspaceId}/sessions/${sessionId}`),

    // Session Messages
    listSessionMessages: (workspaceId: string, sessionId: string): Promise<ChatMessage[]> =>
      http.get(`/api/chat/sessions/${sessionId}/messages?workspaceId=${encodeURIComponent(workspaceId)}`),

    clearSessionMessages: (workspaceId: string, sessionId: string): Promise<void> =>
      http.delete(`/api/chat/sessions/${sessionId}/messages?workspaceId=${encodeURIComponent(workspaceId)}`),

    // Workspace State (tab persistence)
    getWorkspaceState: (workspaceId: string): Promise<{ openSessionTabIds: string[]; openFileTabs: Array<{ path: string; agentId: string }>; activeTab: { type: string; id: string } | null }> =>
      http.get(`/api/chat/workspaces/${workspaceId}/state`),

    saveWorkspaceState: (workspaceId: string, state: Record<string, unknown>): Promise<void> =>
      http.put(`/api/chat/workspaces/${workspaceId}/state`, state),
  };
}
