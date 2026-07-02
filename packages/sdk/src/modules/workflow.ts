import type { HttpClient } from '../client';
import type { WorkflowTemplate, WorkflowNode, WorkflowFolder, WorkflowVersion, ExecutionLog, OperationEntry, StagedNode, WorkflowEdge, WorkflowAgentChatMessage } from '@agent-spaces/shared';

// Re-export from shared for convenience
export type { OperationEntry, StagedNode };

export function createWorkflowApi(http: HttpClient) {
  return {
    // ---- Workflow CRUD ----
    list: (folderId?: string | null): Promise<WorkflowTemplate[]> =>
      http.get(`/api/workflows${folderId ? `?folderId=${folderId}` : ''}`),

    get: (id: string): Promise<WorkflowTemplate> =>
      http.get(`/api/workflows/${id}`),

    getPath: (id: string): Promise<{ path: string }> =>
      http.get(`/api/workflows/${id}/path`),

    create: (data: Partial<WorkflowTemplate>): Promise<WorkflowTemplate> =>
      http.post('/api/workflows', data),

    update: (id: string, data: Partial<WorkflowTemplate>): Promise<WorkflowTemplate> =>
      http.put(`/api/workflows/${id}`, data),

    delete_: (id: string): Promise<void> =>
      http.delete(`/api/workflows/${id}`),

    duplicate: (id: string): Promise<WorkflowTemplate> =>
      http.post(`/api/workflows/${id}/duplicate`),

    recordOpen: (id: string): Promise<WorkflowTemplate> =>
      http.post(`/api/workflows/${id}/open`),

    execute: (workflowId: string, body?: { input?: Record<string, unknown>; snapshot?: { nodes: WorkflowNode[]; edges: WorkflowTemplate['edges']; groups?: WorkflowTemplate['groups'] }; startNodeId?: string }): Promise<Response> =>
      http.sse(`/api/workflows/${workflowId}/execute`, body),

    // ---- Folders ----
    listFolders: (): Promise<WorkflowFolder[]> =>
      http.get('/api/workflows/folders'),

    createFolder: (data: Partial<WorkflowFolder>): Promise<WorkflowFolder> =>
      http.post('/api/workflows/folders', data),

    updateFolder: (id: string, data: Partial<WorkflowFolder>): Promise<WorkflowFolder> =>
      http.put(`/api/workflows/folders/${id}`, data),

    deleteFolder: (id: string): Promise<void> =>
      http.delete(`/api/workflows/folders/${id}`),

    // ---- Versions ----
    listVersions: (workflowId: string): Promise<WorkflowVersion[]> =>
      http.get(`/api/workflows/${workflowId}/versions`),

    addVersion: (workflowId: string, data: { name: string; nodes: WorkflowNode[]; edges: WorkflowEdge[] }): Promise<WorkflowVersion> =>
      http.post(`/api/workflows/${workflowId}/versions`, data),

    getVersion: (workflowId: string, versionId: string): Promise<WorkflowVersion> =>
      http.get(`/api/workflows/${workflowId}/versions/${versionId}`),

    deleteVersion: (workflowId: string, versionId: string): Promise<void> =>
      http.delete(`/api/workflows/${workflowId}/versions/${versionId}`),

    clearVersions: (workflowId: string): Promise<void> =>
      http.delete(`/api/workflows/${workflowId}/versions`),

    // ---- Execution Logs ----
    listAllExecutionLogs: (limit = 50): Promise<(ExecutionLog & { workflowName?: string })[]> =>
      http.get(`/api/workflows/execution-logs/all?limit=${limit}`),

    listExecutionLogs: (workflowId: string): Promise<ExecutionLog[]> =>
      http.get(`/api/workflows/${workflowId}/execution-logs`),

    getExecutionLog: (workflowId: string, logId: string): Promise<ExecutionLog> =>
      http.get(`/api/workflows/${workflowId}/execution-logs/${logId}`),

    getExecutionLogPath: (workflowId: string, logId: string): Promise<{ path: string }> =>
      http.get(`/api/workflows/${workflowId}/execution-logs/${logId}/path`),

    deleteExecutionLog: (workflowId: string, logId: string): Promise<void> =>
      http.delete(`/api/workflows/${workflowId}/execution-logs/${logId}`),

    clearExecutionLogs: (workflowId: string): Promise<void> =>
      http.delete(`/api/workflows/${workflowId}/execution-logs`),

    // ---- Operation History ----
    loadOperationHistory: (workflowId: string): Promise<OperationEntry[]> =>
      http.get(`/api/workflows/${workflowId}/operation-history`),

    saveOperationHistory: (workflowId: string, entries: OperationEntry[]): Promise<void> =>
      http.putVoid(`/api/workflows/${workflowId}/operation-history`, { entries }),

    clearOperationHistory: (workflowId: string): Promise<void> =>
      http.delete(`/api/workflows/${workflowId}/operation-history`),

    // ---- Staging ----
    loadStaging: (workflowId: string): Promise<StagedNode[]> =>
      http.get(`/api/workflows/${workflowId}/staging`),

    saveStaging: (workflowId: string, nodes: StagedNode[]): Promise<void> =>
      http.putVoid(`/api/workflows/${workflowId}/staging`, { nodes }),

    clearStaging: (workflowId: string): Promise<void> =>
      http.delete(`/api/workflows/${workflowId}/staging`),

    // ---- Workflow Agent Chat ----
    loadChat: (workflowId: string): Promise<WorkflowAgentChatMessage[]> =>
      http.get(`/api/workflows/${workflowId}/chat`),

    saveChat: (workflowId: string, messages: WorkflowAgentChatMessage[]): Promise<void> =>
      http.putVoid(`/api/workflows/${workflowId}/chat`, { messages }),

    clearChat: (workflowId: string): Promise<void> =>
      http.delete(`/api/workflows/${workflowId}/chat`),
  };
}
