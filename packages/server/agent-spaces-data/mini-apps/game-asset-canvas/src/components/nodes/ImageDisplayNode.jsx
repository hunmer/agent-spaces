import { useCallback, useRef, useState } from 'react';
import { openMediaGallery } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import { NODE_TYPES } from '../../utils/constants';

/**
 * 图片展示节点：上传一张图片（或粘贴 URL），可连线传给下游编辑节点。
 *
 * 上传走 window.AgentSpaces.uploadFile（use-mini-app-host-api.tsx）→ 返回 { url, ... }，
 * url 是 http URL，存入节点 data 持久化到 configs/canvas.json，刷新页面后图片不丢失。
 *
 * data.images: string[]  当前展示的图片（http URL）
 * data.source: 'upload' | 'url' | 'upstream' | 'history'  来源标记
 */
export default function ImageDisplayNode({ id, data, selected }) {
  const images = data?.images || [];
  const onUpdate = data?.onUpdate;
  const onAutoSize = data?.onAutoSize;
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  // 处理中（抠图/放大）显示加载占位，完成后刷新为结果图
  const loading = data?.loading;
  const source = data?.source;

  // 图片加载完成：按自然尺寸回调 Canvas 自动调整节点尺寸（仅触发一次：图片 URL 变化时重新测量）
  const handleImgLoad = useCallback((e) => {
    const img = e.currentTarget;
    const nw = img?.naturalWidth;
    const nh = img?.naturalHeight;
    if (nw && nh && onAutoSize) onAutoSize(id, nw, nh);
  }, [id, onAutoSize]);

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
      // uploadFile 返回 { name, path, size, type, url, httpPath }
      // url 即可直接用于 <img src> 的 http URL
      const uploaded = await AS.uploadFile(file);
      const httpUrl = uploaded?.url || uploaded?.httpPath;
      if (!httpUrl) throw new Error('上传未返回 URL');
      onUpdate?.({ images: [httpUrl], source: 'upload' });
    } catch (err) {
      console.error('uploadFile failed:', err);
      const msg = err?.message || String(err);
      onUpdate?.({ error: `上传失败：${msg}` });
    } finally {
      setUploading(false);
    }
  }, [onUpdate]);

  const handleUrl = useCallback((raw) => {
    const url = String(raw || '').trim();
    if (!url) return;
    onUpdate?.({ images: [url], source: 'url', error: undefined });
  }, [onUpdate]);

  const open = useCallback(() => {
    if (!images.length) return;
    openMediaGallery(images.map((src) => ({ src, type: 'image' })), 0);
  }, [images]);

  const isUpstream = data?.source === 'upstream';

  return (
    <NodeShell nodeType={NODE_TYPES.imageDisplay} data={data} selected={selected} targetHandle sourceHandle>
      {loading ? (
        // 抠图/放大处理中：加载占位
        <div className="flex h-28 items-center justify-center gap-2 rounded-md border border-dashed border-primary/50 text-xs text-primary">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          处理中…
        </div>
      ) : uploading ? (
        <div className="flex h-28 items-center justify-center gap-2 rounded-md border border-dashed border-primary/50 text-xs text-primary">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          上传中…
        </div>
      ) : images.length > 0 ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={open}
            className="block w-full overflow-hidden rounded-md border border-border"
          >
            <img
              src={images[0]}
              alt=""
              className="w-full object-contain transition hover:opacity-80"
              onLoad={handleImgLoad}
            />
          </button>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {isUpstream ? '来自连线'
                : source === 'url' ? '来自 URL'
                : source === 'history' ? '来自记录'
                : source === 'segment' ? '抠图结果'
                : source === 'enhance' ? '放大结果'
                : source === 'error' ? '处理失败'
                : '已上传'}
            </span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              更换
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-28 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <span className="text-2xl">⬆</span>
            <span>点击上传图片</span>
          </button>
          <input
            type="text"
            placeholder="或粘贴图片 URL"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
            onBlur={(e) => handleUrl(e.target.value)}
          />
        </div>
      )}
      {data?.error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{data.error}</p>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </NodeShell>
  );
}
