// AI 对话封装：list_agent_presets + agent_run。
export async function listPresets() {
  const resp = await window.AgentSpaces.callPluginTool('@agent-spaces/builtin', 'list_agent_presets', {});
  const data = resp?.result || resp;
  return data?.presets || [];
}

export async function runAgent({ agentConfigId, prompt, taskId, meta }) {
  const resp = await window.AgentSpaces.callPluginTool(
    '@agent-spaces/builtin',
    'agent_run',
    { agentConfigId, prompt, permissionMode: 'dontAsk' },
    taskId ? { taskId, meta } : undefined,
  );
  const data = resp?.result || resp;
  return data?.result || data;
}
