import { useState, useCallback, useEffect, useRef } from 'react';
import useAudioPlayer from './hooks/useAudioPlayer';
import Background from './components/Background';
import Player from './components/Player';
import MusicGenerator from './components/MusicGenerator';
import SettingsDialog from './components/SettingsDialog';
import { readHistory, writeHistory, readSettings, writeSettings, readLastTrack, writeLastTrack } from './utils/storage';

const { Sparkles, Alert, AlertTitle, AlertDescription, Loader2, RefreshCw, Settings } = window.AgentSpacesUI;

const toAgentMusicLibrary = (list) => ({
  updatedAt: new Date().toISOString(),
  songs: (Array.isArray(list) ? list : []).slice(0, 100).map((item) => ({
    id: String(item.id || item.audioUrl || ''),
    audioUrl: item.audioUrl || '',
    title: item.title || '未命名歌曲',
    artist: item.artist || 'MiniMax Music AI',
    prompt: item.prompt || '',
    lyrics: item.lyrics ? String(item.lyrics).slice(0, 500) : '',
    createdAt: item.createdAt || '',
  })),
});

export default function App() {
  const player = useAudioPlayer();
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [remixPrompt, setRemixPrompt] = useState('');
  const [remixLyrics, setRemixLyrics] = useState('');
  const [generatingAlert, setGeneratingAlert] = useState(false);
  const [trackInfo, setTrackInfo] = useState({
    title: 'Neon Horizon',
    artist: 'Syntax Error ft. The Algorithm',
    lyrics: '',
  });
  const [currentLyrics, setCurrentLyrics] = useState('');
  const [likedSongs, setLikedSongs] = useState(new Set());

  // Playlist & play mode
  const [playlist, setPlaylist] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [playMode, setPlayMode] = useState('sequential');

  // Settings dialog & restore-on-start preference
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [restoreOnStart, setRestoreOnStart] = useState(false);

  // Load playlist from local storage
  const loadPlaylist = useCallback(async () => {
    const data = await readHistory();
    setPlaylist(data);
    return data;
  }, []);

  useEffect(() => {
    loadPlaylist();
  }, [loadPlaylist]);

  // On startup: load settings; if restore-on-start is enabled, resume last track
  useEffect(() => {
    (async () => {
      const settings = await readSettings();
      setRestoreOnStart(!!settings.restoreOnStart);
      if (!settings.restoreOnStart) return;
      const last = await readLastTrack();
      if (!last?.audioUrl) return;
      // Ensure playlist is loaded so we can sync currentIndex
      const data = await loadPlaylist();
      player.loadAudio(last.audioUrl, true);
      setTrackInfo({ title: last.title || 'Neon Horizon', artist: last.artist || 'MiniMax Music AI', lyrics: last.lyrics || '' });
      setCurrentLyrics(last.lyrics || '');
      const idx = data.findIndex(p => p.audioUrl === last.audioUrl);
      if (idx !== -1) setCurrentIndex(idx);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Play a track and update index
  const playTrack = useCallback((item, index) => {
    player.loadAudio(item.audioUrl, true);
    setTrackInfo({ title: item.title, artist: item.artist });
    setCurrentLyrics(item.lyrics || '');
    if (index !== undefined) setCurrentIndex(index);
    writeLastTrack({ audioUrl: item.audioUrl, title: item.title, artist: item.artist, lyrics: item.lyrics || '' });
  }, [player]);

  // Handle track ended based on play mode
  useEffect(() => {
    player.onEndedRef.current = () => {
      if (playMode === 'single') {
        player.replay();
      } else if (playMode === 'shuffle' && playlist.length > 0) {
        const randomIdx = Math.floor(Math.random() * playlist.length);
        playTrack(playlist[randomIdx], randomIdx);
      } else if (playMode === 'sequential' && currentIndex < playlist.length - 1) {
        const nextIdx = currentIndex + 1;
        playTrack(playlist[nextIdx], nextIdx);
      }
    };
  });

  const toggleLiked = useCallback((audioUrl) => {
    setLikedSongs(prev => {
      const next = new Set(prev);
      if (next.has(audioUrl)) {
        next.delete(audioUrl);
      } else {
        next.add(audioUrl);
      }
      return next;
    });
  }, []);

  const handleGenerateStart = useCallback(() => {
    setGeneratorOpen(false);
    setGeneratingAlert(true);
  }, []);

  const handleGenerateEnd = useCallback(() => {
    setGeneratingAlert(false);
  }, []);

  const handleGenerate = useCallback(async ({ audioUrl, prompt, lyrics }) => {
    player.loadAudio(audioUrl, true);
    const title = prompt.length > 30 ? prompt.slice(0, 30) + '...' : prompt;
    const artist = 'MiniMax Music AI';
    setTrackInfo({ title, artist });
    setCurrentLyrics(lyrics || '');
    writeLastTrack({ audioUrl, title, artist, lyrics: lyrics || '' });

    // Save to local storage (per-project)
    try {
      const existing = await readHistory();
      await writeHistory([
        {
          id: Date.now().toString(),
          audioUrl,
          title,
          artist,
          prompt,
          lyrics: lyrics || '',
          createdAt: new Date().toISOString(),
        },
        ...existing,
      ]);
    } catch (e) {
      console.error('Failed to save music history:', e);
    }

    // Reload playlist and set index to 0 (newest)
    const updated = await loadPlaylist();
    setCurrentIndex(updated.length > 0 ? 0 : -1);
  }, [player, loadPlaylist]);

  const handlePlayFromList = useCallback((item) => {
    const idx = playlist.findIndex(p => p.audioUrl === item.audioUrl);
    playTrack(item, idx !== -1 ? idx : -1);
  }, [playlist, playTrack]);

  const handleRemove = useCallback(async (item) => {
    try {
      const updated = playlist.filter(p => p.audioUrl !== item.audioUrl);
      await writeHistory(updated);
      setPlaylist(updated);
      // 如果删除的是当前播放的歌曲，停止播放
      if (player.audioUrl === item.audioUrl) {
        player.stop();
        setTrackInfo({ title: 'Neon Horizon', artist: 'Syntax Error ft. The Algorithm', lyrics: '' });
        setCurrentLyrics('');
        setCurrentIndex(-1);
      } else {
        // 重新定位当前索引
        const newIdx = updated.findIndex(p => p.audioUrl === player.audioUrl);
        if (newIdx !== -1) setCurrentIndex(newIdx);
      }
    } catch (e) {
      console.error('Failed to remove song:', e);
    }
  }, [playlist, player]);

  // Prev / Next handlers
  const handlePrev = useCallback(() => {
    if (playlist.length === 0) return;
    // If played > 3s, restart current track
    if (player.currentTime > 3) {
      player.seek(0);
      if (!player.isPlaying) player.toggle();
      return;
    }
    const prevIdx = currentIndex > 0 ? currentIndex - 1 : playlist.length - 1;
    playTrack(playlist[prevIdx], prevIdx);
  }, [playlist, currentIndex, player, playTrack]);

  const handleNext = useCallback(() => {
    if (playlist.length === 0) return;
    if (playMode === 'shuffle') {
      const randomIdx = Math.floor(Math.random() * playlist.length);
      playTrack(playlist[randomIdx], randomIdx);
    } else {
      const nextIdx = currentIndex < playlist.length - 1 ? currentIndex + 1 : 0;
      playTrack(playlist[nextIdx], nextIdx);
    }
  }, [playlist, currentIndex, playMode, playTrack]);

  // Random play (driven by play_random command broadcast)
  const handleRandom = useCallback(() => {
    if (playlist.length === 0) return;
    const randomIdx = Math.floor(Math.random() * playlist.length);
    playTrack(playlist[randomIdx], randomIdx);
  }, [playlist, playTrack]);

  // Toggle "restore on start" and persist
  const handleRestoreChange = useCallback(async (val) => {
    setRestoreOnStart(val);
    await writeSettings({ restoreOnStart: val });
  }, []);

  // Export local song list as a downloadable JSON file
  const handleExport = useCallback(async () => {
    try {
      const data = await readHistory();
      const payload = JSON.stringify({ exportedAt: new Date().toISOString(), songs: data }, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sonicai-music-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export data:', e);
    }
  }, []);

  // Clear all songs (local history + last track + player state)
  const handleClear = useCallback(async () => {
    try {
      await writeHistory([]);
      await writeLastTrack(null);
      setPlaylist([]);
      setCurrentIndex(-1);
      player.stop();
      setTrackInfo({ title: 'Neon Horizon', artist: 'Syntax Error ft. The Algorithm', lyrics: '' });
      setCurrentLyrics('');
    } catch (e) {
      console.error('Failed to clear songs:', e);
    }
  }, [player]);

  // Subscribe to agent-driven player actions (api.js broadcasts miniApp.playerAction)
  useEffect(() => {
    if (!window.AgentSpaces?.onTaskEvent) return;
    const unsub = window.AgentSpaces.onTaskEvent((event, data) => {
      if (event === 'miniApp.playerAction') {
        if (data?.dir === 'next') handleNext();
        else if (data?.dir === 'prev') handlePrev();
        else if (data?.dir === 'random') handleRandom();
        else if (data?.dir === 'goto') {
          const idx = playlist.findIndex((item) =>
            (data?.id && item.id === data.id)
            || (data?.audioUrl && item.audioUrl === data.audioUrl)
            || (data?.title && item.title === data.title)
          );
          if (idx !== -1) playTrack(playlist[idx], idx);
        }
      } else if (event === 'miniApp.musicGenerated') {
        if (data?.audioUrl) handleGenerate(data);
      } else if (event === 'miniApp.toggleLike') {
        if (player.audioUrl) toggleLiked(player.audioUrl);
      } else if (event === 'miniApp.clientRequest' && data?.type === 'musicLibrary') {
        readHistory()
          .then((list) => window.AgentSpaces?.respondClientRequest?.(data.requestId, toAgentMusicLibrary(list)))
          .catch((err) => window.AgentSpaces?.respondClientRequest?.(
            data.requestId,
            null,
            false,
            err?.message || String(err),
          ));
      }
    });
    return unsub;
  }, [handleNext, handlePrev, handleRandom, handleGenerate, playlist, playTrack, player.audioUrl, toggleLiked]);

  return (
    <div className="bg-background text-foreground h-screen overflow-hidden flex flex-col relative">
      {/* Keyframe animation */}
      <style>{`
        :root {
          --theme-accent: #d6143a;
        }
        @keyframes pulseBlur {
          0% { filter: blur(100px) scale(1); opacity: 0.8; }
          50% { filter: blur(120px) scale(1.05); opacity: 0.9; }
          100% { filter: blur(100px) scale(1); opacity: 0.8; }
        }
      `}</style>

      {/* Animated Background */}
      <Background />

      {/* Settings (top-left) */}
      <button
        className="absolute top-4 left-4 z-40 flex items-center justify-center w-10 h-10 rounded-full bg-card/60 text-muted-foreground hover:text-foreground hover:bg-card/90 backdrop-blur-xl border border-border transition-colors"
        onClick={() => setSettingsOpen(true)}
        title="设置"
      >
        <Settings className="w-5 h-5" />
      </button>

      {/* Generating Alert */}
      {generatingAlert && (
        <div className="fixed top-4 right-4 z-50">
          <Alert className="bg-card/95 text-card-foreground backdrop-blur-xl border-border max-w-xs">
            <Loader2 className="w-4 h-4 animate-spin" />
            <AlertTitle className="text-sm font-semibold">正在生成中</AlertTitle>
            <AlertDescription className="text-xs">AI 正在为你创作音乐，请稍候…</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Main Player */}
      <Player
        trackInfo={trackInfo}
        isPlaying={player.isPlaying}
        isLoading={player.isLoading}
        currentTime={player.currentTime}
        duration={player.duration}
        hasAudio={!!player.audioUrl}
        onToggle={player.toggle}
        onSeek={player.seek}
        formatTime={player.formatTime}
        currentAudioUrl={player.audioUrl}
        onPlayFromList={handlePlayFromList}
        likedSongs={likedSongs}
        onToggleLiked={toggleLiked}
        lyrics={currentLyrics}
        volume={player.volume}
        onVolumeChange={player.setVolume}
        playMode={playMode}
        onPlayModeChange={setPlayMode}
        onPrev={handlePrev}
        onNext={handleNext}
        playlist={playlist}
        currentIndex={currentIndex}
        onRemove={handleRemove}
      />

      {/* Music Generator Sheet */}
      <MusicGenerator
        open={generatorOpen}
        onClose={() => setGeneratorOpen(false)}
        onGenerate={handleGenerate}
        onGenerateStart={handleGenerateStart}
        onGenerateEnd={handleGenerateEnd}
        initialPrompt={remixPrompt}
        initialLyrics={remixLyrics}
      />

      {/* Settings Dialog */}
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        restoreOnStart={restoreOnStart}
        onRestoreChange={handleRestoreChange}
        onExport={handleExport}
        onClear={handleClear}
      />

      {/* Bottom Center - AI Music Creation / Remix Buttons */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3">
        {player.audioUrl && playlist[currentIndex]?.prompt && (
          <button
            className="flex items-center gap-2 px-5 py-3 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-card/60 backdrop-blur-xl transition-colors text-sm font-medium"
            onClick={() => {
              setRemixPrompt(playlist[currentIndex].prompt);
              setRemixLyrics(playlist[currentIndex].lyrics || '');
              setGeneratorOpen(true);
            }}
          >
            <RefreshCw className="w-4 h-4" />
            翻写此曲
          </button>
        )}
        <button
          className="flex items-center gap-2 px-6 py-3 rounded-full border border-primary text-primary hover:bg-primary/10 transition-colors text-sm font-semibold"
          onClick={() => {
            setRemixPrompt('');
            setRemixLyrics('');
            setGeneratorOpen(true);
          }}
        >
          <Sparkles className="w-5 h-5" />
          AI 音乐创作
        </button>
      </div>
    </div>
  );
}
