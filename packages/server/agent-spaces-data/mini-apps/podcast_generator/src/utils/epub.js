// epub 相关纯函数：href 规范化、toc→spine label 映射、html→纯文本

function normalizeHref(href) {
  if (!href) return '';
  return String(href).split('#')[0];
}

// 扁平化 toc 树，建立 href -> label 映射（同 href 只取首个）
function buildTocLabelMap(toc) {
  const map = new Map();
  const walk = (items) => {
    if (!Array.isArray(items)) return;
    items.forEach((it) => {
      const href = normalizeHref(it?.href);
      if (href && it?.label && !map.has(href)) map.set(href, it.label);
      if (it?.children?.length) walk(it.children);
    });
  };
  walk(toc);
  return map;
}

// 由 spine + toc 推导可读章节列表
export function deriveChapters(spine, toc) {
  if (!Array.isArray(spine) || !spine.length) return [];
  const labelMap = buildTocLabelMap(toc);
  return spine.map((item, i) => ({
    index: i,
    id: item.id,
    label: labelMap.get(normalizeHref(item.href)) || `第 ${i + 1} 章`,
  }));
}

// epub 章节 html -> 纯文本（剥 style/script、块级标签转换行、解码实体）
export function htmlToText(html) {
  if (!html) return '';
  const clean = String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|br|tr|section|article|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const stripped = clean.replace(/<[^>]+>/g, ' ');
  const el = document.createElement('textarea');
  el.innerHTML = stripped;
  return el.value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
