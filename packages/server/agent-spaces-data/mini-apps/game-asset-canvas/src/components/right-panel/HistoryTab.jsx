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
  ArrowDownWideNarrow, RotateCcw, Checkbox, Download,
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@agent-spaces/ui';
import { NODE_META } from '../../utils/constants';
import { CANVAS_DROP_MIME } from '../../utils/canvas-constants';
import { matchText, SearchBar } from './search';
import { NODE_CATEGORIES, ADD_ITEMS } from './constants';
import { downloadImages } from '../../utils/export';
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
  onLocateNode, focusNodeId, assetCategories,
}) {
  const [activeCat, setActiveCat] = useState('all');
  const [activeGroup, setActiveGroup] = useState('all');
  const [query, setQuery] = useState('');
  // 记录多选：选中 history item id 集合。右键菜单作用于选中集（无选中则作用于当前记录）。
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // masonry 图片级多选：选中图片 url 集合（masonry 默认开启多选，右上角 checkbox）。
  const [selectedUrls, setSelectedUrls] = useState(() => new Set());
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
  // url → 素材库分类名 映射（用于图片右上角 badge：判断图片是否已在素材库）。
  // 同一 url 可能在多个分类，取首个命中（按分类顺序）。
  const assetLabelMap = useMemo(() => {
    const m = new Map();
    for (const cat of assetCategories || []) {
      for (const ast of cat.assets || []) {
        if (ast.url && !m.has(ast.url)) m.set(ast.url, cat.name || '未分类');
      }
    }
    return m;
  }, [assetCategories]);
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

  // ---- 记录多选 + 批量操作 ----
  // 选中集只保留当前可见记录（filtered）；切换过滤/工作区导致记录消失时自动清理悬空 id。
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filtered.map((it) => it.id));
      let changed = false;
      const next = new Set();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [filtered]);
  const toggleSelect = (id, additive) => {
    setSelectedIds((prev) => {
      const next = additive ? new Set(prev) : new Set();
      if (additive && next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectOnly = (id) => setSelectedIds(new Set([id]));
  const clearSelection = () => setSelectedIds(new Set());
  // 选中集对应的完整记录数组（用于工具条批量操作，不依赖"当前记录"）
  const selectedItems = useMemo(
    () => filtered.filter((it) => selectedIds.has(it.id)),
    [filtered, selectedIds],
  );
  const selectAll = () => setSelectedIds(new Set(filtered.map((it) => it.id)));
  // 工具条批量操作（作用于整个选中集）
  const toolbarBatch = (action) => {
    if (!selectedItems.length) return;
    const urls = collectUrls(selectedItems);
    if (action === 'useImage') {
      if (!urls.length) { toast.error('选中记录无图片'); return; }
      urls.forEach((u) => onUseImage?.(u));
      toast.success(`已用作输入（${urls.length} 张）`);
    } else if (action === 'addToAssets') {
      if (!urls.length) { toast.error('选中记录无图片'); return; }
      onAddToAssets?.(collectResources(selectedItems));
    } else if (action === 'insert') {
      selectedItems.forEach((it) => onInsertHistory?.(it, {}));
      toast.success(`已插入 ${selectedItems.length} 条记录到画布`);
    } else if (action === 'remove') {
      selectedItems.forEach((it) => onRemoveHistory?.(it.id));
      clearSelection();
    }
  };
  // 计算操作目标集：有选中且当前记录在选中集 → 选中集；否则仅当前记录。
  const resolveTargets = (item) => {
    if (selectedIds.has(item.id) && selectedIds.size > 0) {
      return filtered.filter((it) => selectedIds.has(it.id));
    }
    return [item];
  };
  // 批量操作：收集目标记录的所有图片 url（跳过文本记录无图）
  const collectUrls = (items) => items.flatMap((it) => (Array.isArray(it.images) ? it.images.filter(Boolean) : []));
  const collectResources = (items) => items.flatMap((it) => {
    const resources = Array.isArray(it.resources) ? it.resources : [];
    const byUrl = new Map(resources.map((resource) => [resource?.url, resource]));
    return (Array.isArray(it.images) ? it.images : [])
      .filter(Boolean)
      .map((url) => byUrl.get(url) || { url, thumb: url });
  });
  // 批量操作回调（作用于 resolveTargets 结果）
  const batchUseImage = (item) => {
    const urls = collectUrls(resolveTargets(item));
    if (!urls.length) { toast.error('选中记录无图片'); return; }
    urls.forEach((u) => onUseImage?.(u));
    toast.success(`已用作输入（${urls.length} 张）`);
  };
  const batchAddToAssets = (item) => {
    const urls = collectUrls(resolveTargets(item));
    if (!urls.length) { toast.error('选中记录无图片'); return; }
    onAddToAssets?.(collectResources(resolveTargets(item)));
  };
  const batchInsert = (item, opts) => {
    resolveTargets(item).forEach((it) => onInsertHistory?.(it, opts));
    const n = resolveTargets(item).length;
    toast.success(`已插入 ${n} 条记录到画布`);
  };
  const batchViewGallery = (item) => {
    const urls = collectUrls(resolveTargets(item));
    if (!urls.length) { toast.error('选中记录无图片'); return; }
    openMediaGallery(urls.map((src) => ({ src, type: 'image' })));
  };
  const batchCopyUrls = (item) => {
    const urls = collectUrls(resolveTargets(item));
    if (!urls.length) { toast.error('选中记录无图片'); return; }
    navigator.clipboard?.writeText(urls.join('\n')).then(
      () => toast.success(`已复制 ${urls.length} 个图片地址`),
      () => toast.error('复制失败'),
    );
  };
  const batchRemove = (item) => {
    resolveTargets(item).forEach((it) => onRemoveHistory?.(it.id));
  };

  // 瀑布流视图：把 filtered 中的图片记录展平成单张图条目。
  // 跳过音频/视频/文本记录（它们在列表视图查看）。key 用 `${item.id}:${index}` 保证唯一
  // （规避约束 #24：同一记录内可能有重复 URL，不能直接拿 url 当 key）。
  const flatImageItems = useMemo(() => {
    const out = [];
    for (const it of filtered) {
      if (it.mediaType === 'audio' || it.mediaType === 'video' || it.mediaType === 'text') continue;
      const imgs = it.images || [];
      if (!imgs.length) continue;
      const resources = Array.isArray(it.resources) ? it.resources : [];
      const byUrl = new Map(resources.map((resource) => [resource?.url, resource]));
      imgs.forEach((url, i) => out.push({
        key: `${it.id}:${i}`,
        url,
        resource: byUrl.get(url) || { url, thumb: url },
        item: it,
        imgIndex: i,
        images: imgs,
      }));
    }
    return out;
  }, [filtered]);

  // ---- masonry 图片级多选（须在 flatImageItems 之后，避免 TDZ） ----
  const toggleUrlSelect = (url) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };
  const clearUrlSelection = () => setSelectedUrls(new Set());
  const selectAllUrls = () => setSelectedUrls(new Set(flatImageItems.map((it) => it.url)));
  // 切换过滤/视图导致图片消失时，清理悬空 url
  useEffect(() => {
    setSelectedUrls((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(flatImageItems.map((it) => it.url));
      let changed = false;
      const next = new Set();
      for (const u of prev) {
        if (visible.has(u)) next.add(u);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [flatImageItems]);
  // masonry 操作目标 url：有图片选中 → 选中集；否则 → 当前图片
  const resolveImageUrls = (url) => (selectedUrls.size > 0 && selectedUrls.has(url)
    ? Array.from(selectedUrls)
    : [url]);
  // 下载（单张直接下载，多张打包 zip，复用 downloadImages）
  const batchDownload = async (url) => {
    const urls = resolveImageUrls(url);
    if (!urls.length) return;
    try {
      const { ok, total, failed } = await downloadImages(urls);
      if (failed === 0) toast.success(`已下载 ${ok}/${total} 张`);
      else toast.warning(`下载完成 ${ok} 成功，${failed} 失败`);
    } catch (e) {
      toast.error(e?.message || '下载失败');
    }
  };
  // masonry 图片级批量：素材库/用作输入/查看大图/复制地址 作用于选中图片集
  const masonryBatchAddToAssets = (url) => {
    const urls = resolveImageUrls(url);
    const byUrl = new Map(flatImageItems.map((item) => [item.url, item.resource]));
    onAddToAssets?.(urls.map((itemUrl) => byUrl.get(itemUrl) || { url: itemUrl, thumb: itemUrl }));
  };
  const masonryBatchUseImage = (url) => {
    const urls = resolveImageUrls(url);
    urls.forEach((u) => onUseImage?.(u));
    toast.success(`已用作输入（${urls.length} 张）`);
  };
  const masonryBatchViewGallery = (url) => {
    const urls = resolveImageUrls(url);
    openMediaGallery(urls.map((src) => ({ src, type: 'image' })));
  };
  const masonryBatchCopyUrls = (url) => {
    const urls = resolveImageUrls(url);
    navigator.clipboard?.writeText(urls.join('\n')).then(
      () => toast.success(`已复制 ${urls.length} 个图片地址`),
      () => toast.error('复制失败'),
    );
  };

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
          {/* 批量操作工具条：有选中记录时显示，提供全选/清空 + 批量操作 */}
          {selectedItems.length > 0 && (
            <div className="nodrag nopan nowheel flex items-center gap-1 border-b border-border bg-primary/5 px-2 py-1.5">
              <span className="shrink-0 text-[11px] font-medium text-primary">已选 {selectedItems.length} 条</span>
              <button
                type="button"
                onClick={selectAll}
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                全选
              </button>
              <div className="ml-auto flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => toolbarBatch('addToAssets')}
                  title="添加到素材库"
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-primary"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => toolbarBatch('insert')}
                  title="插入到画布"
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-primary"
                >
                  <CopyPlus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => toolbarBatch('remove')}
                  title="删除选中"
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  title="取消选择"
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
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
          <div className="flex flex-col gap-2 p-2" onClick={(e) => {
            // 点击列表空白区域清空选中（点卡片内部由卡片自行 stopPropagation）
            if (e.target === e.currentTarget) clearSelection();
          }}>
            {filtered.map((it) => (
              <HistoryCard
                key={it.id}
                item={it}
                selected={selectedIds.has(it.id)}
                selectionCount={selectedIds.size}
                assetLabelMap={assetLabelMap}
                selectedUrls={selectedUrls}
                onToggleUrlSelect={toggleUrlSelect}
                onToggleSelect={toggleSelect}
                onSelectOnly={selectOnly}
                onRemove={onRemoveHistory}
                onUseImage={onUseImage}
                onInsert={onInsertHistory}
                onDragStart={onDragStartHistory}
                onAddToAssets={onAddToAssets}
                onBatchUseImage={batchUseImage}
                onBatchAddToAssets={batchAddToAssets}
                onBatchInsert={batchInsert}
                onBatchViewGallery={batchViewGallery}
                onBatchCopyUrls={batchCopyUrls}
                onBatchRemove={batchRemove}
                onBatchDownload={(historyItem) => {
                  const urls = collectUrls(resolveTargets(historyItem));
                  if (!urls.length) { toast.error('选中记录无图片'); return; }
                  downloadImages(urls).then(
                    ({ ok, total, failed }) => failed === 0 ? toast.success(`已下载 ${ok}/${total} 张`) : toast.warning(`下载完成 ${ok} 成功，${failed} 失败`),
                    (e) => toast.error(e?.message || '下载失败'),
                  );
                }}
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
                    selected={selectedUrls.has(it.url)}
                    assetLabel={assetLabelMap[it.url]}
                    onToggleUrlSelect={toggleUrlSelect}
                    onDownload={batchDownload}
                    onMasonryAddToAssets={masonryBatchAddToAssets}
                    onMasonryUseImage={masonryBatchUseImage}
                    onMasonryViewGallery={masonryBatchViewGallery}
                    onMasonryCopyUrls={masonryBatchCopyUrls}
                    onBatchInsert={batchInsert}
                    onBatchRemove={batchRemove}
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

function HistoryCard({
  item, selected, selectionCount, assetLabelMap,
  onToggleSelect, onSelectOnly,
  onRemove, onUseImage, onInsert, onDragStart, onAddToAssets,
  onBatchUseImage, onBatchAddToAssets, onBatchInsert, onBatchViewGallery, onBatchCopyUrls, onBatchRemove,
  onBatchDownload,
  selectedUrls, onToggleUrlSelect,
}) {
  const images = item.images || [];
  const resources = Array.isArray(item.resources) ? item.resources : [];
  const resourceByUrl = new Map(resources.map((resource) => [resource?.url, resource]));
  const cover = images[0];
  // 媒体产出（音频/视频）：渲染播放器而非图片网格，避免 broken img。
  // 多份产出（count>1）时全部渲染，单个用 cover 兜底。
  const mediaType = item.mediaType;
  const isAudio = mediaType === 'audio';
  const isVideo = mediaType === 'video';
  const mediaUrls = (isAudio || isVideo) && images.length ? images : (cover ? [cover] : []);
  const hasNodeType = !!item.nodeType && !!NODE_META[item.nodeType];
  // 批量提示：有选中集且当前记录在选中集时，菜单操作作用于 N 条
  const inSelection = selected && selectionCount > 1;
  const batchSuffix = (label) => inSelection ? `${label}（${selectionCount} 条）` : label;
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            className={
              'rounded-md border p-2 transition-shadow ' +
              (selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border')
            }
            data-history-node-id={item.nodeId || undefined}
            // ctrl/cmd+点击切换选中；普通点击：若已选中则保持，否则单选当前
            onClick={(e) => {
              if (e.target.closest('button, audio, video, pre, a, [data-no-select]')) return;
              if (e.ctrlKey || e.metaKey) onToggleSelect?.(item.id, true);
              else if (selected && selectionCount > 1) { /* 保持选中集 */ }
              else onSelectOnly?.(item.id);
            }}
          >
            {/* 标题行作为「拖拽建 nodeType 节点」的手柄：拖标题=建节点，拖下方图片=拖图片到画布。
                不再把整个卡片设为 draggable，否则会吞掉内部图片缩略图的 dragstart。 */}
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span
                  data-no-select
                  onClick={(e) => { e.stopPropagation(); onToggleSelect?.(item.id, e.ctrlKey || e.metaKey); }}
                  className={
                    'flex h-3.5 w-3.5 shrink-0 cursor-pointer items-center justify-center rounded border text-[9px] transition ' +
                    (selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:border-primary/50')
                  }
                  title="点击选中（Ctrl/Cmd 多选）"
                >
                  {selected ? '✓' : ''}
                </span>
                <span
                  className="flex min-w-0 flex-1 cursor-grab items-center gap-1 truncate text-xs font-medium"
                  draggable={hasNodeType}
                  onDragStart={(e) => hasNodeType && onDragStart?.(item, e)}
                  title={hasNodeType ? '拖到画布新建节点' : undefined}
                >
                  {NODE_META[item.nodeType]?.icon} {NODE_META[item.nodeType]?.label || item.nodeType}
                </span>
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(item.createdAt)}</span>
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
                    thumb={resourceByUrl.get(url)?.thumb || url}
                    images={images}
                    index={i}
                    assetLabel={assetLabelMap?.[url]}
                    imgSelected={selectedUrls?.has(url)}
                    onToggleUrlSelect={onToggleUrlSelect}
                    onAddToAssets={onAddToAssets}
                  />
                ))}
              </div>
            )}
            <div className="mt-1.5 flex items-center justify-end gap-2" data-no-select>
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
                  onClick={() => onAddToAssets?.(images.map((url) => resourceByUrl.get(url) || { url, thumb: url }))}
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
        }
      />
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onBatchUseImage?.(item)}>
          <Send className="mr-2 h-3.5 w-3.5" /> {batchSuffix('用作输入')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onBatchAddToAssets?.(item)}>
          <FolderPlus className="mr-2 h-3.5 w-3.5" /> {batchSuffix('添加到素材库')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onBatchDownload?.(item)}>
          <Download className="mr-2 h-3.5 w-3.5" /> {batchSuffix('下载')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onBatchInsert?.(item, {})}>
          <CopyPlus className="mr-2 h-3.5 w-3.5" /> {batchSuffix('插入到画布')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onBatchViewGallery?.(item)}>
          <Maximize2 className="mr-2 h-3.5 w-3.5" /> {batchSuffix('查看大图')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onBatchCopyUrls?.(item)}>
          <ClipboardCopy className="mr-2 h-3.5 w-3.5" /> {batchSuffix('复制图片地址')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onBatchRemove?.(item)} className="text-red-500 focus:text-red-500">
          <Trash2 className="mr-2 h-3.5 w-3.5" /> {batchSuffix('删除')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (x) => String(x).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 生成记录单张图片缩略图：HoverCard 预览（复用 ImageHoverCard 通用组件）
// delay=500ms 延迟显示；点击打开 mediaGallery 大图查看。
// 右上角：多选 checkbox（hover 显示；选中时常驻）；底部居中：添加到素材库（hover 显示）。
// 左上角 badge：图片已在素材库时显示分类名（assetLabel）。
function HistoryImageThumb({ url, thumb, images, index, assetLabel, imgSelected, onToggleUrlSelect, onAddToAssets }) {
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
      className="relative block"
      renderTrigger={({ setHoverOpen }) => (
        <>
          <button
            type="button"
            onClick={() => openMediaGallery(images.map((src) => ({ src, type: 'image' })), index)}
            className="block h-full w-full overflow-hidden rounded"
          >
            <img
              src={thumb || url}
              alt=""
              className="h-full w-full cursor-grab object-cover transition hover:opacity-80 active:cursor-grabbing"
              loading="lazy"
              draggable
              onDragStart={handleImgDragStart(setHoverOpen)}
            />
          </button>
          {/* 左上角：素材库 badge（图片已在素材库时显示分类名） */}
          {assetLabel && (
            <span
              className="absolute left-0.5 top-0.5 z-20 max-w-[70%] truncate rounded bg-primary/90 px-1 py-0.5 text-[8px] font-medium text-primary-foreground shadow-sm"
              title={`已在素材库：${assetLabel}`}
            >
              {assetLabel}
            </span>
          )}
          {/* 右上角：多选 checkbox（hover 显示；选中时常驻高亮） */}
          {onToggleUrlSelect && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleUrlSelect?.(url); }}
              title="选中（多选）"
              className={
                'absolute right-0.5 top-0.5 z-20 flex size-4 items-center justify-center rounded border text-[8px] shadow-sm transition ' +
                (imgSelected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background/90 text-transparent opacity-0 hover:border-primary/50 group-hover:opacity-100')
              }
            >
              ✓
            </button>
          )}
          {/* 底部居中：添加到素材库（hover 显示） */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center pb-0.5 opacity-0 transition group-hover:opacity-100">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAddToAssets?.([{ url, thumb: thumb || url }]); }}
              title="添加到素材库"
              className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground shadow-sm transition hover:bg-primary hover:text-primary-foreground"
            >
              <FolderPlus className="h-3 w-3" />
            </button>
          </div>
        </>
      )}
    />
  );
}

// 瀑布流视图单张图片单元格：右键菜单 + 右上角多选 checkbox + 素材库 badge + 悬浮底部精简按钮条。
// - 默认开启图片级多选：右上角 checkbox 切换选中，菜单操作作用于选中图片集。
// - 右键菜单含下载（多图 zip）；图片操作作用于选中集，记录操作（插入/删除）作用于当前记录。
// - ImageHoverCard：hover 500ms 预览大图；trigger 内含底部按钮条（hover 显）+ 可拖拽缩略图。
function MasonryImageCell({
  item, selected, assetLabel, onToggleUrlSelect,
  onDownload, onMasonryAddToAssets, onMasonryUseImage, onMasonryViewGallery, onMasonryCopyUrls,
  onBatchInsert, onBatchRemove,
}) {
  const { url, resource, images, imgIndex } = item;
  const historyItem = item.item; // 原始 history 记录（flatImageItems 把图片展平时挂在 .item）
  const sourceNodeId = historyItem?.nodeId || null;
  // 拖拽缩略图到画布：与 HistoryImageThumb 一致的协议（拖图片建 imageDisplay 节点）。
  const handleImgDragStart = (setHoverOpen) => (e) => {
    e.stopPropagation();
    e.dataTransfer.setData(CANVAS_DROP_MIME, JSON.stringify({ urls: [url] }));
    e.dataTransfer.effectAllowed = 'move';
    setHoverOpen(false);
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            className={
              'relative h-full w-full ' +
              (selected ? 'ring-2 ring-primary' : '')
            }
            data-history-node-id={sourceNodeId || undefined}
          >
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
                      src={resource?.thumb || url}
                      alt=""
                      className="h-full w-full cursor-grab object-cover transition hover:opacity-80 active:cursor-grabbing"
                      loading="lazy"
                      draggable
                      onDragStart={handleImgDragStart(setHoverOpen)}
                    />
                  </button>
                  {/* 右上角：多选 checkbox（hover 显示；选中时常驻高亮） */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggleUrlSelect?.(url); }}
                    title="选中（多选）"
                    className={
                      'absolute right-1 top-1 z-20 flex size-5 items-center justify-center rounded border text-[10px] shadow-sm transition ' +
                      (selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background/90 text-transparent opacity-0 hover:border-primary/50 group-hover:opacity-100')
                    }
                  >
                    ✓
                  </button>
                  {/* 左上角：素材库 badge（图片已在素材库时显示分类名） */}
                  {assetLabel && (
                    <span
                      className="absolute left-1 top-1 z-20 max-w-[60%] truncate rounded bg-primary/90 px-1 py-0.5 text-[9px] font-medium text-primary-foreground shadow-sm"
                      title={`已在素材库：${assetLabel}`}
                    >
                      {assetLabel}
                    </span>
                  )}
                  {/* 悬浮底部精简按钮条：用作输入 / 添加到素材库 / 下载。
                      靠 ImageHoverCard trigger 容器自带的 group + group-hover:opacity-100 显隐。 */}
                  <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center gap-1 bg-gradient-to-t from-black/50 to-transparent py-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onMasonryUseImage?.(url); }}
                      title="用作输入"
                      className="flex h-6 w-6 items-center justify-center rounded bg-background/90 text-foreground shadow-sm transition hover:bg-primary hover:text-primary-foreground"
                    >
                      <Send className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onMasonryAddToAssets?.(url); }}
                      title="添加到素材库"
                      className="flex h-6 w-6 items-center justify-center rounded bg-background/90 text-foreground shadow-sm transition hover:bg-primary hover:text-primary-foreground"
                    >
                      <FolderPlus className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDownload?.(url); }}
                      title="下载"
                      className="flex h-6 w-6 items-center justify-center rounded bg-background/90 text-foreground shadow-sm transition hover:bg-primary hover:text-primary-foreground"
                    >
                      <Download className="h-3 w-3" />
                    </button>
                  </div>
                </>
              )}
            />
          </div>
        }
      />
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onMasonryUseImage?.(url)}>
          <Send className="mr-2 h-3.5 w-3.5" /> 用作输入
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onMasonryAddToAssets?.(url)}>
          <FolderPlus className="mr-2 h-3.5 w-3.5" /> 添加到素材库
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onDownload?.(url)}>
          <Download className="mr-2 h-3.5 w-3.5" /> 下载
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onBatchInsert?.(historyItem, {})}>
          <CopyPlus className="mr-2 h-3.5 w-3.5" /> 插入到画布…
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onMasonryViewGallery?.(url)}>
          <Maximize2 className="mr-2 h-3.5 w-3.5" /> 查看大图
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onMasonryCopyUrls?.(url)}>
          <ClipboardCopy className="mr-2 h-3.5 w-3.5" /> 复制图片地址
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onBatchRemove?.(historyItem)} className="text-red-500 focus:text-red-500">
          <Trash2 className="mr-2 h-3.5 w-3.5" /> 删除该记录
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
