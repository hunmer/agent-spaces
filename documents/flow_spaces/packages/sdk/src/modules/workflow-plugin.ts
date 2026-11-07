import type { HttpClient } from '../client';
import type { PluginMeta, NodeTypeDefinition, PluginWorkflowNodesResult, PluginConfigSaveResult } from '@agent-spaces/shared';

export function createWorkflowPluginApi(http: HttpClient) {
  return {
    listAll: (query = ''): Promise<PluginMeta[]> =>
      http.get(`/api/plugins${query}`),

    listWorkflow: (query = ''): Promise<PluginMeta[]> =>
      http.get(`/api/plugins/workflow${query}`),

    enable: (pluginId: string): Promise<PluginMeta> =>
      http.post(`/api/plugins/${encodeURIComponent(pluginId)}/enable`),

    disable: (pluginId: string): Promise<PluginMeta> =>
      http.post(`/api/plugins/${encodeURIComponent(pluginId)}/disable`),

    uninstall: (pluginId: string): Promise<{ success: boolean }> =>
      http.deleteOf<{ success: boolean }>(`/api/plugins/${encodeURIComponent(pluginId)}`),

    installFromStore: (pluginId: string, sourceUrl?: string, md5?: string, files?: string[]): Promise<PluginMeta> =>
      http.post(`/api/plugins/store/${encodeURIComponent(pluginId)}/install`, { sourceUrl, md5, files }),

    getWorkflowNodes: (pluginId: string, query = ''): Promise<NodeTypeDefinition[]> =>
      http.get<PluginWorkflowNodesResult>(`/api/plugins/${encodeURIComponent(pluginId)}/workflow-nodes${query}`)
        .then(data => Array.isArray(data?.nodes) ? data.nodes : []),

    getConfig: (pluginId: string): Promise<Record<string, string>> =>
      http.get(`/api/plugins/${encodeURIComponent(pluginId)}/config`),

    saveConfig: (pluginId: string, data: Record<string, string>): Promise<PluginConfigSaveResult> =>
      http.put(`/api/plugins/${encodeURIComponent(pluginId)}/config`, data),

    listConfigSchemes: (pluginId: string): Promise<string[]> =>
      http.get(`/api/plugins/${encodeURIComponent(pluginId)}/config-schemes`),

    createConfigScheme: (pluginId: string, schemeName: string): Promise<void> =>
      http.postVoid(`/api/plugins/${encodeURIComponent(pluginId)}/config-schemes/${encodeURIComponent(schemeName)}`),

    readConfigScheme: (pluginId: string, schemeName: string): Promise<Record<string, string>> =>
      http.get(`/api/plugins/${encodeURIComponent(pluginId)}/config-schemes/${encodeURIComponent(schemeName)}`),

    saveConfigScheme: (pluginId: string, schemeName: string, data: Record<string, string>): Promise<void> =>
      http.putVoid(`/api/plugins/${encodeURIComponent(pluginId)}/config-schemes/${encodeURIComponent(schemeName)}`, data),

    deleteConfigScheme: (pluginId: string, schemeName: string): Promise<void> =>
      http.delete(`/api/plugins/${encodeURIComponent(pluginId)}/config-schemes/${encodeURIComponent(schemeName)}`),

    // ---- Plugin Schemes ----
    listSchemes: (workflowId: string, pluginId: string): Promise<string[]> =>
      http.get(`/api/workflows/${encodeURIComponent(workflowId)}/plugin-schemes/${encodeURIComponent(pluginId)}`),

    createScheme: (workflowId: string, pluginId: string, schemeName: string): Promise<void> =>
      http.postVoid(`/api/workflows/${encodeURIComponent(workflowId)}/plugin-schemes/${encodeURIComponent(pluginId)}/${encodeURIComponent(schemeName)}`),

    readScheme: (workflowId: string, pluginId: string, schemeName: string): Promise<Record<string, string>> =>
      http.get(`/api/workflows/${encodeURIComponent(workflowId)}/plugin-schemes/${encodeURIComponent(pluginId)}/${encodeURIComponent(schemeName)}`),

    saveScheme: (workflowId: string, pluginId: string, schemeName: string, data: Record<string, string>): Promise<void> =>
      http.putVoid(`/api/workflows/${encodeURIComponent(workflowId)}/plugin-schemes/${encodeURIComponent(pluginId)}/${encodeURIComponent(schemeName)}`, data),

    deleteScheme: (workflowId: string, pluginId: string, schemeName: string): Promise<void> =>
      http.delete(`/api/workflows/${encodeURIComponent(workflowId)}/plugin-schemes/${encodeURIComponent(pluginId)}/${encodeURIComponent(schemeName)}`),
  };
}
