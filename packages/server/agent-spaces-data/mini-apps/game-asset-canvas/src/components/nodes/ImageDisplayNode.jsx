import { useCallback, useRef, useState, useEffect } from 'react';
import { NodeResizer, NodeToolbar, Position } from '@xyflow/react';
import { ChevronLeft, ChevronRight, Upload, openMediaGallery } from '@agent-spaces/ui';
import useViewportActivation from '../../hooks/useViewportActivation';
import { FLOATING_HANDLE_OFFSET } from '../canvas/floating-edge-utils';
import FloatingHandle from './FloatingHandle';

/**
 * 图片展示节点：纯展示图片，无外壳边框/标题栏。
 *
 * 结构：
 * - 顶部一条窄的「自定义拖拽 handle」（.image-drag-handle），通过 ReactFlow node.dragHandle
 *   限定整节点只能从该处拖动（图片区域不触发拖拽，便于点图看大图/框选）。
 * - 图片主体（满宽 object-contain），点击看大图。
 * - 选中时底部浮出 overlay：来源 tags + 多图切换箭头 + 上传按钮。
 * - Handle 左(输入)/右(输出)，NodeResizer 选中时显示，NodeToolbar 导出/抠图/放大/编辑（复用 NodeShell 行为）。
 *
 * data.images: string[]  当前展示的图片（http URL）；多图时底部箭头切换。
 * data.source: 'upload' | 'url' | 'upstream' | 'history' | ...  来源标记
 * data.tags: string[]  来源标签
 */
