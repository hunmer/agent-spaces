import { useCallback } from 'react';
import { FileUpload } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import ImageResult from './ImageResult';
import UpstreamImageList, { orderUpstream } from './UpstreamImageList';
import {
  IMAGE_PROCESSOR_CATEGORIES,
  IMAGE_PROCESSORS,
  NODE_TYPES,
} from '../../utils/constants';
import { dedupeUrls } from '../../utils/workflow';

/**
 * 图像处理节点：选处理器 + 调参 + 执行 → 产出图（本地算法，不走工作流）。
 *
 * 输入来源（两种合并，去重）：
 * 1. FileUpload 组件用户自行上传的图（data.uploadedImages: string[]，持久化）
 * 2. 上游连线推入的图（data.images: string[]，由 computeInputImages 派生）
 *
 * data.params: { processor: string, processorParams: {...} }
 * data.uploadedImages: string[] 用户上传的图 http URL
 * data.output: { images: string[] } 处理后的产出
 *
 * 执行流程：data.onProcessLocal(id, processor, processorParams, inputImages) → Canvas.handleProcessLocal：
 *   输入 URL → io.urlToImageData → PROCESSORS[processor].run → imageDataToUrl → 回填 data.output.images
 *
 * CDN 加载：底层算法库（image-q/gifenc/gifuct）首次执行时从 CDN 动态加载，结果缓存。
 * 断网或 CDN 不可达时执行报错，不影响其他节点。
 */
export default function ImageProcessNode({ id, data, selected }) {
  const params = data?.params || {};
  const processorId = params.processor || 'pixelate';
  const processorParams = params.processorParams || {};
  const uploadedImages = Array.isArray(data?.uploadedImages) ? data.uploadedImages : [];
  const rawUpstream = Array.isArray(data?.images) ? data.images : [];
  // 上游连线图的排序顺序（url 子集，持久化）。data.images 由 computeInputImages 派生会覆盖，
  // 所以顺序单独存在 upstreamOrder，order 里有的按 order 排，没有的（新连入）追加到末尾。
  const upstreamOrder = Array.isArray(data?.upstreamOrder) ? data.upstreamOrder : [];
  const upstreamImages = orderUpstream(rawUpstream, upstreamOrder);
  // 合并输入：上传图在前 + 上游连线图（已排序）在后，去重保序
  const inputImages = dedupeUrls([...uploadedImages, ...upstreamImages]);
  const images = data?.output?.images || [];
  const status = data?.status || 'idle';
  const error = data?.error;
  const running = status === 'running';
  const cancelled = status === 'cancelled';
  const onUpdate = data?.onUpdate;
  const onProcessLocal = data?.onProcessLocal;
  const onCancelProcess = data?.onCancelProcess;
  const uploading = data?.uploading;

  const processor = IMAGE_PROCESSORS.find((p) => p.id === processorId) || IMAGE_PROCESSORS[0];
  const multipleIn = processor?.multipleIn;

  const setProcessor = useCallback((nextId) => {
    onUpdate?.({ params: { processor: nextId, processorParams: defaultParamsFor(nextId) } });
  }, [onUpdate]);

  const setParam = useCallback((key, value) => {
    onUpdate?.({ params: { ...params, processorParams: { ...processorParams, [key]: value } } });
  }, [onUpdate, params, processorParams]);

  // FileUpload onChange：用户增删文件 / 拖拽排序时触发。
  // value 是 FileUploadFile[]，对每个新文件（无 uploadedUrl 的 File）调 uploadFile 拿 http URL 持久化。
  // 已上传过的（带 uploadedUrl/httpPath 的合成对象）直接复用 URL，排序时不会重传。
  const handleFilesChange = useCallback(async (files) => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) {
      console.warn('AgentSpaces.uploadFile 不可用');
      return;
    }
    // 先扫一遍：区分已上传（直接收 URL）和新文件（需上传）。若全是已上传（如纯排序），跳过 uploading 标记，避免「上传中」闪烁。
    const urls = [];
    const pending = []; // 待上传的新 File
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
        console.error('ImageProcess upload failed:', err);
        onUpdate?.({ uploading: false, uploadError: err?.message || String(err) });
        return;
      }
    }
    onUpdate?.({ uploadedImages: urls, uploading: false });
  }, [onUpdate]);

  const handleRun = useCallback(() => {
    if (!inputImages.length) return;
    onProcessLocal?.(id, processorId, processorParams, inputImages);
  }, [onProcessLocal, id, processorId, processorParams, inputImages]);

  // FileUpload value：把持久化的 uploadedImages URL 转回 FileUploadFile 格式（带预览）
  const fileUploadValue = uploadedImages.map((url, i) => ({
    id: `up-${i}-${url.slice(-12)}`,
    file: { name: `upload-${i + 1}.png`, size: 0, type: 'image/png', url, httpPath: url },
    preview: url,
  }));

  // 分组下拉：category → processors
  const grouped = IMAGE_PROCESSOR_CATEGORIES.map((cat) => ({
    cat,
    items: IMAGE_PROCESSORS.filter((p) => p.category === cat.id),
  })).filter((g) => g.items.length);

  // 输入来源描述
  const upCount = uploadedImages.length;
  const usCount = upstreamImages.length;

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

      {/* 输入图：FileUpload 上传 + 上游连线。
          multipleIn（合成类）开启拖拽排序：帧序/图层序对产出敏感 */}
      <FileUpload
        value={fileUploadValue}
        onChange={handleFilesChange}
        accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'] }}
        maxFiles={multipleIn ? 0 : 1}
        sortable={multipleIn}
        placeholder={multipleIn ? '点击或拖入多张图（可拖拽排序）' : '点击或拖入图片'}
      />
      {uploading && (
        <p className="text-[10px] text-primary">上传中…</p>
      )}
      {data?.uploadError && (
        <p className="text-[10px] text-red-500">上传失败：{data.uploadError}</p>
      )}

      {/* 上游连线图（只读，不可删，由连线管理；多输入时可拖拽排序）。
          data.images 是 computeInputImages 派生真值，会被覆盖，所以顺序单独存 data.upstreamOrder。 */}
      {upstreamImages.length > 0 && (
        <UpstreamImageList
          urls={upstreamImages}
          sortable={multipleIn}
          onChangeOrder={(next) => onUpdate?.({ upstreamOrder: next })}
        />
      )}

      {/* 输入来源统计 */}
      <div className="text-[11px] text-muted-foreground">
        {inputImages.length > 0
          ? `输入 ${inputImages.length} 张${upCount ? `（上传 ${upCount}` : ''}${upCount && usCount ? ' + ' : ''}${usCount ? `连线 ${usCount}` : ''}${upCount || usCount ? '）' : ''}`
          : '输入：无（上传或连线）'}
        {multipleIn && inputImages.length < 2 && ' · 合成类需 ≥2 张'}
      </div>

      {/* 执行按钮 + 取消按钮（处理中时显示） */}
      {running ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            className="flex-1 cursor-not-allowed rounded-md bg-primary/70 px-3 py-1.5 text-xs font-medium text-primary-foreground opacity-80"
          >
            处理中…
          </button>
          <button
            type="button"
            onClick={() => onCancelProcess?.(id)}
            title="取消处理"
            className="shrink-0 rounded-md border border-destructive bg-background px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive hover:text-destructive-foreground"
          >
            取消
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleRun}
          disabled={uploading || !inputImages.length || (multipleIn && inputImages.length < 2)}
          className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ⚡ 执行
        </button>
      )}

      {cancelled && (
        <p className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">已取消</p>
      )}

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
