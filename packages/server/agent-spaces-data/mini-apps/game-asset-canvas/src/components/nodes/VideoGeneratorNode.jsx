import { useCallback, useState } from 'react';
import { FileUpload } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import UpstreamImageList, { orderUpstream } from './UpstreamImageList';
import PromptPickerDialog from '../PromptPickerDialog';
import PickedPromptBadge from './PickedPromptBadge';
import CountAndConcurrency from './CountAndConcurrency';
import {
  DEFAULT_VIDEO_MODEL, NODE_TYPES, VIDEO_ASPECT_OPTIONS, VIDEO_DURATION_OPTIONS,
  VIDEO_MODEL_OPTIONS, VIDEO_QUALITY_OPTIONS, WORKFLOWS, isAliyunVideoModel,
} from '../../utils/constants';
import { dedupeUrls, normalizeImageUrls } from '../../utils/workflow';
import { hasPrompt } from '../../utils/prompts';

/**
 * 生成视频节点（video_generator 工作流）。
 *
 * 输入图片来源（两种合并，去重）：
 * 1. FileUpload 上传图（data.uploadedImages）
 * 2. 上游连线推入的图（data.images，由 computeInputImages 派生）
 *
 * data.params: { prompt, pickedPrompt, model, aspect, quality, duration }
 * data.output: { video: string|null }  产出视频 http URL
 */
