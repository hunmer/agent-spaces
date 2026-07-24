import { useCallback, useState } from 'react';
import NodeShell from './NodeShell';
import PromptPickerDialog from '../PromptPickerDialog';
import PickedPromptBadge from './PickedPromptBadge';
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
export default function TextToVoiceNode({ id, data, selected }) {
  const params = data?.params || {};
  const audio = data?.output?.audio || null;
  const status = data?.status || 'idle';
  const error = data?.error;
  const running = status === 'running';
  const onUpdate = data?.onUpdate;
  const onGenerate = data?.onGenerateMedia;
  const [pickerOpen, setPickerOpen] = useState(false);

  const set = useCallback((patch) => {
    onUpdate?.({ params: { ...params, ...patch } });
  }, [onUpdate, params]);

  const handleRun = useCallback(() => {
    const merged = [params.pickedPrompt, params.prompt].map((s) => (s || '').trim()).filter(Boolean).join('\n');
    onGenerate?.(id, NODE_TYPES.textToVoice, 'audio', {
      workflowId: WORKFLOWS.text_to_voice,
      input: {
        prompt: merged,
        model: params.model || VOICE_PROVIDER_OPTIONS[0].value,
        ...(params.voiceId ? { voiceId: params.voiceId } : {}),
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
            onClick={() => setPickerOpen(true)}
            className="text-xs text-muted-foreground transition hover:text-primary"
          >
            📋 提示词库
          </button>
        </div>
        <textarea
          className="min-h-[72px] w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
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

      <button
        type="button"
        disabled={running || !hasPrompt(params)}
        onClick={handleRun}
        className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? '生成中…' : '生成配音'}
      </button>

      {error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
      )}

      {audio && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">产出</span>
          {/* key 加 url 末段，避免 React 复用同 <audio> 实例导致 src 更新后不重新加载 */}
          <audio key={audio} src={audio} controls className="w-full" />
          <a
            href={audio}
            target="_blank"
            rel="noreferrer"
            className="truncate text-xs text-primary underline-offset-2 hover:underline"
          >
            下载 / 打开音频
          </a>
        </div>
      )}

      <PromptPickerDialog
        open={pickerOpen}
        scene="text"
        onClose={() => setPickerOpen(false)}
        onPick={(item) => set({ pickedPrompt: item.prompt })}
      />
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
