// 新增节点 tab：可点击添加、可拖拽到画布；可执行节点 hover 右上角 ⚡ 直接执行。
// 顶部搜索框（支持拼音/首字母）+ 分类筛选 + 列表按分组展示（每组标题 + 计数 + 卡片网格，按容器宽度自适应列数）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollArea, Plus, Zap } from '@agent-spaces/ui';
import { NODE_META } from '../../utils/constants';
import { matchNode, SearchBar } from './search';
import {
  NODE_CATEGORIES, ADD_ITEMS, EXECUTABLE_TYPES,
  MIN_CARD_WIDTH, MIN_COLS, MAX_COLS,
} from './constants';

export default function AddNodeTab({ onAdd, onDragStartNode, onExecute }) {
  const [activeCat, setActiveCat] = useState('all');
  const [query, setQuery] = useState('');
  const scrollRef = useRef(null);
  const [cols, setCols] = useState(MIN_COLS);

  // 响应式：按容器宽度推算列数
  useEffect(() => {
    const el = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]') || scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const w = el.clientWidth;
      const n = Math.floor(w / MIN_CARD_WIDTH);
      setCols(Math.min(MAX_COLS, Math.max(MIN_COLS, n)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 按 NODE_CATEGORIES 顺序把 ADD_ITEMS 分组（category 是单一数据源）。
  const groupedItems = useMemo(() => {
    const map = new Map();
    for (const it of ADD_ITEMS) {
      if (!map.has(it.category)) map.set(it.category, []);
      map.get(it.category).push(it);
    }
    return NODE_CATEGORIES
      .filter((c) => c.id !== 'all') // 'all' 是 chips，不作为分组标题
      .map((c) => ({ ...c, items: map.get(c.id) || [] }))
      .filter((g) => g.items.length > 0);
  }, []);

  // 选「全部」→ 所有分组；选某分类 → 只显示该分组。
  // 命中搜索时强制展开所有分组（跨分类查到结果，否则用户只看到当前 chip 分类下被过滤的子集，体验差）。
  const hasQuery = query.trim().length > 0;
  const visibleGroups = useMemo(() => {
    if (hasQuery) {
      return groupedItems
        .map((g) => ({ ...g, items: g.items.filter((it) => matchNode(it, query)) }))
        .filter((g) => g.items.length > 0);
    }
    if (activeCat === 'all') return groupedItems;
    return groupedItems.filter((g) => g.id === activeCat);
  }, [activeCat, groupedItems, hasQuery, query]);

  const totalVisible = useMemo(
    () => visibleGroups.reduce((n, g) => n + g.items.length, 0),
    [visibleGroups],
  );

  return (
    <div ref={scrollRef} className="flex h-full min-h-0 flex-col">
      {/* 搜索框（支持拼音/首字母，例如 wzsctp 命中「文字生成图片」） */}
      <SearchBar value={query} onChange={setQuery} placeholder="搜索节点（支持拼音）" />

      {/* 分类筛选 chips（搜索时隐藏，让结果跨分类展示） */}
      {!hasQuery && (
        <div className="flex flex-wrap gap-1 border-b border-border p-2">
          {NODE_CATEGORIES.map((c) => {
            const active = activeCat === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCat(c.id)}
                className={
                  'rounded-full px-2.5 py-1 text-[11px] font-medium transition ' +
                  (active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground')
                }
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          {visibleGroups.map((g) => (
            <div key={g.id} className="mb-4 last:mb-0">
              {/* 分组标题 + 计数 */}
              <div className="mb-2 flex items-center gap-1.5 border-b border-border/50 px-0.5 pb-1">
                <span className="text-xs font-semibold text-foreground">{g.label}</span>
                <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{g.items.length}</span>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {g.items.map((it) => (
                  <AddNodeCard
                    key={it.type}
                    item={it}
                    onAdd={onAdd}
                    onExecute={onExecute}
                    onDragStartNode={onDragStartNode}
                  />
                ))}
              </div>
            </div>
          ))}
          {totalVisible === 0 && (
            <p className="px-2 py-8 text-center text-xs text-muted-foreground">
              {hasQuery ? '未找到匹配节点' : '该分类暂无节点'}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// 单个新增节点卡片：每卡自管 hover（取代全局 hoverType），交互逻辑不变。
function AddNodeCard({ item, onAdd, onExecute, onDragStartNode }) {
  const [hovered, setHovered] = useState(false);
  const meta = NODE_META[item.type];
  const executable = EXECUTABLE_TYPES.has(item.type);
  return (
    <div
      className="relative flex flex-col gap-1 rounded-lg border border-border bg-background p-2.5 transition hover:border-primary/60 hover:shadow-sm"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 左上角：添加到画布 */}
      <button
        type="button"
        onClick={() => onAdd?.(item.type)}
        title="添加到画布"
        className="absolute left-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-muted/60 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      {/* 右上角：可执行节点 hover 显示 ⚡，直接执行（不进画布） */}
      {executable && (
        <button
          type="button"
          onClick={() => onExecute?.(item.type)}
          title="直接执行（不创建画布节点）"
          className={
            'absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary transition hover:bg-primary/20 ' +
            (hovered ? 'opacity-100' : 'opacity-0')
          }
        >
          <Zap className="h-3.5 w-3.5" />
        </button>
      )}
      {/* 主体：拖拽手柄，点击不加节点 */}
      <div
        draggable
        onDragStart={(e) => onDragStartNode?.(item.type, e)}
        className="flex flex-1 cursor-grab flex-col items-center gap-1.5 pt-1 outline-none active:cursor-grabbing"
      >
        <span
          className="flex h-9 w-9 items-center justify-center rounded-md text-lg"
          style={{ backgroundColor: `${meta.color}1a` }}
        >
          {meta.icon}
        </span>
        <span className="text-center text-xs font-medium leading-tight">{item.label}</span>
      </div>
    </div>
  );
}
