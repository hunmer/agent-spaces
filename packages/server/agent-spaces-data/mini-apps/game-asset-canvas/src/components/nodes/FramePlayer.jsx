import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Pause, Play } from '@agent-spaces/ui';

/**
 * 帧序列 Canvas 循环播放器。
 *
 * 把 frames（http URL 数组）预加载为 ImageBitmap，用 requestAnimationFrame
 * 按 fps 定时切换并绘制到 <canvas>，循环区间 [startFrame, endFrame]。
 *
 * - endFrame < startFrame → 显示错误信息，不播放
 * - 起止帧由父组件传入（相对 frames 全集的索引）
 *
 * @param {string[]} frames  帧图片 http URL 数组
 * @param {number} startFrame 起始帧索引（含）
 * @param {number} endFrame   结束帧索引（含）
 * @param {number} [fps=10]   播放帧率
 */
export default function FramePlayer({ frames = [], startFrame = 0, endFrame = 0, fps = 10 }) {
  const canvasRef = useRef(null);
  const bitmapsRef = useRef([]);
  const rafRef = useRef(0);
  const nextTimeRef = useRef(0);
  const idxRef = useRef(startFrame);
  const [playing, setPlaying] = useState(true);
  const [loading, setLoading] = useState(true);

  const clamp = (v) => Math.max(0, Math.min(frames.length - 1, v));
  const s = clamp(startFrame);
  const e = clamp(endFrame);
  const invalid = e < s;

  // 预加载帧为 ImageBitmap（失败降级为 Image）
  useEffect(() => {
    let cancelled = false;
    bitmapsRef.current = [];
    if (!frames.length) { setLoading(false); return; }
    setLoading(true);

    (async () => {
      const imgs = [];
      for (const url of frames) {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = url;
          await img.decode();
          if (typeof createImageBitmap === 'function') {
            imgs.push(await createImageBitmap(img));
          } else {
            imgs.push(img);
          }
        } catch {
          imgs.push(null);
        }
        if (cancelled) return;
      }
      if (cancelled) return;
      bitmapsRef.current = imgs;
      setLoading(false);
      drawFirst();
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames.join('|')]);

  // 绘制单帧（按 canvas 实际尺寸等比 contain）
  const drawFrame = (i) => {
    const canvas = canvasRef.current;
    const bmp = bitmapsRef.current[i];
    if (!canvas || !bmp) return;
    const ctx = canvas.getContext('2d');
    const cw = canvas.width, ch = canvas.height;
    const bw = bmp.width || bmp.naturalWidth || cw;
    const bh = bmp.height || bmp.naturalHeight || ch;
    const scale = Math.min(cw / bw, ch / bh);
    const dw = bw * scale, dh = bh * scale;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(bmp, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  };

  const drawFirst = () => {
    if (bitmapsRef.current[s]) drawFrame(s);
    idxRef.current = s;
  };

  // 播放循环
  useEffect(() => {
    if (invalid || loading || !frames.length) return;
    if (!playing) { drawFrame(idxRef.current); return; }

    const interval = Math.max(16, 1000 / Math.max(1, fps));
    nextTimeRef.current = performance.now();
    idxRef.current = s;

    const tick = (now) => {
      if (now >= nextTimeRef.current) {
        idxRef.current = idxRef.current >= e ? s : idxRef.current + 1;
        drawFrame(idxRef.current);
        nextTimeRef.current = now + interval;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, invalid, loading, s, e, fps, frames.length]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-full overflow-hidden rounded-md border border-border bg-muted/30" style={{ aspectRatio: '16 / 9' }}>
        {loading ? (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="ml-2">加载帧…</span>
          </div>
        ) : invalid ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-red-500">
            <AlertCircle className="h-5 w-5" />
            <span>错误：结束帧({e}) &lt; 起始帧({s})，不播放</span>
          </div>
        ) : (
          <canvas ref={canvasRef} width={480} height={270} className="h-full w-full object-contain" />
        )}
      </div>
      <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
        <span>区间 {s}–{e}（共 {Math.max(0, e - s + 1)} 帧）· {fps} fps</span>
        <button
          type="button"
          disabled={invalid || loading}
          onClick={() => setPlaying((p) => !p)}
          className="flex items-center gap-1 rounded border border-border px-2 py-0.5 transition hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {playing ? '暂停' : '播放'}
        </button>
      </div>
    </div>
  );
}
