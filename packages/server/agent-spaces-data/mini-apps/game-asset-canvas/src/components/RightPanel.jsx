import { useState } from 'react';
import {
  openMediaGallery, ScrollArea, Tabs, TabsList, TabsTrigger, TabsContent,
  Crosshair, Trash2, Plus, Boxes, History, Images,
} from '@agent-spaces/ui';
import { NODE_META, NODE_TYPES } from '../utils/constants';
import AssetLibrary from './AssetLibrary';

const ADD_ITEMS = [
  { type: NODE_TYPES.textToImage, label: '文字生成图片' },
  { type: NODE_TYPES.editImage, label: '编辑图片' },
  { type: NODE_TYPES.imageDisplay, label: '图片展示' },
  { type: NODE_TYPES.imageProcess, label: '图像处理' },
  { type: NODE_TYPES.imageEditor, label: '图片编辑' },
  { type: NODE_TYPES.frameEditor, label: '动画帧编辑器' },
  { type: NODE_TYPES.pixelEditor, label: '像素编辑器' },
  { type: NODE_TYPES.note, label: '便签' },
];

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
function AddNodeList({ onAdd, onDragStartNode, onOpenForm }) {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-2 p-3">
        <p className="text-xs text-muted-foreground">点击添加，或拖拽到画布任意位置</p>
        {ADD_ITEMS.map((it) => {
          const meta = NODE_META[it.type];
          const hasForm = FORM_NODE_TYPES.has(it.type);
          return (
            <div key={it.type} className="flex items-center gap-1.5">
              <button
                type="button"
                draggable
                onDragStart={(e) => onDragStartNode?.(it.type, e)}
                onClick={() => onAdd?.(it.type)}
                className="flex flex-1 cursor-grab items-center gap-2 rounded-md border border-border bg-background px-3 py-2.5 text-sm font-medium transition hover:border-primary hover:text-primary active:cursor-grabbing"
              >
                <span className="text-base">{meta.icon}</span>
                <span>{it.label}</span>
              </button>
              {hasForm && (
                <button
                  type="button"
                  onClick={() => onOpenForm?.(it.type)}
                  title="填写参数并提交到执行队列"
                  className="flex shrink-0 items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-2.5 text-xs font-medium text-primary transition hover:bg-primary/20"
                >
                  ⚡生成
                </button>
              )}
            </div>
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
