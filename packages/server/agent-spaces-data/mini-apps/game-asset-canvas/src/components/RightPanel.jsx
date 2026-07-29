import { useEffect, useMemo, useRef, useState } from 'react';
import {
  openMediaGallery, ScrollArea, Tabs, TabsList, TabsTrigger, TabsContent,
  Crosshair, Trash2, Plus, Boxes, History, Images, Zap, CopyPlus, FolderPlus,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@agent-spaces/ui';
import { NODE_META, NODE_TYPES, NODE_TYPE_TO_PROCESSOR } from '../utils/constants';
import { CANVAS_DROP_MIME } from '../utils/canvas-constants';
import AssetLibrary from './AssetLibrary';
import ImageHoverCard from './ImageHoverCard';

// 节点分类（顶部 chips 筛选用）。category 字段同步打到 ADD_ITEMS 每项。
const NODE_CATEGORIES = [
  { id: 'all', label: '全部' },
  { id: 'generate', label: '生成' },
  { id: 'image-process', label: '图像处理' },
  { id: 'edit', label: '编辑' },
  { id: 'media', label: '媒体' },
  { id: 'util', label: '工具' },
];

const ADD_ITEMS = [
  // 生成
  { type: NODE_TYPES.textToImage, label: '文字生成图片', category: 'generate' },
  { type: NODE_TYPES.editImage, label: '编辑图片', category: 'generate' },
  // 工具
  { type: NODE_TYPES.imageDisplay, label: '图片展示', category: 'util' },
  // 图像处理（按单个处理器拆分为 12 个独立节点）
  { type: NODE_TYPES.ipGifSplit, label: 'GIF 拆帧', category: 'image-process' },
  { type: NODE_TYPES.ipGifMerge, label: 'GIF 合成', category: 'image-process' },
  { type: NODE_TYPES.ipSpriteSplit, label: 'Sheet 拆分', category: 'image-process' },
  { type: NODE_TYPES.ipSpriteMerge, label: 'Sheet 合成', category: 'image-process' },
  { type: NODE_TYPES.ipPixelate, label: '像素化', category: 'image-process' },
  { type: NODE_TYPES.ipResizeNearest, label: '最近邻缩放', category: 'image-process' },
  { type: NODE_TYPES.ipInnerStroke, label: '内描边', category: 'image-process' },
  { type: NODE_TYPES.ipComposeOverlay, label: '图层叠加', category: 'image-process' },
  { type: NODE_TYPES.ipEnhance, label: '图片放大', category: 'image-process' },
  { type: NODE_TYPES.ipCompress, label: '图片压缩', category: 'image-process' },
  // 编辑
  { type: NODE_TYPES.imageEditor, label: '图片编辑', category: 'edit' },
  { type: NODE_TYPES.pixelEditor, label: '像素编辑器', category: 'edit' },
  { type: NODE_TYPES.cutout, label: '抠图', category: 'edit' },
  { type: NODE_TYPES.promptReverse, label: '反推提示词', category: 'edit' },
  { type: NODE_TYPES.directorDesk, label: '3D导演台', category: 'edit' },
  { type: NODE_TYPES.photopea, label: '在线PS', category: 'edit' },
  { type: NODE_TYPES.spineEditor, label: '骨骼编辑器', category: 'edit' },
  // 工具
  { type: NODE_TYPES.uiSplitter, label: '雪碧图拆分', category: 'util' },
  { type: NODE_TYPES.bboxViewer, label: 'UI拆分', category: 'util' },
  { type: NODE_TYPES.imageCompare, label: '图片对比', category: 'util' },
  { type: NODE_TYPES.workflowRunner, label: '执行工作流', category: 'util' },
  { type: NODE_TYPES.note, label: '便签', category: 'util' },
  // 媒体
  { type: NODE_TYPES.textToVoice, label: '生成配音', category: 'media' },
  { type: NODE_TYPES.videoGenerator, label: '生成视频', category: 'media' },
  { type: NODE_TYPES.videoDisplay, label: '视频展示', category: 'media' },
];

// 每张卡片最小宽度（px），用于响应式推算列数
const MIN_CARD_WIDTH = 96;
// 列数范围
const MIN_COLS = 2;
const MAX_COLS = 5;

/**
 * 右侧面板：新增节点 / 节点管理 / 生成记录 三个 tab。
 * @param {{ ..., onOpenForm:(type)=>void }} props
 */
export default function RightPanel({
  nodes, onSelectNode, onLocateNode, onDeleteNode,
  onAdd, onDragStartNode, onExecute,
  history, onRemoveHistory, onClearHistory, onUseImage,
  onInsertHistory, onDragStartHistory,
  onAddToAssets, onInsertImagesToCanvas,
  workspaceId,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-card">
      <Tabs defaultValue="add" className="flex h-full min-h-0 flex-col">
        <TabsList className="flex w-full flex-row flex-nowrap rounded-none border-b border-border">
          <TabsTrigger value="add" title="新增节点" aria-label="新增节点" className="flex-1">
            <Plus className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger value="nodes" title="节点管理" aria-label="节点管理" className="flex-1">
            <Boxes className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger value="history" title="生成记录" aria-label="生成记录" className="flex-1">
            <History className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger value="assets" title="素材库" aria-label="素材库" className="flex-1">
            <Images className="h-4 w-4" />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="add" className="mt-0 min-h-0 flex-1 overflow-hidden">
          <AddNodeList onAdd={onAdd} onDragStartNode={onDragStartNode} onExecute={onExecute} />
        </TabsContent>

        <TabsContent value="nodes" className="mt-0 min-h-0 flex-1 overflow-hidden">
          <NodeList
            nodes={nodes}
            onSelectNode={onSelectNode}
            onLocateNode={onLocateNode}
            onDeleteNode={onDeleteNode}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-0 min-h-0 flex-1 overflow-hidden">
          <HistoryList
            history={history}
            onRemoveHistory={onRemoveHistory}
            onClearHistory={onClearHistory}
            onUseImage={onUseImage}
            onInsertHistory={onInsertHistory}
            onDragStartHistory={onDragStartHistory}
            onAddToAssets={onAddToAssets}
          />
        </TabsContent>

        <TabsContent value="assets" className="mt-0 min-h-0 flex-1 overflow-hidden">
          <AssetLibrary workspaceId={workspaceId} onInsertImagesToCanvas={onInsertImagesToCanvas} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// 可执行节点类型集合（与 NodeExecuteDialog.EXEC_KIND 对应）：文生图/编辑图片/反推提示词/
// 生成配音/生成视频/抠图 + 12 个 ip* 图像处理节点。这些节点卡片 hover 时右上角显示 ⚡ 图标，
// 点击打开执行对话框（不创建画布节点，产出只写生成记录）。
const EXECUTABLE_TYPES = new Set([
  NODE_TYPES.textToImage,
  NODE_TYPES.editImage,
  NODE_TYPES.promptReverse,
  NODE_TYPES.textToVoice,
  NODE_TYPES.videoGenerator,
  NODE_TYPES.cutout,
  ...Object.keys(NODE_TYPE_TO_PROCESSOR),
]);

// ============ 新增节点（可点击添加，可拖拽到画布；可执行节点 hover 右上角 ⚡ 直接执行） ============
// 顶部按分类筛选 + 卡片网格按容器宽度自适应列数（2~5 列）。
function AddNodeList({ onAdd, onDragStartNode, onExecute }) {
  const [activeCat, setActiveCat] = useState('all');
  const [hoverType, setHoverType] = useState(null);
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

  const items = useMemo(
    () => (activeCat === 'all' ? ADD_ITEMS : ADD_ITEMS.filter((it) => it.category === activeCat)),
    [activeCat],
  );

  return (
    <div ref={scrollRef} className="flex h-full min-h-0 flex-col">
      {/* 分类筛选 chips */}
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

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          <p className="mb-2 text-xs text-muted-foreground">左上角＋添加到画布，或拖拽到画布任意位置</p>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {items.map((it) => {
              const meta = NODE_META[it.type];
              const executable = EXECUTABLE_TYPES.has(it.type);
              const hovered = hoverType === it.type;
              return (
                <div
                  key={it.type}
                  className="relative flex flex-col gap-1 rounded-lg border border-border bg-background p-2.5 transition hover:border-primary/60 hover:shadow-sm"
                  onMouseEnter={() => setHoverType(it.type)}
                  onMouseLeave={() => setHoverType(null)}
                >
                  {/* 左上角：添加到画布 */}
                  <button
                    type="button"
                    onClick={() => onAdd?.(it.type)}
                    title="添加到画布"
                    className="absolute left-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-muted/60 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  {/* 右上角：可执行节点 hover 显示 ⚡，直接执行（不进画布） */}
                  {executable && (
                    <button
                      type="button"
                      onClick={() => onExecute?.(it.type)}
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
                    onDragStart={(e) => onDragStartNode?.(it.type, e)}
                    className="flex flex-1 cursor-grab flex-col items-center gap-1.5 pt-1 outline-none active:cursor-grabbing"
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-md text-lg"
                      style={{ backgroundColor: `${meta.color}1a` }}
                    >
                      {meta.icon}
                    </span>
                    <span className="text-center text-xs font-medium leading-tight">{it.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {items.length === 0 && (
            <p className="px-2 py-8 text-center text-xs text-muted-foreground">该分类暂无节点</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ============ 节点管理 ============
function NodeList({ nodes, onSelectNode, onLocateNode, onDeleteNode }) {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1 p-2">
        {nodes.length === 0 && (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">画布暂无节点</p>
        )}
        {nodes.map((n) => {
          const meta = NODE_META[n.type] || { icon: '🔹', label: n.type };
          const imgCount = n.data?.output?.images?.length || n.data?.images?.length || 0;
          return (
            <div
              key={n.id}
              className="group/node flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm transition hover:bg-muted"
              onClick={() => onSelectNode?.(n.id)}
            >
              <span>{meta.icon}</span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{meta.label}</span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {n.data?.status === 'running' ? '生成中…'
                    : n.data?.status === 'error' ? '出错'
                    : imgCount > 0 ? `${imgCount} 张图` : '—'}
                </span>
              </div>
              {/* 跳转到节点（定位画布） */}
              <button
                type="button"
                className="rounded p-1 text-muted-foreground transition hover:text-primary opacity-0 group-hover/node:opacity-100"
                onClick={(e) => { e.stopPropagation(); onLocateNode?.(n.id); }}
                title="在画布定位"
              >
                <Crosshair className="h-3.5 w-3.5" />
              </button>
              {/* 删除节点 */}
              <button
                type="button"
                className="rounded p-1 text-muted-foreground transition hover:text-destructive opacity-0 group-hover/node:opacity-100"
                onClick={(e) => { e.stopPropagation(); onDeleteNode?.(n.id); }}
                title="删除节点"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// ============ 生成记录 ============
function HistoryList({ history, onRemoveHistory, onClearHistory, onUseImage, onInsertHistory, onDragStartHistory, onAddToAssets }) {
  const [activeCat, setActiveCat] = useState('all');
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
  const filtered = useMemo(() => {
    if (activeCat === 'all') return history;
    return history.filter((it) => typeToCat.get(it.nodeType) === activeCat);
  }, [history, activeCat, typeToCat]);

  return (
    <div className="flex h-full flex-col">
      {history.length > 0 && (
        <>
          {/* 分类筛选 chips（参考「选择添加节点」列表样式）：含计数 + 横向滚动防溢出 */}
          {cats.length > 1 && (
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
            <p className="px-2 py-8 text-center text-xs text-muted-foreground">该分类暂无记录</p>
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
