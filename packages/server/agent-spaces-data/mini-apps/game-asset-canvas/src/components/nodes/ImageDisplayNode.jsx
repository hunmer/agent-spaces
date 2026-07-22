import { useCallback, useRef } from 'react';
import { openMediaGallery } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import { NODE_TYPES } from '../../utils/constants';

/**
 * 图片展示节点：上传一张图片（或粘贴 URL），可连线传给下游编辑节点。
 * data.images: string[]  当前展示的图片（可来自上传或上游连线）
 * data.source: 'upload' | 'url' | 'upstream'  来源标记
 */
export default function ImageDisplayNode({ id, data, selected }) {
  const images = data?.images || [];
  const onUpdate = data?.onUpdate;
  const fileRef = useRef(null);

  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 用 object URL 展示；同时可保存到 data/ 以便持久化（可选）
    const url = URL.createObjectURL(file);
    onUpdate?.({ images: [url], source: 'upload' });
    // 尝试存到 data/ 便于刷新后保留
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const name = `uploads/${id}-${Date.now()}.${(file.type.split('/')[1] || 'png')}`;
        window.AgentSpacesUI?.saveDataFile?.(name, reader.result).catch(() => {});
      };
      reader.readAsArrayBuffer(file);
    } catch {}
    e.target.value = '';
  }, [id, onUpdate]);

  const handleUrl = useCallback((raw) => {
    const url = String(raw || '').trim();
    if (!url) return;
    onUpdate?.({ images: [url], source: 'url' });
  }, [onUpdate]);

  const open = useCallback(() => {
    if (!images.length) return;
    openMediaGallery(images.map((src) => ({ src, type: 'image' })), 0);
  }, [images]);

  const isUpstream = data?.source === 'upstream' || (images.length > 0 && !data?.source);

  return (
    <NodeShell nodeType={NODE_TYPES.imageDisplay} data={data} selected={selected} targetHandle sourceHandle>
      {images.length > 0 ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={open}
            className="block w-full overflow-hidden rounded-md border border-border"
          >
            <img src={images[0]} alt="" className="max-h-[180px] w-full object-cover transition hover:opacity-80" />
          </button>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {isUpstream ? '来自连线' : data?.source === 'url' ? '来自 URL' : '已上传'}
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
