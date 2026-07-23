import { useCallback } from 'react';
import NodeShell from './NodeShell';
import ImageResult from './ImageResult';
import {
  IMAGE_PROCESSOR_CATEGORIES,
  IMAGE_PROCESSORS,
  NODE_TYPES,
} from '../../utils/constants';

/**
 * 图像处理节点：选处理器 + 调参 + 执行 → 产出图（本地算法，不走工作流）。
 *
 * data.params: { processor: string, processorParams: {...} }
 * data.images: 上游连线推入的输入图 URL（无连线时为空，节点不可执行）
 * data.output: { images: string[] } 处理后的产出
 *
 * 执行流程：data.onProcessLocal(id, processor, processorParams) → Canvas.handleProcessLocal：
 *   上游 URL → io.urlToImageData → PROCESSORS[processor].run → imageDataToUrl → 回填 data.output.images
 *
 * CDN 加载：底层算法库（image-q/gifenc/gifuct）首次执行时从 CDN 动态加载，结果缓存。
 * 断网或 CDN 不可达时执行报错，不影响其他节点。
 */
export default function ImageProcessNode({ id, data, selected }) {
  const params = data?.params || {};
  const processorId = params.processor || 'pixelate';
  const processorParams = params.processorParams || {};
  const inputImages = data?.images || [];
  const images = data?.output?.images || [];
  const status = data?.status || 'idle';
  const error = data?.error;
  const running = status === 'running';
  const onUpdate = data?.onUpdate;
  const onProcessLocal = data?.onProcessLocal;

  const processor = IMAGE_PROCESSORS.find((p) => p.id === processorId) || IMAGE_PROCESSORS[0];
  const multipleIn = processor?.multipleIn;

  const setProcessor = useCallback((nextId) => {
    onUpdate?.({ params: { processor: nextId, processorParams: defaultParamsFor(nextId) } });
  }, [onUpdate]);

  const setParam = useCallback((key, value) => {
    onUpdate?.({ params: { ...params, processorParams: { ...processorParams, [key]: value } } });
  }, [onUpdate, params, processorParams]);

  const handleRun = useCallback(() => {
    if (!inputImages.length) return;
    onProcessLocal?.(id, processorId, processorParams, inputImages);
  }, [onProcessLocal, id, processorId, processorParams, inputImages]);

  // 分组下拉：category → processors
  const grouped = IMAGE_PROCESSOR_CATEGORIES.map((cat) => ({
    cat,
    items: IMAGE_PROCESSORS.filter((p) => p.category === cat.id),
  })).filter((g) => g.items.length);

  return (
    <NodeShell id={id} nodeType={NODE_TYPES.imageProcess} data={data} selected={selected} targetHandle sourceHandle>
      {/* 处理器选择 */}
      <select
        value={processorId}
        onChange={(e) => setProcessor(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
      >
        {grouped.map(({ cat, items }) => (
          <optgroup key={cat.id} label={`${cat.icon} ${cat.label}`}>
            {items.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {processor?.desc && (
        <p className="text-[10px] leading-snug text-muted-foreground">{processor.desc}</p>
      )}

      {/* 参数表单（动态渲染） */}
      {(processor?.params || []).map((param) => (
        <ParamField
          key={param.key}
          param={param}
          value={processorParams[param.key] ?? param.default}
          onChange={(v) => setParam(param.key, v)}
        />
      ))}

      {/* 输入图提示 */}
      <div className="text-xs text-muted-foreground">
        {multipleIn
          ? `输入：${inputImages.length} 张${inputImages.length < 2 ? '（合成类需 ≥2 张，请连线多源）' : ''}`
          : inputImages.length > 0
            ? `输入：${inputImages.length} 张（来自连线）`
            : '输入：无（请连线或上游产出）'}
      </div>
      {inputImages.length > 0 && (
        <div className="grid grid-cols-4 gap-1">
          {inputImages.slice(0, 8).map((url, i) => (
            <img key={i} src={url} alt="" className="h-10 w-full rounded border border-border object-cover" />
          ))}
        </div>
      )}

      {/* 执行按钮 */}
      <button
        type="button"
        onClick={handleRun}
        disabled={running || !inputImages.length || (multipleIn && inputImages.length < 2)}
        className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? '处理中…' : '⚡ 执行'}
      </button>

      {error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
      )}

      {/* 产出 */}
      {images.length > 0 && (
        <ImageResult images={images} />
      )}
    </NodeShell>
  );
}

/** 动态参数字段渲染 */
function ParamField({ param, value, onChange }) {
  if (param.type === 'bool') {
    return (
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        <span className="text-muted-foreground">{param.label}</span>
      </label>
    );
  }
  if (param.type === 'color') {
    return (
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{param.label}</span>
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-10 cursor-pointer rounded border border-border bg-background"
        />
      </label>
    );
  }
  if (param.type === 'select') {
    return (
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{param.label}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary"
        >
          {(param.options || []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </label>
    );
  }
  // number
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{param.label}</span>
      <input
        type="number"
        value={value ?? param.default}
        min={param.min}
        max={param.max}
        step={1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary"
      />
    </label>
  );
}

/** 切换处理器时重置参数为默认值 */
function defaultParamsFor(processorId) {
  const p = IMAGE_PROCESSORS.find((x) => x.id === processorId);
  if (!p) return {};
  const out = {};
  for (const param of p.params || []) out[param.key] = param.default;
  return out;
}
