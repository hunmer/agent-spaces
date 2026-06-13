import { useState, useCallback, useEffect, useRef } from 'react';
import useAudioPlayer from './hooks/useAudioPlayer';
import Background from './components/Background';
import Player from './components/Player';
import MusicGenerator from './components/MusicGenerator';

const { Sparkles, Alert, AlertTitle, AlertDescription, Loader2, RefreshCw } = window.AgentSpacesUI;

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

  // Load playlist from config
  const loadPlaylist = useCallback(async () => {
    try {
      const data = await window.AgentSpacesUI.readConfigJson('music-history.json');
      setPlaylist(data || []);
      return data || [];
    } catch {
      setPlaylist([]);
      return [];
    }
  }, []);

  useEffect(() => {
    loadPlaylist();
  }, [loadPlaylist]);

  // Play a track and update index
  const playTrack = useCallback((item, index) => {
    player.loadAudio(item.audioUrl, true);
    setTrackInfo({ title: item.title, artist: item.artist });
    setCurrentLyrics(item.lyrics || '');
    if (index !== undefined) setCurrentIndex(index);
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

    // Save to config
    try {
      let existing = [];
      try {
        existing = await window.AgentSpacesUI.readConfigJson('music-history.json') || [];
      } catch {}
      await window.AgentSpacesUI.writeConfigJson('music-history.json', [
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

  // Subscribe to agent-driven player actions (api.js broadcasts miniApp.playerAction)
  useEffect(() => {
    if (!window.AgentSpaces?.onTaskEvent) return;
    const unsub = window.AgentSpaces.onTaskEvent((event, data) => {
      if (event !== 'miniApp.playerAction') return;
      if (data?.dir === 'next') handleNext();
      else if (data?.dir === 'prev') handlePrev();
    });
    return unsub;
  }, [handleNext, handlePrev]);

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
