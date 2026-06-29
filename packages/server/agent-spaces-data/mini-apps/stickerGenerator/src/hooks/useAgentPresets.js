// 拉取 agent_run 可用的 Agent preset 列表（用于提示词生成/优化）
// 走 @agent-spaces/builtin 的 list_agent_presets 工具
export function useAgentPresets(enabled = true) {
  const AS = window.AgentSpaces;
  const [presets, setPresets] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const refresh = React.useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      const resp = await AS.callPluginTool('@agent-spaces/builtin', 'list_agent_presets', {});
      const list = resp?.presets || resp?.result?.presets || [];
      setPresets(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err?.message || String(err));
      setPresets([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  React.useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  return { presets, loading, error, refresh };
}
