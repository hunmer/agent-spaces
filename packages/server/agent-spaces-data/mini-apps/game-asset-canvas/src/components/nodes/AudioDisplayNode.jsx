import { useCallback, useEffect, useRef, useState } from 'react';
import { NodeResizer } from '@xyflow/react';
import { AudioLines, ChevronLeft, ChevronRight, Mic, Pause, Play, Upload, toast } from '@agent-spaces/ui';
import useViewportActivation from '../../hooks/useViewportActivation';
import NodeHandles from './NodeHandles';
import NodeHoverMenu from './NodeHoverMenu';
import { normalizeImageUrl } from '../../utils/workflow';

const AUDIO_SEPARATOR_PLUGIN_ID = 'workflow.audio-separator';
const AUDIO_SEPARATE_ACTION = 'audio_separate';
const SEPARATE_HQ_MODEL = 'model_bs_roformer_ep_317_sdr_12.9755.ckpt';
// UVR stem → 中文名（产物节点标题）
const STEM_TITLES = { Vocals: '人声', Instrumental: '伴奏' };

/**
 * 音频展示节点：无边框铺满式波形播放器（结构对标 VideoDisplayNode，内容区零内边距）。
 *
 * - 波形：fetch + AudioContext.decodeAudioData 解码出峰值数组，canvas 双色柱状绘制
 *   （已播 primary / 未播 muted），ResizeObserver 随节点尺寸重绘；
 *   解码失败或跨域受限时退化为按 URL 种子生成的伪波形，播放 / seek 不受影响。
 * - 交互：波形区域点击 + 拖拽 seek（nodrag nopan），播放/暂停按钮 + 当前时间/总时长；
 *   多音频时底部 ‹ 1/N › 切换；节点拖动只走顶部窄条与空白面（.audio-drag-handle）。
 * - 离屏不解码：useViewportActivation 首次进入视口才 fetch。
 * - 人声分离：hover 菜单调 audio-separator 插件（本地 HTTP 服务），产物 stem 在右侧
 *   插入带「人声/伴奏」标题的音频节点（data.title 选中时显示）。
 *
 * data.audios: string[]  当前展示的音频（http URL），上游连线时由派生逻辑覆盖
 * data.source: 'upload' | 'upstream' | ...  来源标记
 */

const PEAK_BUCKETS = 900;

function computePeaks(buffer, buckets) {
  const channelCount = Math.min(buffer.numberOfChannels, 2);
  const channels = [];
  for (let c = 0; c < channelCount; c += 1) channels.push(buffer.getChannelData(c));
  const block = Math.max(1, Math.floor(buffer.length / buckets));
  const peaks = new Float32Array(buckets);
  let max = 0;
  for (let i = 0; i < buckets; i += 1) {
    const start = i * block;
    const end = Math.min(start + block, buffer.length);
    let peak = 0;
    for (let j = start; j < end; j += 1) {
      for (let c = 0; c < channelCount; c += 1) {
        const v = Math.abs(channels[c][j]);
        if (v > peak) peak = v;
      }
    }
    peaks[i] = peak;
    if (peak > max) max = peak;
  }
  if (max > 0) for (let i = 0; i < buckets; i += 1) peaks[i] /= max;
  return peaks;
}

// 伪波形：解码不可用时按 URL 生成确定性形状，仅作视觉占位
function pseudoPeaks(seedText, buckets) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) seed = ((seed ^ seedText.charCodeAt(i)) * 16777619) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const peaks = new Float32Array(buckets);
  for (let i = 0; i < buckets; i += 1) {
    const env = 0.45 + 0.55 * Math.sin((i / buckets) * Math.PI) ** 0.8;
    peaks[i] = Math.min(1, (0.18 + rand() * 0.55) * env + 0.06);
  }
  return peaks;
}

