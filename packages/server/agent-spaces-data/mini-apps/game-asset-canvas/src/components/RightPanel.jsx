import { useEffect, useMemo, useRef, useState } from 'react';
import {
  openMediaGallery, ScrollArea, Tabs, TabsList, TabsTrigger, TabsContent,
  Crosshair, Trash2, Plus, Boxes, History, Images,
} from '@agent-spaces/ui';
import { NODE_META, NODE_TYPES } from '../utils/constants';
import AssetLibrary from './AssetLibrary';

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
  // 工具
  { type: NODE_TYPES.uiSplitter, label: '雪碧图拆分', category: 'util' },
  { type: NODE_TYPES.bboxViewer, label: 'UI拆分', category: 'util' },
  { type: NODE_TYPES.imageCompare, label: '图片对比', category: 'util' },
  { type: NODE_TYPES.note, label: '便签', category: 'util' },
  // 媒体
  { type: NODE_TYPES.textToVoice, label: '生成配音', category: 'media' },
  { type: NODE_TYPES.videoGenerator, label: '生成视频', category: 'media' },
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
  onAdd, onDragStartNode, onOpenForm,
  history, onRemoveHistory, onClearHistory, onUseImage,
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
          <AddNodeList onAdd={onAdd} onDragStartNode={onDragStartNode} onOpenForm={onOpenForm} />
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
          />
        </TabsContent>

        <TabsContent value="assets" className="mt-0 min-h-0 flex-1 overflow-hidden">
          <AssetLibrary workspaceId={workspaceId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// 支持表单提交的节点类型（文生图 / 编辑图片）
const FORM_NODE_TYPES = new Set([NODE_TYPES.textToImage, NODE_TYPES.editImage]);

// ============ 新增节点（可点击添加，可拖拽到画布；文生图/编辑图片可填表单提交到队列） ============
// 顶部按分类筛选 + 卡片网格按容器宽度自适应列数（2~5 列）。
function AddNodeList({ onAdd, onDragStartNode, onOpenForm }) {
  const [activeCat, setActiveCat] = useState('all');
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
          <p className="mb-2 text-xs text-muted-foreground">点击添加，或拖拽到画布任意位置</p>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {items.map((it) => {
              const meta = NODE_META[it.type];
              const hasForm = FORM_NODE_TYPES.has(it.type);
              return (
                <div
                  key={it.type}
                  className="group/card relative flex flex-col gap-1 rounded-lg border border-border bg-background p-2.5 transition hover:border-primary/60 hover:shadow-sm"
                >
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => onDragStartNode?.(it.type, e)}
                    onClick={() => onAdd?.(it.type)}
                    className="flex flex-1 cursor-grab flex-col items-center gap-1.5 outline-none active:cursor-grabbing"
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-md text-lg"
                      style={{ backgroundColor: `${meta.color}1a` }}
                    >
                      {meta.icon}
                    </span>
                    <span className="text-center text-xs font-medium leading-tight">{it.label}</span>
                  </button>
                  {hasForm && (
                    <button
                      type="button"
                      onClick={() => onOpenForm?.(it.type)}
                      title="填写参数并提交到执行队列"
                      className="w-full rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/20"
                    >
                      ⚡ 生成
                    </button>
                  )}
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
function HistoryList({ history, onRemoveHistory, onClearHistory, onUseImage }) {
  return (
    <div className="flex h-full flex-col">
      {history.length > 0 && (
        <div className="flex justify-end border-b border-border px-2 py-1">
          <button
            type="button"
            onClick={onClearHistory}
            className="text-xs text-muted-foreground transition hover:text-red-500"
          >
            清空记录
          </button>
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 p-2">
          {history.length === 0 && (
            <p className="px-2 py-8 text-center text-xs text-muted-foreground">暂无生成记录</p>
          )}
          {history.map((it) => (
            <HistoryCard
              key={it.id}
              item={it}
              onRemove={onRemoveHistory}
              onUseImage={onUseImage}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function HistoryCard({ item, onRemove, onUseImage }) {
  const images = item.images || [];
  const cover = images[0];
  // 媒体产出（音频/视频）：渲染播放器而非图片网格，避免 broken img
  const mediaType = item.mediaType;
  const isAudio = mediaType === 'audio';
  const isVideo = mediaType === 'video';
  return (
    <div className="rounded-md border border-border p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs font-medium">
          {NODE_META[item.nodeType]?.icon} {NODE_META[item.nodeType]?.label || item.nodeType}
        </span>
        <span className="text-[10px] text-muted-foreground">{formatTime(item.createdAt)}</span>
      </div>
      {item.prompt && (
        <p className="mb-1.5 line-clamp-2 text-xs text-muted-foreground">{item.prompt}</p>
      )}
      {isAudio && cover && (
        <audio key={cover} src={cover} controls className="mb-1 w-full" />
      )}
      {isVideo && cover && (
        <video key={cover} src={cover} controls className="mb-1 w-full rounded border border-border" />
      )}
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
            <button
              type="button"
              key={i}
              onClick={() => openMediaGallery(images.map((src) => ({ src, type: 'image' })), i)}
              className="block aspect-square overflow-hidden rounded border border-border"
            >
              <img src={url} alt="" className="h-full w-full object-cover transition hover:opacity-80" />
            </button>
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