export default function VideoGeneratorNode({ id, data, selected }) {
  const params = data?.params || {};
  const uploadedImages = Array.isArray(data?.uploadedImages) ? data.uploadedImages : [];
  const rawUpstream = Array.isArray(data?.images) ? data.images : [];
  const upstreamOrder = Array.isArray(data?.upstreamOrder) ? data.upstreamOrder : [];
  const upstreamImages = orderUpstream(rawUpstream, upstreamOrder);
  const inputImages = dedupeUrls([...uploadedImages, ...upstreamImages]);

  // 产出优先取 videos 数组（count>1 时由后端写入），降级旧单 video 字段
  const videos = Array.isArray(data?.output?.videos) && data.output.videos.length
    ? data.output.videos
    : (data?.output?.video ? [data.output.video] : []);
  const status = data?.status || 'idle';
  const error = data?.error;
  const running = status === 'running';
  const onUpdate = data?.onUpdate;
  const onGenerate = data?.onGenerateMedia;
  const uploading = data?.uploading;
  const [pickerOpen, setPickerOpen] = useState(false);

  const set = useCallback((patch) => {
    onUpdate?.({ params: { ...params, ...patch } });
  }, [onUpdate, params]);

  const handleFilesChange = useCallback(async (files) => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) {
      console.warn('AgentSpaces.uploadFile 不可用');
      return;
    }
    const urls = [];
    const pending = [];
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
        console.error('Video upload failed:', err);
        onUpdate?.({ uploading: false, uploadError: err?.message || String(err) });
        return;
      }
    }
    onUpdate?.({ uploadedImages: urls, uploading: false });
  }, [onUpdate]);

  const handleRun = useCallback(() => {
    const merged = [params.pickedPrompt, params.prompt].map((s) => (s || '').trim()).filter(Boolean).join('\n');
    const model = params.model || DEFAULT_VIDEO_MODEL;
    // uploadFile 返回的可能是相对路径（如 /static/uploads/xxx.png），提交给工作流后端下载需完整 http URL；
    // normalizeImageUrls 补全 origin（同源相对路径前置 window.location.origin）。
    const images = normalizeImageUrls(inputImages);
    onGenerate?.(id, NODE_TYPES.videoGenerator, 'video', {
      workflowId: WORKFLOWS.video_generator,
      input: {
        prompt: merged,
        model,
        aspect: params.aspect || VIDEO_ASPECT_OPTIONS[0],
        quality: params.quality || VIDEO_QUALITY_OPTIONS[0],
        duration: params.duration || VIDEO_DURATION_OPTIONS[0],
        // 图片可作为参考输入传给工作流（string[]）；aliyun 分支会用 images[0]/images[1] 作首尾帧
        images,
        count: Math.max(1, Number(params.count) || 1),
        concurrency: Math.max(1, Number(params.concurrency) || 1),
      },
    });
  }, [onGenerate, id, params, inputImages]);

  // aliyun 分支需 ≥1 张参考图（工作流 run_code 会取 images[0]/images[1]）
  const needsRefImage = isAliyunVideoModel(params.model || DEFAULT_VIDEO_MODEL);
  const canRun = hasPrompt(params) && !uploading && !running
    && (!needsRefImage || inputImages.length > 0);

  const fileUploadValue = uploadedImages.map((url, i) => ({
    id: `up-${i}-${url.slice(-12)}`,
    file: { name: `upload-${i + 1}.png`, size: 0, type: 'image/png', url, httpPath: url },
    preview: url,
  }));

  const upCount = uploadedImages.length;
  const usCount = upstreamImages.length;

  return (
    <NodeShell id={id} nodeType={NODE_TYPES.videoGenerator} data={data} selected={selected} targetHandle sourceHandle>
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
          className="min-h-[64px] w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
          placeholder="描述要生成的视频，如：森林精灵转动魔杖，金色粒子飞溅"
          value={params.prompt || ''}
          onChange={(e) => set({ prompt: e.target.value })}
        />
      </label>

      {/* 参考图片：FileUpload 上传 + 上游连线 */}
      <FileUpload
        value={fileUploadValue}
        onChange={handleFilesChange}
        accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'] }}
        maxFiles={0}
        placeholder="点击或拖入参考图（可选）"
      />
      {uploading && <p className="text-[10px] text-primary">上传中…</p>}
      {data?.uploadError && (
        <p className="text-[10px] text-red-500">上传失败：{data.uploadError}</p>
      )}
      {upstreamImages.length > 0 && (
        <UpstreamImageList
          urls={upstreamImages}
          onChangeOrder={(next) => onUpdate?.({ upstreamOrder: next })}
        />
      )}
      <div className="text-[11px] text-muted-foreground">
        参考 {inputImages.length} 张{upCount ? `（上传 ${upCount}` : ''}{upCount && usCount ? ' + ' : ''}{usCount ? `连线 ${usCount}` : ''}{upCount || usCount ? '）' : '（无）'}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">模型</span>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            value={params.model || DEFAULT_VIDEO_MODEL}
            onChange={(e) => set({ model: e.target.value })}
          >
            {VIDEO_MODEL_OPTIONS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <LabeledSelect label="比例" value={params.aspect || VIDEO_ASPECT_OPTIONS[0]} rawOptions={VIDEO_ASPECT_OPTIONS} onChange={(v) => set({ aspect: v })} />
        <LabeledSelect label="质量" value={params.quality || VIDEO_QUALITY_OPTIONS[0]} rawOptions={VIDEO_QUALITY_OPTIONS} onChange={(v) => set({ quality: v })} />
        <LabeledSelect label="时长" value={params.duration || VIDEO_DURATION_OPTIONS[0]} rawOptions={VIDEO_DURATION_OPTIONS} onChange={(v) => set({ duration: v })} />
      </div>
      <CountAndConcurrency
        count={params.count ?? 1}
        concurrency={params.concurrency ?? 1}
        onChange={(patch) => set(patch)}
      />
      {needsRefImage && inputImages.length === 0 && (
        <p className="rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600">
          该模型（阿里云）需至少 1 张参考图，请上传或连线上游图片
        </p>
      )}

      <button
        type="button"
        disabled={!canRun}
        onClick={handleRun}
        className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? '生成中…' : '生成视频'}
      </button>

      {error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
      )}

      {videos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            产出{videos.length > 1 ? `（${videos.length}）` : ''}
          </span>
          {videos.map((url, i) => (
            <div key={url + i} className="flex flex-col gap-1">
              <video key={url} src={url} controls className="w-full rounded border border-border" />
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-xs text-primary underline-offset-2 hover:underline"
              >
                {videos.length > 1 ? `#${i + 1} ` : ''}下载 / 打开视频
              </a>
            </div>
          ))}
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
