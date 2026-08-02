import { useCallback, useContext, useRef, useState } from 'react';
import { CANVAS_IMAGE_DROP_MIME, Check, SquarePen, Trash2, Upload, debugCanvasImageDrag, getCanvasImageDropUrls, setCanvasImageDragData } from '@agent-spaces/ui';
import { IMAGE_REORDER_MIME } from '../utils/canvas-constants';
import { ImageSelectionContext } from '../context/ImageSelectionContext';
import { useCanvasGallery } from '../utils/canvas-gallery';
import ImageHoverCard from './ImageHoverCard';

/**
 * 图片上传组件：支持点击/拖拽上传，调用 window.AgentSpaces.uploadFile 上传到后端，
 * 返回 http URL 后回传给父组件，并展示已上传图片缩略图（可删除）。
 *
 * @param {{ value: string[], onChange:(urls:string[])=>void, max?:number, placeholder?:string, extraItems?:{src:string,badge?:string,onRemove?:()=>void}[], itemOrder?:string[], onReorderItems?:(urls:string[])=>void, onEditItem?:(url:string)=>void, bottomActions?:boolean }} props
 *   value: 已上传图片 URL 数组（http URL，可删）
 *   onChange: 上传成功/删除后回传新的 URL 数组
 *   max: 最大上传数量，默认 6（不含只读项）
 *   extraItems: 整合进同一网格的其它来源图片（参考图/连线图），渲染在上传图前面，带可选角标。
 *               传 onRemove 则该项右上角显示红色删除按钮（如参考图，可从提示词库带入后移除）；
 *               不传 onRemove 则纯只读（如连线图，由上游派生，不可在此删）。作用：把不同来源整合进同一网格。
 *   itemOrder/onReorderItems: 传入后，上传图和 extraItems 组成的整个列表均可拖拽排序。
 *   onEditItem: 可选。传入后，缩略图悬浮时在底部显示编辑/删除图标组，并回传待编辑图片 URL。
 *   bottomActions: 可选。即使没有编辑动作，也把删除按钮放到底部悬浮操作组。
 */
