// 把 AI 回复拆成 { think, content }：
// - think: <think>...</think> 里的内容（去掉标签），可能为空
// - content: 去掉 think 段后的正文
// 兼容多个 think 段、跨行、未闭合（兜底取到串尾）。
export function splitThink(text) {
  const raw = typeof text === 'string' ? text : '';
  if (!raw) return { think: '', content: '' };
  const thinkParts = [];
  // 优先匹配成对的 <think>...</think>（[\s\S] 跨行，非贪婪）
  let remaining = raw.replace(/<think>([\s\S]*?)<\/think>/gi, (_, inner) => {
    thinkParts.push(inner.trim());
    return '';
  });
  // 兜底：未闭合的 <think>，取到串尾
  const openMatch = remaining.match(/<think>([\s\S]*)$/i);
  if (openMatch) {
    thinkParts.push(openMatch[1].replace(/<\/think>$/i, '').trim());
    remaining = remaining.replace(/<think>([\s\S]*)$/i, '');
  }
  return {
    think: thinkParts.filter(Boolean).join('\n\n'),
    content: remaining.trim(),
  };
}

// 归一化 label：小写 + 去分隔符，容忍 AI 输出 TapBody / tap_body / tap-body 等变体
const normLabel = (s) => String(s).toLowerCase().replace(/[-_\s]+/g, '');

// 从 AI 回复里提取所有动作标签 [xxx]，返回 { motions, content }：
// - motions: 匹配到 availableMotions 的 label 列表（按出现顺序、去重）
// - content: 去掉所有「已识别」动作标签后的文本；未识别的方括号保留（避免误删正常文本）
// availableMotions 支持字符串数组或 [{label}] 项数组。
export function extractMotions(text, availableMotions = []) {
  const raw = typeof text === 'string' ? text : '';
  if (!raw) return { motions: [], content: raw };
  const labels = (Array.isArray(availableMotions) ? availableMotions : [])
    .map((m) => (typeof m === 'string' ? m : m?.label))
    .filter(Boolean);
  if (labels.length === 0) return { motions: [], content: raw };

  const normalized = labels.map((l) => ({ label: l, key: normLabel(l) }));
  const found = [];

  const stripped = raw.replace(/\[([^\]\n]+)\]/g, (full, inner) => {
    const key = normLabel(inner.trim());
    if (!key) return full;
    // 精确匹配（归一化后），避免短 label 误伤正常方括号文本
    const matched = normalized.find((l) => l.key === key);
    if (matched) {
      if (!found.includes(matched.label)) found.push(matched.label);
      return ''; // 删除已识别的动作标签
    }
    return full; // 未识别，原样保留
  });

  // 清理删除后留下的多余空白（首尾空白、连续空格、连续空行）
  const content = stripped
    .replace(/^[ \t]*\n+/, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { motions: found, content };
}

