import type { HttpClient } from '../client';
import type { AgentConfig, AgentUsageDashboard, AgentUsageFilterOptions, AgentUsageRecentQuery, AgentUsageRecentResult, AgentUsageSessionDetail } from '@agent-spaces/shared';

export function createAgentApi(http: HttpClient) {
  return {
    listPresets: (): Promise<AgentConfig[]> =>
      http.get('/api/agents/presets'),

    getPreset: (id: string): Promise<AgentConfig> =>
      http.get(`/api/agents/presets/${id}`),

    createPreset: (data: Partial<AgentConfig>): Promise<AgentConfig> =>
      http.post('/api/agents/presets', data),

    updatePreset: (id: string, data: Partial<AgentConfig>): Promise<AgentConfig> =>
      http.put(`/api/agents/presets/${id}`, data),

    deletePreset: (id: string): Promise<void> =>
      http.delete(`/api/agents/presets/${id}`),

    /** 用量仪表盘 */
    usageDashboard: (days = 30): Promise<AgentUsageDashboard> =>
      http.get(`/api/agents/usage/dashboard?days=${days}`),

    /** 过滤选项（model/status/role/runtime 去重列表） */
    usageOptions: (days = 30): Promise<AgentUsageFilterOptions> =>
      http.get(`/api/agents/usage/options?days=${days}`),

    /** recent 用量表格：后端过滤 + 分页 */
    recentUsage: (q: AgentUsageRecentQuery): Promise<AgentUsageRecentResult> =>
      http.post(`/api/agents/usage/recent`, q),

    /** 删除单条用量记录 */
    deleteUsageRecord: (recordId: string): Promise<void> =>
      http.delete(`/api/agents/usage/${recordId}`),

    /** 清空所有用量记录 */
    clearAllUsageRecords: (): Promise<{ deleted: number }> =>
      http.deleteOf(`/api/agents/usage`),

    sessionDetail: (agentSessionId: string): Promise<AgentUsageSessionDetail> =>
      http.get(`/api/agents/sessions/${agentSessionId}/detail`),

    /** Agent Designer — AI 生成 Agent 配置 */
    design: (prompt: string): Promise<Partial<AgentConfig>> =>
      http.post('/api/agents/design', { prompt }),

    /** Optimize an existing prompt */
    optimizePrompt: (prompt: string, currentPrompt?: string): Promise<{ systemPrompt?: string; error?: string }> =>
      http.post('/api/agents/presets/optimize-prompt', { prompt, currentPrompt }),

    /** Test agent connection */
    testConnection: (config: Record<string, unknown>): Promise<Record<string, unknown> & { error?: string }> =>
      http.post('/api/agents/presets/test-connection', config),

    /** Generate agent config from prompt */
    generateFromPrompt: (prompt: string): Promise<Record<string, unknown> & { error?: string }> =>
      http.post('/api/agents/presets/generate', { prompt }),
  };
}
