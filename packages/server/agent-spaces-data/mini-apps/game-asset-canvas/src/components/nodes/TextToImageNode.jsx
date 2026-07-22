import { useCallback } from 'react';
import NodeShell from './NodeShell';
import ImageResult from './ImageResult';
import { ASPECT_OPTIONS, DEFAULT_MODEL, MODEL_OPTIONS, NODE_TYPES, SIZE_OPTIONS, WORKFLOWS } from '../../utils/constants';

/**
 * 文字生成图片节点。
 * data.params: { prompt, model, aspect, size }
 * data.output: { images: string[] }
 */
export default function TextToImageNode({ id, data }) {
  const params = data?.params || {};
  const images = data?.output?.images || [];
  const status = data?.status || 'idle';
  const error = data?.error;
  const running = status === 'running';
  const onUpdate = data?.onUpdate;
  const onGenerate = data?.onGenerate;

  const set = useCallback((patch) => {
    onUpdate?.({ params: { ...params, ...patch } });
  }, [onUpdate, params]);

  const handleRun = useCallback(() => {
    onGenerate?.(id, NODE_TYPES.textToImage, {
      workflowId: WORKFLOWS.text_to_image,
      input: {
        prompt: params.prompt || '',
        model: params.model || DEFAULT_MODEL,
        aspect: params.aspect || '1:1',
        size: params.size || '1k',
      },
    });
  }, [onGenerate, id, params]);

  return (
    <NodeShell nodeType={NODE_TYPES.textToImage} data={data} sourceHandle>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">提示词</span>
        <textarea
          className="min-h-[64px] w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
          placeholder="描述要生成的游戏资产，如：像素风宝箱，俯视角，无背景"
          value={params.prompt || ''}
          onChange={(e) => set({ prompt: e.target.value })}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <LabeledSelect label="模型" value={params.model || DEFAULT_MODEL} options={MODEL_OPTIONS} onChange={(v) => set({ model: v })} />
        <LabeledSelect label="比例" value={params.aspect || '1:1'} rawOptions={ASPECT_OPTIONS} onChange={(v) => set({ aspect: v })} />
        <LabeledSelect label="尺寸" value={params.size || '1k'} rawOptions={SIZE_OPTIONS} onChange={(v) => set({ size: v })} />
      </div>

      <button
        type="button"
        disabled={running || !params.prompt?.trim()}
        onClick={handleRun}
        className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? '生成中…' : '生成图片'}
      </button>

      {error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
      )}

      {images.length > 0 && <ImageResult images={images} />}
    </NodeShell>
  );
}

function LabeledSelect({ label, value, options, rawOptions, onChange }) {
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
