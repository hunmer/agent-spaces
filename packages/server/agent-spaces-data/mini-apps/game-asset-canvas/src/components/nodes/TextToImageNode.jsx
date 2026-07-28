import { useCallback, useEffect, useRef, useState } from 'react';
import { SearchSelect } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import ImageResult from './ImageResult';
import PromptPickerDialog from '../PromptPickerDialog';
import PickedPromptBadge from './PickedPromptBadge';
import CountAndConcurrency from './CountAndConcurrency';
import { ASPECT_OPTIONS, DEFAULT_MODEL, MODEL_OPTIONS, NODE_TYPES, SIZE_OPTIONS, WORKFLOWS } from '../../utils/constants';
import { hasPrompt } from '../../utils/prompts';

/**
 * 文字生成图片节点。
 * data.params: { prompt, pickedPrompt, model, aspect, size }
 *   - prompt:       用户在输入框自由输入的提示词
 *   - pickedPrompt: 从提示词库选中的提示词（可选，展示为标签，提交时与 prompt 合并）
 * data.output: { images: string[] }
 */

// 参数 schema（agent 通过 get_node_params 读取）。
// options 直接引用 constants 的 OPTIONS 常量，单一数据源，改 constants 自动同步。
export const PARAMS_SCHEMA = [
  {
    key: 'prompt',
    label: '提示词',
    type: 'text',
    required: true,
    description: '正向提示词，描述要生成的游戏资产。英文效果通常更好，会与 pickedPrompt 合并后提交。',
  },
  {
    key: 'model',
    label: '模型',
    type: 'select',
    options: MODEL_OPTIONS,            // [{value,label}]
    default: DEFAULT_MODEL,
    description: '图像生成模型。value 是要填进 data.params.model 的值。',
  },
  {
    key: 'aspect',
    label: '画面比例',
    type: 'select',
    options: ASPECT_OPTIONS.map((v) => ({ value: v, label: v })),
    default: '1:1',
    description: '角色立绘用 3:4/9:16；场景背景用 16:9/21:9；道具图标用 1:1。',
  },
  {
    key: 'size',
    label: '输出尺寸',
    type: 'select',
    options: SIZE_OPTIONS.map((v) => ({ value: v, label: v })),
    default: '1k',
    description: '1k=1024 便宜快；2k/4k 更清晰更贵。',
  },
  {
    key: 'fileName',
    label: '文件名',
    type: 'text',
    description: '可选。产出图下载、保存到素材库时使用的文件名（含扩展名，如 hero.png）；多张产出自动加 _2/_3 后缀。留空则用 URL 默认名。',
  },
];
export default function TextToImageNode({ id, data, selected }) {
  const params = data?.params || {};
  const images = data?.output?.images || [];
  const status = data?.status || 'idle';
  const error = data?.error;
  const running = status === 'running';
  const onUpdate = data?.onUpdate;
  const onGenerate = data?.onGenerate;
  const onCancelProcess = data?.onCancelProcess;
  const [pickerOpen, setPickerOpen] = useState(false);
  const promptRef = useRef(null);

  // textarea 自动调整高度：重置为 auto 后按 scrollHeight 撑开，上限 500px 后出现滚动条。
  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 500)}px`;
  }, [params.prompt]);

  const set = useCallback((patch) => {
    onUpdate?.({ params: { ...params, ...patch } });
  }, [onUpdate, params]);

  const handleRun = useCallback(() => {
    // 提示词库选中 + 用户输入 合并（去空去重）
    const merged = [params.pickedPrompt, params.prompt].map((s) => (s || '').trim()).filter(Boolean).join('\n');
    onGenerate?.(id, NODE_TYPES.textToImage, {
      workflowId: WORKFLOWS.text_to_image,
      input: {
        prompt: merged,
        model: params.model || DEFAULT_MODEL,
        aspect: params.aspect || '1:1',
        size: params.size || '1k',
        count: Math.max(1, Number(params.count) || 1),
        concurrency: Math.max(1, Number(params.concurrency) || 1),
      },
    });
  }, [onGenerate, id, params]);

  return (
    <NodeShell id={id} nodeType={NODE_TYPES.textToImage} data={data} selected={selected} sourceHandle>
      <PickedPromptBadge
        pickedPrompt={params.pickedPrompt}
        onClear={() => set({ pickedPrompt: undefined })}
      />
      <label className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">提示词</span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-xs text-muted-foreground transition hover:text-primary"
          >
            📋 提示词库
          </button>
        </div>
        <textarea
          ref={promptRef}
          className="min-h-[64px] w-full resize-none overflow-auto rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
          style={{ maxHeight: 500 }}
          placeholder="描述要生成的游戏资产，如：像素风宝箱，俯视角，无背景"
          value={params.prompt || ''}
          onChange={(e) => set({ prompt: e.target.value })}
        />
      </label>

      {/* 模型：优先用设置页自定义列表，回退内置 MODEL_OPTIONS；支持临时输入列表外的值 */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">模型</span>
        <SearchSelect
          value={params.model || DEFAULT_MODEL}
          onChange={(v) => set({ model: v })}
          options={data?.modelOptions || MODEL_OPTIONS}
          placeholder="选择或输入模型"
          searchPlaceholder="搜索模型…"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <LabeledSelect label="比例" value={params.aspect || '1:1'} rawOptions={ASPECT_OPTIONS} onChange={(v) => set({ aspect: v })} />
        <LabeledSelect label="尺寸" value={params.size || '1k'} rawOptions={SIZE_OPTIONS} onChange={(v) => set({ size: v })} />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">文件名（可选）</span>
        <input
          type="text"
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
          placeholder="如 hero.png，留空用默认名"
          value={params.fileName || ''}
          onChange={(e) => set({ fileName: e.target.value || undefined })}
        />
      </label>

      <CountAndConcurrency
        count={params.count ?? 1}
        concurrency={params.concurrency ?? 1}
        onChange={(patch) => set(patch)}
      />

      {running ? (
        <button
          type="button"
          onClick={() => onCancelProcess?.(id)}
          className="w-full rounded-md border border-destructive bg-background px-3 py-1.5 text-sm font-medium text-destructive transition hover:bg-destructive hover:text-destructive-foreground"
        >
          取消生成
        </button>
      ) : (
        <button
          type="button"
          disabled={!hasPrompt(params)}
          onClick={handleRun}
          className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          生成图片
        </button>
      )}

      {error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
      )}

      <ImageResult images={images} fileName={params.fileName} onAddToAssets={data?.onAddToAssets} onAddImages={data?.onAddImages} onRemoveImage={data?.onRemoveImage} onClearImages={data?.onClearImages} versions={data?.versions} activeVersion={data?.activeVersion} onSwitchVersion={data?.onSwitchVersion} />

      <PromptPickerDialog
        open={pickerOpen}
        scene="text"
        onClose={() => setPickerOpen(false)}
        onPick={(item) => set({ pickedPrompt: item.prompt, ...(item.aspect ? { aspect: item.aspect } : {}) })}
      />
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
