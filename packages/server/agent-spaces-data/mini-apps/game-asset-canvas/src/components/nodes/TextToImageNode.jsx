import { useCallback } from 'react';
import { SearchSelect, Wand2 } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import { useNodeDialog } from './NodeDialogContext';
import PickedPromptBadge from './PickedPromptBadge';
import CountAndConcurrency from './CountAndConcurrency';
import { ASPECT_OPTIONS, DEFAULT_MODEL, MODEL_OPTIONS, NODE_TYPES, SIZE_OPTIONS, WORKFLOWS } from '../../utils/constants';
import { hasPrompt } from '../../utils/prompts';
import TextVariableEditor from './TextVariableEditor';

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
  const storedParams = data?.params || {};
  const params = { ...storedParams, ...(data?.textInputValues || {}) };
  const status = data?.status || 'idle';
  const error = data?.error;
  const running = status === 'running';
  const onUpdate = data?.onUpdate;
  const onGenerate = data?.onGenerate;
  const onCancelProcess = data?.onCancelProcess;
  const { openPicker, openOptimize } = useNodeDialog();

  const set = useCallback((patch) => {
    onUpdate?.({ params: { ...storedParams, ...patch } });
  }, [onUpdate, storedParams]);

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
    <NodeShell id={id} nodeType={NODE_TYPES.textToImage} data={data} selected={selected} targetHandle sourceHandle>
      <PickedPromptBadge
        pickedPrompt={params.pickedPrompt}
        onClear={() => set({ pickedPrompt: undefined })}
      />
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">提示词</span>
          <button
            type="button"
            onClick={() => openPicker({
              scene: 'text',
              onPick: (item) => set({ pickedPrompt: item.prompt, ...(item.aspect ? { aspect: item.aspect } : {}) }),
            })}
            className="text-xs text-muted-foreground transition hover:text-primary"
          >
            📋 提示词库
          </button>
        </div>
        <div className="nodrag nopan nowheel relative min-h-[64px] rounded-md border border-border bg-background px-2 py-1.5 pr-8 text-sm focus-within:border-primary">
          <TextVariableEditor
            data={data}
            field="prompt"
            value={storedParams.prompt || ''}
            resolvedValue={params.prompt || ''}
            placeholder="描述要生成的游戏资产，如：像素风宝箱，俯视角，无背景"
            onChange={(value) => set({ prompt: value })}
          />
          <button
            type="button"
            onClick={() => openOptimize({
              prompt: params.prompt || '',
              agentConfig: data?.promptOptimizeAgent,
              onApply: (newPrompt) => set({ prompt: newPrompt }),
            })}
            title="优化提示词"
            disabled={!data?.promptOptimizeAgent?.id}
            className="nopan nowheel absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-60 transition hover:bg-primary/10 hover:text-primary hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Wand2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

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
        <div className="nodrag nopan nowheel rounded-md border border-border bg-background px-2 py-1 text-sm focus-within:border-primary">
          <TextVariableEditor
            data={data}
            field="fileName"
            value={storedParams.fileName || ''}
            resolvedValue={params.fileName || ''}
            placeholder="如 hero.png，留空用默认名"
            singleLine
            onChange={(value) => set({ fileName: value || undefined })}
          />
        </div>
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
