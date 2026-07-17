// 替代原 services/geminiService.ts。
// 不再直连 Gemini，改走宿主内置工具 agent_run（@agent-spaces/builtin）。
//
// 关键差异：agent_run 没有原生 history/systemInstruction/temperature 参数，
// 这些都通过 prompt 拼装注入（把最近若干条历史 + 人设 + 动作标签规则合成一个 prompt）。

import { BUILTIN_PLUGIN } from './constants';

// 拉取可用 agent preset（模型配置）列表
export async function listAgentPresets() {
  const resp = await window.AgentSpaces.callPluginTool(BUILTIN_PLUGIN, 'list_agent_presets', {});
  const data = resp?.result || resp;
  return Array.isArray(data?.presets) ? data.presets : [];
}

// 构造给 agent_run 的完整 prompt：人设 + 历史上下文 + 动作规则 + 用户名 + 本次输入
export function buildAgentPrompt({
  systemInstruction,
  userName,
  history, // [{role:'user'|'model', content}]
  userInput,
  availableMotions,
}) {
  const parts = [];

  parts.push('【角色设定 / System】');
  parts.push(systemInstruction || '');
  parts.push('');

  parts.push(`【用户称呼】用户名为：${userName || 'Master'}。`);
  parts.push('');

  if (Array.isArray(availableMotions) && availableMotions.length > 0) {
    parts.push('【动作控制 / Motion Control】');
    parts.push(
      `角色可使用的动作组：${availableMotions.join(', ')}。\n` +
        '若想让角色配合回复表演动作，请在回复最前面用方括号包裹动作组名。\n' +
        '示例：[TapBody] That tickles!\n' +
        '示例：[Idle] I am waiting...\n' +
        '如果没有合适的动作，就直接正常回复。',
    );
    parts.push('');
  }

  parts.push('【输出要求】使用纯文本，不要使用 markdown 语法（如 **加粗**、# 标题）。回复尽量简短。');
  parts.push('');

  if (Array.isArray(history) && history.length > 0) {
    parts.push('【对话历史】');
    // 只取最近 10 条，省 token
    const recent = history.slice(-10);
    for (const m of recent) {
      const who = m.role === 'user' ? '用户' : '角色';
      parts.push(`${who}：${m.content}`);
    }
    parts.push('');
  }

  parts.push('【本次用户输入】');
  parts.push(userInput || '');

  return parts.join('\n');
}

// 运行 agent；返回 AI 回复文本。
// agentConfigId 必填（来自 listAgentPresets）。
export async function runAgent({ agentConfigId, prompt, permissionMode = 'dontAsk' }) {
  if (!agentConfigId) throw new Error('未选择 AI 预设（agentConfigId）');
  const resp = await window.AgentSpaces.callPluginTool(
    BUILTIN_PLUGIN,
    'agent_run',
    { agentConfigId, prompt, permissionMode },
  );
  const data = resp?.result || resp;
  // agent_run 输出契约：{ result: string }
  const text = data?.result ?? data?.data?.result ?? (typeof data === 'string' ? data : '');
  return text || '...';
}
