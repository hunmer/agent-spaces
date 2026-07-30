import { useCallback } from 'react';
import { FileUpload, ReactCompareSlider, ReactCompareSliderImage } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import { NODE_TYPES } from '../../utils/constants';

/**
 * 图片对比节点：双图前后对比滑块（基于 react-compare-slider）。
 *
 * 两个图槽位（first/second），各自独立支持两种来源：
 * 1. FileUpload 用户上传（持久化在 data.first.uploadedImages / data.second.uploadedImages）
 * 2. 上游连线推入（data.first.images / data.second.images，由 Canvas.computeInputImages 派生，只取首张）
 * 单槽位优先级：上传 > 连线首张。
 *
 * data.first / data.second 形如 { uploadedImages: string[], images: string[] }。
 * 节点本身不产图（纯展示对比），但挂 sourceHandle 让其他节点能连「下游」取 first 作为导出参考。
 *
 * 组件经 @agent-spaces/ui 暴露（宿主 ui-exports），无需 CDN 懒加载。
 */
const SLOT_META = {
  first: { label: '对比前', placeholder: '点击或拖入「对比前」图片' },
  second: { label: '对比后', placeholder: '点击或拖入「对比后」图片' },
};

function slotUrls(slot) {
  const uploaded = Array.isArray(slot?.uploadedImages) ? slot.uploadedImages : [];
  const upstream = Array.isArray(slot?.images) ? slot.images : [];
  // 单槽位单图：上传优先，无上传取连线首张
  return { uploaded, upstream, picked: uploaded[0] || upstream[0] || '' };
}

export default function ImageCompareNode({ id, data, selected }) {
  // 上游连线图统一进 data.images（computeInputImages 派生），按顺序分槽位：
  // upstream[0] → first, upstream[1] → second。每槽位再被用户上传覆盖（上传优先）。
  const upstreamAll = Array.isArray(data?.images) ? data.images : [];
  const first = slotUrls({
    uploadedImages: data?.first?.uploadedImages,
    images: upstreamAll.slice(0, 1),
  });
  const second = slotUrls({
    uploadedImages: data?.second?.uploadedImages,
    images: upstreamAll.slice(1, 2),
  });
  const onUpdate = data?.onUpdate;
  const uploading = data?.uploading;

  const handleFilesChange = useCallback((slotKey) => async (files) => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) { console.warn('AgentSpaces.uploadFile 不可用'); return; }
    const item = (files || [])[0];
    const f = item?.file;
    if (!f) {
      onUpdate?.({ [slotKey]: { uploadedImages: [] } });
      return;
    }
    const existing = f.uploadedUrl || f.uploadedHttpPath || f.url || f.httpPath;
    if (existing) {
      onUpdate?.({ [slotKey]: { uploadedImages: [existing] } });
      return;
    }
    if (!(f instanceof File)) return;
    onUpdate?.({ uploading: true, uploadError: undefined });
    try {
      const uploaded = await AS.uploadFile(f);
      const httpUrl = uploaded?.url || uploaded?.httpPath;
      if (!httpUrl) throw new Error('上传未返回 URL');
      onUpdate?.({ [slotKey]: { uploadedImages: [httpUrl] }, uploading: false, uploadError: undefined });
    } catch (err) {
      console.error('ImageCompare upload failed:', err);
      onUpdate?.({ uploading: false, uploadError: err?.message || String(err) });
    }
  }, [onUpdate]);

  const bothReady = Boolean(first.picked && second.picked);

  return (
    <NodeShell id={id} nodeType={NODE_TYPES.imageCompare} data={data} selected={selected} targetHandle sourceHandle>
      {/* 对比视图：双图就绪时渲染 ReactCompareSlider（本地组件，无 CDN 依赖） */}
      {bothReady && (
        <div className="nodrag nopan nowheel overflow-hidden rounded-md border border-border">
          <ReactCompareSlider
            position={50}
            itemOne={<ReactCompareSliderImage src={first.picked} alt="对比前" />}
            itemTwo={<ReactCompareSliderImage src={second.picked} alt="对比后" />}
            style={{ width: '100%', display: 'block', maxHeight: '320px' }}
          />
        </div>
      )}

      {/* 两个图槽位上传区 */}
      <div className="flex flex-col gap-2">
        <SlotUpload
          slotKey="first"
          urls={first}
          onChange={handleFilesChange('first')}
          onClear={() => onUpdate?.({ first: { uploadedImages: [] } })}
          uploading={uploading}
        />
        <SlotUpload
          slotKey="second"
          urls={second}
          onChange={handleFilesChange('second')}
          onClear={() => onUpdate?.({ second: { uploadedImages: [] } })}
          uploading={uploading}
        />
      </div>

      {/* 输入统计 */}
      <div className="text-[11px] text-muted-foreground">
        {bothReady ? '已就绪，拖动滑块对比' : '需两个槽位都有图'}
      </div>

      {data?.uploadError && (
        <p className="text-[10px] text-red-500">上传失败：{data.uploadError}</p>
      )}
    </NodeShell>
  );
}

/**
 * 单槽位：有图（上传或连线）且非上传中 → 图片预览（上传图可清空）；否则显示 FileUpload。
 * 连线图由连线管理，不可清（仅显示「🔗 连线」角标）。
 */
function SlotUpload({ slotKey, urls, onChange, onClear, uploading }) {
  const meta = SLOT_META[slotKey];
  const isUpload = urls.uploaded.length > 0;

  // 有图且非上传中：显示预览 + 清空按钮（仅上传图）
  if (urls.picked && !uploading) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-muted-foreground">
            {meta.label}
            <span className="ml-1 text-muted-foreground/70">({isUpload ? '上传' : '连线'})</span>
          </span>
          {isUpload && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClear?.(); }}
              title="清空图片"
              className="rounded p-0.5 text-[11px] leading-none text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            >✕</button>
          )}
        </div>
        <div className="nodrag nopan nowheel group relative overflow-hidden rounded-md border border-border bg-muted/30">
          <img
            src={urls.picked}
            alt={meta.label}
            draggable={false}
            className="block max-h-32 w-full object-contain"
          />
          {!isUpload && (
            <span className="absolute left-1 top-1 rounded bg-background/80 px-1 py-0.5 text-[9px] text-muted-foreground">🔗 连线</span>
          )}
        </div>
      </div>
    );
  }

  // 无图或上传中：显示 FileUpload
  const fileUploadValue = urls.uploaded.map((url, i) => ({
    id: `${slotKey}-up-${i}-${url.slice(-12)}`,
    file: { name: `${slotKey}-${i + 1}.png`, size: 0, type: 'image/png', url, httpPath: url },
    preview: url,
  }));
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium text-muted-foreground">{meta.label}</span>
      <FileUpload
        value={fileUploadValue}
        onChange={onChange}
        accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'] }}
        maxFiles={1}
        placeholder={meta.placeholder}
      />
      {uploading && <p className="text-[10px] text-primary">上传中…</p>}
    </div>
  );
}
