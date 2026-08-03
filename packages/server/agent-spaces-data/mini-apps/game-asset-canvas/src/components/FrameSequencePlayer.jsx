import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Pause, Play } from '@agent-spaces/ui';
import { getFastImageSequence } from '../utils/image-ops/cdn';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** 通用图片帧序列播放器，区间索引相对传入的 frames 全集。 */
export default function FrameSequencePlayer({
  frames = [],
  startFrame = 0,
  endFrame = frames.length - 1,
  fps = 10,
  onFpsChange,
  autoPlay = true,
  className = '',
}) {
  const containerRef = useRef(null);
  const sequenceRef = useRef(null);
  const currentRef = useRef(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [currentFrame, setCurrentFrame] = useState(0);

  const maxIndex = Math.max(0, frames.length - 1);
  const start = clamp(Number(startFrame) || 0, 0, maxIndex);
  const end = clamp(Number(endFrame) || 0, 0, maxIndex);
  const invalid = frames.length > 0 && end < start;
  const selectedFrames = useMemo(
    () => (invalid ? [] : frames.slice(start, end + 1)),
    [frames, start, end, invalid],
  );
  const sequenceKey = `${start}:${end}:${selectedFrames.join('|')}`;

  useEffect(() => {
    setPlaying(autoPlay);
  }, [autoPlay, sequenceKey]);

  useEffect(() => {
    let cancelled = false;
    let instance = null;
    const container = containerRef.current;
    setReady(false);
    setError('');
    setCurrentFrame(start);
    currentRef.current = start;
    if (!container || !selectedFrames.length || invalid) return undefined;

    (async () => {
      try {
        const FastImageSequence = await getFastImageSequence();
        if (cancelled) return;
        instance = new FastImageSequence(container, {
          frames: selectedFrames.length,
          src: {
            imageURL: (index) => selectedFrames[index],
            maxCachedImages: Math.min(selectedFrames.length, 64),
          },
          poster: selectedFrames[0],
          loop: true,
          objectFit: 'contain',
          clearCanvas: true,
          fillStyle: '#000000',
        });
        sequenceRef.current = instance;
        instance.tick(() => {
          const absoluteIndex = start + instance.index;
          if (absoluteIndex !== currentRef.current) {
            currentRef.current = absoluteIndex;
            setCurrentFrame(absoluteIndex);
          }
        });
        await instance.ready();
        if (cancelled) return;
        instance.progress = 0;
        setReady(true);
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err));
      }
    })();

    return () => {
      cancelled = true;
      if (sequenceRef.current === instance) sequenceRef.current = null;
      instance?.destruct?.();
    };
  }, [sequenceKey, start, invalid]);

  useEffect(() => {
    const sequence = sequenceRef.current;
    if (!sequence || !ready) return;
    if (playing) sequence.play(Math.max(1, Number(fps) || 10));
    else sequence.stop();
  }, [playing, fps, ready]);

  const handleSeek = useCallback((event) => {
    const absoluteIndex = Number(event.target.value);
    const sequence = sequenceRef.current;
    setPlaying(false);
    setCurrentFrame(absoluteIndex);
    currentRef.current = absoluteIndex;
    if (sequence) {
      sequence.stop();
      sequence.progress = selectedFrames.length > 1
        ? (absoluteIndex - start) / (selectedFrames.length - 1)
        : 0;
    }
  }, [selectedFrames.length, start]);

  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className}`}>
      <div className="relative w-full overflow-hidden rounded-md border border-border bg-black" style={{ aspectRatio: '16 / 9' }}>
        <div ref={containerRef} className="absolute inset-0" />
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
            disabled={!ready || invalid}
            onClick={() => setPlaying((value) => !value)}
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
