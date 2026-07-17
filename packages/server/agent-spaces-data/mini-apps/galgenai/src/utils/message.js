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
