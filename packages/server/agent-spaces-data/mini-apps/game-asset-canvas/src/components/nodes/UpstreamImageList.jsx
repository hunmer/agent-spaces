import { useRef, useState } from 'react';
import { X } from '@agent-spaces/ui';

/**
 * 通用「上游连线图列表」组件：缩略图（hover 显示删除按钮，删除即断开对应连线），
 * 可选拖拽 + 上下移按钮排序。
 * 从 ImageProcessNode 抽出，供所有「多输入」节点复用（GIF 合成 / 像素编辑器 / 动画帧编辑器 等）。
 *
 * 排序结果（url 数组）经 onChangeOrder 回写到节点 data.upstreamOrder 持久化。
 * data.images 由 computeInputImages 派生会覆盖，所以顺序单独存在 upstreamOrder，
 * 见配套工具函数 {@link orderUpstream}。
 *
 * 删除：传 onDelete(url) 时每项 hover 右上角显示 ×，点击后由调用方反查产出该 url 的连入边并删除。
 *
 * @param {Object} props
 * @param {string[]} props.urls        当前（已按 upstreamOrder 排序的）上游连线图列表
 * @param {boolean} [props.sortable]   是否开启拖拽/上下移排序
 * @param {(next: string[]) => void} [props.onChangeOrder]  排序变化回调
 * @param {string|Function} [props.itemLabel]   单项右侧标签文案（默认「第 N 帧」），传 '' 则不显示
 * @param {(url: string) => void} [props.onDelete]  删除单张上游图（断开对应连线）；不传则不显示删除按钮
 * @param {string[]} [props.nonDeletableUrls]  不允许删除的图片 URL（分组「按上传素材执行」注入）
 */
export default function UpstreamImageList({
  urls, sortable, onChangeOrder, itemLabel, onDelete, nonDeletableUrls = [],
}) {
  // draggingIdx 用 ref 保证 dragstart→dragover 之间同步读取（state 异步会读到 null）。
  // overIdx 用 state 仅驱动渲染高亮。
  const draggingRef = useRef(null);
  const [draggingIdx, setDraggingIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const nonDeletableSet = new Set(nonDeletableUrls);

  const move = (from, to) => {
    if (from === to || from < 0 || to < 0 || from >= urls.length || to >= urls.length) return;
    const next = [...urls];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onChangeOrder(next);
  };

  const onDragStart = (i) => (e) => {
    draggingRef.current = i;
    setDraggingIdx(i);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(i)); } catch {}
  };
  const onDragOver = (i) => (e) => {
    const from = draggingRef.current;
    if (from === null || from === i) return;
    e.preventDefault();
    if (overIdx !== i) setOverIdx(i);
    move(from, i);
    draggingRef.current = i;    // 同步更新索引，连续跨项拖拽才正确
    setDraggingIdx(i);
  };
  const onDragEnd = () => {
    draggingRef.current = null;
    setDraggingIdx(null);
    setOverIdx(null);
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">
        🔗 来自连线 {urls.length} 张{sortable ? '（可拖拽排序）' : ''}
      </span>
      <div className="flex flex-col gap-1">
        {urls.map((url, i) => {
          const isDragging = sortable && draggingIdx === i;
          const isOver = sortable && overIdx === i && draggingIdx !== i;
          return (
            <div
              key={url}
              draggable={sortable || undefined}
              onDragStart={sortable ? onDragStart(i) : undefined}
              onDragOver={sortable ? onDragOver(i) : undefined}
              onDragEnd={sortable ? onDragEnd : undefined}
              className={`group relative flex items-center gap-2 rounded border px-1.5 py-1 transition-colors ${
                isDragging ? 'border-primary opacity-40'
                  : isOver ? 'border-primary border-t-2'
                  : 'border-primary/40 bg-muted/30'
              } ${sortable ? 'cursor-grab active:cursor-grabbing' : ''}`}
            >
              {sortable && (
                <span className="shrink-0 text-[10px] leading-none text-muted-foreground select-none">⠿</span>
              )}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded">
                <img
                  src={url}
                  alt=""
                  draggable={false}
                  className="pointer-events-none max-h-full max-w-full object-contain"
                />
              </div>
              {itemLabel !== '' && (
                <span className="flex-1 truncate text-[10px] text-muted-foreground">
                  {typeof itemLabel === 'function' ? itemLabel(i) : `第 ${i + 1} 帧`}
                </span>
              )}
              {/* hover 删除按钮：点击断开产出该 url 的上游连线。 */}
              {onDelete && !nonDeletableSet.has(url) && (
                <button
                  type="button"
                  title="断开该上游连线"
                  onClick={(e) => { e.stopPropagation(); onDelete(url); }}
                  className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-destructive/30 bg-background text-destructive opacity-0 shadow-sm transition hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
              {sortable && (
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    title="上移"
                    disabled={i === 0}
                    onClick={(e) => { e.stopPropagation(); move(i, i - 1); }}
                    className="text-[10px] leading-none text-muted-foreground hover:text-primary disabled:opacity-30"
                  >▲</button>
                  <button
                    type="button"
                    title="下移"
                    disabled={i === urls.length - 1}
                    onClick={(e) => { e.stopPropagation(); move(i, i + 1); }}
                    className="text-[10px] leading-none text-muted-foreground hover:text-primary disabled:opacity-30"
                  >▼</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 按 upstreamOrder 重排上游连线图：order 里出现的 url 按其顺序在前，
 * 未在 order 里的（新连入的）按 raw 原顺序追加到末尾。
 * 过滤掉 order 中已失效（raw 不再含）的 url。
 *
 * @param {string[]} raw   computeInputImages 派生的当前上游图（真值，会被覆盖）
 * @param {string[]} order 用户上次排好的顺序（持久化在 data.upstreamOrder）
 * @returns {string[]}     合并后的有序列表
 */
export function orderUpstream(raw, order) {
  if (!order?.length) return raw;
  const rawSet = new Set(raw);
  const ordered = order.filter((u) => rawSet.has(u));
  const orderedSet = new Set(ordered);
  for (const u of raw) {
    if (!orderedSet.has(u)) ordered.push(u);
  }
  return ordered;
}
