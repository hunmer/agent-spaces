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
  // 子贴纸内容一键生成的独立 busy 态
  const [itemsBusy, setItemsBusy] = React.useState(false);

  const hasAgent = Boolean(settings?.agentConfigId || presets.length > 0);

  // 调用 agent_run 跑一段任务，返回纯文本结果
  const runAgent = async (prompt, agentConfigId) => {
    setBusy(true);
    setError('');
    try {
      const resp = await AS.callPluginTool('@agent-spaces/builtin', 'agent_run', {
        prompt,
        agentConfigId,
        permissionMode: 'dontAsk',
      });
      const text = resp?.result?.result || resp?.result || '';
      const raw = typeof text === 'string' ? text : JSON.stringify(text);
      // 过滤 AI 回复中的 <think>...</think>（含未闭合的残留标签）
      return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '');
    } catch (err) {
      throw new Error(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  // 生成 3 条贴纸提示词（输入框右下角助手）
  const run = async (overrideTopic) => {
    setError('');
    const t = String(overrideTopic ?? topic ?? currentPrompt ?? '').trim();
    if (!t) { setError('请先输入主题或提示词'); return; }
    const agentConfigId = settings?.agentConfigId || presets[0]?.id;
    if (!agentConfigId) { setError('未配置 Agent，请点击右上角「设置」配置。'); return; }
    setResult('正在生成贴图提示词...');
    try {
      const text = await runAgent(
        `请根据以下主题，生成 3 条适合制作贴纸(sticker)的英文提示词，每条一行，简洁有画面感，强调主体、风格、表情和构图。主题：「${t}」`,
        agentConfigId,
      );
      setResult(text);
    } catch (err) {
      setResult('');
      setError(`生成失败：${err?.message || err}`);
    }
  };

  // 一键生成 N 个子贴纸内容：根据主提示词，让 AI 拆出 count 个不同主体
  // 返回 string[]（已去空、去编号）；失败返回 [] 并设置 error
  const generateCollectionItems = async (mainPrompt, count) => {
    const topic = String(mainPrompt || currentPrompt || '').trim();
    if (!topic) { setError('请先输入上方主提示词'); return []; }
    const agentConfigId = settings?.agentConfigId || presets[0]?.id;
    if (!agentConfigId) { setError('未配置 Agent，请点击右上角「设置」配置。'); return []; }
    setItemsBusy(true);
    setError('');
    try {
      const text = await runAgent(
        `请围绕主题「${topic}」，构思 ${count} 个适合做成贴纸的不同主体，每个主体用简短中文/英文词组描述，每行一个，不要序号、不要解释、不要 markdown。`,
        agentConfigId,
      );
      const items = String(text || '')
        .split('\n')
        .map((line) => line.replace(/^[\d\.\)、\-\*\s]+/, '').trim()) // 去掉序号/前缀符号
        .filter(Boolean)
        .slice(0, count);
      if (!items.length) setError('AI 未返回有效的子贴纸内容');
      return items;
    } catch (err) {
      setError(`生成失败：${err?.message || err}`);
      return [];
    } finally {
      setItemsBusy(false);
    }
  };

  const reset = () => { setResult(''); setError(''); setTopic(''); };

  return {
    open, setOpen,
    busy, topic, setTopic, result, error,
    presetsLoading, hasAgent,
    run, reset,
    itemsBusy, generateCollectionItems,
  };
}
