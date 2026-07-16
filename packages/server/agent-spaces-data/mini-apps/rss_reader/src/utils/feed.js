// 把 feedsmith 各格式条目归一化为统一结构
// 输入：feed_fetch 返回的 data.feed.items[]（各格式字段差异较大）
// 输出：{ guid, title, link, author, pubDate, contentHtml, contentText }
export function normalizeItem(raw, feedTitle) {
  if (!raw || typeof raw !== 'object') return null;
  const guid =
    String(raw.id ?? raw.guid ?? raw.url ?? raw.link ?? '').trim() ||
    String(raw.title ?? '').trim() ||
    Math.random().toString(36).slice(2);
  const link =
    String(raw.link ?? raw.url ?? raw.id ?? '').trim() ||
    pickFirstHref(raw.links);
  const author = pickAuthor(raw);
  const pubDate = pickDate(raw);
  const contentHtml =
    String(raw.content ?? raw.content_html ?? raw.description ?? raw.summary ?? '').trim();
  const contentText = htmlToText(contentHtml) || String(raw.content_text ?? '').trim();
  return {
    guid,
    title: String(raw.title ?? '(无标题)').trim() || '(无标题)',
    link,
    author: author || feedTitle || '',
    pubDate,
    contentHtml,
    contentText,
  };
}

function pickFirstHref(links) {
  if (!Array.isArray(links)) return '';
  const alt = links.find((l) => l && (!l.rel || l.rel === 'alternate'));
  return (alt && alt.href) || (links[0] && links[0].href) || '';
}

function pickAuthor(raw) {
  const a = raw.author;
  if (typeof a === 'string') return a.trim();
  if (a && typeof a === 'object' && typeof a.name === 'string') return a.name.trim();
  if (Array.isArray(raw.authors)) {
    const names = raw.authors
      .map((x) => (typeof x === 'string' ? x : x && x.name))
      .filter(Boolean);
    if (names.length) return names.join('、');
  }
  if (typeof raw['dc:creator'] === 'string') return raw['dc:creator'].trim();
  return '';
}

function pickDate(raw) {
  const v =
    raw.pubDate ?? raw.published ?? raw.date_published ?? raw.updated ?? raw.date_modified;
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

// 与 podcast_generator 同款轻量 HTML→文本
export function htmlToText(html) {
  if (!html) return '';
  let s = String(html);
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<\/(p|div|section|article|li|h[1-6]|br|tr)>/gi, '\n');
  s = s.replace(/<br\s*\/?>(?=>)/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  const ta = (typeof document !== 'undefined') ? document.createElement('textarea') : null;
  if (ta) {
    ta.innerHTML = s;
    s = ta.value;
  } else {
    s = s
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');
  }
  return s.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// 文章指纹去重 key：优先 guid，回退 link，再回退 title
export function articleKey(item) {
  return item.guid || item.link || item.title;
}

// 合并新老文章：按 articleKey 去重，新的在前
export function mergeArticles(oldList, fresh, feedId) {
  const map = new Map();
  for (const a of oldList) map.set(articleKey(a), a);
  const out = [];
  for (const f of fresh) {
    const key = articleKey(f);
    if (map.has(key)) {
      // 已存在：保留 favorite/summary/readAt 等用户态，刷新基础字段
      const prev = map.get(key);
      out.push({ ...prev, ...f, feedId });
    } else {
      out.push({ ...f, feedId });
      map.set(key, true);
    }
  }
  // 追加老文章中未出现在本次 fresh 的（按时间排序在前文之后）
  for (const a of oldList) {
    if (!map.has(articleKey(a))) out.push(a);
  }
  return out;
}
