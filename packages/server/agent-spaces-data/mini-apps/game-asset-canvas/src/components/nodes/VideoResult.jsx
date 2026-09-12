import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize, Pause, Play, Volume2, VolumeX } from '@agent-spaces/ui';

function formatTime(value) {
  if (!Number.isFinite(value) || value <= 0) return '0:00';
  const m = Math.floor(value / 60);
  return `${m}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
}

export default function VideoResult({ videos = [] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const ref = useRef(null);
  const current = videos[index] || videos[0];
  useEffect(() => { setIndex((value) => Math.min(value, Math.max(0, videos.length - 1))); }, [videos.length]);
  useEffect(() => { setPlaying(false); setProgress(0); setDuration(0); }, [current]);
  if (!current) return null;
  const togglePlay = () => { const video = ref.current; if (!video) return; if (video.paused) video.play().catch(() => {}); else video.pause(); };
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-black">
      <video ref={ref} src={current} className="block max-h-[420px] w-full object-contain" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)} onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))} muted={muted} draggable={false} />
      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 rounded-full bg-background/85 px-1.5 py-1 shadow backdrop-blur-sm">
        <button type="button" aria-label={playing ? '暂停' : '播放'} onClick={togglePlay} className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">{playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}</button>
        <input type="range" min="0" max="1" step="0.001" value={progress} onChange={(e) => { const value = Number(e.target.value); setProgress(value); if (ref.current && duration) ref.current.currentTime = value * duration; }} className="min-w-0 flex-1" aria-label="视频进度" />
        <span className="text-[10px] tabular-nums text-muted-foreground">{formatTime(progress * duration)} / {formatTime(duration)}</span>
        <button type="button" aria-label={muted ? '取消静音' : '静音'} onClick={() => setMuted((value) => !value)} className="flex h-6 w-6 items-center justify-center text-muted-foreground">{muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}</button>
        <button type="button" aria-label="全屏" onClick={() => ref.current?.requestFullscreen?.()} className="flex h-6 w-6 items-center justify-center text-muted-foreground"><Maximize className="h-3.5 w-3.5" /></button>
        {videos.length > 1 && <><button type="button" onClick={() => setIndex((value) => (value - 1 + videos.length) % videos.length)}><ChevronLeft className="h-3.5 w-3.5" /></button><span className="text-[10px] text-muted-foreground">{index + 1}/{videos.length}</span><button type="button" onClick={() => setIndex((value) => (value + 1) % videos.length)}><ChevronRight className="h-3.5 w-3.5" /></button></>}
      </div>
    </div>
  );
}