// 读取主题 CSS 变量；兼容旧版 shadcn 裸 hsl 分量格式（如 "217 91% 60%"）
function cssColor(el, name, fallback) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  if (!v) return fallback;
  return /^[\d.]+\s+[\d.]+%\s+[\d.]+%$/.test(v) ? `hsl(${v})` : v;
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Blob 播放需要正确 MIME 才能被 audio 元素识别；后端可能返回通用类型，按扩展名兜底
function guessAudioMime(contentType, url) {
  if (contentType && /^audio\//i.test(contentType)) return contentType.split(';')[0].trim();
  const ext = (url.match(/\.([a-z0-9]+)(?:[?&#/]|$)/i) || [])[1]?.toLowerCase();
  const map = {
    m4a: 'audio/mp4', mp4: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav',
    ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac',
    aac: 'audio/aac', webm: 'audio/webm',
  };
  return map[ext] || 'audio/mpeg';
}

export default function AudioDisplayNode({ data, selected }) {
  const audios = Array.isArray(data?.audios) ? data.audios.filter(Boolean) : [];
  const onUpdate = data?.onUpdate;
  const inputRef = useRef(null);
  const rootRef = useRef(null);
  const surfaceRef = useRef(null);
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const seekingRef = useRef(false);
  const audioCtxRef = useRef(null);
  const viewportActivated = useViewportActivation(rootRef);
  const [uploading, setUploading] = useState(false);
  const [separating, setSeparating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [nodeHovered, setNodeHovered] = useState(false);
  const [audioIndex, setAudioIndex] = useState(0);
  const [peaks, setPeaks] = useState(null);
  const [mediaUrl, setMediaUrl] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [box, setBox] = useState(null);

  useEffect(() => {
    if (audioIndex > audios.length - 1) setAudioIndex(Math.max(0, audios.length - 1));
  }, [audios.length, audioIndex]);

  const isMulti = audios.length > 1;
  const current = audios[Math.min(audioIndex, audios.length - 1)] || audios[0];
  const selectionCount = data?.selectionCount ?? 1;

  const handleFile = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await window.AgentSpaces?.uploadFile?.(file);
      const url = uploaded?.url || uploaded?.httpPath;
      if (!url) throw new Error('上传未返回 URL');
      onUpdate?.({ audios: [url], source: 'upload', error: undefined });
    } catch (error) {
      onUpdate?.({ error: `上传失败：${error?.message || String(error)}` });
    } finally {
      setUploading(false);
    }
  }, [onUpdate]);

  // AudioContext 仅用于离线解码，随节点卸载释放
  useEffect(() => () => {
    audioCtxRef.current?.close?.().catch(() => {});
  }, []);

  // 波形解码 + 播放源：URL 变化即重置；离屏（未激活）不 fetch。
  // data/file 等后端路由不支持 HTTP Range，audio 元素直接 seek 会无效，
  // 因此复用波形解码的同一次下载转 Blob URL 播放（本地可任意 seek，也省一遍网络请求）。
  useEffect(() => {
    setPeaks(null);
    setMediaUrl(null);
    setPlaying(false);
    setProgress(0);
    setDuration(0);
    if (!current || !viewportActivated) return undefined;
    const controller = new AbortController();
    const CtxClass = window.AudioContext || window.webkitAudioContext;
    let blobUrl = null;
    (async () => {
      let raw = null;
      let mime = '';
      try {
        const res = await fetch(current, { signal: controller.signal });
        raw = await res.arrayBuffer();
        mime = res.headers.get('content-type') || '';
        if (controller.signal.aborted) return;
      } catch {
        if (controller.signal.aborted) return;
        // 网络失败（如跨域受限）：伪波形 + 原始 URL 尽力播放
        setPeaks(pseudoPeaks(current, PEAK_BUCKETS));
        setMediaUrl(current);
        return;
      }
      // 先建 Blob 再解码：decodeAudioData 可能接管（detach）原 buffer
      blobUrl = URL.createObjectURL(new Blob([raw], { type: guessAudioMime(mime, current) }));
      setMediaUrl(blobUrl);
      try {
        if (!audioCtxRef.current && CtxClass) audioCtxRef.current = new CtxClass();
        const decoded = await audioCtxRef.current.decodeAudioData(raw);
        if (controller.signal.aborted) return;
        setPeaks(computePeaks(decoded, PEAK_BUCKETS));
        setDuration((d) => (Number.isFinite(decoded.duration) && decoded.duration > 0 ? decoded.duration : d));
      } catch {
        if (controller.signal.aborted) return;
        // 格式解码失败：伪波形，播放仍走 Blob
        setPeaks(pseudoPeaks(current, PEAK_BUCKETS));
      }
    })();
    return () => {
      controller.abort();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [current, viewportActivated]);

  // 播放中用 rAF 刷新进度（timeupdate 粒度太粗，波形回扫不平滑）
  useEffect(() => {
    if (!playing) return undefined;
    let raf = 0;
    const tick = () => {
      const a = audioRef.current;
      if (a && Number.isFinite(a.duration) && a.duration > 0 && !seekingRef.current) {
        setProgress(a.currentTime / a.duration);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // 节点尺寸变化 → 重测画布
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) setBox({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 波形绘制：随 peaks / 进度 / 尺寸变化重绘
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !box) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.round(box.w);
    const h = Math.round(box.h);
    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
    if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const primary = cssColor(canvas, '--primary', '#6366f1');
    const muted = cssColor(canvas, '--muted-foreground', '#a1a1aa');
    const p = Math.min(1, Math.max(0, progress || 0));

    if (!peaks) {
      // 解码中：居中一条低透明度细线占位
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = muted;
      ctx.fillRect(0, Math.round(h / 2), w, 1.5);
      return;
    }

    const barW = 2;
    const gap = 1;
    const count = Math.max(4, Math.floor((w + gap) / (barW + gap)));
    const step = peaks.length / count;
    const mid = h / 2;
    const offset = (w - (count * (barW + gap) - gap)) / 2;
    for (let i = 0; i < count; i += 1) {
      const v = peaks[Math.min(peaks.length - 1, Math.floor(i * step))] || 0;
      const bh = Math.max(2, v * h * 0.78);
      const x = offset + i * (barW + gap);
      const played = (i + 0.5) / count <= p;
      ctx.globalAlpha = played ? 0.95 : 0.3;
      ctx.fillStyle = played ? primary : muted;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, mid - bh / 2, barW, bh, Math.min(1, barW / 2));
        ctx.fill();
      } else {
        ctx.fillRect(x, mid - bh / 2, barW, bh);
      }
    }
    if (p > 0 && p < 1) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = primary;
      ctx.fillRect(Math.round(p * w) - 0.5, 0, 1.5, h);
    }
  }, [peaks, progress, box]);

  const seekFromEvent = useCallback((event) => {
    const el = surfaceRef.current;
    const a = audioRef.current;
    if (!el || !a || !Number.isFinite(a.duration) || a.duration <= 0) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    a.currentTime = ratio * a.duration;
    setProgress(ratio);
  }, []);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, [current]);

  // 人声分离：audio-separator 插件（本地 HTTP 服务，GPU 加速）→ 每个 stem 在源节点右侧插入音频节点。
  // 产物落插件临时目录，filePath 经 localFileUrl 转本地 http URL（token 持久化，可直接存画布）。
  const onExportAudios = data?.onExportAudios;
  const handleSeparateVocals = useCallback(async (model) => {
    const AS = window.AgentSpaces;
    if (!current || separating) return;
    if (!/^https?:/i.test(normalizeImageUrl(current) || '')) {
      toast.error('当前音频不是 http 地址，无法分离');
      return;
    }
    if (!AS?.callPluginTool || !AS?.localFileUrl || !onExportAudios) {
      toast.error('宿主插件能力不可用');
      return;
    }
    setSeparating(true);
    try {
      const ret = await AS.callPluginTool(AUDIO_SEPARATOR_PLUGIN_ID, AUDIO_SEPARATE_ACTION, {
        input: normalizeImageUrl(current),
        output_format: 'MP3',
        ...(model ? { model } : {}),
      });
      const outputs = ret?.success ? ret?.data?.outputs : null;
      if (!Array.isArray(outputs) || outputs.length === 0) {
        throw new Error(ret?.message || '人声分离失败');
      }
      const urls = outputs.map((o) => normalizeImageUrl(AS.localFileUrl(o.filePath)));
      onExportAudios(urls, { titles: outputs.map((o) => STEM_TITLES[o.stem] || o.stem) });
      toast.success(`人声分离完成，已插入 ${urls.length} 个音频节点`);
    } catch (err) {
      toast.error(`人声分离失败：${err?.message || err}`);
    } finally {
      setSeparating(false);
    }
  }, [current, separating, onExportAudios]);

  const sourceLabel = data?.source === 'upstream' ? '来自连线'
    : data?.source === 'history' ? '来自记录'
    : data?.source === 'storyboard' ? '来自分镜'
    : data?.source === 'upload' ? '已上传'
    : '';

  return (
    <div
      ref={rootRef}
      className="group relative h-full w-full overflow-visible"
      onMouseEnter={() => setNodeHovered(true)}
      onMouseLeave={() => setNodeHovered(false)}
    >
      <style>{`
        @keyframes audio-separate-scan {
          0% { transform: translateX(-110%); }
          100% { transform: translateX(310%); }
        }
        .audio-separate-progress-bar {
          animation: audio-separate-scan 1.2s ease-in-out infinite;
        }
      `}</style>
      <NodeHoverMenu
        actions={current ? [{
          key: 'separate-vocals',
          label: separating ? '人声分离中…' : '人声分离',
          icon: <Mic className="h-3.5 w-3.5" />,
          disabled: separating,
          children: [
            { key: 'separate-fast', label: '快速分离（默认模型）', disabled: separating, onClick: () => handleSeparateVocals() },
            { key: 'separate-hq', label: '高质量分离（首次需下载模型）', disabled: separating, onClick: () => handleSeparateVocals(SEPARATE_HQ_MODEL) },
          ],
        }] : []}
        visible={(nodeHovered || menuOpen) && selectionCount <= 1}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onRun={data?.onRunNode}
        onDelete={data?.onDeleteNode}
        running={data?.status === 'running'}
      />
      <NodeResizer
        isVisible={!!selected}
        minWidth={240}
        minHeight={100}
        color="#6366f1"
        handleClassName="!w-2.5 !h-2.5 !rounded-sm !border-2 !border-background"
        lineClassName="!border-primary/40"
      />
      <NodeHandles target source />

      <div className="absolute inset-0 overflow-hidden">
        {/* 左上角常驻上传按钮（同视频展示节点） */}
        <div className="absolute -left-10 top-1.5 z-30 nodrag nopan">
          <button
            type="button"
            title="上传音频"
            aria-label="上传音频"
            onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-background/85 text-muted-foreground shadow ring-1 ring-border backdrop-blur-sm hover:text-primary"
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 顶部自定义拖拽 handle：ReactFlow node.dragHandle 指向 .audio-drag-handle */}
        <div
          className="audio-drag-handle absolute left-0 right-0 top-0 z-20 h-5 cursor-move opacity-0 transition group-hover:opacity-100"
          title="拖拽移动"
        >
          <div className="mx-auto mt-1 h-1 w-8 rounded-full bg-foreground/30" />
        </div>

        {/* 人声分离运行态：顶部 indeterminate 进度条 + 状态 pill（不挡波形试听，进度不可知——服务端 job 无百分比） */}
        {separating && (
          <>
            <div className="audio-separate-progress pointer-events-none absolute left-0 right-0 top-0 z-30 h-[3px] overflow-hidden rounded-t-lg bg-primary/15">
              <div className="audio-separate-progress-bar h-full w-1/3 rounded-full bg-primary" />
            </div>
            <div className="nodrag nopan absolute left-1.5 top-1.5 z-30 flex items-center gap-1.5 rounded-full bg-background/85 py-1 pl-1.5 pr-3 shadow ring-1 ring-border backdrop-blur-sm">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-[11px] text-primary">人声分离中…</span>
            </div>
          </>
        )}

        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-card text-xs text-primary ring-1 ring-border">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            上传中…
          </div>
        ) : audios.length === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="audio-drag-handle flex h-full w-full cursor-move flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <AudioLines className="h-6 w-6" />
            <span className="pointer-events-none select-none">点击上传音频，或连接上游节点</span>
          </button>
        ) : (
          <div className="audio-drag-handle absolute inset-0 cursor-move overflow-hidden rounded-lg bg-gradient-to-b from-card to-secondary ring-1 ring-border">
            {/* 波形画布：铺满节点，点击/拖拽 seek */}
            <div
              ref={surfaceRef}
              className="nodrag nopan nowheel absolute inset-0 touch-none select-none"
              title="点击定位播放进度"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                seekingRef.current = true;
                seekFromEvent(e);
              }}
              onPointerMove={(e) => { if (seekingRef.current) seekFromEvent(e); }}
              onPointerUp={() => { seekingRef.current = false; }}
              onPointerCancel={() => { seekingRef.current = false; }}
            >
              <canvas ref={canvasRef} className="block h-full w-full" />
            </div>

            {/* 底部控制条：播放按钮 + 时间 +（多音频）切换 + 来源标签 */}
            {!uploading && current && (
              <div className="nodrag nopan absolute bottom-1.5 left-1.5 right-1.5 z-10 flex select-none items-center gap-1.5">
                <div className="flex items-center gap-2 rounded-full bg-background/85 py-1 pl-1 pr-3 shadow ring-1 ring-border backdrop-blur-sm">
                  <button
                    type="button"
                    title={playing ? '暂停' : '播放'}
                    aria-label={playing ? '暂停' : '播放'}
                    onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                    disabled={!mediaUrl}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50"
                  >
                    {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 translate-x-px" />}
                  </button>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {formatTime((progress || 0) * duration)} / {formatTime(duration)}
                  </span>
                </div>
                <div className="flex-1" />
                {isMulti && (
                  <div className="flex items-center gap-1 rounded-full bg-background/85 px-1.5 py-1 shadow ring-1 ring-border backdrop-blur-sm">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setAudioIndex((i) => (i - 1 + audios.length) % audios.length); }}
                      className="rounded p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                      title="上一个"
                    ><ChevronLeft className="h-3.5 w-3.5" /></button>
                    <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                      {Math.min(audioIndex, audios.length - 1) + 1}/{audios.length}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setAudioIndex((i) => (i + 1) % audios.length); }}
                      className="rounded p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                      title="下一个"
                    ><ChevronRight className="h-3.5 w-3.5" /></button>
                  </div>
                )}
                {selected && (data?.title || sourceLabel) ? (
                  <span className="max-w-[45%] shrink-0 truncate rounded-full bg-background/85 px-2 py-1 text-[10px] text-muted-foreground shadow ring-1 ring-border backdrop-blur-sm">
                    {data?.title || sourceLabel}
                  </span>
                ) : null}
              </div>
            )}

            {/* 就绪后以 Blob URL 播放（data/file 路由无 Range 支持，原 URL 无法 seek） */}
            {mediaUrl && viewportActivated && (
              <audio
                key={mediaUrl}
                ref={audioRef}
                src={mediaUrl}
                preload="auto"
                className="hidden"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => {
                  const a = audioRef.current;
                  if (a) a.currentTime = 0;
                  setProgress(0);
                  setPlaying(false);
                }}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
                onTimeUpdate={(e) => {
                  const a = e.currentTarget;
                  if (!seekingRef.current && Number.isFinite(a.duration) && a.duration > 0) {
                    setProgress(a.currentTime / a.duration);
                  }
                }}
              />
            )}
          </div>
        )}

        {data?.error ? (
          <p className="absolute bottom-1.5 left-1.5 right-1.5 z-20 rounded bg-red-500/90 px-2 py-1 text-xs text-white">{data.error}</p>
        ) : null}

        <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={handleFile} />
      </div>
    </div>
  );
}
