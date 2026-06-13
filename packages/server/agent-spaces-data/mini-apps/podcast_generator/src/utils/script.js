// 播客脚本解析与截断

export const MAX_CONTENT_CHARS_PLACEHOLDER = '\n\n（原文过长，已截断）';

// agent_run 返回的脚本（每行 "角色：内容"）-> 对话行数组
export function parseScript(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf('：');
      if (idx === -1) return { role: '旁白', content: line };
      return { role: line.slice(0, idx).trim() || '旁白', content: line.slice(idx + 1).trim() };
    })
    .filter((it) => it.content);
}

export function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + MAX_CONTENT_CHARS_PLACEHOLDER : text;
}
