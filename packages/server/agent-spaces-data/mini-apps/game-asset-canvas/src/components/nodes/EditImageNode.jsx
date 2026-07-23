import { useCallback, useState } from 'react';
import NodeShell from './NodeShell';
import ImageResult from './ImageResult';
import PromptPickerDialog from '../PromptPickerDialog';
import PickedPromptBadge from './PickedPromptBadge';
import FileUpload from '../FileUpload';
import { ASPECT_OPTIONS, DEFAULT_MODEL, MODEL_OPTIONS, NODE_TYPES, SIZE_OPTIONS, WORKFLOWS } from '../../utils/constants';
import { hasPrompt } from '../../utils/prompts';
import { normalizeImageUrls, resolveReferenceImages } from '../../utils/workflow';

/**
 * 编辑图片节点。
 * data.params: { prompt, model, aspect, size }
 * data.images: string[]  上游通过连线推入的待编辑图片 URL（或手动粘贴）
 * data.output: { images: string[] }  编辑后的产出
 */
export default function EditImageNode({ id, data, selected }) {
  const params = data?.params || {};
  // 连线图（由 computeInputImages 派生到 data.images）+ 用户上传图（data.uploadedImages，持久化不被覆盖）
  // 两种来源并存，提交时合并去重。参考 imageProcess 节点的双来源模式。
  const inputImages = data?.images || [];
  const uploadedImages = Array.isArray(data?.uploadedImages) ? data.uploadedImages : [];
  const images = data?.output?.images || [];
  const status = data?.status || 'idle';
  const error = data?.error;
  const running = status === 'running';
  const onUpdate = data?.onUpdate;
  const onGenerate = data?.onGenerate;
  const [pickerOpen, setPickerOpen] = useState(false);

  const set = useCallback((patch) => {
    onUpdate?.({ params: { ...params, ...patch } });
  }, [onUpdate, params]);

  // FileUpload onChange：上传待编辑图片，写入 data.uploadedImages（与连线图 data.images 分离，互不覆盖）
  const setUploadedImages = useCallback((urls) => {
    onUpdate?.({ uploadedImages: Array.isArray(urls) ? urls.filter(Boolean) : [] });
  }, [onUpdate]);

  // 把参考图 + 连线图作为只读项整合进同一个 FileUpload 网格（带来源角标），上传图可删，只读项不可删。
  // 这样「输入图片」与「参考图」合并为单一区块，避免 UI 分组割裂。
  const refImages = Array.isArray(params.referenceImages) ? params.referenceImages : [];
  const extraItems = [
    ...refImages.map((src) => ({ src, badge: '参考' })),
    ...inputImages.map((src) => ({ src, badge: '连线' })),
  ];

  const handleRun = useCallback(() => {
    // 参考图 + 上传图 + 连线图，至少其一非空才执行；提交时合并去重
    const allSources = [...refImages, ...uploadedImages, ...inputImages];
    if (!allSources.length) return;
    // 提示词库选中 + 用户输入 合并（去空去重）
    const merged = [params.pickedPrompt, params.prompt].map((s) => (s || '').trim()).filter(Boolean).join('\n');
    onGenerate?.(id, NODE_TYPES.editImage, {
      workflowId: WORKFLOWS.edit_image,
      input: {
        images: normalizeImageUrls(allSources),
        prompt: merged,
        model: params.model || DEFAULT_MODEL,
        aspect: params.aspect || '1:1',
        size: params.size || '1k',
      },
    });
  }, [onGenerate, id, inputImages, uploadedImages, params, refImages]);

  return (
    <NodeShell id={id} nodeType={NODE_TYPES.editImage} data={data} selected={selected} targetHandle sourceHandle>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">输入图片</span>
        <FileUpload
          value={uploadedImages}
          onChange={setUploadedImages}
          max={6}
          placeholder="点击或拖拽上传待编辑图片"
          extraItems={extraItems}
        />
      </div>

      <PickedPromptBadge
        pickedPrompt={params.pickedPrompt}
        onClear={() => set({ pickedPrompt: undefined, referenceImages: undefined })}
      />
      <label className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">编辑指令</span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-xs text-muted-foreground transition hover:text-primary"
          >
            📋 提示词库
          </button>
        </div>
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
        disabled={running || (!inputImages.length && !uploadedImages.length && !(params.referenceImages || []).length) || !hasPrompt(params)}
        onClick={handleRun}
        className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? '编辑中…' : '编辑图片'}
      </button>

      {error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
      )}

      {images.length > 0 && <ImageResult images={images} />}

      <PromptPickerDialog
        open={pickerOpen}
        scene="edit"
        onClose={() => setPickerOpen(false)}
        onPick={(item) => set({
          pickedPrompt: item.prompt,
          referenceImages: resolveReferenceImages(item.references),
          ...(item.aspect ? { aspect: item.aspect } : {}),
        })}
      />
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
