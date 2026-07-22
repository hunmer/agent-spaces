import { useCallback, useRef, useState } from 'react';

/**
 * 图片上传组件：支持点击/拖拽上传，调用 window.AgentSpaces.uploadFile 上传到后端，
 * 返回 http URL 后回传给父组件，并展示已上传图片缩略图（可删除）。
 *
 * @param {{ value: string[], onChange:(urls:string[])=>void, max?:number, placeholder?:string }} props
 *   value: 已有图片 URL 数组（http URL）
 *   onChange: 上传成功/删除后回传新的 URL 数组
 *   max: 最大数量，默认 6
 */
export default function FileUpload({ value = [], onChange, max = 6, placeholder = '点击或拖拽图片到此处上传' }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const urls = Array.isArray(value) ? value : [];

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
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onRemove = useCallback((idx) => {
    onChange?.(urls.filter((_, i) => i !== idx));
  }, [urls, onChange]);

  return (
    <div className="flex flex-col gap-2">
      {urls.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {urls.map((src, i) => (
            <div key={i} className="group relative aspect-square overflow-hidden rounded-md border border-border">
              <img src={src} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white opacity-0 transition group-hover:opacity-100"
                title="移除"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {urls.length < max && (
        <button
          type="button"
          onClick={onPick}
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          disabled={uploading}
          className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-md border border-dashed px-2 py-3 text-xs text-muted-foreground transition disabled:opacity-50 ${
            dragOver ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary hover:text-primary'
          }`}
        >
          {uploading ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>上传中…</span>
            </>
          ) : (
            <>
              <span className="text-2xl">⬆</span>
              <span>{placeholder}</span>
              <span className="text-[10px]">支持拖拽，最多 {max} 张</span>
            </>
          )}
        </button>
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
