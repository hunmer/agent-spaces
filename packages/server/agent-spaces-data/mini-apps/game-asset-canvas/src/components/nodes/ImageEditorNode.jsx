import { useCallback, useState } from 'react';
import { FileUpload } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import ImageResult from './ImageResult';
import ImageEditorDialog from '../ImageEditorDialog';
import { NODE_TYPES } from '../../utils/constants';

/**
 * 图片编辑节点：浏览器端用 Painterro 编辑单张图片（画笔/文字/裁切/马赛克/旋转等）。
 *
 * 编辑入口：点「编辑图片」按钮 → 打开 ImageEditorDialog（对话框内嵌 Painterro）
 *   → saveHandler 拿编辑结果 Blob → uploadFile 拿 http URL → 回填 data.output.images
 *   → 下游节点经 computeInputImages 自动派生，NodeToolbar 导出按钮自动可用
 *
 * 输入来源（单张，去重优先级：上传 > 上游连线）：
 * 1. FileUpload 用户上传的图（data.uploadedImages: string[]，持久化）
 * 2. 上游连线推入的图（data.images: string[]，由 computeInputImages 派生，只取首张）
 *
 * data.output: { images: string[] } 编辑后的产出
 * Painterro 是 IIFE 格式（var Painterro=...），经 cdn.js 追加 export default 转 ESM 加载。
 * 对话框传 `id` 参数给 Painterro，让它复用 Dialog 内容器，避免默认全屏 fixed 覆盖。
 */
export default function ImageEditorNode({ id, data, selected }) {
  const uploadedImages = Array.isArray(data?.uploadedImages) ? data.uploadedImages : [];
  const rawUpstream = Array.isArray(data?.images) ? data.images : [];
  const upstreamImages = rawUpstream.slice(0, 1); // 编辑节点单输入，连线只取首张
  // 输入：上传优先，无上传才用连线首张
  const inputImage = uploadedImages[0] || upstreamImages[0] || '';
  const images = data?.output?.images || [];
  const error = data?.error;
  const onUpdate = data?.onUpdate;
  const uploading = data?.uploading;
  const [dialogOpen, setDialogOpen] = useState(false);

  // FileUpload onChange：单图，上传拿 http URL。
  // value 是 FileUploadFile[]，对每个新 File 调 uploadFile 拿 http URL 持久化。
  const handleFilesChange = useCallback(async (files) => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) {
      console.warn('AgentSpaces.uploadFile 不可用');
      return;
    }
    const item = (files || [])[0];
    const f = item?.file;
    if (!f) {
      // 列表被清空
      onUpdate?.({ uploadedImages: [] });
      return;
    }
    const existing = f.uploadedUrl || f.uploadedHttpPath || f.url || f.httpPath;
    if (existing) {
      onUpdate?.({ uploadedImages: [existing], error: undefined });
      return;
    }
    if (!(f instanceof File)) return;
    onUpdate?.({ uploading: true, uploadError: undefined });
    try {
      const uploaded = await AS.uploadFile(f);
      const httpUrl = uploaded?.url || uploaded?.httpPath;
      if (!httpUrl) throw new Error('上传未返回 URL');
      onUpdate?.({ uploadedImages: [httpUrl], uploading: false, error: undefined });
    } catch (err) {
      console.error('ImageEditor upload failed:', err);
      onUpdate?.({ uploading: false, uploadError: err?.message || String(err) });
    }
  }, [onUpdate]);

  // 编辑器保存回调：写入产出
  const handleSave = useCallback((urls) => {
    onUpdate?.({ status: 'done', output: { images: urls }, error: undefined });
  }, [onUpdate]);

  // FileUpload value：把持久化的 uploadedImages URL 转回 FileUploadFile 格式
  const fileUploadValue = uploadedImages.map((url, i) => ({
    id: `up-${i}-${url.slice(-12)}`,
    file: { name: `upload-${i + 1}.png`, size: 0, type: 'image/png', url, httpPath: url },
    preview: url,
  }));

  return (
    <NodeShell id={id} nodeType={NODE_TYPES.imageEditor} data={data} selected={selected} targetHandle sourceHandle>
      {/* 输入图：FileUpload 单图上传 */}
      <FileUpload
        value={fileUploadValue}
        onChange={handleFilesChange}
        accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'] }}
        maxFiles={1}
        placeholder="点击或拖入单张图片"
      />
      {uploading && <p className="text-[10px] text-primary">上传中…</p>}
      {data?.uploadError && (
        <p className="text-[10px] text-red-500">上传失败：{data.uploadError}</p>
      )}

      {/* 上游连线图（只读，单张） */}
      {upstreamImages.length > 0 && uploadedImages.length === 0 && (
        <div className="flex items-center gap-2 rounded border border-primary/40 bg-muted/30 px-1.5 py-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded">
            <img
              src={upstreamImages[0]}
              alt=""
              draggable={false}
              className="pointer-events-none max-h-full max-w-full object-contain"
            />
          </div>
          <span className="truncate text-[10px] text-muted-foreground">🔗 来自连线</span>
        </div>
      )}

      {/* 输入来源统计 */}
      <div className="text-[11px] text-muted-foreground">
        {inputImage
          ? (uploadedImages.length ? '输入：上传 1 张' : '输入：连线 1 张')
          : '输入：无（上传或连线）'}
      </div>

      {/* 编辑按钮 */}
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        disabled={uploading || !inputImage}
        className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        🎨 编辑图片
      </button>

      {error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
      )}

      {/* 产出 */}
      {images.length > 0 && <ImageResult images={images} />}

      <ImageEditorDialog
        open={dialogOpen}
        imageUrl={inputImage}
        onSave={(urls) => {
          handleSave(urls);
          setDialogOpen(false);
        }}
        onClose={() => setDialogOpen(false)}
      />
    </NodeShell>
  );
}
