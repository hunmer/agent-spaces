// 提示词 AI 助手：调用 agent_run 生成贴图提示词
// 优先用 settings.agentConfigId，否则用 list_agent_presets 兜底
import { useAgentPresets } from './useAgentPresets';

export function usePromptAgent({ settings, currentPrompt }) {
  const AS = window.AgentSpaces;
  const { presets, loading: presetsLoading } = useAgentPresets(!settings?.agentConfigId);

  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [topic, setTopic] = React.useState('');
  const [result, setResult] = React.useState('');
  const [error, setError] = React.useState('');

  const hasAgent = Boolean(settings?.agentConfigId || presets.length > 0);

  const run = async (overrideTopic) => {
    setError('');
    const t = String(overrideTopic ?? topic ?? currentPrompt ?? '').trim();
    if (!t) { setError('请先输入主题或提示词'); return; }
    const agentConfigId = settings?.agentConfigId || presets[0]?.id;
    if (!agentConfigId) { setError('未配置 Agent，请点击右上角「设置」配置。'); return; }
    setBusy(true);
    setResult('正在生成贴图提示词...');
    try {
      const resp = await AS.callPluginTool('@agent-spaces/builtin', 'agent_run', {
        prompt: `请根据以下主题，生成 3 条适合制作贴纸(sticker)的英文提示词，每条一行，简洁有画面感，强调主体、风格、表情和构图。主题：「${t}」`,
        agentConfigId,
        permissionMode: 'dontAsk',
      });
      const text = resp?.result?.result || resp?.result || '';
      setResult(typeof text === 'string' ? text : JSON.stringify(text));
    } catch (err) {
      setResult('');
      setError(`生成失败：${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setResult(''); setError(''); setTopic(''); };

  return {
    open, setOpen,
    busy, topic, setTopic, result, error,
    presetsLoading, hasAgent,
    run, reset,
  };
}