export default function FileUpload({ nodeId, value = [], onChange, max = 6, placeholder = '点击或拖拽图片到此处上传', extraItems = [], itemOrder = [], onReorderItems, onEditItem, bottomActions = false }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const urls = Array.isArray(value) ? value : [];
  // 只读项归一：过滤无 src 的项
  const extras = (Array.isArray(extraItems) ? extraItems : []).filter((e) => e && e.src);
  // 跨节点图片选中状态：checkbox 点击增删切换，ctrl+点击图片本体增删切换（跨节点累加）
  const { isSelected, toggle } = useContext(ImageSelectionContext);

  const rawItems = [
    ...extras.map((item, sourceIndex) => ({ ...item, kind: 'extra', sourceIndex })),
    ...urls.map((src, sourceIndex) => ({ src, kind: 'uploaded', sourceIndex })),
  ];
  const remainingItems = [...rawItems];
  const displayItems = [];
  for (const src of itemOrder || []) {
    const index = remainingItems.findIndex((item) => item.src === src);
    if (index >= 0) displayItems.push(...remainingItems.splice(index, 1));
  }
  displayItems.push(...remainingItems);

  // 默认仅上传图内部排序；注入 onReorderItems 后，参考图/连线图也参与统一排序。
  const unifiedSortable = typeof onReorderItems === 'function' && displayItems.length > 1;
  const uploadedSortable = !unifiedSortable && urls.length > 1;
  const useBottomActions = bottomActions || typeof onEditItem === 'function';
  const draggingRef = useRef(null);
  const [draggingIdx, setDraggingIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const reorderUploaded = (from, to) => {
    if (from === to || from < 0 || to < 0 || from >= urls.length || to >= urls.length) return;
    const next = [...urls];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onChange?.(next);
  };
  const reorderAll = (from, to) => {
    if (from === to || from < 0 || to < 0 || from >= displayItems.length || to >= displayItems.length) return;
    const next = [...displayItems];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorderItems?.(next.map((item) => item.src));
  };
  const onReorderDragStart = (displayIndex, item, sortable) => (e) => {
    setCanvasImageDragData(e.dataTransfer, [item.src]);
    debugCanvasImageDrag('local-input:dragstart', e.dataTransfer, { url: item.src, sortable });
    draggingRef.current = unifiedSortable ? displayIndex : item.sourceIndex;
    if (!sortable) {
      e.dataTransfer.effectAllowed = 'copy';
      return;
    }
    setDraggingIdx(displayIndex);
    e.dataTransfer.effectAllowed = 'copyMove';
    try {
      e.dataTransfer.setData('text/plain', String(displayIndex));
      // 写入互斥标记：画布 handleDrop 见此标记直接 return，不建节点（防误触发）
      e.dataTransfer.setData(IMAGE_REORDER_MIME, '1');
    } catch {}
  };
  const onReorderDragOver = (displayIndex, item) => (e) => {
    if (!unifiedSortable && (!uploadedSortable || item.kind !== 'uploaded')) return;
    const from = draggingRef.current;
    const to = unifiedSortable ? displayIndex : item.sourceIndex;
    if (from === null || from === to) return;
    e.preventDefault();
    if (overIdx !== displayIndex) setOverIdx(displayIndex);
    if (unifiedSortable) reorderAll(from, to);
    else reorderUploaded(from, to);
    draggingRef.current = to;
    setDraggingIdx(displayIndex);
  };
  const onReorderDragEnd = () => {
    draggingRef.current = null;
    setDraggingIdx(null);
    setOverIdx(null);
  };

  const uploadOne = useCallback(async (file) => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) throw new Error('上传能力不可用');
    const uploaded = await AS.uploadFile(file);
    const httpUrl = uploaded?.url || uploaded?.httpPath;
    if (!httpUrl) throw new Error('上传未返回 URL');
    return httpUrl;
  }, []);

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type?.startsWith('image/'));
    if (!files.length) return;
    const remaining = max - urls.length;
    if (remaining <= 0) {
      setError(`最多 ${max} 张`);
      return;
    }
    const toUpload = files.slice(0, remaining);
    setError('');
    setUploading(true);
    try {
      // 串行上传（避免并发压垮后端），失败跳过
      const ok = [];
      const failed = [];
      for (const f of toUpload) {
        try {
          ok.push(await uploadOne(f));
        } catch (e) {
          console.error('uploadOne failed:', e);
          failed.push(f.name);
        }
      }
      if (ok.length) onChange?.([...urls, ...ok]);
      if (failed.length) setError(`上传失败 ${failed.length} 张：${failed.join(', ')}`);
    } finally {
      setUploading(false);
    }
  }, [urls, max, onChange, uploadOne]);

  const onPick = useCallback(() => inputRef.current?.click(), []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation(); // 阻止冒泡到 ReactFlow，避免外部文件已被本组件消费后又触发画布「拖拽建节点」
    setDragOver(false);
    const droppedUrls = getCanvasImageDropUrls(e.dataTransfer);
    debugCanvasImageDrag('local-target:drop-handler', e.dataTransfer, {
      droppedUrls,
      ownDrag: draggingRef.current !== null,
      currentUrls: urls.length,
    });
    if (droppedUrls.length > 0) {
      if (draggingRef.current !== null) return;
      const remaining = max - urls.length;
      if (remaining <= 0) {
        setError(`最多 ${max} 张`);
        return;
      }
      setError('');
      onChange?.([...urls, ...droppedUrls.slice(0, remaining)]);
      debugCanvasImageDrag('local-target:onChange', e.dataTransfer, {
        addedUrls: droppedUrls.slice(0, remaining),
      });
      return;
    }
    handleFiles(e.dataTransfer.files);
  }, [handleFiles, max, onChange, urls]);

  const onInternalDragOverCapture = useCallback((e) => {
    debugCanvasImageDrag('local-target:dragover:capture', e.dataTransfer);
    if (draggingRef.current !== null) return;
    if (!Array.from(e.dataTransfer.types || []).includes(CANVAS_IMAGE_DROP_MIME)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  }, []);

  const onInternalDropCapture = useCallback((e) => {
    const droppedUrls = getCanvasImageDropUrls(e.dataTransfer);
    debugCanvasImageDrag('local-target:drop:capture', e.dataTransfer, { droppedUrls });
    if (droppedUrls.length === 0) return;
    if (draggingRef.current !== null) return;
    onDrop(e);
  }, [onDrop]);

  const onRemove = useCallback((idx) => {
    onChange?.(urls.filter((_, i) => i !== idx));
  }, [urls, onChange]);

  const allItems = displayItems.map((item) => ({ src: item.src, type: 'image' }));
  const openCanvasGallery = useCanvasGallery();
  const openAt = useCallback((idx) => {
    if (!allItems.length) return;
    openCanvasGallery(allItems, Math.max(0, Math.min(idx, allItems.length - 1)));
  }, [allItems, openCanvasGallery]);

  return (
    <div
      className="flex flex-col gap-2"
      onDragOverCapture={onInternalDragOverCapture}
      onDropCapture={onInternalDropCapture}
    >
      <style>{`
        .game-asset-upload-thumb {
          position: relative;
        }
        .game-asset-upload-thumb-actions {
          position: absolute;
          left: 50%;
          bottom: 2px;
          transform: translateX(-50%);
          z-index: 20;
          display: flex;
          align-items: center;
          gap: 4px;
          opacity: 0;
          pointer-events: none;
          transition: opacity 150ms ease;
        }
        .game-asset-upload-thumb-action {
          display: flex;
          width: 20px;
          height: 20px;
          flex: 0 0 20px;
          align-items: center;
          justify-content: center;
        }
        .game-asset-upload-add {
          min-width: 0;
          aspect-ratio: 1 / 1;
        }
        .game-asset-upload-thumb:hover .game-asset-upload-thumb-actions,
        .game-asset-upload-thumb:focus-within .game-asset-upload-thumb-actions {
          opacity: 1;
          pointer-events: auto;
        }
        /* 右上角选择 checkbox：选中时常驻显示，未选中时仅 hover 显示 */
        .game-asset-upload-checkbox {
          opacity: 0;
          pointer-events: none;
          transition: opacity 150ms ease;
        }
        .game-asset-upload-thumb:hover .game-asset-upload-checkbox,
        .game-asset-upload-thumb:focus-within .game-asset-upload-checkbox,
        .game-asset-upload-checkbox.game-asset-upload-checkbox-on {
          opacity: 1;
          pointer-events: auto;
        }
      `}</style>
      {(urls.length < max || extras.length > 0 || urls.length > 0) && (
        <div
          className="grid grid-cols-3 gap-1.5"
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          {urls.length < max && (
            <button
              type="button"
              data-upload-trigger
              onClick={onPick}
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              disabled={uploading}
              className={`game-asset-upload-add flex flex-col items-center justify-center gap-1 rounded-md border border-dashed px-1 text-xs text-muted-foreground transition disabled:opacity-50 ${
                dragOver ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary hover:text-primary'
              }`}
              title={placeholder}
              aria-label={placeholder}
            >
              {uploading ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
              <span>{uploading ? '上传中…' : '上传'}</span>
            </button>
          )}
          {displayItems.map((item, i) => {
            const sortable = unifiedSortable || (uploadedSortable && item.kind === 'uploaded');
            const sel = nodeId ? isSelected(nodeId, item.src) : false;
            return (
              <div
                key={i}
                data-image-selection-node-id={nodeId || undefined}
                data-image-selection-url={nodeId ? item.src : undefined}
                draggable
                onDragStart={onReorderDragStart(i, item, sortable)}
                onDragOver={sortable ? onReorderDragOver(i, item) : undefined}
                onDragEnd={onReorderDragEnd}
                onClick={(e) => {
                  // ctrl/meta + 点击图片本体：增删切换（跨节点累加多选）
                  if ((e.ctrlKey || e.metaKey) && nodeId) { e.stopPropagation(); toggle(nodeId, item.src, true); return; }
                  openAt(i);
                }}
                className={`game-asset-upload-thumb group relative aspect-square cursor-pointer overflow-hidden rounded-md border transition-colors ${
                  sortable && draggingIdx === i ? 'border-primary opacity-40'
                    : sortable && overIdx === i && draggingIdx !== i ? 'border-primary border-t-2'
                    : sel ? 'border-primary'
                    : item.kind === 'extra' ? 'border-border bg-muted/40' : 'border-border'
                } ${sortable ? 'cursor-grab active:cursor-grabbing' : ''}`}
              >
                <ImageHoverCard url={item.src} triggerShape="fixed" className="h-full w-full border-0">
                  <img src={item.src} alt="" draggable={false} className="h-full w-full object-cover" />
                </ImageHoverCard>
                {/* 右上角选择 checkbox：hover 显示空框，选中时常驻显示实心勾。点击切换选中（天然多选）。 */}
                {nodeId && (
                  <button
                    type="button"
                    draggable={false}
                    onPointerDown={(ev) => ev.stopPropagation()}
                    onClick={(ev) => { ev.stopPropagation(); toggle(nodeId, item.src, ev.metaKey || ev.ctrlKey); }}
                    title={sel ? '取消选择' : '选择'}
                    className={`game-asset-upload-checkbox nodrag nopan nowheel ${sel ? 'game-asset-upload-checkbox-on' : ''} absolute right-1 top-1 z-20 flex h-4 w-4 items-center justify-center rounded-full border shadow ${
                      sel ? 'border-primary bg-primary text-primary-foreground' : 'border-background bg-background/90 text-foreground hover:border-primary hover:text-primary'
                    }`}
                  >
                    {sel && <Check className="h-2.5 w-2.5" />}
                  </button>
                )}
                {item.badge && (
                  <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[9px] leading-tight text-white">
                    {item.badge}
                  </span>
                )}
                {useBottomActions ? (
                  <div className="game-asset-upload-thumb-actions nodrag nopan nowheel">
                    {typeof onEditItem === 'function' && (
                      <button
                        type="button"
                        draggable={false}
                        onPointerDown={(ev) => ev.stopPropagation()}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onEditItem?.(item.src);
                        }}
                        className="game-asset-upload-thumb-action rounded border border-border bg-background/90 text-foreground shadow hover:bg-muted"
                        title="蒙版绘制"
                        aria-label="为此图片绘制蒙版"
                      >
                        <SquarePen className="h-3 w-3" />
                      </button>
                    )}
                    {(item.kind === 'uploaded' || typeof item.onRemove === 'function') && (
                      <button
                        type="button"
                        draggable={false}
                        onPointerDown={(ev) => ev.stopPropagation()}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (item.kind === 'uploaded') onRemove(item.sourceIndex);
                          else item.onRemove();
                        }}
                        className="game-asset-upload-thumb-action rounded border border-border bg-background/90 text-destructive shadow hover:bg-destructive hover:text-destructive-foreground"
                        title="移除"
                        aria-label="移除图片"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ) : (item.kind === 'uploaded' || typeof item.onRemove === 'function') && (
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (item.kind === 'uploaded') onRemove(item.sourceIndex);
                      else item.onRemove();
                    }}
                    className={`absolute right-0.5 top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow transition hover:bg-red-600 ${item.kind === 'extra' ? 'opacity-0 group-hover:opacity-100' : ''}`}
                    title="移除"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
