import { useCallback, useState } from 'react';
import { FileUpload } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import ImageResult from './ImageResult';
import FrameEditorDialog from '../FrameEditorDialog';
import { NODE_TYPES } from '../../utils/constants';

/**
 * 动画帧编辑器节点：接收上游多图或本地上传图片，节点内展示「编辑」按钮，
 * 点击弹出对话框用 scenejs-timeline(CDN) 编辑序列帧（时间线调出现时机 + 预览区调 x/y 偏移），
 * 最终可导出 GIF，写入 data.output.images 供下游使用。
 *
 * 输入来源（多帧，合并去重）：
 * 1. FileUpload 用户上传的图（data.uploadedImages: string[]，持久化）
 * 2. 上游连线推入的图（data.images: string[]，由 computeInputImages 派生）
 *
 * 编辑产出：导出的 GIF URL 写入 data.output.images，下游自动派生，NodeToolbar 按钮自动可用。
 */
export default function FrameEditorNode({ id, data, selected }) {
  const uploadedImages = Array.isArray(data?.uploadedImages) ? data.uploadedImages : [];
  const upstreamImages = Array.isArray(data?.images) ? data.images : [];
  // 合并去重（保序）
  const seen = new Set();
  const allFrames = [];
  for (const u of [...uploadedImages, ...upstreamImages]) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    allFrames.push(u);
  }
  const images = data?.output?.images || [];
  const uploading = data?.uploading;
  const error = data?.error;
  const onUpdate = data?.onUpdate;
  const [editorOpen, setEditorOpen] = useState(false);

  // FileUpload onChange：多图，对每个新 File 调 uploadFile 拿 http URL 持久化。
  const handleFilesChange = useCallback(async (files) => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) {
      console.warn('AgentSpaces.uploadFile 不可用');
      return;
    }
    const list = files || [];
    if (!list.length) {
      onUpdate?.({ uploadedImages: [] });
      return;
    }
    // 先把已有 uploadedUrl 的项直接收集，新 File 异步上传
    const collected = [];
    const pending = [];
    for (const it of list) {
      const f = it?.file;
      if (!f) continue;
      const existing = f.uploadedUrl || f.uploadedHttpPath || f.url || f.httpPath;
      if (existing) { collected.push(existing); continue; }
      if (f instanceof File) pending.push(f);
    }
    onUpdate?.({ uploading: true, uploadError: undefined });
    try {
      for (const f of pending) {
        const uploaded = await AS.uploadFile(f);
        const httpUrl = uploaded?.url || uploaded?.httpPath;
        if (httpUrl) collected.push(httpUrl);
      }
      onUpdate?.({ uploadedImages: collected, uploading: false, error: undefined });
    } catch (err) {
      console.error('FrameEditor upload failed:', err);
      onUpdate?.({ uploading: false, uploadError: err?.message || String(err) });
    }
  }, [onUpdate]);

  const handleSave = useCallback((urls) => {
    onUpdate?.({ status: 'done', output: { images: urls }, error: undefined });
  }, [onUpdate]);

  // FileUpload value：把持久化的 uploadedImages URL 转回 FileUploadFile 格式
  const fileUploadValue = uploadedImages.map((url, i) => ({
    id: `up-${i}-${url.slice(-12)}`,
    file: { name: `frame-${i + 1}.png`, size: 0, type: 'image/png', url, httpPath: url },
    preview: url,
  }));

  return (
    <NodeShell id={id} nodeType={NODE_TYPES.frameEditor} data={data} selected={selected} targetHandle sourceHandle>
      <FileUpload
        value={fileUploadValue}
        onChange={handleFilesChange}
        accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'] }}
        maxFiles={0}
        placeholder="点击或拖入多张序列帧图片"
      />
      {uploading && <p className="text-[10px] text-primary">上传中…</p>}
      {data?.uploadError && (
        <p className="text-[10px] text-red-500">上传失败：{data.uploadError}</p>
      )}

      {/* 上游连线图（只读，多张） */}
      {upstreamImages.length > 0 && uploadedImages.length === 0 && (
        <div className="rounded border border-primary/40 bg-muted/30 px-1.5 py-1">
          <div className="flex flex-wrap gap-1">
            {upstreamImages.slice(0, 6).map((url, i) => (
              <div key={i} className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded">
                <img src={url} alt="" draggable={false} className="pointer-events-none max-h-full max-w-full object-contain" />
              </div>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground">🔗 来自连线 {upstreamImages.length} 张</span>
        </div>
      )}

      {/* 输入来源统计 */}
      <div className="text-[11px] text-muted-foreground">
        {allFrames.length
          ? `输入：${allFrames.length} 帧${uploadedImages.length ? `（上传 ${uploadedImages.length}` : '（连线'}${uploadedImages.length && upstreamImages.length ? ` + 连线 ${upstreamImages.length}` : ''}）`
          : '输入：无（上传或连线）'}
      </div>

      {/* 编辑按钮 */}
      <button
        type="button"
        onClick={() => setEditorOpen(true)}
        disabled={uploading || allFrames.length < 1}
        className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        🎞️ 编辑帧序列
      </button>

      {error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
      )}

      {/* 产出 */}
      {images.length > 0 && <ImageResult images={images} />}

      <FrameEditorDialog
        open={editorOpen}
        frames={allFrames}
        onSave={handleSave}
        onClose={() => setEditorOpen(false)}
      />
    </NodeShell>
  );
}
