import { useState } from 'react';
import { openMediaGallery, ScrollArea, Tabs, TabsList, TabsTrigger, TabsContent } from '@agent-spaces/ui';
import { NODE_META, NODE_TYPES } from '../utils/constants';

const ADD_ITEMS = [
  { type: NODE_TYPES.textToImage, label: '文字生成图片' },
  { type: NODE_TYPES.editImage, label: '编辑图片' },
  { type: NODE_TYPES.imageDisplay, label: '图片展示' },
  { type: NODE_TYPES.note, label: '便签' },
];

/**
 * 右侧面板：新增节点 / 节点管理 / 生成记录 三个 tab。
 * @param {{ nodes: array, onSelectNode:(id)=>void, onLocateNode:(id)=>void, onDeleteNode:(id)=>void, onAdd:(type)=>void, onDragStartNode:(type)=>void, history: array, onRemoveHistory:(id)=>void, onClearHistory:()=>void, onUseImage:(url)=>void }} props
 */
export default function RightPanel({
  nodes, onSelectNode, onLocateNode, onDeleteNode,
  onAdd, onDragStartNode,
  history, onRemoveHistory, onClearHistory, onUseImage,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-card">
      <Tabs defaultValue="add" className="flex h-full min-h-0 flex-col">
        <TabsList className="grid w-full grid-cols-3 rounded-none border-b border-border">
          <TabsTrigger value="add">新增节点</TabsTrigger>
          <TabsTrigger value="nodes">节点管理</TabsTrigger>
          <TabsTrigger value="history">生成记录</TabsTrigger>
        </TabsList>

        <TabsContent value="add" className="mt-0 min-h-0 flex-1 overflow-hidden">
          <AddNodeList onAdd={onAdd} onDragStartNode={onDragStartNode} />
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
      </Tabs>
    </div>
  );
}

// ============ 新增节点（可点击添加，可拖拽到画布） ============
function AddNodeList({ onAdd, onDragStartNode }) {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-2 p-3">
        <p className="text-xs text-muted-foreground">点击添加，或拖拽到画布任意位置</p>
        {ADD_ITEMS.map((it) => {
          const meta = NODE_META[it.type];
          return (
            <button
              key={it.type}
              type="button"
              draggable
              onDragStart={(e) => onDragStartNode?.(it.type, e)}
              onClick={() => onAdd?.(it.type)}
              className="flex cursor-grab items-center gap-2 rounded-md border border-border bg-background px-3 py-2.5 text-sm font-medium transition hover:border-primary hover:text-primary active:cursor-grabbing"
            >
              <span className="text-base">{meta.icon}</span>
              <span>{it.label}</span>
            </button>
          );
        })}
      </div>
    </ScrollArea>
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
              className="group flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm transition hover:bg-muted"
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
                className="invisible rounded p-1 text-muted-foreground transition hover:text-primary group-hover:visible"
                onClick={(e) => { e.stopPropagation(); onLocateNode?.(n.id); }}
                title="在画布定位"
              >
                🎯
              </button>
              {/* 删除节点 */}
              <button
                type="button"
                className="invisible rounded p-1 text-muted-foreground transition hover:text-red-500 group-hover:visible"
                onClick={(e) => { e.stopPropagation(); onDeleteNode?.(n.id); }}
                title="删除节点"
              >
                🗑
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
      {cover && (
        <div className="grid grid-cols-4 gap-1">
          {images.slice(0, 4).map((url, i) => (
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
