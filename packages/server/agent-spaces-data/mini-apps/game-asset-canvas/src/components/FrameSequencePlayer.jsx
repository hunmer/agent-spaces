import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Pause, Play, Repeat2 } from '@agent-spaces/ui';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** 通用图片帧序列播放器，区间索引相对传入的 frames 全集。 */
export default function FrameSequencePlayer({
  frames = [],
  startFrame = 0,
  endFrame = frames.length - 1,
  fps = 10,
  onFpsChange,
  autoPlay = true,
  active = true,
  className = '',
}) {
  const [playing, setPlaying] = useState(autoPlay);
  const [loop, setLoop] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [currentFrame, setCurrentFrame] = useState(0);
  const currentFrameRef = useRef(0);

  const maxIndex = Math.max(0, frames.length - 1);
  const start = clamp(Number(startFrame) || 0, 0, maxIndex);
  const end = clamp(Number(endFrame) || 0, 0, maxIndex);
  const invalid = frames.length > 0 && end < start;
  const selectedFrames = useMemo(
    () => (invalid ? [] : frames.slice(start, end + 1)),
    [frames, start, end, invalid],
  );
  const frameSourceKey = frames.join('|');

  useEffect(() => {
    setPlaying(autoPlay);
    setReady(false);
    setError('');
    setCurrentFrame(start);
    currentFrameRef.current = start;
    // 起止帧由下方 effect 单独处理，避免范围变化重置播放器。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, frameSourceKey]);

  useEffect(() => {
    if (invalid || !frames.length) return;
    const next = clamp(currentFrameRef.current, start, end);
    if (next === currentFrameRef.current) return;
    currentFrameRef.current = next;
    setCurrentFrame(next);
  }, [end, frames.length, invalid, start]);

  useEffect(() => {
    if (!active || !playing || !ready || invalid || selectedFrames.length < 2) return undefined;
    const interval = Math.max(8, Math.round(1000 / Math.max(1, Number(fps) || 10)));
    const timer = setInterval(() => {
      const current = clamp(currentFrameRef.current, start, end);
      if (!loop && current >= end) {
        setPlaying(false);
        return;
      }
      const next = current >= end ? start : current + 1;
      currentFrameRef.current = next;
      setCurrentFrame(next);
    }, interval);
    return () => clearInterval(timer);
  }, [active, end, fps, invalid, loop, playing, ready, selectedFrames.length, start]);

  const handleSeek = useCallback((event) => {
    const absoluteIndex = Number(event.target.value);
    setPlaying(false);
    currentFrameRef.current = absoluteIndex;
    setCurrentFrame(absoluteIndex);
  }, []);

  const currentUrl = frames[clamp(currentFrame, start, Math.max(start, end))] || selectedFrames[0] || '';

  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className}`}>
      <div className="relative w-full overflow-hidden rounded-md border border-border bg-black" style={{ aspectRatio: '16 / 9' }}>
        {currentUrl && !invalid && (
          <img
            src={currentUrl}
            alt={`帧 ${currentFrame}`}
            className="absolute inset-0 h-full w-full object-contain"
            onLoad={() => {
              setReady(true);
              setError('');
            }}
            onError={() => {
              setPlaying(false);
              setError(`帧 ${currentFrame} 加载失败`);
            }}
          />
        )}
        {!frames.length && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-white/50">暂无帧</div>
        )}
        {frames.length > 0 && invalid && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-red-400">
            <AlertCircle className="h-5 w-5" />
            <span>结束帧不能小于起始帧</span>
          </div>
        )}
        {!ready && !error && selectedFrames.length > 0 && !invalid && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white/70">
            加载帧播放器…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-red-400">{error}</div>
        )}
      </div>

      <input
        type="range"
        min={start}
        max={Math.max(start, end)}
        step="1"
        value={clamp(currentFrame, start, Math.max(start, end))}
        disabled={!ready || invalid || selectedFrames.length < 2}
        onChange={handleSeek}
        className="w-full accent-primary disabled:opacity-40"
        aria-label="当前帧"
      />

      <div className="flex min-h-7 items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">帧 {currentFrame} · 区间 {start}-{end}（{selectedFrames.length} 帧）</span>
        <div className="flex shrink-0 items-center gap-1.5">
          {onFpsChange ? (
            <label className="flex items-center gap-1">
              <span>FPS</span>
              <input
                type="number"
                min="1"
                max="120"
                value={fps}
                onChange={(event) => onFpsChange(Math.max(1, Number(event.target.value) || 1))}
                className="h-6 w-14 rounded border border-border bg-background px-1 text-xs text-foreground outline-none focus:border-primary"
              />
            </label>
          ) : (
            <span>{fps} fps</span>
          )}
          <button
            type="button"
            disabled={!ready || invalid || selectedFrames.length < 2}
            onClick={() => setLoop((value) => !value)}
            className={`flex h-7 w-7 items-center justify-center rounded border transition disabled:opacity-50 ${loop ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary hover:text-primary'}`}
            title={loop ? '关闭循环播放' : '开启循环播放'}
            aria-label={loop ? '关闭循环播放' : '开启循环播放'}
            aria-pressed={loop}
          >
            <Repeat2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={!ready || invalid || selectedFrames.length < 2}
            onClick={() => {
              if (!playing && !loop && currentFrame >= end) {
                currentFrameRef.current = start;
                setCurrentFrame(start);
              }
              setPlaying((value) => !value);
            }}
            className="flex h-7 w-7 items-center justify-center rounded border border-border transition hover:border-primary hover:text-primary disabled:opacity-50"
            title={playing ? '暂停' : '播放'}
            aria-label={playing ? '暂停' : '播放'}
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
