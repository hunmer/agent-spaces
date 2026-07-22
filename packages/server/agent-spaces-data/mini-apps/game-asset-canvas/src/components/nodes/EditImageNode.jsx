import { useCallback } from 'react';
import NodeShell from './NodeShell';
import ImageResult from './ImageResult';
import { ASPECT_OPTIONS, DEFAULT_MODEL, MODEL_OPTIONS, NODE_TYPES, SIZE_OPTIONS, WORKFLOWS } from '../../utils/constants';

/**
 * 编辑图片节点。
 * data.params: { prompt, model, aspect, size }
 * data.images: string[]  上游通过连线推入的待编辑图片 URL（或手动粘贴）
 * data.output: { images: string[] }  编辑后的产出
 */
export default function EditImageNode({ id, data }) {
  const params = data?.params || {};
  const inputImages = data?.images || [];
  const images = data?.output?.images || [];
  const status = data?.status || 'idle';
  const error = data?.error;
  const running = status === 'running';
  const onUpdate = data?.onUpdate;
  const onGenerate = data?.onGenerate;

  const set = useCallback((patch) => {
    onUpdate?.({ params: { ...params, ...patch } });
  }, [onUpdate, params]);

  const setImages = useCallback((raw) => {
    const list = String(raw || '')
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    onUpdate?.({ images: list });
  }, [onUpdate]);

  const handleRun = useCallback(() => {
    if (!inputImages.length) return;
    onGenerate?.(id, NODE_TYPES.editImage, {
      workflowId: WORKFLOWS.edit_image,
      input: {
        images: inputImages,
        prompt: params.prompt || '',
        model: params.model || DEFAULT_MODEL,
        aspect: params.aspect || '1:1',
        size: params.size || '1k',
      },
    });
  }, [onGenerate, id, inputImages, params]);

  return (
    <NodeShell nodeType={NODE_TYPES.editImage} data={data} targetHandle sourceHandle>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          输入图片 {inputImages.length > 0 && <span className="text-primary">（{inputImages.length} 张，来自连线）</span>}
        </span>
        {inputImages.length > 0 ? (
          <div className="grid grid-cols-3 gap-1">
            {inputImages.slice(0, 6).map((url, i) => (
              <img key={i} src={url} alt="" className="h-12 w-full rounded border border-border object-cover" />
            ))}
          </div>
        ) : (
          <textarea
            className="min-h-[48px] w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
            placeholder="无连线时，粘贴图片 URL（多个用换行或逗号分隔）"
            onChange={(e) => setImages(e.target.value)}
          />
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">编辑指令</span>
        <textarea
          className="min-h-[56px] w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
          placeholder="如：将背景改为星空，保持宝箱主体不变"
          value={params.prompt || ''}
          onChange={(e) => set({ prompt: e.target.value })}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <MiniSelect label="模型" value={params.model || DEFAULT_MODEL} options={MODEL_OPTIONS} onChange={(v) => set({ model: v })} />
        <MiniSelect label="比例" value={params.aspect || '1:1'} rawOptions={ASPECT_OPTIONS} onChange={(v) => set({ aspect: v })} />
        <MiniSelect label="尺寸" value={params.size || '1k'} rawOptions={SIZE_OPTIONS} onChange={(v) => set({ size: v })} />
      </div>

      <button
        type="button"
        disabled={running || !inputImages.length || !params.prompt?.trim()}
        onClick={handleRun}
        className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? '编辑中…' : '编辑图片'}
      </button>

      {error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
      )}

      {images.length > 0 && <ImageResult images={images} />}
    </NodeShell>
  );
}

function MiniSelect({ label, value, options, rawOptions, onChange }) {
  const opts = options || (rawOptions || []).map((o) => ({ value: o, label: o }));
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
