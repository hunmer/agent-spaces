import { useCallback, useRef, useState, useEffect } from 'react';
import { NodeResizer, NodeToolbar, Position } from '@xyflow/react';
import { ChevronLeft, ChevronRight, Upload } from '@agent-spaces/ui';
import useViewportActivation from '../../hooks/useViewportActivation';
import { FLOATING_HANDLE_OFFSET } from '../canvas/floating-edge-utils';
import FloatingHandle from './FloatingHandle';

/**
 * 视频展示节点：纯展示视频，无外壳边框/标题栏（结构对标 ImageDisplayNode）。
 *
 * - 顶部一条窄的自定义拖拽 handle（.image-drag-handle，复用同款 dragHandle 规则）
 * - 视频主体（满宽），<video controls> 播放，双击全屏
 * - 选中时底部 overlay：来源标签 + 多视频切换箭头 + 上传按钮
 * - 顶部 NodeToolbar：导出视频到画布
 *
 * data.videos: string[]  当前展示的视频（http URL）；多个时底部箭头切换
 * data.source: 'upload' | 'upstream' | ...  来源标记
 * data.tags: string[]  来源标签
 */
export default function VideoDisplayNode({ id, data, selected }) {
  const videos = Array.isArray(data?.videos) ? data.videos.filter(Boolean) : [];
  const onUpdate = data?.onUpdate;
  const fileRef = useRef(null);
  const rootRef = useRef(null);
  const viewportActivated = useViewportActivation(rootRef);
  const [uploading, setUploading] = useState(false);
  const source = data?.source;
  const tags = Array.isArray(data?.tags) ? data.tags.filter(Boolean) : [];
  // 多视频当前索引；集合变化时夹回有效范围
  const [vidIndex, setVidIndex] = useState(0);
  useEffect(() => {
    if (vidIndex > videos.length - 1) setVidIndex(Math.max(0, videos.length - 1));
  }, [videos.length, vidIndex]);

  const selectionCount = data?.selectionCount ?? 1;
  const isMulti = videos.length > 1;
  const current = videos[Math.min(vidIndex, videos.length - 1)] || videos[0];

  const onExportVideos = data?.onExportVideos;
  const showToolbar = videos.length > 0 && !!onExportVideos;

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
      onUpdate?.({ videos: [httpUrl], source: 'upload' });
    } catch (err) {
      console.error('uploadFile failed:', err);
      onUpdate?.({ error: `上传失败：${err?.message || String(err)}` });
    } finally {
      setUploading(false);
    }
  }, [onUpdate]);

  // 双击全屏播放
  const toggleFullscreen = useCallback((e) => {
    const v = e.currentTarget;
    if (!v) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      v.requestFullscreen?.();
    }
  }, []);

  const sourceLabel = data?.source === 'upstream' ? '来自连线'
    : source === 'history' ? '来自记录'
    : '已上传';

  return (
    <div ref={rootRef} className="group relative h-full w-full overflow-visible">
      {showToolbar && (
        <NodeToolbar isVisible={!!selected && selectionCount <= 1} position={Position.Top} align="center" offset={8}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onExportVideos(videos); }}
            className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary"
          >导出视频</button>
        </NodeToolbar>
      )}

      <NodeResizer
        isVisible={!!selected}
        minWidth={200}
        minHeight={140}
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
        {/* 顶部自定义拖拽 handle */}
        <div
          className="image-drag-handle absolute left-0 right-0 top-0 z-10 h-5 cursor-move opacity-0 transition group-hover:opacity-100"
          title="拖拽移动"
        >
          <div className="mx-auto mt-1 h-1 w-8 rounded-full bg-foreground/30" />
        </div>

        {/* 视频主体区域 */}
        <div className="image-drag-handle nopan absolute bottom-0 left-2 right-2 top-0 flex items-center justify-center p-3">
          {uploading ? (
            <div className="flex h-full w-full items-center justify-center gap-2 text-xs text-primary">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              上传中…
            </div>
          ) : videos.length > 0 ? (
            current && viewportActivated && (
              <video
                key={current}
                src={current}
                controls
                onDoubleClick={toggleFullscreen}
                title="双击全屏"
                className="max-h-full max-w-full rounded border border-border object-contain"
              />
            )
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="image-drag-handle flex h-full w-full cursor-move flex-col items-center justify-center gap-2 border-2 border-dashed border-border text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <Upload className="h-6 w-6" />
              <span className="pointer-events-none select-none">点击上传视频</span>
            </button>
          )}
        </div>

        {/* 选中时底部 overlay */}
        {selected && (videos.length > 0 || tags.length > 0) && !uploading && (
          <div className="nodrag nopan absolute bottom-1.5 left-1.5 right-1.5 z-10 flex items-center gap-1.5 rounded-md bg-background/85 px-2 py-1 text-xs shadow ring-1 ring-border backdrop-blur-sm">
            {isMulti && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setVidIndex((i) => (i - 1 + videos.length) % videos.length); }}
                  className="rounded p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  title="上一个"
                ><ChevronLeft className="h-3.5 w-3.5" /></button>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {Math.min(vidIndex, videos.length - 1) + 1}/{videos.length}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setVidIndex((i) => (i + 1) % videos.length); }}
                  className="rounded p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  title="下一个"
                ><ChevronRight className="h-3.5 w-3.5" /></button>
              </>
            )}
            <span className="truncate text-muted-foreground">{sourceLabel}</span>
            {tags.map((t) => (
              <span
                key={t}
                className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
              >{t}</span>
            ))}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
              className="ml-auto flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-muted-foreground transition hover:border-primary hover:text-primary"
              title="更换视频"
            ><Upload className="h-3 w-3" />更换</button>
          </div>
        )}

        {data?.error && (
          <p className="absolute bottom-1.5 left-1.5 right-1.5 z-10 rounded bg-red-500/90 px-2 py-1 text-xs text-white">{data.error}</p>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </div>
  );
}
