import React, { useEffect, useMemo, useCallback, useState } from 'react';

const cn = (...a) => a.filter(Boolean).join(' ');
const { ChevronRight } = (window.AgentSpacesUI || {});

/**
 * 从 HTML 内容中提取 h1-h3 标题层级。
 * 纯函数：仅做正则解析，无副作用。
 */
export function extractTocFromHtml(html) {
  const re = /<h([1-3])[^>]*>(.*?)<\/h\1>/gi;
  const headings = [];
  let m;
  while ((m = re.exec(html || '')) !== null) {
    const level = parseInt(m[1], 10);
    const text = m[2].replace(/<[^>]*>/g, '').trim();
    if (!text) continue;
    headings.push({ id: `toc-h-${headings.length}`, text, level });
  }
  return headings;
}

/**
 * 从 Markdown 内容中提取 #/##/### 标题层级。
 * 纯函数：仅做行匹配，无副作用。
 */
export function extractTocFromMarkdown(md) {
  const headings = [];
  let idx = 0;
  for (const line of String(md || '').split('\n')) {
    const m = line.match(/^(#{1,3})\s+(.+)$/);
    if (m) {
      headings.push({ id: `toc-h-${idx++}`, text: m[2].trim(), level: m[1].length });
    }
  }
  return headings;
}

/**
 * 目录侧栏。
 * props.items: [{ id, level, text }]
 * 点击标题滚动到编辑器内对应位置的标题元素。
 */
export function TableOfContents({ items = [] }) {
  const [activeId, setActiveId] = useState(null);

  const minLevel = useMemo(() => {
    if (items.length === 0) return 1;
    return Math.min(...items.map((h) => h.level));
  }, [items]);

  const scrollTo = useCallback((id) => {
    const panel = document.querySelector('[data-editor-content]');
    if (!panel) return;
    const allHeadings = panel.querySelectorAll('h1, h2, h3');
    const idx = parseInt(String(id).replace('toc-h-', ''), 10);
    if (allHeadings[idx]) {
      allHeadings[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(id);
    }
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    const panel = document.querySelector('[data-editor-content]');
    if (!panel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const tag = entry.target.tagName.toLowerCase();
            const level = parseInt(tag.replace('h', ''), 10);
            const allOfLevel = panel.querySelectorAll(tag);
            const idx = Array.from(allOfLevel).indexOf(entry.target);
            const globalIdx = items.findIndex((h) => h.level === level);
            if (globalIdx >= 0) {
              setActiveId(`toc-h-${globalIdx + idx}`);
            }
          }
        }
      },
      { root: panel, rootMargin: '0px 0px -80% 0px', threshold: 0.1 },
    );

    const els = panel.querySelectorAll('h1, h2, h3');
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border shrink-0 text-xs font-semibold text-muted-foreground">
        <span>目录</span>
        <span className="text-[10px] text-muted-foreground/60">{items.length}</span>
      </div>
      <div className="overflow-y-auto py-1.5 px-1 flex-1">
        {items.map((h) => {
          const indent = h.level - minLevel;
          const isActive = activeId === h.id;
          return (
            <button
              key={h.id}
              onClick={() => scrollTo(h.id)}
              className={cn(
                'w-full text-left px-2 py-1 rounded-md text-xs transition-all cursor-pointer flex items-center gap-1',
                isActive
                  ? 'text-foreground font-semibold bg-accent'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
              style={{ paddingLeft: `${8 + indent * 12}px` }}
            >
              {indent > 0 && ChevronRight ? <ChevronRight className="w-2.5 h-2.5 shrink-0 opacity-40" /> : null}
              <span className="truncate">{h.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
