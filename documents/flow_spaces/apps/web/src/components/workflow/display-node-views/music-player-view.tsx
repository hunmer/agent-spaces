'use client';

import { useEffect, useRef } from 'react';
import { Music } from 'lucide-react';
import { type DisplayNodeViewProps, trackItems, readNumber, formatDuration, EmptyDisplay } from './utils';

export function MusicPlayerView({ data }: DisplayNodeViewProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const tracks = trackItems(data);
  const firstTrack = tracks[0];
  const volume = readNumber(data.volume) ?? 80;
  const loop = data.loop === true;

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = Math.max(0, Math.min(1, volume / 100));
  }, [volume]);

  if (!firstTrack) {
    return <EmptyDisplay icon={<Music className="h-5 w-5" />} text="暂无音频" />;
  }

  return (
    <div className="nodrag nopan flex h-full w-full flex-col overflow-hidden rounded-lg border border-border/60 bg-background">
      <div className="flex min-h-0 flex-1 items-center gap-2 p-2">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted">
          {firstTrack.cover ? (
            <img src={firstTrack.cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <Music className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">
            {firstTrack.title || firstTrack.src.split('/').pop() || 'Audio'}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{tracks.length} tracks</span>
            {formatDuration(firstTrack.duration) ? <span>{formatDuration(firstTrack.duration)}</span> : null}
            {loop ? <span>Loop</span> : null}
          </div>
        </div>
      </div>
      <div className="border-t border-border/60 p-2">
        <audio
          ref={audioRef}
          src={firstTrack.src}
          controls
          loop={loop}
          preload="metadata"
          className="h-8 w-full"
        />
      </div>
    </div>
  );
}
