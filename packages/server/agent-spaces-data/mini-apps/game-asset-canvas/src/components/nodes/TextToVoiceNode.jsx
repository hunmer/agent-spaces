import { useCallback } from 'react';
import NodeShell from './NodeShell';
import { useNodeDialog } from './NodeDialogContext';
import PickedPromptBadge from './PickedPromptBadge';
import CountAndConcurrency from './CountAndConcurrency';
import { NODE_TYPES, VOICE_PROVIDER_OPTIONS, WORKFLOWS } from '../../utils/constants';
import { hasPrompt } from '../../utils/prompts';

/**
 * 文字生成语音节点（text_to_voice 工作流）。
 * data.params: { prompt, pickedPrompt, model, voiceId }
 *   - prompt:       用户输入的要合成语音的文本
 *   - pickedPrompt: 提示词库选中的文本（与 prompt 合并）
 *   - model:        语音服务提供商 fish-audio / minimax / qianyin
 *   - voiceId:      发音人 ID（fish-audio→referenceId / minimax→voiceId / qianyin→speakerId）
 * data.output: { audio: string|null }  产出音频 http URL
 */

// 参数 schema（agent 通过 get_node_params 读取）。
export const PARAMS_SCHEMA = [
  {
    key: 'prompt',
    label: '文本',
    type: 'text',
    required: true,
    description: '要合成语音的文本内容。',
  },
  {
    key: 'model',
    label: '语音服务',
    type: 'select',
    options: VOICE_PROVIDER_OPTIONS,
    default: VOICE_PROVIDER_OPTIONS[0]?.value || 'fish-audio',
  },
  {
    key: 'voiceId',
    label: '发音人 ID',
    type: 'text',
    required: false,
    description: '可选。各服务字段名不同：fish-audio→referenceId / minimax→voiceId / qianyin→speakerId。不填用默认发音人。',
  },
];
export default function TextToVoiceNode({ id, data, selected }) {
  const storedParams = data?.params || {};
  const params = { ...storedParams, ...(data?.textInputValues || {}) };
  // 产出优先取 audios 数组（count>1 时由后端写入），降级旧单 audio 字段
  const audios = Array.isArray(data?.output?.audios) && data.output.audios.length
    ? data.output.audios
    : (data?.output?.audio ? [data.output.audio] : []);
  const status = data?.status || 'idle';
  const error = data?.error;
  const running = status === 'running';
  const onUpdate = data?.onUpdate;
  const onGenerate = data?.onGenerateMedia;
  const onCancelProcess = data?.onCancelProcess;
  const { openPicker } = useNodeDialog();

  const set = useCallback((patch) => {
    onUpdate?.({ params: { ...storedParams, ...patch } });
  }, [onUpdate, storedParams]);

  const handleRun = useCallback(() => {
    const merged = [params.pickedPrompt, params.prompt].map((s) => (s || '').trim()).filter(Boolean).join('\n');
    onGenerate?.(id, NODE_TYPES.textToVoice, 'audio', {
      workflowId: WORKFLOWS.text_to_voice,
      input: {
        prompt: merged,
        model: params.model || VOICE_PROVIDER_OPTIONS[0].value,
        ...(params.voiceId ? { voiceId: params.voiceId } : {}),
        count: Math.max(1, Number(params.count) || 1),
        concurrency: Math.max(1, Number(params.concurrency) || 1),
      },
    });
  }, [onGenerate, id, params]);

  return (
    <NodeShell id={id} nodeType={NODE_TYPES.textToVoice} data={data} selected={selected}>
      <PickedPromptBadge
        pickedPrompt={params.pickedPrompt}
        onClear={() => set({ pickedPrompt: undefined })}
      />
      <label className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">文本</span>
          <button
            type="button"
            onClick={() => openPicker({
              scene: 'text',
              onPick: (item) => set({ pickedPrompt: item.prompt }),
            })}
            className="text-xs text-muted-foreground transition hover:text-primary"
          >
            📋 提示词库
          </button>
        </div>
        <textarea
          className="min-h-[72px] max-h-[300px] w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
          placeholder="输入要合成语音的文本，如：欢迎来到这片神秘大陆……"
          value={params.prompt || ''}
          onChange={(e) => set({ prompt: e.target.value })}
        />
      </label>

      <div className="grid grid-cols-1 gap-2">
        <LabeledSelect
          label="语音服务"
          value={params.model || VOICE_PROVIDER_OPTIONS[0].value}
          options={VOICE_PROVIDER_OPTIONS}
          onChange={(v) => set({ model: v })}
        />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            发音人 ID（可选）
          </span>
          <input
            type="text"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            placeholder="fish→referenceId / minimax→voiceId / qianyin→speakerId"
            value={params.voiceId || ''}
            onChange={(e) => set({ voiceId: e.target.value })}
          />
        </label>
      </div>

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
          生成配音
        </button>
      )}

      {error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
      )}

      {audios.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            产出{audios.length > 1 ? `（${audios.length}）` : ''}
          </span>
          {audios.map((url, i) => (
            <div key={url + i} className="flex flex-col gap-1">
              {/* key 加 url 末段，避免 React 复用同 <audio> 实例导致 src 更新后不重新加载 */}
              <audio key={url} src={url} controls className="w-full" />
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-xs text-primary underline-offset-2 hover:underline"
              >
                {audios.length > 1 ? `#${i + 1} ` : ''}下载 / 打开音频
              </a>
            </div>
          ))}
        </div>
      )}
    </NodeShell>
  );
}

function LabeledSelect({ label, value, options, onChange }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
