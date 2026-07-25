import { useCallback, useState } from 'react';
import { FileUpload } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import ImageResult from './ImageResult';
import BBoxViewerDialog from '../BBoxViewerDialog';
import { NODE_TYPES } from '../../utils/constants';

/**
 * BBox 查看节点：接收上游单图或本地上传图片，弹出 fabric 编辑器
 * 渲染/编辑 bbox 框（JSON 导入或 Alt 拉框），支持批量导出框区域到 ZIP 或画布。
 *
 * 输入来源（单图，上传优先 > 连线首张）：
 * 1. FileUpload 用户上传（data.uploadedImages: string[]，单张）
 * 2. 上游连线推入（data.images: string[]，由 computeInputImages 派生，取首张）
 *
 * 依赖：vendor/fabric.min.js + vendor/jszip.js（均经 cdn.js 加载）。
 */
export default function BBoxViewerNode({ id, data, selected }) {
  const uploadedImages = Array.isArray(data?.uploadedImages) ? data.uploadedImages : [];
  const upstreamImages = Array.isArray(data?.images) ? data.images : [];
  // 单图：上传优先，无上传取连线首张
  const inputUrl = uploadedImages[0] || upstreamImages[0] || '';
  const inputImages = inputUrl ? [inputUrl] : [];
  const images = data?.output?.images || [];
  const onUpdate = data?.onUpdate;
  const uploading = data?.uploading;
  const agentConfig = data?.agentConfig;
  const [dialogOpen, setDialogOpen] = useState(false);

  // FileUpload onChange：单图，对新文件调 uploadFile 拿 http URL
  const handleFilesChange = useCallback(async (files) => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) {
      console.warn('AgentSpaces.uploadFile 不可用');
      return;
    }
    const item = (files || [])[0];
    const f = item?.file;
    if (!f) {
      onUpdate?.({ uploadedImages: [] });
      return;
    }
    const existing = f.uploadedUrl || f.uploadedHttpPath || f.url || f.httpPath;
    if (existing) {
      onUpdate?.({ uploadedImages: [existing] });
      return;
    }
    if (!(f instanceof File)) return;
    onUpdate?.({ uploading: true, uploadError: undefined });
    try {
      const uploaded = await AS.uploadFile(f);
      const httpUrl = uploaded?.url || uploaded?.httpPath;
      if (!httpUrl) throw new Error('上传未返回 URL');
      onUpdate?.({ uploadedImages: [httpUrl], uploading: false, uploadError: undefined });
    } catch (err) {
      console.error('BBoxViewer upload failed:', err);
      onUpdate?.({ uploading: false, uploadError: err?.message || String(err) });
    }
  }, [onUpdate]);

  const handleSave = useCallback((urls) => {
    onUpdate?.({ status: 'done', output: { images: urls }, error: undefined });
  }, [onUpdate]);

  const handleClear = useCallback(() => {
    onUpdate?.({ uploadedImages: [] });
  }, [onUpdate]);

  // FileUpload value
  const fileUploadValue = uploadedImages.map((url, i) => ({
    id: `up-${i}-${url.slice(-12)}`,
    file: { name: `input-${i + 1}.png`, size: 0, type: 'image/png', url, httpPath: url },
    preview: url,
  }));

  return (
    <NodeShell id={id} nodeType={NODE_TYPES.bboxViewer} data={data} selected={selected} targetHandle sourceHandle>
      {/* 输入图：有上传图 → 预览 + 清空；否则 FileUpload */}
      {inputUrl && !uploading ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground">
              背景图
              <span className="ml-1 text-muted-foreground/70">
                ({uploadedImages.length ? '上传' : '连线'})
              </span>
            </span>
            {uploadedImages.length > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleClear(); }}
                title="清空图片"
                className="rounded p-0.5 text-[11px] leading-none text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              >✕</button>
            )}
          </div>
          <div className="nodrag nopan nowheel group relative overflow-hidden rounded-md border border-border bg-muted/30">
            <img
              src={inputUrl}
              alt="背景图"
              draggable={false}
              className="block max-h-32 w-full object-contain"
            />
            {uploadedImages.length === 0 && (
              <span className="absolute left-1 top-1 rounded bg-background/80 px-1 py-0.5 text-[9px] text-muted-foreground">
                🔗 连线
              </span>
            )}
          </div>
        </div>
      ) : (
        <FileUpload
          value={fileUploadValue}
          onChange={handleFilesChange}
          accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }}
          maxFiles={1}
          placeholder="点击或拖入背景图"
        />
      )}
      {uploading && <p className="text-[10px] text-primary">上传中…</p>}
      {data?.uploadError && (
        <p className="text-[10px] text-red-500">上传失败：{data.uploadError}</p>
      )}

      {/* 输入统计 */}
      <div className="text-[11px] text-muted-foreground">
        {inputUrl ? '已就绪，点下方打开查看器' : '需上传或连线一张背景图'}
      </div>

      {/* 打开按钮 */}
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        disabled={uploading || !inputUrl}
        className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        📦 打开 BBox 查看器
      </button>

      {data?.error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{data.error}</p>
      )}

      {/* 产出（导出到画布的图） */}
      {images.length > 0 && <ImageResult images={images} />}

      <BBoxViewerDialog
        open={dialogOpen}
        inputImages={inputImages}
        onSave={handleSave}
        onClose={() => setDialogOpen(false)}
        agentConfig={agentConfig}
      />
    </NodeShell>
  );
}
