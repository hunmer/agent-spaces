// 生成记录 tab：历史卡片列表 + 分类筛选 + 拼音搜索。
// 卡片支持拖拽建节点（拖标题）/拖图片到画布（拖缩略图）/插入到画布/添加到素材库。
import { useMemo, useState } from 'react';
import {
  openMediaGallery, ScrollArea, FolderPlus, CopyPlus,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@agent-spaces/ui';
import { NODE_META } from '../../utils/constants';
import { CANVAS_DROP_MIME } from '../../utils/canvas-constants';
import { matchText, SearchBar } from './search';
import { NODE_CATEGORIES, ADD_ITEMS } from './constants';
import ImageHoverCard from '../ImageHoverCard';

export default function HistoryTab({
  history, onRemoveHistory, onClearHistory, onUseImage,
  onInsertHistory, onDragStartHistory, onAddToAssets,
}) {
  const [activeCat, setActiveCat] = useState('all');
  const [query, setQuery] = useState('');
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
          <div className="flex justify-end border-b border-border px-2 py-1">
            <button
              type="button"
              onClick={onClearHistory}
              className="text-xs text-muted-foreground transition hover:text-red-500"
            >
              清空记录
            </button>
          </div>
        </>
      )}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 p-2">
          {history.length === 0 && (
            <p className="px-2 py-8 text-center text-xs text-muted-foreground">暂无生成记录</p>
          )}
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
          {history.length > 0 && filtered.length === 0 && (
            <p className="px-2 py-8 text-center text-xs text-muted-foreground">
              {hasQuery ? '未找到匹配记录' : '该分类暂无记录'}
            </p>
          )}
        </div>
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