export default function ImageDisplayNode({ id, data, selected }) {
  const images = Array.isArray(data?.images) ? data.images.filter(Boolean) : [];
  const onUpdate = data?.onUpdate;
  const onAutoSize = data?.onAutoSize;
  const autoSizeEnabled = data?.autoSize !== false;
  const fileRef = useRef(null);
  const rootRef = useRef(null);
  const viewportActivated = useViewportActivation(rootRef);
  const [uploading, setUploading] = useState(false);
  const loading = data?.loading;
  const source = data?.source;
  const tags = Array.isArray(data?.tags) ? data.tags.filter(Boolean) : [];
  // 多图当前索引；图片集合变化时自动夹回有效范围
  const [imgIndex, setImgIndex] = useState(0);
  useEffect(() => {
    if (imgIndex > images.length - 1) setImgIndex(Math.max(0, images.length - 1));
  }, [images.length, imgIndex]);

  const selectionCount = data?.selectionCount ?? 1;
  const isMulti = images.length > 1;
  const current = images[Math.min(imgIndex, images.length - 1)] || images[0];

  // 工具栏按钮可见性（与原 NodeShell 逻辑一致：有产出图且有回调）
  const onExportImages = data?.onExportImages;
  const onProcessImage = data?.onProcessImage;
  const onEditImages = data?.onEditImages;
  const showProcessButtons = images.length > 0 && onProcessImage;
  const showEditButton = images.length > 0 && onEditImages;
  const showToolbar = images.length > 0 && onExportImages || showProcessButtons || showEditButton;

  // 图片加载完成：按自然尺寸回调 Canvas 自动调整节点尺寸
  const handleImgLoad = useCallback((e) => {
    const img = e.currentTarget;
    const nw = img?.naturalWidth;
    const nh = img?.naturalHeight;
    if (nw && nh && onAutoSize && autoSizeEnabled) onAutoSize(id, nw, nh);
  }, [autoSizeEnabled, id, onAutoSize]);

  const handleFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) {
      console.warn('AgentSpaces.uploadFile 不可用');
      return;
    }
    setUploading(true);
    try {
      const uploaded = await AS.uploadFile(file);
      const httpUrl = uploaded?.url || uploaded?.httpPath;
      if (!httpUrl) throw new Error('上传未返回 URL');
      onUpdate?.({ images: [httpUrl], source: 'upload' });
    } catch (err) {
      console.error('uploadFile failed:', err);
      onUpdate?.({ error: `上传失败：${err?.message || String(err)}` });
    } finally {
      setUploading(false);
    }
  }, [onUpdate]);

  const open = useCallback(() => {
    if (!images.length) return;
    openMediaGallery(images.map((src) => ({ src, type: 'image' })), Math.min(imgIndex, images.length - 1));
  }, [images, imgIndex]);

  const sourceLabel = data?.source === 'upstream' ? '来自连线'
    : source === 'url' ? '来自 URL'
    : source === 'history' ? '来自记录'
    : source === 'segment' ? '抠图结果'
    : source === 'enhance' ? '放大结果'
    : source === 'error' ? '处理失败'
    : '已上传';

  return (
    <div ref={rootRef} className="group relative h-full w-full overflow-visible">
      {/* NodeToolbar：导出/抠图/放大/编辑（选中且单选时） */}
      {showToolbar && (
        <NodeToolbar isVisible={!!selected && selectionCount <= 1} position={Position.Top} align="center" offset={8}>
          <div className="flex items-center gap-1">
            {showEditButton && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEditImages(images); }}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary"
              >编辑</button>
            )}
            {showProcessButtons && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onProcessImage(images, 'segment'); }}
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary"
                >抠图</button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onProcessImage(images, 'enhance'); }}
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary"
                >放大</button>
              </>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onExportImages(images); }}
              className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary"
            >导出图片</button>
          </div>
        </NodeToolbar>
      )}

      {/* 选中时显示 resize 控件 */}
      <NodeResizer
        isVisible={!!selected}
        minWidth={180}
        minHeight={120}
        color="#6366f1"
        handleClassName="!w-2.5 !h-2.5 !rounded-sm !border-2 !border-background"
        lineClassName="!border-primary/40"
      />

      <FloatingHandle
        type="target"
        position={Position.Left}
        style={{ left: -FLOATING_HANDLE_OFFSET, zIndex: 50 }}
      />
      <FloatingHandle
        type="source"
        position={Position.Right}
        style={{ right: -FLOATING_HANDLE_OFFSET, zIndex: 50 }}
      />

      <div className="absolute inset-0 overflow-hidden rounded-lg bg-card shadow-sm">
      {/* 顶部自定义拖拽 handle：ReactFlow node.dragHandle 指向 .image-drag-handle，
          整节点只能从这里拖动。透明窄条覆盖图片顶部，hover 时浮现便于发现。 */}
      <div
        className="image-drag-handle absolute left-0 right-0 top-0 z-10 h-5 cursor-move opacity-0 transition group-hover:opacity-100"
        title="拖拽移动"
      >
        <div className="mx-auto mt-1 h-1 w-8 rounded-full bg-foreground/30" />
      </div>

      {/* 图片主体区域：作为节点拖拽 handle（.image-drag-handle，配合 Canvas node.dragHandle）。
          img 本身 draggable={false} 防止浏览器原生拖图虚影，但父容器是 ReactFlow 拖拽区，
          按住图片拖动即可移动整个节点。nowheel 防滚轮误触画布缩放。
          水平内缩(left-2/right-2)给左右 Handle 留空间，避免视觉遮挡 + 事件覆盖；
          p-3 让图片本身不贴边。 */}
      <div className="image-drag-handle nopan nowheel absolute bottom-0 left-2 right-2 top-0 flex items-center justify-center p-3">
        {loading ? (
          <div className="flex h-full w-full items-center justify-center gap-2 text-xs text-primary">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            生成中…
          </div>
        ) : uploading ? (
          <div className="flex h-full w-full items-center justify-center gap-2 text-xs text-primary">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            上传中…
          </div>
        ) : images.length > 0 ? (
          <button type="button" onDoubleClick={open} title="双击查看大图" className="flex max-h-full max-w-full items-center justify-center">
            {current && viewportActivated && (
              <img
                key={current}
                src={current}
                alt=""
                draggable={false}
                className="max-h-full max-w-full select-none object-contain"
                onLoad={handleImgLoad}
              />
            )}
          </button>
        ) : (
          // 空态：点开上传。带 image-drag-handle class 让空节点也能从该区域拖动。
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="image-drag-handle flex h-full w-full cursor-move flex-col items-center justify-center gap-2 border-2 border-dashed border-border text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <Upload className="h-6 w-6" />
            <span className="pointer-events-none select-none">点击上传图片</span>
          </button>
        )}
      </div>

      {/* 选中时底部 overlay：tags + 多图切换 + 上传 */}
      {selected && (images.length > 0 || tags.length > 0) && !loading && !uploading && (
        <div className="nodrag nopan absolute bottom-1.5 left-1.5 right-1.5 z-10 flex items-center gap-1.5 rounded-md bg-background/85 px-2 py-1 text-xs shadow ring-1 ring-border backdrop-blur-sm">
          {/* 多图切换 */}
          {isMulti && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setImgIndex((i) => (i - 1 + images.length) % images.length); }}
                className="rounded p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                title="上一张"
              ><ChevronLeft className="h-3.5 w-3.5" /></button>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {Math.min(imgIndex, images.length - 1) + 1}/{images.length}
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setImgIndex((i) => (i + 1) % images.length); }}
                className="rounded p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                title="下一张"
              ><ChevronRight className="h-3.5 w-3.5" /></button>
            </>
          )}
          {/* 来源 + tags */}
          <span className="truncate text-muted-foreground">{sourceLabel}</span>
          {tags.map((t) => (
            <span
              key={t}
              className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
            >{t}</span>
          ))}
          {/* 更换/上传 */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
            className="ml-auto flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-muted-foreground transition hover:border-primary hover:text-primary"
            title="更换图片"
          ><Upload className="h-3 w-3" />更换</button>
        </div>
      )}

      {data?.error && (
        <p className="absolute bottom-1.5 left-1.5 right-1.5 z-10 rounded bg-red-500/90 px-2 py-1 text-xs text-white">{data.error}</p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
      </div>
    </div>
  );
}
