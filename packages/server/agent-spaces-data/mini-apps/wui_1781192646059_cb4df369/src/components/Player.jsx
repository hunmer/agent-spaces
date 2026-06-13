import { useMemo } from 'react';
import PlaylistPopover from './PlaylistPopover';

const {
  Card, CardContent,
  Heart, Download, Shuffle, SkipBack, Play, Pause, SkipForward, Repeat, Repeat1,
  Loader2, Music, Volume2, VolumeX, Volume1,
  Popover, PopoverContent, PopoverTrigger,
} = window.AgentSpacesUI;

const PLAY_MODES = ['sequential', 'single', 'shuffle'];
const MODE_ICONS = { sequential: Repeat, single: Repeat1, shuffle: Shuffle };
const MODE_LABELS = { sequential: '顺序播放', single: '单曲循环', shuffle: '随机播放' };

export default function Player({
  trackInfo, isPlaying, isLoading, currentTime, duration,
  onToggle, onSeek, formatTime, hasAudio,
  currentAudioUrl, onPlayFromList,
  likedSongs, onToggleLiked, lyrics,
  volume, onVolumeChange,
  playMode, onPlayModeChange,
  onPrev, onNext,
  playlist,
  onRemove,
}) {
  const barCount = 80;
  const bars = useMemo(
    () => Array.from({ length: barCount }, () => 0.2 + Math.random() * 0.8),
    []
  );

  const progress = duration > 0 ? currentTime / duration : 0;
  const ModeIcon = MODE_ICONS[playMode] || Repeat;
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <main className="flex-1 relative z-10 flex flex-col items-center justify-center px-6 pb-20 w-full min-h-0">
      <div className="flex flex-col gap-10 w-full max-w-3xl">
      {/* Album Art + Lyrics */}
      <div className="flex gap-6 items-start mb-3">
        {/* Cover + Track Info */}
        <div className="flex flex-col items-center w-[280px] max-w-[40vw] shrink-0">
          {/* Album Cover */}
          <div className="relative w-full aspect-square rounded-[24px] overflow-hidden shadow-2xl transform transition-transform hover:scale-[1.02] duration-500">
            <Card className="w-full h-full border-0 bg-card text-card-foreground">
              <CardContent className="w-full h-full flex items-center justify-center p-0">
                <Music className="w-24 h-24 text-muted-foreground" />
              </CardContent>
            </Card>
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-6 backdrop-blur-sm">
              <button
                className="p-3 bg-white/20 hover:bg-white/30 rounded-full backdrop-blur-md transition-all text-white"
                onClick={() => currentAudioUrl && onToggleLiked(currentAudioUrl)}
              >
                <Heart className="w-8 h-8" fill={currentAudioUrl && likedSongs.has(currentAudioUrl) ? 'currentColor' : 'none'} />
              </button>
              <button
                className="p-3 bg-white/20 hover:bg-white/30 rounded-full backdrop-blur-md transition-all text-white"
                onClick={() => currentAudioUrl && window.open(currentAudioUrl, '_blank')}
              >
                <Download className="w-8 h-8" />
              </button>
            </div>
          </div>
          {/* Track Info */}
          <div className="text-center mt-4 w-full">
            <h1 className="text-2xl font-semibold tracking-tight mb-1 truncate text-foreground">
              {trackInfo.title}
            </h1>
            <p className="text-base text-muted-foreground">{trackInfo.artist}</p>
          </div>
        </div>

        {/* Lyrics Panel - always visible */}
        <div className="flex-1 min-w-[200px] relative mb-3" style={{ height: 'min(calc(280px + 1rem + 30px), 40vw + 1rem + 30px)' }}>
          <div
            className="h-full overflow-y-auto px-2"
            style={{
              maskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
            }}
          >
            {lyrics ? (
              <div className="text-xl text-foreground/80 leading-10 font-light">
                {lyrics.split('\n').map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-lg">
                暂无歌词
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Player Controls Card */}
      <div className="relative bg-card/70 text-card-foreground backdrop-blur-xl rounded-3xl p-5 border border-border shadow-2xl">

        {/* Waveform Progress */}
        <div className="mb-4">
          {/* Time labels */}
          <div className="flex items-center justify-between px-1 mb-1.5">
            <span className="text-xs text-muted-foreground font-mono">
              {formatTime(currentTime)}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {formatTime(duration)}
            </span>
          </div>
          {/* Waveform bars - clickable for seeking */}
          <div
            className={`flex items-end h-10 ${hasAudio ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
            onClick={(e) => {
              if (!hasAudio) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              onSeek(ratio);
            }}
          >
            {bars.map((height, i) => {
              const filled = i / bars.length <= progress;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-full min-w-[3px] ml-[2px] first:ml-0 transition-colors duration-150"
                  style={{
                    height: `${height * 40}px`,
                    backgroundColor: filled ? 'var(--theme-accent)' : 'rgba(120,120,120,0.45)',
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Primary Controls */}
        <div className="flex items-center justify-between px-4">
          {/* Left: Play Mode */}
          <button
            className={`flex items-center justify-center w-10 h-10 transition-colors ${
              playMode !== 'sequential' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => {
              const idx = PLAY_MODES.indexOf(playMode);
              onPlayModeChange(PLAY_MODES[(idx + 1) % PLAY_MODES.length]);
            }}
            title={MODE_LABELS[playMode]}
          >
            <ModeIcon className="w-[22px] h-[22px]" />
          </button>

          {/* Center: Download + Skip + Play/Pause + Playlist */}
          <div className="flex items-center gap-4">
            <button
              className="flex items-center justify-center w-10 h-10 text-muted-foreground hover:text-foreground hover:scale-110 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => currentAudioUrl && window.open(currentAudioUrl, '_blank')}
              disabled={!currentAudioUrl}
              title="下载当前歌曲"
            >
              <Download className="w-[22px] h-[22px]" />
            </button>
            <button
              className="flex items-center justify-center w-10 h-10 text-foreground hover:scale-110 transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={onPrev}
              disabled={!hasAudio || playlist.length === 0}
            >
              <SkipBack className="w-[28px] h-[28px]" />
            </button>
            <button
              className="w-12 h-12 bg-foreground text-background rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.2)] disabled:opacity-50"
              onClick={onToggle}
              disabled={!hasAudio && !isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-[26px] h-[26px] animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-[26px] h-[26px]" />
              ) : (
                <Play className="w-[26px] h-[26px]" />
              )}
            </button>
            <button
              className="flex items-center justify-center w-10 h-10 text-foreground hover:scale-110 transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={onNext}
              disabled={!hasAudio || playlist.length === 0}
            >
              <SkipForward className="w-[28px] h-[28px]" />
            </button>
            <PlaylistPopover
              currentAudioUrl={currentAudioUrl}
              isPlaying={isPlaying}
              onSelect={onPlayFromList}
              likedSongs={likedSongs}
              onToggleLiked={onToggleLiked}
              onRemove={onRemove}
              playlist={playlist}
            />
          </div>

          {/* Right: Volume */}
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center justify-center w-10 h-10 text-muted-foreground hover:text-foreground transition-colors" title="音量">
                  <VolumeIcon className="w-[22px] h-[22px]" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="!w-[200px] bg-popover/95 text-popover-foreground backdrop-blur-xl border-border p-3"
                align="end"
                side="top"
              >
                <div className="flex items-center gap-3">
                  <button
                    className="text-muted-foreground hover:text-popover-foreground transition-colors shrink-0"
                    onClick={() => onVolumeChange(volume === 0 ? 0.7 : 0)}
                  >
                    <VolumeIcon className="w-4 h-4" />
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                    className="flex-1 h-1.5 appearance-none rounded-full outline-none cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none
                      [&::-webkit-slider-thumb]:w-3
                      [&::-webkit-slider-thumb]:h-3
                      [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-white
                      [&::-webkit-slider-thumb]:cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #d6143a ${volume * 100}%, rgba(255,255,255,0.2) ${volume * 100}%)`,
                    }}
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
      </div>
    </main>
  );
}
