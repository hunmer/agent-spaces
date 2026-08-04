import { useCallback, useRef, useState } from 'react';
import { NodeResizer } from '@xyflow/react';
import { Upload } from '@agent-spaces/ui';
import FloatingHandle from './FloatingHandle';
import { getFloatingHandleProps } from '../canvas/floating-edge-utils';

export default function AudioDisplayNode({ data, selected }) {
  const audios = Array.isArray(data?.audios) ? data.audios.filter(Boolean) : [];
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const handleFile = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await window.AgentSpaces?.uploadFile?.(file);
      const url = uploaded?.url || uploaded?.httpPath;
      if (!url) throw new Error('上传未返回 URL');
      data?.onUpdate?.({ audios: [url], source: 'upload', error: undefined });
    } catch (error) {
      data?.onUpdate?.({ error: `上传失败：${error?.message || String(error)}` });
    } finally {
      setUploading(false);
    }
  }, [data?.onUpdate]);

  return (
    <div className="relative h-full w-full overflow-visible">
      <NodeResizer isVisible={!!selected} minWidth={240} minHeight={120} color="#6366f1" />
      <FloatingHandle type="target" {...getFloatingHandleProps(data?.floatingHandlePosition, 'target')} />
      <div className="audio-drag-handle flex h-full w-full cursor-move flex-col justify-center gap-2 overflow-hidden rounded-lg border border-border bg-card p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">音频展示</span>
          <button type="button" className="nodrag nopan rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => inputRef.current?.click()} title="上传音频">
            <Upload className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="nodrag nopan nowheel flex min-h-0 flex-col gap-2 overflow-auto">
          {uploading ? <span className="text-xs text-muted-foreground">上传中...</span> : null}
          {!uploading && audios.length === 0 ? <span className="text-xs text-muted-foreground">点击上传音频，或连接上游节点</span> : null}
          {audios.map((url, index) => <audio key={`${url}-${index}`} src={url} controls className="w-full" />)}
          {data?.error ? <span className="text-xs text-red-500">{data.error}</span> : null}
        </div>
        <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={handleFile} />
      </div>
      <FloatingHandle type="source" {...getFloatingHandleProps(data?.floatingHandlePosition, 'source')} />
    </div>
  );
}
