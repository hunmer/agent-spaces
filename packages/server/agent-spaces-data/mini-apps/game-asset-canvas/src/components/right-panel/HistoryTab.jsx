// 生成记录 tab：历史卡片列表 + 分类筛选 + 拼音搜索 + 视图切换（列表/瀑布流）。
// 卡片支持拖拽建节点（拖标题）/拖图片到画布（拖缩略图）/插入到画布/添加到素材库。
// 瀑布流视图：把所有记录的图片展平成缩略图网格，按真实宽高比错落排布，悬浮显示精简按钮 + 右键全量菜单。
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  openMediaGallery, toast, ScrollArea, FolderPlus, CopyPlus,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator,
  Masonry,
} from '@agent-spaces/ui';
import {
  List, LayoutGrid, Send, Maximize2, ClipboardCopy, Trash2, Crosshair,
  ArrowDownWideNarrow, RotateCcw, Checkbox,
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@agent-spaces/ui';
import { NODE_META } from '../../utils/constants';
import { CANVAS_DROP_MIME } from '../../utils/canvas-constants';
import { matchText, SearchBar } from './search';
import { NODE_CATEGORIES, ADD_ITEMS } from './constants';
import ImageHoverCard from '../ImageHoverCard';
import useSettings from '../../hooks/useSettings';

// 图片尺寸缓存（模块级，跨 HistoryTab 实例复用，避免来回切视图/切 tab 反复 new Image 重测）。
// url → "w:h"。仅内存，不持久化；同一会话内有效。
const sizeCache = new Map();

// 定位高亮样式：一次性注入（focusNodeId 触发 scrollIntoView + 短暂 ring 高亮）。
let _highlightStyleInjected = false;
function ensureHighlightStyle() {
  if (_highlightStyleInjected || typeof document === 'undefined') return;
  _highlightStyleInjected = true;
  const style = document.createElement('style');
  style.textContent = '.history-item-highlight{box-shadow:0 0 0 2px var(--primary, #3b82f6);transition:box-shadow .2s ease}';
  document.head.appendChild(style);
}

export default function HistoryTab({
  history, groups, onRemoveHistory, onClearHistory, onRestoreFromNodes, onUseImage,
  onInsertHistory, onDragStartHistory, onAddToAssets,
  onLocateNode, focusNodeId,
}) {
  const [activeCat, setActiveCat] = useState('all');
  const [activeGroup, setActiveGroup] = useState('all');
  const [query, setQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  // 清空记录时是否同时重置画布节点产出（默认勾选，保持原强绑定行为）
  const [clearAlsoResetNodes, setClearAlsoResetNodes] = useState(true);
  const [confirmRestore, setConfirmRestore] = useState(false);
  // viewMode 持久化到 settings（刷新后保留）。useSettings 是单例订阅，可被任意组件重复调用。
  const { settings, saveSettings } = useSettings();
  const viewMode = settings.historyViewMode === 'masonry' ? 'masonry' : 'list';
  const handleViewModeChange = (mode) => {
    // saveSettings 是整体覆盖，需把现有 settings 全部带上避免丢字段（参考 Canvas.handleCanvasStyleChange）
    saveSettings({ ...settings, historyViewMode: mode });
  };
  // 排序：'desc'（最新在前，默认）/ 'asc'（最旧在前），持久化到 settings。
  const sortOrder = settings.historySortOrder === 'asc' ? 'asc' : 'desc';
  const handleSortOrderChange = () => {
    saveSettings({ ...settings, historySortOrder: sortOrder === 'desc' ? 'asc' : 'desc' });
  };
  // nodeType → category 映射（ADD_ITEMS 是单一数据源）
  const typeToCat = useMemo(() => {
    const m = new Map();
    for (const it of ADD_ITEMS) m.set(it.type, it.category);
    return m;
  }, []);
  // nodeId → groupName 映射（节点归属分组；分组可嵌套，按 childNodeIds 反查顶层 group 名）。
  // 用于生成记录按分组过滤：history 通过 nodeId 反查所属 group。
  const nodeToGroupName = useMemo(() => {
    const m = new Map();
    for (const g of groups || []) {
      for (const nid of g.childNodeIds || []) m.set(nid, g.name || '未命名分组');
    }
    return m;
  }, [groups]);
  // 动态分类 chips：基于历史记录里实际出现过的 nodeType 推导 category，避免列空分类。
  // 同时统计每类记录数，用于 chips 计数显示。
  const cats = useMemo(() => {
    const seen = new Set();
    const counts = new Map();
    counts.set('all', history.length);
    for (const it of history) {
      const cat = typeToCat.get(it.nodeType);
      if (cat) {
        seen.add(cat);
        counts.set(cat, (counts.get(cat) || 0) + 1);
      }
    }
    return NODE_CATEGORIES
      .filter((c) => c.id === 'all' || seen.has(c.id))
      .map((c) => ({ ...c, count: counts.get(c.id) || 0 }));
  }, [history, typeToCat]);
  // 动态分组 chips：基于历史记录里实际出现过的 nodeName→groupName 反查，统计每组记录数。
  // 「未分组」收集 nodeId 为 null 或不在任何 group 的记录。
  const groupChips = useMemo(() => {
    const counts = new Map(); // groupName → count
    let ungrouped = 0;
    for (const it of history) {
      const gname = it.nodeId ? nodeToGroupName.get(it.nodeId) : undefined;
      if (gname) counts.set(gname, (counts.get(gname) || 0) + 1);
      else ungrouped += 1;
    }
    const chips = Array.from(counts.entries()).map(([name, count]) => ({ id: name, label: name, count }));
    if (ungrouped > 0) chips.push({ id: '__ungrouped__', label: '未分组', count: ungrouped });
    return chips;
  }, [history, nodeToGroupName]);
  // 搜索匹配：节点名 + prompt + text 三者任一命中（均走 matchText 支持拼音）。
  const matchHistory = (it, q) => {
    const parts = [
      NODE_META[it.nodeType]?.label,
      it.prompt,
      it.text,
    ];
    return parts.some((t) => matchText(t, q));
  };
  // 搜索时跨分类+跨分组（忽略 activeCat/activeGroup）；否则按分类 + 分组双重过滤。
  const hasQuery = query.trim().length > 0;
  const filtered = useMemo(() => {
    const base = hasQuery
      ? history.filter((it) => matchHistory(it, query))
      : history.filter((it) => {
        if (activeCat !== 'all' && typeToCat.get(it.nodeType) !== activeCat) return false;
        if (activeGroup !== 'all') {
          const gname = it.nodeId ? nodeToGroupName.get(it.nodeId) : undefined;
          if (activeGroup === '__ungrouped__') { if (gname) return false; }
          else if (gname !== activeGroup) return false;
        }
        return true;
      });
    // 排序：按 createdAt。desc = 最新在前（默认），asc = 最旧在前。
    // 用带索引稳定排序，避免 createdAt 相同（如批量生成同毫秒）时顺序抖动。
    const indexed = base.map((it, i) => [it, i]);
    indexed.sort((a, b) => {
      const ta = a[0].createdAt || 0;
      const tb = b[0].createdAt || 0;
      if (ta !== tb) return sortOrder === 'asc' ? ta - tb : tb - ta;
      // 时间相同回退到原始顺序：desc 保持原序（新的在后追加→索引大），asc 反转
      return sortOrder === 'asc' ? a[1] - b[1] : b[1] - a[1];
    });
    return indexed.map((pair) => pair[0]);
  }, [history, activeCat, activeGroup, typeToCat, nodeToGroupName, hasQuery, query, sortOrder]);

  // 瀑布流视图：把 filtered 中的图片记录展平成单张图条目。
  // 跳过音频/视频/文本记录（它们在列表视图查看）。key 用 `${item.id}:${index}` 保证唯一
  // （规避约束 #24：同一记录内可能有重复 URL，不能直接拿 url 当 key）。
  const flatImageItems = useMemo(() => {
    const out = [];
    for (const it of filtered) {
      if (it.mediaType === 'audio' || it.mediaType === 'video' || it.mediaType === 'text') continue;
      const imgs = it.images || [];
      if (!imgs.length) continue;
      imgs.forEach((url, i) => out.push({ key: `${it.id}:${i}`, url, item: it, imgIndex: i, images: imgs }));
    }
    return out;
  }, [filtered]);

  // ScrollArea 内部滚动视口 ref：传给 Masonry 让它在面板内监听滚动（否则默认监听 window）。
  // ScrollArea 用 base-ui（data-slot="scroll-area-viewport" 是真正的滚动节点）。
  const scrollRef = useRef(null);
  const setScrollRef = (el) => {
    if (!el) return;
    // el 是 Root 容器；真正的滚动视口在其内部
    const viewport = el.querySelector?.('[data-slot="scroll-area-viewport"]') || el;
    scrollRef.current = viewport;
  };

  // 图片宽高比缓存：url → "w:h" 字符串（供 Masonry getMeta 用，实现真实错落排布）。
  // 历史记录 images 只存 URL（无尺寸），故在渲染时异步测量；老记录也能自适应。
  // 缓存是组件级内存（不持久化），切换 tab/刷新重测即可。模块级缓存可跨实例复用，避免来回切视图重测。
  const [sizeMap, setSizeMap] = useState(() => sizeCache);
  // 瀑布流激活且有图时，懒测量当前可见 url 的尺寸（不存在于缓存的才测）。
  useEffect(() => {
    if (viewMode !== 'masonry') return;
    const todo = flatImageItems.map((it) => it.url).filter((u) => !sizeCache.has(u));
    if (!todo.length) return;
    let cancelled = false;
    todo.forEach((url) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (cancelled) return;
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w > 0 && h > 0) {
          sizeCache.set(url, `${w}:${h}`);
          setSizeMap(new Map(sizeCache));
        }
      };
      img.onerror = () => {}; // 测不出则回退 1:1（getMeta 兜底）
      img.src = url;
    });
    return () => { cancelled = true; };
  }, [viewMode, flatImageItems]);
  const getImageAspect = (url) => sizeMap.get(url); // 缓存未命中返回 undefined → Masonry 回退正方形

  // 定位到指定节点的历史记录：focusNodeId 变化时滚动到该节点第一条记录并高亮。
  // 用 data-history-node-id 标记 + 短暂高亮 class 实现（高亮 1.6s 后自动消失）。
  const highlightRef = useRef(null);
  useEffect(() => { ensureHighlightStyle(); }, []);
  // 定位到历史记录：先重置过滤器为「全部」（否则目标记录可能被过滤掉不可见），
  // 再在 DOM 更新后滚动+高亮。focusNodeId 形如 "nodeId:token"（token 让同节点可重复触发）。
  useEffect(() => {
    if (!focusNodeId) return;
    const nodeId = String(focusNodeId).split(':')[0];
    // 重置过滤器，确保目标记录可见
    setActiveCat('all');
    setActiveGroup('all');
    setQuery('');
    let cancelled = false;
    const highlight = (el) => {
      if (highlightRef.current) highlightRef.current.classList.remove('history-item-highlight');
      el.classList.add('history-item-highlight');
      highlightRef.current = el;
      setTimeout(() => {
        el.classList.remove('history-item-highlight');
        if (highlightRef.current === el) highlightRef.current = null;
      }, 1600);
    };
    // 过滤器重置 → filtered 重算 → DOM 重建，需等渲染完成。用 rAF + 重试查找兜底。
    const tryScroll = (attempts) => {
      if (cancelled) return;
      const el = scrollRef.current?.querySelector?.(`[data-history-node-id="${CSS.escape(nodeId)}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        highlight(el);
        return;
      }
      if (attempts > 0) requestAnimationFrame(() => tryScroll(attempts - 1));
    };
    requestAnimationFrame(() => requestAnimationFrame(() => tryScroll(5)));
    return () => { cancelled = true; };
  }, [focusNodeId]);

  return (
    <div className="flex h-full flex-col">
      {history.length > 0 && (
        <>
          <SearchBar value={query} onChange={setQuery} placeholder="搜索记录（支持拼音）" />
          {/* 分类筛选 chips（搜索时隐藏，让结果跨分类展示） */}
          {!hasQuery && cats.length > 1 && (
            <div className="nodrag nopan nowheel scrollbar-none flex gap-1 overflow-x-auto border-b border-border p-2">
              {cats.map((c) => {
                const active = activeCat === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveCat(c.id)}
                    className={
                      'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition ' +
                      (active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground')
                    }
                  >
                    {c.label}
                    <span className={'rounded-full px-1 text-[10px] ' + (active ? 'bg-primary-foreground/20' : 'bg-background/60')}>
                      {c.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {/* 分组筛选 chips（搜索时隐藏；仅当存在归属分组的记录时显示） */}
          {!hasQuery && groupChips.length > 0 && (
            <div className="nodrag nopan nowheel scrollbar-none flex gap-1 overflow-x-auto border-b border-border p-2">
              <button
                type="button"
                onClick={() => setActiveGroup('all')}
                className={
                  'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition ' +
                  (activeGroup === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground')
                }
              >
                全部分组
              </button>
              {groupChips.map((g) => {
                const active = activeGroup === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setActiveGroup(g.id)}
                    className={
                      'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition ' +
                      (active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground')
                    }
                  >
                    {g.label}
                    <span className={'rounded-full px-1 text-[10px] ' + (active ? 'bg-primary-foreground/20' : 'bg-background/60')}>
                      {g.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {/* 工具栏：左侧清空记录，右侧视图切换（列表 / 瀑布流） */}
          <div className="flex items-center justify-between border-b border-border px-2 py-1">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="text-xs text-muted-foreground transition hover:text-red-500"
              >
                清空记录
              </button>
              {/* 临时：从节点产出反向恢复历史记录（误清空后补救） */}
              {onRestoreFromNodes && (
                <button
                  type="button"
                  onClick={() => setConfirmRestore(true)}
                  title="从画布节点的产出反向重建生成记录"
                  className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-primary"
                >
                  <RotateCcw className="h-3 w-3" />
                  从节点恢复
                </button>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={handleSortOrderChange}
                title={sortOrder === 'desc' ? '当前：最新在前（点击切换）' : '当前：最旧在前（点击切换）'}
                className={
                  'flex h-6 w-6 items-center justify-center rounded transition ' +
                  (sortOrder === 'asc'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground')
                }
              >
                {/* desc=最新在前用默认朝下图标；asc=最旧在前高亮表示已切换 */}
                <ArrowDownWideNarrow className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange('list')}
                title="列表视图"
                className={
                  'flex h-6 w-6 items-center justify-center rounded transition ' +
                  (viewMode === 'list'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground')
                }
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange('masonry')}
                title="瀑布流视图"
                className={
                  'flex h-6 w-6 items-center justify-center rounded transition ' +
                  (viewMode === 'masonry'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground')
                }
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
      <ScrollArea ref={setScrollRef} className="min-h-0 flex-1">
        {history.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <p className="text-xs text-muted-foreground">暂无生成记录</p>
            {/* 无记录时仍提供「从节点恢复」入口（误清空后补救） */}
            {onRestoreFromNodes && (
              <button
                type="button"
                onClick={() => setConfirmRestore(true)}
                className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-primary"
              >
                <RotateCcw className="h-3 w-3" />
                从节点恢复
              </button>
            )}
          </div>
        )}
        {/* 列表视图：原卡片形态 */}
        {history.length > 0 && viewMode === 'list' && (
          <div className="flex flex-col gap-2 p-2">
            {filtered.map((it) => (
              <HistoryCard
                key={it.id}
                item={it}
                onRemove={onRemoveHistory}
                onUseImage={onUseImage}
                onInsert={onInsertHistory}
                onDragStart={onDragStartHistory}
                onAddToAssets={onAddToAssets}
              />
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                {hasQuery ? '未找到匹配记录' : '当前筛选无记录'}
              </p>
            )}
          </div>
        )}
        {/* 瀑布流视图：图片展平 + 按真实宽高比错落排布 */}
        {history.length > 0 && viewMode === 'masonry' && (
          flatImageItems.length > 0 ? (
            <div className="p-2">
              <Masonry
                data={flatImageItems}
                getKey={(it) => it.key}
                columns={3}
                gap={6}
                rowHeight={80}
                enterAnimation={false}
                exitAnimation={false}
                layoutTransition={false}
                scrollContainerRef={scrollRef}
                getMeta={(it) => ({ aspect: getImageAspect(it.url) || '1:1' })}
                renderItem={(it) => (
                  <MasonryImageCell
                    item={it}
                    onUseImage={onUseImage}
                    onAddToAssets={onAddToAssets}
                    onInsert={onInsertHistory}
                    onRemove={onRemoveHistory}
                    onLocateNode={onLocateNode}
                  />
                )}
              />
            </div>
          ) : (
            <p className="px-2 py-8 text-center text-xs text-muted-foreground">
              {hasQuery ? '未找到匹配记录' : (filtered.length === 0 ? '当前筛选无记录' : '当前筛选结果无图片')}
            </p>
          )
        )}
      </ScrollArea>
      {/* 清空记录确认框：可选是否同时重置画布节点产出 */}
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>清空生成记录？</AlertDialogTitle>
            <AlertDialogDescription>
              将清空全部生成记录，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="nodrag nopan nowheel flex cursor-pointer items-center gap-2 py-1 text-sm">
            <Checkbox
              checked={clearAlsoResetNodes}
              onCheckedChange={(checked) => setClearAlsoResetNodes(!!checked)}
            />
            <span>同时清空画布上所有节点的产出</span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => { setConfirmClear(false); onClearHistory?.(clearAlsoResetNodes); }}
            >
              清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* 从节点恢复确认框：恢复会在现有记录后追加，不会覆盖 */}
      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>从节点恢复生成记录？</AlertDialogTitle>
            <AlertDialogDescription>
              将遍历画布上有产出的节点，按其产出（图片/音频/视频/文本）重建生成记录并追加到当前列表。原有记录保留，不会覆盖。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmRestore(false); onRestoreFromNodes?.(); }}
            >
              恢复
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function HistoryCard({ item, onRemove, onUseImage, onInsert, onDragStart, onAddToAssets }) {
  const images = item.images || [];
  const cover = images[0];
  // 媒体产出（音频/视频）：渲染播放器而非图片网格，避免 broken img。
  // 多份产出（count>1）时全部渲染，单个用 cover 兜底。
  const mediaType = item.mediaType;
  const isAudio = mediaType === 'audio';
  const isVideo = mediaType === 'video';
  const mediaUrls = (isAudio || isVideo) && images.length ? images : (cover ? [cover] : []);
  const hasNodeType = !!item.nodeType && !!NODE_META[item.nodeType];
  return (
    <div
      className="rounded-md border border-border p-2 transition-shadow"
      data-history-node-id={item.nodeId || undefined}
    >
      {/* 标题行作为「拖拽建 nodeType 节点」的手柄：拖标题=建节点，拖下方图片=拖图片到画布。
          不再把整个卡片设为 draggable，否则会吞掉内部图片缩略图的 dragstart。 */}
      <div
        className="mb-1 flex cursor-grab items-center justify-between gap-2"
        draggable={hasNodeType}
        onDragStart={(e) => hasNodeType && onDragStart?.(item, e)}
        title={hasNodeType ? '拖到画布新建节点' : undefined}
      >
        <span className="flex items-center gap-1 text-xs font-medium">
          {NODE_META[item.nodeType]?.icon} {NODE_META[item.nodeType]?.label || item.nodeType}
        </span>
        <span className="text-[10px] text-muted-foreground">{formatTime(item.createdAt)}</span>
      </div>
      {item.prompt && (
        <p className="mb-1.5 line-clamp-2 text-xs text-muted-foreground">{item.prompt}</p>
      )}
      {isAudio && mediaUrls.map((url, i) => (
        <audio key={url + i} src={url} controls className="mb-1 w-full" />
      ))}
      {isVideo && mediaUrls.map((url, i) => (
        <video key={url + i} src={url} controls className="mb-1 w-full rounded border border-border" />
      ))}
      {mediaType === 'text' && item.text && (
        <pre className="nodrag nopan nowheel mb-1 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-muted/30 p-1.5 text-[10px] leading-snug text-foreground">
{item.text}
        </pre>
      )}
      {!isAudio && !isVideo && mediaType !== 'text' && cover && (
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}
        >
          {images.map((url, i) => (
            <HistoryImageThumb
              key={i}
              url={url}
              images={images}
              index={i}
              onAddToAssets={onAddToAssets}
            />
          ))}
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-end gap-2">
        {cover && (
          <button
            type="button"
            onClick={() => onUseImage?.(cover)}
            className="text-[10px] text-muted-foreground transition hover:text-primary"
          >
            用作输入
          </button>
        )}
        {images.length > 0 && (
          <button
            type="button"
            onClick={() => onAddToAssets?.(images)}
            title="把本条记录的所有输出图片添加到素材库分组"
            className="flex items-center gap-1 text-[10px] text-muted-foreground transition hover:text-primary"
          >
            <FolderPlus className="h-3 w-3" />
            添加到素材库
          </button>
        )}
        {hasNodeType && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  title="插入到画布（新建节点并预填历史参数）"
                  className="flex items-center gap-1 text-[10px] text-muted-foreground transition hover:text-primary"
                />
              }
            >
              <CopyPlus className="h-3 w-3" />
              插入到画布
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onInsert?.(item, {})}>
                全部插入（独立节点）
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsert?.(item, { group: true })}>
                插入到新分组
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <button
          type="button"
          onClick={() => onRemove?.(item.id)}
          className="text-[10px] text-muted-foreground transition hover:text-red-500"
        >
          删除
        </button>
      </div>
    </div>
  );
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (x) => String(x).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 生成记录单张图片缩略图：HoverCard 预览（复用 ImageHoverCard 通用组件）
// delay=500ms 延迟显示；点击打开 mediaGallery 大图查看；右上角按钮把单张图加到素材库。
function HistoryImageThumb({ url, images, index, onAddToAssets }) {
  // 拖拽缩略图到画布：写入画布图片协议，落点建 imageDisplay 节点（拖图片，区别于拖卡片建 nodeType 节点）。
  // stopPropagation 防止冒泡到 HistoryCard 的 onDragStart（否则会被当作「拖节点」处理）。
  const handleImgDragStart = (setHoverOpen) => (e) => {
    e.stopPropagation();
    e.dataTransfer.setData(CANVAS_DROP_MIME, JSON.stringify({ urls: [url] }));
    e.dataTransfer.effectAllowed = 'move';
    setHoverOpen(false); // 拖起时立即关闭 HoverCard 避免遮挡
  };
  return (
    <ImageHoverCard
      url={url}
      className="block"
      renderTrigger={({ setHoverOpen }) => (
        <>
          <button
            type="button"
            onClick={() => openMediaGallery(images.map((src) => ({ src, type: 'image' })), index)}
            className="block h-full w-full overflow-hidden rounded"
          >
            <img
              src={url}
              alt=""
              className="h-full w-full cursor-grab object-cover transition hover:opacity-80 active:cursor-grabbing"
              loading="lazy"
              draggable
              onDragStart={handleImgDragStart(setHoverOpen)}
            />
          </button>
          {/* 右上角：把该单张图片添加到素材库分组（仅 hover 显示） */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAddToAssets?.([url]); }}
            title="添加到素材库"
            className="absolute -right-1 -top-1 z-20 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition hover:bg-primary hover:text-primary-foreground group-hover:opacity-100"
          >
            <FolderPlus className="h-3 w-3" />
          </button>
        </>
      )}
    />
  );
}

// 瀑布流视图单张图片单元格：右键全量菜单 + 悬浮底部精简按钮条。
// - ContextMenu 包裹整格：右键弹出 7 项操作（输入/素材库/插入画布/定位源节点/查看大图/复制地址/删除整条记录）。
// - ImageHoverCard：hover 500ms 预览大图；trigger 内含底部按钮条（hover 显）+ 可拖拽缩略图。
// - 操作语义：单图级（用作输入/素材库/查看大图/复制地址）vs 记录级（插入画布/定位源节点/删除整条）。
function MasonryImageCell({ item, onUseImage, onAddToAssets, onInsert, onRemove, onLocateNode }) {
  const { url, images, imgIndex } = item;
  // 源节点 id：表单生成/工具栏派生记录可能为 null（无源节点），此时菜单项禁用。
  const sourceNodeId = item.item?.nodeId || null;
  // 拖拽缩略图到画布：与 HistoryImageThumb 一致的协议（拖图片建 imageDisplay 节点）。
  const handleImgDragStart = (setHoverOpen) => (e) => {
    e.stopPropagation();
    e.dataTransfer.setData(CANVAS_DROP_MIME, JSON.stringify({ urls: [url] }));
    e.dataTransfer.effectAllowed = 'move';
    setHoverOpen(false);
  };
  const handleCopyUrl = () => {
    navigator.clipboard?.writeText(url).then(
      () => toast.success('已复制图片地址'),
      () => toast.error('复制失败'),
    );
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div className="h-full w-full" data-history-node-id={sourceNodeId || undefined}>
            <ImageHoverCard
              url={url}
              className="h-full w-full"
              triggerShape="fixed"
              renderTrigger={({ setHoverOpen }) => (
                <>
                  <button
                    type="button"
                    onClick={() => openMediaGallery(images.map((src) => ({ src, type: 'image' })), imgIndex)}
                    className="block h-full w-full overflow-hidden rounded"
                  >
                    <img
                      src={url}
                      alt=""
                      className="h-full w-full cursor-grab object-cover transition hover:opacity-80 active:cursor-grabbing"
                      loading="lazy"
                      draggable
                      onDragStart={handleImgDragStart(setHoverOpen)}
                    />
                  </button>
                  {/* 悬浮底部精简按钮条：用作输入 / 添加到素材库。
                      与 HistoryImageThumb 右上角按钮一致，靠 ImageHoverCard trigger 容器自带的 group + group-hover:opacity-100 显隐。 */}
                  <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center gap-1 bg-gradient-to-t from-black/50 to-transparent py-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onUseImage?.(url); }}
                      title="用作输入"
                      className="flex h-6 w-6 items-center justify-center rounded bg-background/90 text-foreground shadow-sm transition hover:bg-primary hover:text-primary-foreground"
                    >
                      <Send className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onAddToAssets?.([url]); }}
                      title="添加到素材库"
                      className="flex h-6 w-6 items-center justify-center rounded bg-background/90 text-foreground shadow-sm transition hover:bg-primary hover:text-primary-foreground"
                    >
                      <FolderPlus className="h-3 w-3" />
                    </button>
                  </div>
                </>
              )}
            />
          </div>
        }
      />
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onUseImage?.(url)}>
          <Send className="mr-2 h-3.5 w-3.5" /> 用作输入
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onAddToAssets?.([url])}>
          <FolderPlus className="mr-2 h-3.5 w-3.5" /> 添加到素材库
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onInsert?.(item.item, {})}>
          <CopyPlus className="mr-2 h-3.5 w-3.5" /> 插入到画布…
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!sourceNodeId}
          onClick={() => sourceNodeId && onLocateNode?.(sourceNodeId)}
          title={sourceNodeId ? '滚动并选中生成该记录的画布节点' : '该记录无关联的画布节点'}
        >
          <Crosshair className="mr-2 h-3.5 w-3.5" /> 定位到生成节点
        </ContextMenuItem>
        <ContextMenuItem onClick={() => openMediaGallery(images.map((src) => ({ src, type: 'image' })), imgIndex)}>
          <Maximize2 className="mr-2 h-3.5 w-3.5" /> 查看大图
        </ContextMenuItem>
        <ContextMenuItem onClick={handleCopyUrl}>
          <ClipboardCopy className="mr-2 h-3.5 w-3.5" /> 复制图片地址
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onRemove?.(item.item.id)} className="text-red-500 focus:text-red-500">
          <Trash2 className="mr-2 h-3.5 w-3.5" /> 删除该记录
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
