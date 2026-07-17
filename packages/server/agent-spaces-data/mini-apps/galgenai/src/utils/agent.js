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
  images, // [{path, httpPath, name}] 上传后的图片引用，可选
}) {
  const parts = [];

  parts.push('【角色设定 / System】');
  parts.push(systemInstruction || '');
  parts.push('');

  parts.push(`【用户称呼】用户名为：${userName || 'Master'}。`);
  parts.push('');

  if (Array.isArray(availableMotions) && availableMotions.length > 0) {
    // availableMotions 是 [{group,index,label}]，给 AI 看的是 label 列表
    const labels = availableMotions.map((m) => m.label).filter(Boolean);
    if (labels.length > 0) {
      parts.push('【动作控制 / Motion Control】');
      parts.push(
        `角色可使用的动作：${labels.join(', ')}。\n` +
          '若想让角色配合回复表演动作，请在回复最前面用方括号包裹动作名。\n' +
        '示例：[idle] 我在等你哦~\n' +
          '示例：[touch1] 呀！别戳我啦！\n' +
          '如果没有合适的动作，就直接正常回复。',
      );
      parts.push('');
    }
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

  // 图片附件：agent_run 无独立图片入参，runtime（Claude Code 类）有文件读取工具。
  // 把本地 path（首选，runtime 可直接 Read）和 httpPath（兜底，可 fetch）都写进 prompt。
  if (Array.isArray(images) && images.length > 0) {
    parts.push('');
    parts.push('【用户附带的图片】');
    parts.push('用户随消息发送了以下图片，请结合图片内容回复：');
    images.forEach((img, i) => {
      const lines = [`[图片${i + 1}] ${img.name || ''}`];
      if (img.path) lines.push(`本地路径（优先用此路径读取）：${img.path}`);
      if (img.httpPath) lines.push(`HTTP 地址（兜底）：${img.httpPath}`);
      parts.push(lines.join('\n'));
    });
  }

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
