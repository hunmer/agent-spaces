import { useCallback, useState } from 'react';
import { FileUpload } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import ImageResult from './ImageResult';
import UpstreamImageList from './UpstreamImageList';
import UiSplitterDialog from '../UiSplitterDialog';
import { NODE_TYPES } from '../../utils/constants';
import { dedupeUrls } from '../../utils/workflow';

/**
 * UI 拆分节点：接收上游多图或本地上传图片，节点内展示「拆分」按钮，
 * 点击弹出对话框，用 fabric.js 画布框选 + 连通域检测把每张图拆成多张切片，
 * 保存后所有图的所有切片上传写入 data.output.images，供下游使用。
 *
 * 输入来源（两种合并去重，多图）：
 * 1. FileUpload 用户上传的图（data.uploadedImages: string[]，持久化，可多张）
 * 2. 上游连线推入的图（data.images: string[]，由 computeInputImages 派生）
 *
 * 依赖：vendor/fabric.min.js（fabric@5.3.0 IIFE，经 cdn.js 转 ESM 加载）。
 */
export default function UiSplitterNode({ id, data, selected }) {
  const uploadedImages = Array.isArray(data?.uploadedImages) ? data.uploadedImages : [];
  const upstreamImages = Array.isArray(data?.images) ? data.images : [];
  // 合并输入：上传图在前 + 上游连线图在后，去重保序
  const inputImages = dedupeUrls([...uploadedImages, ...upstreamImages]);
  const images = data?.output?.images || [];
  const status = data?.status || 'idle';
  const error = data?.error;
  const onUpdate = data?.onUpdate;
  const uploading = data?.uploading;
  const [dialogOpen, setDialogOpen] = useState(false);

  // FileUpload onChange：多图，对每个新文件调 uploadFile 拿 http URL，已上传的复用 URL（排序不重传）
  const handleFilesChange = useCallback(async (files) => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) {
      console.warn('AgentSpaces.uploadFile 不可用');
      return;
    }
    const urls = [];
    const pending = [];
    for (const item of files || []) {
      const f = item?.file;
      if (!f) continue;
      const existing = f.uploadedUrl || f.uploadedHttpPath || f.url || f.httpPath;
      if (existing) { urls.push(existing); continue; }
      if (f instanceof File) pending.push(f);
    }
    if (pending.length) {
      onUpdate?.({ uploading: true, uploadError: undefined });
      try {
        for (const f of pending) {
          const uploaded = await AS.uploadFile(f);
          const httpUrl = uploaded?.url || uploaded?.httpPath;
          if (httpUrl) urls.push(httpUrl);
        }
      } catch (err) {
        console.error('UiSplitter upload failed:', err);
        onUpdate?.({ uploading: false, uploadError: err?.message || String(err) });
        return;
      }
    }
    onUpdate?.({ uploadedImages: urls, uploading: false, error: undefined });
  }, [onUpdate]);

  const handleSave = useCallback((urls) => {
    onUpdate?.({ status: 'done', output: { images: urls }, error: undefined });
  }, [onUpdate]);

  // FileUpload value：把持久化的 uploadedImages URL 转回 FileUploadFile 格式
  const fileUploadValue = uploadedImages.map((url, i) => ({
    id: `up-${i}-${url.slice(-12)}`,
    file: { name: `input-${i + 1}.png`, size: 0, type: 'image/png', url, httpPath: url },
    preview: url,
  }));

  return (
    <NodeShell id={id} nodeType={NODE_TYPES.uiSplitter} data={data} selected={selected} targetHandle sourceHandle>
      {/* 输入图：FileUpload 多图上传 */}
      <FileUpload
        value={fileUploadValue}
        onChange={handleFilesChange}
        accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'] }}
        maxFiles={0}
        sortable
        placeholder="点击或拖入多张图（可拖拽排序）"
      />
      {uploading && <p className="text-[10px] text-primary">上传中…</p>}
      {data?.uploadError && (
        <p className="text-[10px] text-red-500">上传失败：{data.uploadError}</p>
      )}

      {/* 上游连线图（只读，多张） */}
      {upstreamImages.length > 0 && (
        <UpstreamImageList urls={upstreamImages} sortable onChangeOrder={(next) => onUpdate?.({ upstreamOrder: next })} />
      )}

      {/* 输入来源统计 */}
      <div className="text-[11px] text-muted-foreground">
        {inputImages.length > 0
          ? `输入 ${inputImages.length} 张${uploadedImages.length ? `（上传 ${uploadedImages.length}` : ''}${uploadedImages.length && upstreamImages.length ? ' + ' : ''}${upstreamImages.length ? `连线 ${upstreamImages.length}` : ''}${uploadedImages.length || upstreamImages.length ? '）' : ''}`
          : '输入：无（上传或连线）'}
      </div>

      {/* 拆分按钮 */}
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        disabled={uploading || !inputImages.length}
        className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        🧩 打开拆分编辑器
      </button>

      {status === 'running' && (
        <p className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">处理中…</p>
      )}
      {error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
      )}

      {/* 产出 */}
      {images.length > 0 && <ImageResult images={images} />}

      <UiSplitterDialog
        open={dialogOpen}
        inputImages={inputImages}
        onSave={handleSave}
        onClose={() => setDialogOpen(false)}
      />
    </NodeShell>
  );
}
