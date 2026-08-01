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

export default function HistoryTab({
  history, onRemoveHistory, onClearHistory, onUseImage,
  onInsertHistory, onDragStartHistory, onAddToAssets,
  onLocateNode,
}) {
  const [activeCat, setActiveCat] = useState('all');
  const [query, setQuery] = useState('');
  // viewMode 持久化到 settings（刷新后保留）。useSettings 是单例订阅，可被任意组件重复调用。
  const { settings, saveSettings } = useSettings();
  const viewMode = settings.historyViewMode === 'masonry' ? 'masonry' : 'list';
  const handleViewModeChange = (mode) => {
    // saveSettings 是整体覆盖，需把现有 settings 全部带上避免丢字段（参考 Canvas.handleCanvasStyleChange）
    saveSettings({ ...settings, historyViewMode: mode });
  };
  // nodeType → category 映射（ADD_ITEMS 是单一数据源）
  const typeToCat = useMemo(() => {
    const m = new Map();
    for (const it of ADD_ITEMS) m.set(it.type, it.category);
    return m;
  }, []);
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
  // 搜索匹配：节点名 + prompt + text 三者任一命中（均走 matchText 支持拼音）。
  const matchHistory = (it, q) => {
    const parts = [
      NODE_META[it.nodeType]?.label,
      it.prompt,
      it.text,
    ];
    return parts.some((t) => matchText(t, q));
  };
  // 搜索时跨分类（忽略 activeCat）；否则按分类过滤。
  const hasQuery = query.trim().length > 0;
  const filtered = useMemo(() => {
    if (hasQuery) return history.filter((it) => matchHistory(it, query));
    if (activeCat === 'all') return history;
    return history.filter((it) => typeToCat.get(it.nodeType) === activeCat);
  }, [history, activeCat, typeToCat, hasQuery, query]);

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
          {/* 工具栏：左侧清空记录，右侧视图切换（列表 / 瀑布流） */}
          <div className="flex items-center justify-between border-b border-border px-2 py-1">
            <button
              type="button"
              onClick={onClearHistory}
              className="text-xs text-muted-foreground transition hover:text-red-500"
            >
              清空记录
            </button>
            <div className="flex items-center gap-0.5">
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
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">暂无生成记录</p>
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
                {hasQuery ? '未找到匹配记录' : '该分类暂无记录'}
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
              {hasQuery ? '未找到匹配记录' : (filtered.length === 0 ? '该分类暂无记录' : '当前筛选结果无图片')}
            </p>
          )
        )}
      </ScrollArea>
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
    <div className="rounded-md border border-border p-2">
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
          <div className="h-full w-full">
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
